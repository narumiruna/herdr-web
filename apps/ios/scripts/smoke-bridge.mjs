import { readFileSync } from "node:fs";
import { createServer } from "node:http";

const state = JSON.parse(
  readFileSync(
    new URL("../HerdrWebTests/Fixtures/state.json", import.meta.url),
  ),
);
let offline = false;
const streams = new Set();
const originalOutput = state.previews.p1.text;
const longOutput = Array.from(
  { length: 150 },
  (_, index) => `line ${index + 1}`,
).join("\n");
const server = createServer(async (request, response) => {
  if (request.url === "/smoke/offline" && request.method === "POST") {
    offline = true;
    response.writeHead(200).end();
    return;
  }
  if (request.url === "/smoke/online" && request.method === "POST") {
    offline = false;
    response.writeHead(200).end();
    return;
  }
  if (
    request.method === "POST" &&
    ["/smoke/focus/t1", "/smoke/focus/t2"].includes(request.url)
  ) {
    state.snapshot.workspaces[0].active_tab_id = request.url.slice(
      "/smoke/focus/".length,
    );
    for (const stream of streams) stream.write('{"event":"tab.updated"}\n');
    response.writeHead(200).end();
    return;
  }
  if (request.method === "POST" && request.url?.startsWith("/smoke/output/")) {
    const mode = request.url.slice("/smoke/output/".length);
    if (!["short", "long", "updated"].includes(mode)) {
      response.writeHead(404).end();
      return;
    }
    state.previews.p1.text =
      mode === "short"
        ? originalOutput
        : `${longOutput}\n${mode === "updated" ? "new tail" : "old tail"}`;
    for (const stream of streams) stream.write('{"event":"pane.updated"}\n');
    response.writeHead(200).end();
    return;
  }
  const token = request.headers.authorization?.replace(/^Bearer /, "");
  if (token !== "smoke-controller" && token !== "smoke-viewer") {
    response.writeHead(401, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        error: { code: "unauthorized", message: "Invalid token" },
      }),
    );
    return;
  }
  if (request.url === "/api/herdr/state" && request.method === "GET") {
    if (offline) {
      response.writeHead(503, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { code: "unavailable" } }));
      return;
    }
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({
        ...state,
        access: { role: token === "smoke-viewer" ? "viewer" : "controller" },
      }),
    );
    return;
  }
  if (request.url === "/api/herdr/events" && request.method === "GET") {
    response.writeHead(200, { "content-type": "application/x-ndjson" });
    response.write("\n");
    streams.add(response);
    const keepalive = setInterval(() => response.write("\n"), 15_000);
    response.on("close", () => {
      streams.delete(response);
      clearInterval(keepalive);
    });
    return;
  }
  if (
    request.url === "/api/herdr/agents/p1/prompt" &&
    request.method === "POST"
  ) {
    if (token === "smoke-viewer") {
      response.writeHead(403, { "content-type": "application/json" });
      response.end(JSON.stringify({ error: { code: "read_only_access" } }));
      return;
    }
    const parts = [];
    for await (const part of request) parts.push(part);
    const { message } = JSON.parse(Buffer.concat(parts).toString());
    response.writeHead(message?.trim() ? 200 : 400, {
      "content-type": "application/json",
    });
    response.end(
      JSON.stringify({
        type: message?.trim() ? "agent_prompted" : "invalid_message",
      }),
    );
    return;
  }
  response.writeHead(404).end();
});
server.listen(18997, "127.0.0.1");
