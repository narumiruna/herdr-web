import { type ChildProcessWithoutNullStreams, spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { connect, type Socket } from "node:net";
import { PassThrough, type Readable, type Writable } from "node:stream";
import type { TerminalTicket } from "./terminal-tickets.js";

const MAX_FRAME_BYTES = 2 * 1024 * 1024;
const MAX_LINE_BYTES = Math.ceil((MAX_FRAME_BYTES * 4) / 3) + 4_096;
const MAX_INPUT_BYTES = 64 * 1024;
const MAX_STDERR_BYTES = 8 * 1024;
const MAX_DIMENSION = 1_000;

export type TerminalServerMessage =
  | {
      bytes: string;
      encoding: "ansi";
      full: boolean;
      height: number;
      seq: number;
      type: "terminal.frame";
      width: number;
    }
  | { reason?: string | null; type: "terminal.closed" }
  | {
      code: string;
      message: string;
      recoverable: boolean;
      type: "terminal.error";
    }
  | { requestId: string; type: "terminal.input-accepted" }
  | { type: "terminal.flow"; writable: boolean };

export type TerminalClientMessage =
  | { data: string; requestId?: string; type: "terminal.input" }
  | { cols: number; rows: number; type: "terminal.resize" }
  | { direction: "down" | "up"; lines: number; type: "terminal.scroll" }
  | { type: "terminal.release" };

interface TerminalProcess extends EventEmitter {
  kill(signal?: NodeJS.Signals): boolean;
  stderr: Readable;
  stdin: Writable;
  stdout: Readable;
}

export interface TerminalBackend {
  readonly configured: boolean;
  open(ticket: TerminalTicket): TerminalProcess;
}

interface LocalTerminalBackendOptions {
  command?: string;
  env?: NodeJS.ProcessEnv;
}

export class LocalTerminalBackend implements TerminalBackend {
  readonly configured = true;
  private readonly command: string;
  private readonly env: NodeJS.ProcessEnv;

  constructor(options: LocalTerminalBackendOptions = {}) {
    this.command = options.command ?? "herdr";
    this.env = options.env ?? process.env;
  }

  open(ticket: TerminalTicket): ChildProcessWithoutNullStreams {
    const args = [
      "terminal",
      "session",
      ticket.mode,
      ticket.paneId,
      "--cols",
      String(ticket.cols),
      "--rows",
      String(ticket.rows),
    ];
    if (ticket.mode === "control" && ticket.takeover) args.push("--takeover");
    return spawn(this.command, args, {
      env: this.env,
      stdio: ["pipe", "pipe", "pipe"],
    });
  }
}

interface RemoteTerminalBackendOptions {
  host: string;
  port: number;
  token: string;
}

class SocketTerminalProcess extends EventEmitter implements TerminalProcess {
  readonly stderr: Readable;
  readonly stdin: Writable;
  readonly stdout: Readable;

  constructor(private readonly socket: Socket) {
    super();
    this.stdin = socket;
    this.stdout = socket;
    this.stderr = new PassThrough();
    socket.once("close", (hadError) =>
      this.emit("exit", hadError ? 1 : 0, null),
    );
    socket.once("error", (error) => this.emit("error", error));
  }

  kill(): boolean {
    this.socket.destroy();
    return true;
  }
}

export class RemoteTerminalBackend implements TerminalBackend {
  readonly configured: boolean;

  constructor(private readonly options: RemoteTerminalBackendOptions) {
    this.configured =
      Number.isInteger(options.port) &&
      options.port > 0 &&
      options.port <= 65_535 &&
      Boolean(options.token);
  }

  open(ticket: TerminalTicket): TerminalProcess {
    const socket = connect(this.options.port, this.options.host);
    socket.once("connect", () => {
      socket.write(
        `${JSON.stringify({ type: "terminal.start", token: this.options.token, ...ticket })}\n`,
      );
    });
    return new SocketTerminalProcess(socket);
  }
}

function strictBase64Bytes(value: unknown): number | undefined {
  if (typeof value !== "string" || value.length > MAX_LINE_BYTES)
    return undefined;
  if (
    value.length % 4 !== 0 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(
      value,
    )
  ) {
    return undefined;
  }
  return Buffer.from(value, "base64").length;
}

function positiveInteger(value: unknown, max: number): value is number {
  return Number.isInteger(value) && Number(value) > 0 && Number(value) <= max;
}

function parseServerMessage(value: unknown): TerminalServerMessage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const message = value as Record<string, unknown>;
  if (message.type === "terminal.frame") {
    const bytes = strictBase64Bytes(message.bytes);
    if (
      bytes === undefined ||
      bytes > MAX_FRAME_BYTES ||
      message.encoding !== "ansi" ||
      typeof message.full !== "boolean" ||
      !positiveInteger(message.width, MAX_DIMENSION) ||
      !positiveInteger(message.height, MAX_DIMENSION) ||
      !positiveInteger(message.seq, Number.MAX_SAFE_INTEGER)
    ) {
      return undefined;
    }
    return {
      bytes: message.bytes as string,
      encoding: "ansi",
      full: message.full,
      height: message.height as number,
      seq: message.seq as number,
      type: "terminal.frame",
      width: message.width as number,
    };
  }
  if (message.type === "terminal.closed") {
    if (
      message.reason !== undefined &&
      message.reason !== null &&
      typeof message.reason !== "string"
    ) {
      return undefined;
    }
    return {
      reason: message.reason as string | null | undefined,
      type: "terminal.closed",
    };
  }
  if (message.type === "terminal.error") {
    if (typeof message.code !== "string" || typeof message.message !== "string")
      return undefined;
    return {
      code: message.code,
      message: message.message,
      recoverable: message.recoverable !== false,
      type: "terminal.error",
    };
  }
  return undefined;
}

