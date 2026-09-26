import { randomUUID } from "node:crypto";
import { createConnection, type Socket } from "node:net";

const MAX_HERDR_LINE_BYTES = 4 * 1024 * 1024;

interface HerdrClientOptions {
  timeoutMs?: number;
}

interface HerdrRequestOptions {
  timeoutMs?: number;
}

export type HerdrEndpoint = string | { host: string; port: number };

interface HerdrErrorBody {
  code: string;
  message: string;
}

interface HerdrResponse {
  id: string;
  result?: unknown;
  error?: HerdrErrorBody;
}

interface HerdrSubscriptionOptions<T> {
  onEvent: (event: T) => void;
  onReady?: () => void;
  signal: AbortSignal;
}

export class HerdrApiError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "HerdrApiError";
    this.code = code;
  }
}

// Returning false stops processing the current chunk after the caller settles.
function receiveMessages(
  socket: Socket,
  kind: "response" | "subscription",
  onMessage: (value: unknown) => boolean,
  onError: (error: Error) => void,
): void {
  let buffer = "";
  const oversized = () =>
    onError(
      new Error(
        kind === "response"
          ? "Herdr returned an oversized response"
          : "Herdr returned an oversized subscription event",
      ),
    );
  socket.setEncoding("utf8");
  socket.on("data", (chunk) => {
    buffer += chunk;
    let newline = buffer.indexOf("\n");
    while (newline >= 0) {
      const line = buffer.slice(0, newline).trim();
      buffer = buffer.slice(newline + 1);
      newline = buffer.indexOf("\n");
      if (!line) continue;
      if (Buffer.byteLength(line) > MAX_HERDR_LINE_BYTES) {
        oversized();
        return;
      }
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        onError(
          new Error(
            kind === "response"
              ? "Herdr returned invalid JSON"
              : "Herdr returned invalid subscription JSON",
          ),
        );
        return;
      }
      if (!onMessage(value)) return;
    }
    if (Buffer.byteLength(buffer) > MAX_HERDR_LINE_BYTES) oversized();
  });
}

export class HerdrClient {
  readonly endpoint: HerdrEndpoint;
  readonly timeoutMs: number;

  constructor(endpoint: HerdrEndpoint, options: HerdrClientOptions = {}) {
    this.endpoint = endpoint;
    this.timeoutMs = options.timeoutMs ?? 5_000;
  }

  private connect(): Socket {
    return typeof this.endpoint === "string"
      ? createConnection(this.endpoint)
      : createConnection(this.endpoint.port, this.endpoint.host);
  }

  request<T = unknown>(
    method: string,
    params: unknown,
    options: HerdrRequestOptions = {},
  ): Promise<T> {
    const id = `herdr-web:${randomUUID()}`;
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    return new Promise<T>((resolve, reject) => {
      const socket = this.connect();
      let settled = false;
      const finish = (error?: Error, result?: T) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        socket.destroy();
        if (error) reject(error);
        else resolve(result as T);
      };
      const timeout = setTimeout(() => {
        finish(new Error(`Herdr request timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      socket.once("error", (error) => finish(error));
      socket.once("connect", () => {
        socket.write(`${JSON.stringify({ id, method, params })}\n`);
      });
      receiveMessages(
        socket,
        "response",
        (value) => {
          const response = value as HerdrResponse;
          if (response.id !== id) return true;
          if (response.error) {
            finish(
              new HerdrApiError(response.error.code, response.error.message),
            );
          } else if (!("result" in response)) {
            finish(new Error("Herdr response did not include a result"));
          } else {
            finish(undefined, response.result as T);
          }
          return false;
        },
        finish,
      );
      socket.once("end", () => {
        finish(new Error("Herdr closed the socket before responding"));
      });
    });
  }

  subscribe<T = unknown>(
    method: string,
    params: unknown,
    { onEvent, onReady, signal }: HerdrSubscriptionOptions<T>,
  ): Promise<void> {
    const id = `herdr-web:${randomUUID()}`;
    return new Promise<void>((resolve, reject) => {
      const socket = this.connect();
      let ready = false;
      let settled = false;
      const finish = (error?: Error) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        signal.removeEventListener("abort", abort);
        socket.destroy();
        if (error) reject(error);
        else resolve();
      };
      const abort = () => finish();
      const timeout = setTimeout(() => {
        finish(
          new Error(`Herdr subscription timed out after ${this.timeoutMs}ms`),
        );
      }, this.timeoutMs);

      if (signal.aborted) {
        finish();
        return;
      }
      signal.addEventListener("abort", abort, { once: true });
      socket.once("error", (error) => finish(error));
      socket.once("connect", () => {
        socket.write(`${JSON.stringify({ id, method, params })}\n`);
      });
      receiveMessages(
        socket,
        "subscription",
        (value) => {
          if (!ready) {
            const response = value as HerdrResponse;
            if (response.id !== id) return true;
            if (response.error) {
              finish(
                new HerdrApiError(response.error.code, response.error.message),
              );
              return false;
            }
            if (!("result" in response)) {
              finish(new Error("Herdr subscription did not start"));
              return false;
            }
            ready = true;
            clearTimeout(timeout);
            try {
              onReady?.();
            } catch (error) {
              finish(
                error instanceof Error
                  ? error
                  : new Error("Herdr subscription setup failed"),
              );
              return false;
            }
            return true;
          }
          try {
            onEvent(value as T);
          } catch (error) {
            finish(
              error instanceof Error
                ? error
                : new Error("Herdr subscription event handling failed"),
            );
            return false;
          }
          return true;
        },
        finish,
      );
      socket.once("end", () => {
        finish(
          signal.aborted
            ? undefined
            : new Error("Herdr closed the event subscription"),
        );
      });
    });
  }
}
