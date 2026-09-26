import { EventEmitter, once } from "node:events";
import { createServer } from "node:http";
import { PassThrough } from "node:stream";
import { afterEach, describe, expect, test, vi } from "vitest";
import WebSocket from "ws";
import type { ViewerShareStore } from "../server/share-store";
import type { TerminalBackend } from "../server/terminal-session";
import { TerminalTicketStore } from "../server/terminal-tickets";
import { attachTerminalWebSocket } from "../server/terminal-websocket";

class FakeTerminalProcess extends EventEmitter {
  readonly stderr = new PassThrough();
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly kill = vi.fn(() => true);
}

const servers: Array<ReturnType<typeof createServer>> = [];
const sockets: WebSocket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.terminate();
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

async function fixture(options: { shareStore?: ViewerShareStore } = {}) {
  const process = new FakeTerminalProcess();
  const open = vi.fn(() => process);
  const backend: TerminalBackend = { configured: true, open };
  const tickets = new TerminalTicketStore();
  const server = createServer((_request, response) => {
    response.writeHead(404).end();
  });
  servers.push(server);
  const terminal = attachTerminalWebSocket({
    backend,
    server,
    shareStore: options.shareStore,
    tickets,
  });
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Missing test port");
  const origin = `http://127.0.0.1:${address.port}`;
  return { open, origin, process, terminal, tickets };
}

function issue(tickets: TerminalTicketStore) {
  return tickets.issue({
    cols: 80,
    mode: "control",
    paneId: "w5:p1",
    rows: 24,
    takeover: false,
  }).ticket;
}

async function connect(origin: string, ticket: string) {
  const socket = new WebSocket(
    `${origin.replace("http:", "ws:")}/api/herdr/terminal?ticket=${ticket}`,
    { origin },
  );
  sockets.push(socket);
  await once(socket, "open");
  return socket;
}

describe("terminal WebSocket bridge", () => {
  test("uses a one-use ticket and relays ordered terminal input and output", async () => {
    const { open, origin, process, terminal, tickets } = await fixture();
    const socket = await connect(origin, issue(tickets));
    let stdin = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      stdin += chunk;
    });
    const output = once(socket, "message");
    const message = {
      bytes: Buffer.from("\u001b[2Jhello").toString("base64"),
      encoding: "ansi",
      full: true,
      height: 24,
      seq: 1,
      type: "terminal.frame",
      width: 80,
    };
    process.stdout.write(`${JSON.stringify(message)}\n`);

    expect(JSON.parse(String((await output)[0]))).toEqual({
      ...message,
      serverUnixMs: expect.any(Number),
    });
    socket.send(JSON.stringify({ data: "echo hi\r", type: "terminal.input" }));
    await vi.waitFor(() => expect(stdin).toContain('"text":"echo hi\\r"'));
    expect(open).toHaveBeenCalledWith(
      expect.objectContaining({ paneId: "w5:p1", mode: "control" }),
    );
    expect(terminal.sessionCount()).toBe(1);

    socket.close();
    await once(socket, "close");
    await vi.waitFor(() => expect(terminal.sessionCount()).toBe(0));
    terminal.close();
  });

  test("closes active scoped viewer sockets immediately on revocation", async () => {
    let active = true;
    let revokeListener: ((id: string) => void) | undefined;
    const shareStore = {
      isActive: vi.fn(() => active),
      onRevoked: vi.fn((listener: (id: string) => void) => {
        revokeListener = listener;
        return () => undefined;
      }),
    } as unknown as ViewerShareStore;
    const { origin, terminal, tickets } = await fixture({ shareStore });
    const ticket = tickets.issue({
      cols: 80,
      mode: "observe",
      paneId: "w5:p1",
      rows: 24,
      shareExpiresAt: Date.now() + 60_000,
      shareId: "share-1",
      takeover: false,
    }).ticket;
    const socket = await connect(origin, ticket);
    const closed = once(socket, "close");

    active = false;
    revokeListener?.("share-1");

    const [code] = await closed;
    expect(code).toBe(1008);
    await vi.waitFor(() => expect(terminal.sessionCount()).toBe(0));
    terminal.close();
  });

  test("rejects cross-origin and expired or reused tickets", async () => {
    const { origin, terminal, tickets } = await fixture();
    const ticket = issue(tickets);
    const wrongOrigin = new WebSocket(
      `${origin.replace("http:", "ws:")}/api/herdr/terminal?ticket=${ticket}`,
      { origin: "http://attacker.invalid" },
    );
    wrongOrigin.on("error", () => undefined);
    const [, response] = (await once(wrongOrigin, "unexpected-response")) as [
      import("node:http").ClientRequest,
      import("node:http").IncomingMessage,
    ];
    expect(response.statusCode).toBe(403);

    const socket = await connect(origin, ticket);
    socket.close();
    await once(socket, "close");
    const reused = new WebSocket(
      `${origin.replace("http:", "ws:")}/api/herdr/terminal?ticket=${ticket}`,
      { origin },
    );
    reused.on("error", () => undefined);
    const [, reusedResponse] = (await once(reused, "unexpected-response")) as [
      import("node:http").ClientRequest,
      import("node:http").IncomingMessage,
    ];
    expect(reusedResponse.statusCode).toBe(401);
    terminal.close();
  });
});
