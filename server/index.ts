import { createServer } from "node:http";
import { homedir } from "node:os";
import { isAbsolute, join, resolve } from "node:path";
import { HerdrClient } from "./herdr-client.js";
import { LiveHerdrService } from "./herdr-service.js";
import {
  parseHerdrProtocol,
  readHerdrStatus,
  statusSocketPath,
} from "./herdr-status.js";
import { createHerdrHttpHandler } from "./http-app.js";
import { createStaticHandler } from "./static-files.js";
import {
  LocalTerminalBackend,
  RemoteTerminalBackend,
} from "./terminal-session.js";
import { TerminalTicketStore } from "./terminal-tickets.js";
import { attachTerminalWebSocket } from "./terminal-websocket.js";

const token = process.env.HERDR_WEB_TOKEN?.trim();
if (!token) {
  console.error(
    "HERDR_WEB_TOKEN is required; use `just run` or set it explicitly.",
  );
  process.exit(1);
}

const host = process.env.BRIDGE_HOST ?? "127.0.0.1";
const port = Number.parseInt(
  process.env.BRIDGE_PORT ?? process.env.PORT ?? "8787",
  10,
);
const tcpPort = Number.parseInt(process.env.HERDR_TCP_PORT ?? "", 10);
const usesSocketProxy =
  Number.isInteger(tcpPort) && tcpPort > 0 && tcpPort <= 65_535;
const herdrCommand =
  process.env.HERDR_BINARY ?? process.env.HERDR_BIN_PATH ?? "herdr";
const herdrStatus = usesSocketProxy
  ? undefined
  : await readHerdrStatus(herdrCommand).catch(() => undefined);
const terminalProxyProtocol = parseHerdrProtocol(
  process.env.HERDR_TERMINAL_CLIENT_PROTOCOL,
);
const discoveredSocket =
  process.env.HERDR_SOCKET_PATH?.trim() || statusSocketPath(herdrStatus);
if (!usesSocketProxy && process.platform === "win32" && !discoveredSocket) {
  console.error(
    "Cannot discover the Herdr named pipe; ensure `herdr status --json` works or set HERDR_SOCKET_PATH.",
  );
  process.exit(1);
}
const socketPath =
  discoveredSocket || join(homedir(), ".config", "herdr", "herdr.sock");
const endpoint = usesSocketProxy
  ? {
      host: process.env.HERDR_TCP_HOST ?? "host.docker.internal",
      port: tcpPort,
    }
  : socketPath;
const staticRoot = resolve(process.env.HERDR_WEB_STATIC_ROOT ?? "dist");
const configuredDataHome = process.env.HERDR_WEB_HOME?.trim();
if (configuredDataHome && !isAbsolute(configuredDataHome)) {
  console.error("HERDR_WEB_HOME must be an absolute path.");
  process.exit(1);
}
const dataHome = resolve(configuredDataHome || join(homedir(), ".herdr-web"));
const projectsRoot = process.env.HERDR_PROJECTS_ROOT?.trim() || undefined;
const terminalProxyPort = Number.parseInt(
  process.env.HERDR_TERMINAL_PROXY_PORT ?? "",
  10,
);
const terminalBackend =
  Number.isInteger(terminalProxyPort) && terminalProxyPort > 0
    ? new RemoteTerminalBackend({
        host: process.env.HERDR_TERMINAL_PROXY_HOST ?? "host.docker.internal",
        port: terminalProxyPort,
        token: process.env.HERDR_TERMINAL_PROXY_TOKEN?.trim() ?? "",
      })
    : new LocalTerminalBackend({ command: herdrCommand });
const client = new HerdrClient(endpoint);
const service = new LiveHerdrService(client, {
  herdrClientProtocol: usesSocketProxy
    ? terminalProxyProtocol
    : herdrStatus?.client?.protocol,
  projectsRoot,
  terminalStreamingConfigured: terminalBackend.configured,
  uploadsRoot: join(dataHome, "uploads"),
});
const terminalTickets = new TerminalTicketStore();
const api = createHerdrHttpHandler({
  service,
  terminalConfigured: terminalBackend.configured,
  terminalTickets,
  token,
  viewToken: process.env.HERDR_WEB_VIEW_TOKEN?.trim() || undefined,
});
const staticFiles = createStaticHandler(staticRoot);

const server = createServer((request, response) => {
  const url = new URL(request.url ?? "/", "http://herdr.local");
  if (url.pathname === "/healthz") {
    response.writeHead(200, {
      "cache-control": "no-store",
      "content-type": "text/plain; charset=utf-8",
    });
    response.end("ok\n");
    return;
  }
  if (url.pathname.startsWith("/api/herdr/")) {
    void api(request, response);
    return;
  }
  void staticFiles(request, response);
});

const terminalWebSocket = attachTerminalWebSocket({
  backend: terminalBackend,
  server,
  tickets: terminalTickets,
});

server.listen(port, host, () => {
  console.log(`herdr-web bridge listening on http://${host}:${port}`);
  console.log(
    typeof endpoint === "string"
      ? `herdr socket: ${endpoint}`
      : `herdr socket proxy: ${endpoint.host}:${endpoint.port}`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    terminalWebSocket.close();
    server.close(() => process.exit(0));
  });
}
