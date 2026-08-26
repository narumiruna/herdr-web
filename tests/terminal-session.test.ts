import { EventEmitter } from "node:events";
import { PassThrough } from "node:stream";
import { describe, expect, test, vi } from "vitest";
import {
  LocalTerminalBackend,
  RemoteTerminalBackend,
  type TerminalServerMessage,
  TerminalSession,
} from "../server/terminal-session";

class FakeTerminalProcess extends EventEmitter {
  readonly stderr = new PassThrough();
  readonly stdin = new PassThrough();
  readonly stdout = new PassThrough();
  readonly kill = vi.fn(() => true);
}

function frame(seq: number, full = seq === 1, bytes = "hello") {
  return {
    bytes: Buffer.from(bytes).toString("base64"),
    encoding: "ansi",
    full,
    height: 24,
    seq,
    type: "terminal.frame",
    width: 80,
  };
}

function collect(session: TerminalSession): TerminalServerMessage[] {
  const messages: TerminalServerMessage[] = [];
  session.on("message", (message) => messages.push(message));
  return messages;
}

describe("TerminalSession", () => {
  test("accepts fragmented ordered ANSI frames", () => {
    const process = new FakeTerminalProcess();
    const session = new TerminalSession(process);
    const messages = collect(session);
    const line = `${JSON.stringify(frame(1, true, "決定\u001b[31m"))}\n`;

    process.stdout.write(line.slice(0, 17));
    process.stdout.write(line.slice(17));
    process.stdout.write(`${JSON.stringify(frame(2, false, "next"))}\n`);

    expect(messages).toEqual([
      frame(1, true, "決定\u001b[31m"),
      frame(2, false, "next"),
    ]);
  });

  test("rejects non-full initial frames and revision gaps before forwarding them", () => {
    const process = new FakeTerminalProcess();
    const session = new TerminalSession(process);
    const messages = collect(session);

    process.stdout.write(`${JSON.stringify(frame(1, true))}\n`);
    process.stdout.write(`${JSON.stringify(frame(3, false))}\n`);

    expect(messages[0]).toEqual(frame(1, true));
    expect(messages[1]).toMatchObject({
      code: "terminal_sequence_gap",
      type: "terminal.error",
    });
    expect(messages).toHaveLength(2);
  });

  test("forwards each accepted input once and rejects oversized input", () => {
    const process = new FakeTerminalProcess();
    const session = new TerminalSession(process);
    const messages = collect(session);
    let stdin = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      stdin += chunk;
    });

    session.accept({
      data: "echo hi\r",
      requestId: "input-1",
      type: "terminal.input",
    });
    session.accept({ cols: 100, rows: 30, type: "terminal.resize" });
    session.accept({ direction: "up", lines: 3, type: "terminal.scroll" });
    session.accept({ data: "x".repeat(70 * 1024), type: "terminal.input" });

    expect(
      stdin
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line)),
    ).toEqual([
      { text: "echo hi\r", type: "terminal.input" },
      { cols: 100, rows: 30, type: "terminal.resize" },
      { direction: "up", lines: 3, type: "terminal.scroll" },
    ]);
    expect(messages[0]).toEqual({
      requestId: "input-1",
      type: "terminal.input-accepted",
    });
    expect(messages.at(-1)).toMatchObject({
      code: "invalid_terminal_message",
      type: "terminal.error",
    });
  });

  test("rejects mutations in observer sessions", () => {
    const process = new FakeTerminalProcess();
    const session = new TerminalSession(process, false);
    const messages = collect(session);
    let stdin = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      stdin += chunk;
    });

    session.accept({ data: "must-not-send", type: "terminal.input" });

    expect(stdin).toBe("");
    expect(messages).toContainEqual(
      expect.objectContaining({
        code: "terminal_read_only",
        type: "terminal.error",
      }),
    );
  });

  test("does not replay input after release", () => {
    const process = new FakeTerminalProcess();
    const session = new TerminalSession(process);
    let stdin = "";
    process.stdin.setEncoding("utf8");
    process.stdin.on("data", (chunk) => {
      stdin += chunk;
    });

    session.accept({ type: "terminal.release" });
    session.accept({ data: "must-not-send", type: "terminal.input" });

    expect(stdin).toBe(`${JSON.stringify({ type: "terminal.release" })}\n`);
  });
});

describe("terminal backends", () => {
  test("builds a pane-scoped Herdr terminal session command", () => {
    const backend = new LocalTerminalBackend({ command: "/bin/herdr" });
    expect(backend.configured).toBe(true);
  });

  test("requires a valid port and shared token for the Docker proxy", () => {
    expect(
      new RemoteTerminalBackend({
        host: "localhost",
        port: 18788,
        token: "secret",
      }).configured,
    ).toBe(true);
    expect(
      new RemoteTerminalBackend({ host: "localhost", port: 0, token: "" })
        .configured,
    ).toBe(false);
  });
});
