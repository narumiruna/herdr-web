import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import type { IncomingMessage, ServerResponse } from "node:http";
import { extname, join, normalize, resolve, sep } from "node:path";

const MIME_TYPES: Record<string, string> = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function safePath(root: string, pathname: string): string | null {
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return null;
  }
  const candidate = resolve(root, `.${normalize(decoded)}`);
  return candidate === root || candidate.startsWith(`${root}${sep}`)
    ? candidate
    : null;
}

export function createStaticHandler(rootDirectory: string) {
  const root = resolve(rootDirectory);
  return async (request: IncomingMessage, response: ServerResponse) => {
    if (request.method !== "GET" && request.method !== "HEAD") {
      response.writeHead(405, { allow: "GET, HEAD" });
      response.end();
      return;
    }
    const url = new URL(request.url ?? "/", "http://herdr.local");
    const requested = safePath(root, url.pathname);
    if (!requested) {
      response.writeHead(400);
      response.end("Bad request");
      return;
    }
    let filePath = requested;
    try {
      const info = await stat(filePath);
      if (info.isDirectory()) filePath = join(filePath, "index.html");
    } catch {
      filePath = join(root, "index.html");
    }
    try {
      const info = await stat(filePath);
      if (!info.isFile()) throw new Error("Not a file");
      const extension = extname(filePath).toLowerCase();
      response.writeHead(200, {
        "cache-control":
          extension === ".html"
            ? "no-cache"
            : "public, max-age=31536000, immutable",
        "content-length": info.size,
        "content-type": MIME_TYPES[extension] ?? "application/octet-stream",
        "x-content-type-options": "nosniff",
        "x-frame-options": "DENY",
      });
      if (request.method === "HEAD") {
        response.end();
        return;
      }
      createReadStream(filePath).pipe(response);
    } catch {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
    }
  };
}
