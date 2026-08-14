import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { HerdrApiError } from "./herdr-client.js";
import type { CreateSessionInput } from "./herdr-service.js";
import {
  type ImageUploadInput,
  MAX_IMAGE_BYTES,
  type UploadedImage,
  validateImage,
} from "./image-upload.js";

export interface HerdrService {
  closePane(paneId: string): Promise<unknown>;
  createSession(input: CreateSessionInput): Promise<unknown>;
  getState(): Promise<unknown>;
  promptAgent(target: string, text: string): Promise<unknown>;
  splitPane(paneId: string): Promise<unknown>;
  uploadImage(paneId: string, input: ImageUploadInput): Promise<UploadedImage>;
}

interface HandlerOptions {
  service: HerdrService;
  token: string;
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

function authorized(request: IncomingMessage, token: string): boolean {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return false;
  const supplied = Buffer.from(header.slice(7));
  const expected = Buffer.from(token);
  return (
    supplied.length === expected.length && timingSafeEqual(supplied, expected)
  );
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

export function createHerdrHttpHandler({ service, token }: HandlerOptions) {
  if (!token) throw new Error("HERDR_WEB_TOKEN must not be empty");
  return async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://herdr.local");
    if (!url.pathname.startsWith("/api/herdr/")) {
      sendJson(response, 404, {
        error: { code: "not_found", message: "Not found" },
      });
      return;
    }
    if (!authorized(request, token)) {
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
      if (request.method === "GET" && url.pathname === "/api/herdr/state") {
        sendJson(response, 200, await service.getState());
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
