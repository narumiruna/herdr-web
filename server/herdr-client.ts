import { randomUUID } from "node:crypto";
import { createConnection } from "node:net";

interface HerdrClientOptions {
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

  request<T = unknown>(method: string, params: unknown): Promise<T> {
    const id = `herdr-web:${randomUUID()}`;
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
        finish(new Error(`Herdr request timed out after ${this.timeoutMs}ms`));
      }, this.timeoutMs);

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
      });
      socket.once("end", () => {
        finish(new Error("Herdr closed the socket before responding"));
      });
    });
  }
}
