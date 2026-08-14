import { createServer } from "node:http";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { HerdrClient } from "./herdr-client.js";
import { LiveHerdrService } from "./herdr-service.js";
import { createHerdrHttpHandler } from "./http-app.js";
import { createStaticHandler } from "./static-files.js";

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
const socketPath =
  process.env.HERDR_SOCKET_PATH ??
  join(homedir(), ".config", "herdr", "herdr.sock");
const tcpPort = Number.parseInt(process.env.HERDR_TCP_PORT ?? "", 10);
const endpoint =
  Number.isInteger(tcpPort) && tcpPort > 0 && tcpPort <= 65_535
    ? {
        host: process.env.HERDR_TCP_HOST ?? "host.docker.internal",
        port: tcpPort,
      }
    : socketPath;
const staticRoot = resolve(process.env.HERDR_WEB_STATIC_ROOT ?? "dist");
const projectsRoot = process.env.HERDR_PROJECTS_ROOT?.trim() || undefined;
const client = new HerdrClient(endpoint);
const service = new LiveHerdrService(client, { projectsRoot });
const api = createHerdrHttpHandler({ service, token });
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

server.listen(port, host, () => {
  console.log(`herdr bridge listening on http://${host}:${port}`);
  console.log(
    typeof endpoint === "string"
      ? `herdr socket: ${endpoint}`
      : `herdr socket proxy: ${endpoint.host}:${endpoint.port}`,
  );
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => server.close(() => process.exit(0)));
}
