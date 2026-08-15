import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test } from "vitest";
import { type HerdrApiError, HerdrClient } from "../server/herdr-client";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function fakeHerdr(
  respond: (request: Record<string, unknown>) => Record<string, unknown>,
  afterRespond?: (socket: Socket, request: Record<string, unknown>) => void,
): Promise<{ socketPath: string; requests: Array<Record<string, unknown>> }> {
  const directory = await mkdtemp(join(tmpdir(), "herdr-web-test-"));
  const socketPath = join(directory, "herdr.sock");
  const requests: Array<Record<string, unknown>> = [];
  const sockets = new Set<Socket>();
  const server: Server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    let buffer = "";
    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        const request = JSON.parse(line) as Record<string, unknown>;
        requests.push(request);
        socket.write(`${JSON.stringify(respond(request))}\n`);
        afterRespond?.(socket, request);
        newline = buffer.indexOf("\n");
      }
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, resolve);
  });
  cleanups.push(async () => {
    for (const socket of sockets) socket.destroy();
    await new Promise<void>((resolve) => server.close(() => resolve()));
    await rm(directory, { force: true, recursive: true });
  });
  return { socketPath, requests };
}

describe("HerdrClient", () => {
  test("sends one NDJSON request and returns the matching result", async () => {
    const fake = await fakeHerdr((request) => ({
      id: request.id,
      result: { protocol: 19, type: "pong", version: "0.8.0" },
    }));
    const client = new HerdrClient(fake.socketPath, { timeoutMs: 500 });

    await expect(client.request("ping", {})).resolves.toEqual({
      protocol: 19,
      type: "pong",
      version: "0.8.0",
    });
    expect(fake.requests).toHaveLength(1);
    expect(fake.requests[0]).toMatchObject({ method: "ping", params: {} });
  });

  test("streams fragmented Unicode subscription events until cancellation", async () => {
    const event = {
      data: { label: "決定" },
      event: "workspace_updated",
      subscription: 0,
    };
    const bytes = Buffer.from(`${JSON.stringify(event)}\n`);
    const fake = await fakeHerdr(
      (request) => ({
        id: request.id,
        result: { type: "subscription_started" },
      }),
      (socket) => {
        const split = bytes.indexOf(Buffer.from("決")) + 1;
        socket.write(bytes.subarray(0, split));
        setTimeout(() => socket.write(bytes.subarray(split)), 5);
      },
    );
    const client = new HerdrClient(fake.socketPath, { timeoutMs: 500 });
    const controller = new AbortController();
    const events: unknown[] = [];

    await client.subscribe(
      "events.subscribe",
      { subscriptions: [] },
      {
        onEvent: (value) => {
          events.push(value);
          controller.abort();
        },
        signal: controller.signal,
      },
    );

    expect(events).toEqual([event]);
    expect(fake.requests[0]).toMatchObject({ method: "events.subscribe" });
  });

  test("surfaces structured herdr errors", async () => {
    const fake = await fakeHerdr((request) => ({
      error: { code: "agent_not_found", message: "No such agent" },
      id: request.id,
    }));
    const client = new HerdrClient(fake.socketPath, { timeoutMs: 500 });

    await expect(client.request("agent.prompt", {})).rejects.toEqual(
      expect.objectContaining<Partial<HerdrApiError>>({
        code: "agent_not_found",
        message: "No such agent",
      }),
    );
  });
});
