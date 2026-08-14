import { createServer, type Server, type Socket } from "node:net";
import { afterEach, describe, expect, test, vi } from "vitest";
import { RemoteTerminalBackend } from "../server/terminal-session";
import type { TerminalTicket } from "../server/terminal-tickets";

const servers: Server[] = [];
const sockets: Socket[] = [];

afterEach(async () => {
  for (const socket of sockets.splice(0)) socket.destroy();
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

function ticket(): TerminalTicket {
  return {
    cols: 100,
    expiresAt: Date.now() + 30_000,
    mode: "control",
    paneId: "w5:p1",
    rows: 30,
    takeover: false,
  };
}

describe("RemoteTerminalBackend", () => {
  test("authenticates the host proxy and relays NDJSON in both directions", async () => {
    const lines: Array<Record<string, unknown>> = [];
    let hostSocket: Socket | undefined;
    const server = createServer((socket) => {
      hostSocket = socket;
      sockets.push(socket);
      let buffer = "";
      socket.on("data", (chunk) => {
        buffer += chunk.toString("utf8");
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          lines.push(JSON.parse(buffer.slice(0, newline)));
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
        }
      });
    });
    servers.push(server);
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No port");
    const backend = new RemoteTerminalBackend({
      host: "127.0.0.1",
      port: address.port,
      token: "proxy-secret",
    });

    const process = backend.open(ticket());
    await vi.waitFor(() => expect(lines).toHaveLength(1));
    expect(lines[0]).toMatchObject({
      cols: 100,
      mode: "control",
      paneId: "w5:p1",
      rows: 30,
      takeover: false,
      token: "proxy-secret",
      type: "terminal.start",
    });
    expect(lines[0]?.expiresAt).toEqual(expect.any(Number));

    let output = "";
    process.stdout.setEncoding("utf8");
    process.stdout.on("data", (chunk) => {
      output += chunk;
    });
    hostSocket?.write('{"bytes":"aGk=","seq":1,"type":"terminal.frame"}\n');
    await vi.waitFor(() => expect(output).toContain("terminal.frame"));

    process.stdin.write('{"data":"echo hi\\r","type":"terminal.input"}\n');
    await vi.waitFor(() => expect(lines).toHaveLength(2));
    expect(lines[1]).toEqual({ data: "echo hi\r", type: "terminal.input" });
    process.kill();
  });
});
