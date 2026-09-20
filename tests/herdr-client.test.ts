import { mkdtemp, rm } from "node:fs/promises";
import { createServer, type Server, type Socket } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import { type HerdrApiError, HerdrClient } from "../server/herdr-client";

const cleanups: Array<() => Promise<void>> = [];

afterEach(async () => {
  await Promise.all(cleanups.splice(0).map((cleanup) => cleanup()));
});

async function fakeHerdr(
  respond: (
    request: Record<string, unknown>,
  ) => Record<string, unknown> | undefined,
  afterRespond?: (socket: Socket, request: Record<string, unknown>) => void,
): Promise<{
  socketPath: string;
  requests: Array<Record<string, unknown>>;
  sockets: Set<Socket>;
}> {
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
        const response = respond(request);
        if (response) socket.write(`${JSON.stringify(response)}\n`);
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
  return { socketPath, requests, sockets };
}

describe("HerdrClient", () => {
  test.each(["request", "subscribe"] as const)(
    "%s ignores unrelated ids and accepts coalesced lines",
    async (mode) => {
      const fake = await fakeHerdr(
        () => undefined,
        (socket, request) => {
          socket.write(
            `\n${JSON.stringify({ id: "other", result: 0 })}\n${JSON.stringify({ id: request.id, result: 42 })}\n${JSON.stringify({ event: "one" })}\n${JSON.stringify({ event: "two" })}\n`,
          );
        },
      );
      const client = new HerdrClient(fake.socketPath);
      if (mode === "request") {
        await expect(client.request("ping", {})).resolves.toBe(42);
      } else {
        const controller = new AbortController();
        const events: unknown[] = [];
        let ready = false;
        await client.subscribe(
          "events.subscribe",
          {},
          {
            signal: controller.signal,
            onReady: () => {
              ready = true;
            },
            onEvent: (event) => {
              expect(ready).toBe(true);
              events.push(event);
              if (events.length === 2) controller.abort();
            },
          },
        );
        expect(events).toEqual([{ event: "one" }, { event: "two" }]);
      }
      await vi.waitFor(() => expect(fake.sockets.size).toBe(0));
    },
  );

  test.each(["request", "subscribe"] as const)(
    "%s rejects malformed, missing, oversized, and closed responses",
    async (mode) => {
      const errors =
        mode === "request"
          ? {
              json: "Herdr returned invalid JSON",
              missing: "Herdr response did not include a result",
              oversized: "Herdr returned an oversized response",
              closed: "Herdr closed the socket before responding",
            }
          : {
              json: "Herdr returned invalid subscription JSON",
              missing: "Herdr subscription did not start",
              oversized: "Herdr returned an oversized subscription event",
              closed: "Herdr closed the event subscription",
            };
      const oversized = "x".repeat(4 * 1024 * 1024 + 1);
      for (const [output, expected] of [
        [() => "not-json\n", errors.json],
        [(id: unknown) => `${JSON.stringify({ id })}\n`, errors.missing],
        [() => `${oversized}\n`, errors.oversized],
        [() => oversized, errors.oversized],
        [() => "", errors.closed],
        [
          (id: unknown) =>
            `${JSON.stringify({ id, error: { code: "denied", message: "Denied" } })}\n`,
          "Denied",
        ],
      ] as const) {
        const fake = await fakeHerdr(
          () => undefined,
          (socket, request) => socket.end(output(request.id)),
        );
        const client = new HerdrClient(fake.socketPath, { timeoutMs: 2_000 });
        const result =
          mode === "request"
            ? client.request("ping", {})
            : client.subscribe(
                "events.subscribe",
                {},
                {
                  onEvent: () => undefined,
                  signal: new AbortController().signal,
                },
              );
        await expect(result).rejects.toThrow(expected);
        await vi.waitFor(() => expect(fake.sockets.size).toBe(0));
      }
    },
  );

  test("times out requests and subscription setup, but not a ready subscription", async () => {
    const silent = await fakeHerdr(() => undefined);
    const client = new HerdrClient(silent.socketPath, { timeoutMs: 20 });
    await expect(client.request("ping", {})).rejects.toThrow(
      "Herdr request timed out after 20ms",
    );
    await expect(
      client.subscribe(
        "events.subscribe",
        {},
        {
          onEvent: () => undefined,
          signal: new AbortController().signal,
        },
      ),
    ).rejects.toThrow("Herdr subscription timed out after 20ms");
    const ready = await fakeHerdr((request) => ({
      id: request.id,
      result: {},
    }));
    const controller = new AbortController();
    await new HerdrClient(ready.socketPath, { timeoutMs: 200 }).subscribe(
      "events.subscribe",
      {},
      {
        signal: controller.signal,
        onReady: () => {
          setTimeout(() => controller.abort(), 250);
        },
        onEvent: () => undefined,
      },
    );
    await vi.waitFor(() => expect(ready.sockets.size).toBe(0));
  });

  test.each(["ready", "event"] as const)(
    "propagates %s callback exceptions and closes the socket",
    async (stage) => {
      const fake = await fakeHerdr(
        (request) => ({ id: request.id, result: {} }),
        (socket) => socket.write('{"event":"one"}\n'),
      );
      const thrown = new Error(`${stage} failed`);
      await expect(
        new HerdrClient(fake.socketPath).subscribe(
          "events.subscribe",
          {},
          {
            signal: new AbortController().signal,
            onReady: () => {
              if (stage === "ready") throw thrown;
            },
            onEvent: () => {
              throw thrown;
            },
          },
        ),
      ).rejects.toBe(thrown);
      await vi.waitFor(() => expect(fake.sockets.size).toBe(0));
    },
  );

  test("cancels before readiness and with an already-aborted signal", async () => {
    const fake = await fakeHerdr(() => undefined);
    for (const alreadyAborted of [false, true]) {
      const controller = new AbortController();
      if (alreadyAborted) controller.abort();
      const onReady = vi.fn();
      const subscribed = new HerdrClient(fake.socketPath).subscribe(
        "events.subscribe",
        {},
        {
          onEvent: vi.fn(),
          onReady,
          signal: controller.signal,
        },
      );
      if (!alreadyAborted) {
        await vi.waitFor(() => expect(fake.requests.length).toBe(1));
        controller.abort();
      }
      await subscribed;
      expect(onReady).not.toHaveBeenCalled();
      await vi.waitFor(() => expect(fake.sockets.size).toBe(0));
    }
  });

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

  test("supports a longer timeout for one slow request", async () => {
    const fake = await fakeHerdr(
      () => undefined,
      (socket, request) => {
        setTimeout(
          () =>
            socket.write(
              `${JSON.stringify({ id: request.id, result: { type: "ok" } })}\n`,
            ),
          30,
        );
      },
    );
    const client = new HerdrClient(fake.socketPath, { timeoutMs: 5 });

    await expect(
      client.request("agent.start", {}, { timeoutMs: 100 }),
    ).resolves.toEqual({ type: "ok" });
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
