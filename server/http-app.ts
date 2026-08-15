import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { HerdrApiError } from "./herdr-client.js";
import type {
  CreateSessionInput,
  CreateWorkspaceInput,
} from "./herdr-service.js";
import {
  type ImageUploadInput,
  MAX_IMAGE_BYTES,
  type UploadedImage,
  validateImage,
} from "./image-upload.js";
import type { TerminalTicketStore } from "./terminal-tickets.js";

export interface HerdrService {
  closePane(paneId: string): Promise<unknown>;
  createSession(input: CreateSessionInput): Promise<unknown>;
  createWorkspace(input: CreateWorkspaceInput): Promise<unknown>;
  getState(): Promise<unknown>;
  promptAgent(target: string, text: string): Promise<unknown>;
  splitPane(paneId: string): Promise<unknown>;
  subscribeEvents?(
    signal: AbortSignal,
    onEvent: (event: unknown) => void,
    onReady?: () => void,
  ): Promise<void>;
  uploadImage(paneId: string, input: ImageUploadInput): Promise<UploadedImage>;
}

interface HandlerOptions {
  service: HerdrService;
  terminalConfigured?: boolean;
  terminalTickets?: TerminalTicketStore;
  token: string;
  viewToken?: string;
}

const RESOURCE_ID = /^[A-Za-z0-9:_-]{1,128}$/;
const MAX_JSON_BODY_BYTES = 16_384;

class PayloadTooLargeError extends Error {}

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

function tokenMatches(supplied: string, expected: string): boolean {
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return (
    suppliedBytes.length === expectedBytes.length &&
    timingSafeEqual(suppliedBytes, expectedBytes)
  );
}

function accessRole(
  request: IncomingMessage,
  controllerToken: string,
  viewToken?: string,
): "controller" | "viewer" | undefined {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;
  const supplied = header.slice(7);
  if (tokenMatches(supplied, controllerToken)) return "controller";
  if (viewToken && tokenMatches(supplied, viewToken)) return "viewer";
  return undefined;
}

async function readBody(
  request: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  const declaredLength = Number.parseInt(
    request.headers["content-length"] ?? "0",
    10,
  );
  if (declaredLength > maxBytes) {
    throw new PayloadTooLargeError("Request body is too large");
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > maxBytes) {
      throw new PayloadTooLargeError("Request body is too large");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const body = await readBody(request, MAX_JSON_BODY_BYTES);
  if (body.length === 0) return {};
  return JSON.parse(body.toString("utf8")) as unknown;
}

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function cleanId(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new TypeError("Invalid herdr resource id");
  }
  if (!RESOURCE_ID.test(decoded))
    throw new TypeError("Invalid herdr resource id");
  return decoded;
}

function cleanText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string")
    throw new TypeError(`${field} must be a string`);
  const text = value.trim();
  if (!text || text.length > max) {
    throw new TypeError(`${field} must contain 1-${max} characters`);
  }
  return text;
}

function cleanTerminalDimension(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 1_000) {
    throw new RangeError(`${field} must be an integer between 1 and 1000`);
  }
  return Number(value);
}

function cleanPath(value: unknown): string {
  const path = cleanText(value, "cwd", 4_096);
  if (
    [...path].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || code === 127;
    })
  ) {
    throw new TypeError("cwd must not contain control characters");
  }
  return path;
}

function errorResponse(response: ServerResponse, error: unknown): void {
  if (error instanceof PayloadTooLargeError) {
    sendJson(response, 413, {
      error: { code: "payload_too_large", message: error.message },
    });
    return;
  }
  if (
    error instanceof TypeError ||
    error instanceof RangeError ||
    error instanceof SyntaxError
  ) {
    sendJson(response, 400, {
      error: { code: "invalid_request", message: error.message },
    });
    return;
  }
  if (error instanceof HerdrApiError) {
    sendJson(response, 502, {
      error: { code: error.code, message: error.message },
    });
    return;
  }
  const nodeError = error as NodeJS.ErrnoException;
  if (nodeError?.code === "ENOENT" || nodeError?.code === "ECONNREFUSED") {
    sendJson(response, 503, {
      error: {
        code: "herdr_unavailable",
        message: "Cannot connect to the herdr socket",
      },
    });
    return;
  }
  console.error("herdr bridge request failed", error);
  sendJson(response, 500, {
    error: { code: "bridge_error", message: "Herdr bridge request failed" },
  });
}

