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
  ".webmanifest": "application/manifest+json; charset=utf-8",
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
      const filename = filePath.slice(filePath.lastIndexOf(sep) + 1);
      const revalidated =
        extension === ".html" ||
        extension === ".webmanifest" ||
        filename === "sw.js" ||
        filename === "theme-init.js";
      response.writeHead(200, {
        "cache-control": revalidated
          ? "no-cache"
          : "public, max-age=31536000, immutable",
        "content-length": info.size,
        "content-security-policy":
          "default-src 'self'; base-uri 'self'; connect-src 'self'; font-src 'self'; form-action 'self'; frame-ancestors 'none'; img-src 'self' blob: data:; manifest-src 'self'; object-src 'none'; script-src 'self'; style-src 'self' 'unsafe-inline'; worker-src 'self'",
        "content-type": MIME_TYPES[extension] ?? "application/octet-stream",
        "permissions-policy":
          "clipboard-read=(self), clipboard-write=(self), notifications=(self), screen-wake-lock=(self)",
        "referrer-policy": "no-referrer",
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