function cleanClientMessage(value: unknown): TerminalClientMessage | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value))
    return undefined;
  const message = value as Record<string, unknown>;
  if (message.type === "terminal.input" && typeof message.data === "string") {
    if (Buffer.byteLength(message.data) > MAX_INPUT_BYTES) return undefined;
    if (
      message.requestId !== undefined &&
      (typeof message.requestId !== "string" ||
        message.requestId.length < 1 ||
        message.requestId.length > 64)
    ) {
      return undefined;
    }
    return {
      data: message.data,
      ...(typeof message.requestId === "string"
        ? { requestId: message.requestId }
        : {}),
      type: "terminal.input",
    };
  }
  if (
    message.type === "terminal.resize" &&
    positiveInteger(message.cols, MAX_DIMENSION) &&
    positiveInteger(message.rows, MAX_DIMENSION)
  ) {
    return {
      cols: message.cols as number,
      rows: message.rows as number,
      type: "terminal.resize",
    };
  }
  if (
    message.type === "terminal.scroll" &&
    (message.direction === "up" || message.direction === "down") &&
    positiveInteger(message.lines, MAX_DIMENSION)
  ) {
    return {
      direction: message.direction,
      lines: message.lines as number,
      type: "terminal.scroll",
    };
  }
  if (message.type === "terminal.release") return { type: "terminal.release" };
  return undefined;
}

export class TerminalSession extends EventEmitter {
  private buffer = "";
  private closed = false;
  private inputBlocked = false;
  private lastSequence = 0;
  private sawClosedMessage = false;
  private stderr = "";

  constructor(
    private readonly process: TerminalProcess,
    private readonly writableSession = true,
  ) {
    super();
    process.stdout.setEncoding("utf8");
    process.stderr.setEncoding("utf8");
    process.stdout.on("data", (chunk: string) => this.onData(chunk));
    process.stderr.on("data", (chunk: string) => {
      if (this.stderr.length < MAX_STDERR_BYTES) {
        this.stderr += chunk.slice(0, MAX_STDERR_BYTES - this.stderr.length);
      }
    });
    process.once("error", (error: Error) => {
      this.fail("terminal_unavailable", error.message, true);
    });
    process.once(
      "exit",
      (code: number | null, signal: NodeJS.Signals | null) => {
        if (this.closed) return;
        if (this.sawClosedMessage) {
          this.finish();
          return;
        }
        const detail = this.stderr.trim();
        this.fail(
          "terminal_process_exited",
          detail ||
            `Herdr terminal session exited (${signal ?? code ?? "unknown"})`,
          true,
        );
      },
    );
    process.stdin.on("drain", () => {
      if (this.closed || !this.inputBlocked) return;
      this.inputBlocked = false;
      this.emitMessage({ type: "terminal.flow", writable: true });
    });
    process.stdin.once("error", (error: Error) => {
      this.fail("terminal_input_failed", error.message, true);
    });
  }