export function createHerdrHttpHandler({
  service,
  terminalConfigured = false,
  terminalTickets,
  token,
  viewToken,
}: HandlerOptions) {
  if (!token) throw new Error("HEDR_TOKEN must not be empty");
  if (viewToken === token) {
    throw new Error("HEDR_VIEW_TOKEN must differ from HEDR_TOKEN");
  }
  return async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://herdr.local");
    if (!url.pathname.startsWith("/api/herdr/")) {
      sendJson(response, 404, {
        error: { code: "not_found", message: "Not found" },
      });
      return;
    }
    const role = accessRole(request, token, viewToken);
    if (!role) {
      response.setHeader("www-authenticate", "Bearer");
      sendJson(response, 401, {
        error: {
          code: "unauthorized",
          message: "A valid access token is required",
        },
      });
      return;
    }

    try {
      if (request.method === "GET" && url.pathname === "/api/herdr/events") {
        if (!service.subscribeEvents) {
          sendJson(response, 404, {
            error: {
              code: "event_stream_unavailable",
              message: "Herdr event streaming is unavailable",
            },
          });
          return;
        }
        const controller = new AbortController();
        let keepalive: NodeJS.Timeout | undefined;
        response.once("close", () => controller.abort());
        try {
          await service.subscribeEvents(
            controller.signal,
            (event) => {
              if (response.writableEnded) return;
              const writable = response.write(`${JSON.stringify(event)}\n`);
              if (!writable) controller.abort();
            },
            () => {
              response.writeHead(200, {
                "cache-control": "no-store",
                connection: "keep-alive",
                "content-type": "application/x-ndjson; charset=utf-8",
                "x-accel-buffering": "no",
                "x-content-type-options": "nosniff",
              });
              response.flushHeaders();
              keepalive = setInterval(() => {
                if (!response.writableEnded) response.write("\n");
              }, 15_000);
              keepalive.unref();
            },
          );
          if (!response.writableEnded) response.end();
        } catch (error) {
          if (!response.headersSent) errorResponse(response, error);
          else if (!response.writableEnded) response.end();
        } finally {
          if (keepalive) clearInterval(keepalive);
        }
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/herdr/state") {
        const state = await service.getState();
        sendJson(
          response,
          200,
          state && typeof state === "object" && !Array.isArray(state)
            ? { ...state, access: { role } }
            : state,
        );
        return;
      }
      const terminalTicket = url.pathname.match(
        /^\/api\/herdr\/panes\/([^/]+)\/terminal-ticket$/,
      );
      if (request.method === "POST" && terminalTicket?.[1]) {
        if (!terminalConfigured || !terminalTickets) {
          sendJson(response, 409, {
            error: {
              code: "terminal_streaming_unavailable",
              message:
                "This Hedr bridge is not configured for Herdr terminal sessions",
            },
          });
          return;
        }
        const body = objectBody(await readJson(request));
        const mode = body.mode ?? "control";
        if (mode !== "control" && mode !== "observe") {
          throw new TypeError("mode must be control or observe");
        }
        if (body.takeover !== undefined && typeof body.takeover !== "boolean") {
          throw new TypeError("takeover must be a boolean");
        }
        if (mode === "observe" && body.takeover === true) {
          throw new TypeError("observe mode cannot take control");
        }
        if (role === "viewer" && mode !== "observe") {
          sendJson(response, 403, {
            error: {
              code: "read_only_access",
              message: "This access token permits observation only",
            },
          });
          return;
        }
        const issued = terminalTickets.issue({
          cols: cleanTerminalDimension(body.cols, "cols"),
          mode,
          paneId: cleanId(terminalTicket[1]),
          rows: cleanTerminalDimension(body.rows, "rows"),
          takeover: body.takeover === true,
        });
        sendJson(response, 201, {
          ...issued,
          path: "/api/herdr/terminal",
          type: "terminal_ticket",
        });
        return;
      }
      if (role === "viewer") {
        sendJson(response, 403, {
          error: {
            code: "read_only_access",
            message: "This access token does not permit Herdr mutations",
          },
        });
        return;
      }
      const image = url.pathname.match(
        /^\/api\/herdr\/agents\/([^/]+)\/images$/,
      );
      if (request.method === "POST" && image?.[1]) {
        const mediaType = request.headers["content-type"]
          ?.split(";", 1)[0]
          ?.trim()
          .toLowerCase();
        const input: ImageUploadInput = {
          data: await readBody(request, MAX_IMAGE_BYTES),
          mediaType: mediaType ?? "",
        };
        validateImage(input);
        sendJson(
          response,
          200,
          await service.uploadImage(cleanId(image[1]), input),
        );
        return;
      }
      const prompt = url.pathname.match(
        /^\/api\/herdr\/agents\/([^/]+)\/prompt$/,
      );
      if (request.method === "POST" && prompt?.[1]) {
        const body = objectBody(await readJson(request));
        const result = await service.promptAgent(
          cleanId(prompt[1]),
          cleanText(body.message, "message", 20_000),
        );
        sendJson(response, 200, result);
        return;
      }
      const split = url.pathname.match(/^\/api\/herdr\/panes\/([^/]+)\/split$/);
      if (request.method === "POST" && split?.[1]) {
        sendJson(response, 200, await service.splitPane(cleanId(split[1])));
        return;
      }
      const close = url.pathname.match(/^\/api\/herdr\/panes\/([^/]+)$/);
      if (request.method === "DELETE" && close?.[1]) {
        sendJson(response, 200, await service.closePane(cleanId(close[1])));
        return;
      }
      if (
        request.method === "POST" &&
        url.pathname === "/api/herdr/workspaces"
      ) {
        const body = objectBody(await readJson(request));
        const input: CreateWorkspaceInput = {
          cwd: cleanPath(body.cwd),
          ...(body.label === undefined
            ? {}
            : { label: cleanText(body.label, "label", 80) }),
        };
        sendJson(response, 201, await service.createWorkspace(input));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/herdr/sessions") {
        const body = objectBody(await readJson(request));
        const input: CreateSessionInput = {
          command: cleanText(body.command, "command", 120),
          label: cleanText(body.label, "label", 80),
          runtime: cleanText(body.runtime, "runtime", 40),
          workspaceId: cleanText(body.workspaceId, "workspaceId", 128),
        };
        if (!RESOURCE_ID.test(input.workspaceId)) {
          throw new TypeError("Invalid workspace id");
        }
        sendJson(response, 200, await service.createSession(input));
        return;
      }
      sendJson(response, 404, {
        error: { code: "not_found", message: "Not found" },
      });
    } catch (error) {
      errorResponse(response, error);
    }
  };
}
