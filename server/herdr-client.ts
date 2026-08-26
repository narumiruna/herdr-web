import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";

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

export class HerdrClient {
  readonly endpoint: HerdrEndpoint;
  readonly timeoutMs: number;

  constructor(endpoint: HerdrEndpoint, options: HerdrClientOptions = {}) {
    this.endpoint = endpoint;
    this.timeoutMs = options.timeoutMs ?? 5_000;
  }

  request<T = unknown>(
    method: string,
    params: unknown,
    options: HerdrRequestOptions = {},
  ): Promise<T> {
    const id = `herdr-web:${randomUUID()}`;
    const timeoutMs = options.timeoutMs ?? this.timeoutMs;
    return new Promise<T>((resolve, reject) => {
      const socket =
        typeof this.endpoint === "string"
          ? createConnection(this.endpoint)
          : createConnection(this.endpoint.port, this.endpoint.host);
      let settled = false;
      let buffer = "";
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

      socket.setEncoding("utf8");
      socket.once("error", (error) => finish(error));
      socket.once("connect", () => {
        socket.write(`${JSON.stringify({ id, method, params })}\n`);
      });
      socket.on("data", (chunk) => {
        buffer += chunk;
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
          if (!line) continue;
          if (Buffer.byteLength(line) > MAX_HERDR_LINE_BYTES) {
            finish(new Error("Herdr returned an oversized response"));
            return;
          }
          let response: HerdrResponse;
          try {
            response = JSON.parse(line) as HerdrResponse;
          } catch {
            finish(new Error("Herdr returned invalid JSON"));
            return;
          }
          if (response.id !== id) continue;
          if (response.error) {
            finish(
              new HerdrApiError(response.error.code, response.error.message),
            );
            return;
          }
          if (!("result" in response)) {
            finish(new Error("Herdr response did not include a result"));
            return;
          }
          finish(undefined, response.result as T);
          return;
        }
        if (Buffer.byteLength(buffer) > MAX_HERDR_LINE_BYTES) {
          finish(new Error("Herdr returned an oversized response"));
        }
      });
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
      const socket =
        typeof this.endpoint === "string"
          ? createConnection(this.endpoint)
          : createConnection(this.endpoint.port, this.endpoint.host);
      let buffer = "";
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
      socket.setEncoding("utf8");
      socket.once("error", (error) => finish(error));
      socket.once("connect", () => {
        socket.write(`${JSON.stringify({ id, method, params })}\n`);
      });
      socket.on("data", (chunk) => {
        buffer += chunk;
        let newline = buffer.indexOf("\n");
        while (newline >= 0) {
          const line = buffer.slice(0, newline).trim();
          buffer = buffer.slice(newline + 1);
          newline = buffer.indexOf("\n");
          if (!line) continue;
          if (Buffer.byteLength(line) > MAX_HERDR_LINE_BYTES) {
            finish(new Error("Herdr returned an oversized subscription event"));
            return;
          }
          let value: unknown;
          try {
            value = JSON.parse(line);
          } catch {
            finish(new Error("Herdr returned invalid subscription JSON"));
            return;
          }
          if (!ready) {
            const response = value as HerdrResponse;
            if (response.id !== id) continue;
            if (response.error) {
              finish(
                new HerdrApiError(response.error.code, response.error.message),
              );
              return;
            }
            if (!("result" in response)) {
              finish(new Error("Herdr subscription did not start"));
              return;
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
              return;
            }
            continue;
          }
          try {
            onEvent(value as T);
          } catch (error) {
            finish(
              error instanceof Error
                ? error
                : new Error("Herdr subscription event handling failed"),
            );
            return;
          }
        }
        if (Buffer.byteLength(buffer) > MAX_HERDR_LINE_BYTES) {
          finish(new Error("Herdr returned an oversized subscription event"));
        }
      });
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