  accept(value: unknown): void {
    if (this.closed) return;
    const message = cleanClientMessage(value);
    if (!message) {
      this.emitMessage({
        code: "invalid_terminal_message",
        message: "The terminal command is invalid or too large",
        recoverable: true,
        type: "terminal.error",
      });
      return;
    }
    if (message.type === "terminal.release") {
      this.close();
      return;
    }
    if (!this.writableSession) {
      this.emitMessage({
        code: "terminal_read_only",
        message: "This terminal session is read-only",
        recoverable: true,
        type: "terminal.error",
      });
      return;
    }
    if (this.inputBlocked) {
      this.emitMessage({
        code: "terminal_backpressure",
        message: "Terminal input is temporarily paused",
        recoverable: true,
        type: "terminal.error",
      });
      return;
    }
    const command =
      message.type === "terminal.input"
        ? { type: "terminal.input", text: message.data }
        : message.type === "terminal.resize"
          ? { type: "terminal.resize", cols: message.cols, rows: message.rows }
          : {
              type: "terminal.scroll",
              direction: message.direction,
              lines: message.lines,
            };
    const writable = this.process.stdin.write(`${JSON.stringify(command)}\n`);
    if (message.type === "terminal.input" && message.requestId) {
      this.emitMessage({
        requestId: message.requestId,
        type: "terminal.input-accepted",
      });
    }
    if (!writable) {
      this.inputBlocked = true;
      this.emitMessage({ type: "terminal.flow", writable: false });
    }
  }

  close(): void {
    if (this.closed) return;
    this.closed = true;
    this.process.stdin.write(
      `${JSON.stringify({ type: "terminal.release" })}\n`,
    );
    this.process.stdin.end();
    const timer = setTimeout(() => this.process.kill("SIGTERM"), 250);
    timer.unref();
    this.emit("closed");
  }

  private onData(chunk: string): void {
    if (this.closed) return;
    this.buffer += chunk;
    let newline = this.buffer.indexOf("\n");
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim();
      this.buffer = this.buffer.slice(newline + 1);
      newline = this.buffer.indexOf("\n");
      if (!line) continue;
      let raw: unknown;
      try {
        raw = JSON.parse(line);
      } catch {
        this.fail(
          "invalid_terminal_frame",
          "Herdr returned invalid terminal JSON",
          true,
        );
        return;
      }
      const message = parseServerMessage(raw);
      if (!message) {
        this.fail(
          "invalid_terminal_frame",
          "Herdr returned an invalid terminal message",
          true,
        );
        return;
      }
      if (message.type === "terminal.error") {
        this.emitMessage(message);
        continue;
      }
      if (message.type === "terminal.closed") {
        this.sawClosedMessage = true;
        this.emitMessage(message);
        continue;
      }
      if (message.type !== "terminal.frame") {
        this.fail(
          "invalid_terminal_frame",
          "Herdr returned an invalid terminal message",
          true,
        );
        return;
      }
      if (this.lastSequence === 0 && !message.full) {
        this.fail(
          "terminal_sync_required",
          "The first terminal frame was not a full synchronization",
          true,
        );
        return;
      }
      if (message.seq !== this.lastSequence + 1) {
        this.fail(
          "terminal_sequence_gap",
          `Expected terminal frame ${this.lastSequence + 1} but received ${message.seq}`,
          true,
        );
        return;
      }
      this.lastSequence = message.seq;
      this.emitMessage(message);
    }
    if (Buffer.byteLength(this.buffer) > MAX_LINE_BYTES) {
      this.fail(
        "terminal_frame_too_large",
        "Herdr returned an oversized terminal frame",
        true,
      );
    }
  }

  private emitMessage(message: TerminalServerMessage): void {
    if (!this.closed) this.emit("message", message);
  }

  private fail(code: string, message: string, recoverable: boolean): void {
    if (this.closed) return;
    this.emitMessage({ code, message, recoverable, type: "terminal.error" });
    this.close();
  }

  private finish(): void {
    if (this.closed) return;
    this.closed = true;
    this.emit("closed");
  }
}
