import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createHerdrHttpHandler, type HerdrService } from "../server/http-app";

const servers: Server[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
});

async function startApi(service: HerdrService): Promise<string> {
  const server = createServer(
    createHerdrHttpHandler({ service, token: "test-secret" }),
  );
  servers.push(server);
  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No TCP port");
  return `http://127.0.0.1:${address.port}`;
}

function fakeService(): HerdrService {
  return {
    closePane: vi.fn().mockResolvedValue({ type: "ok" }),
    createSession: vi.fn().mockResolvedValue({ type: "agent_started" }),
    getState: vi.fn().mockResolvedValue({ reads: {}, snapshot: {} }),
    promptAgent: vi.fn().mockResolvedValue({ type: "agent_prompted" }),
    splitPane: vi.fn().mockResolvedValue({ type: "pane_info" }),
  };
}

describe("herdr HTTP bridge", () => {
  test("fails closed without a bearer token", async () => {
    const baseUrl = await startApi(fakeService());

    const response = await fetch(`${baseUrl}/api/herdr/state`);

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("returns live state with a valid token", async () => {
    const service = fakeService();
    const baseUrl = await startApi(service);

    const response = await fetch(`${baseUrl}/api/herdr/state`, {
      headers: { authorization: "Bearer test-secret" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ reads: {}, snapshot: {} });
    expect(service.getState).toHaveBeenCalledOnce();
  });

  test("validates and forwards a trimmed agent prompt", async () => {
    const service = fakeService();
    const baseUrl = await startApi(service);

    const response = await fetch(`${baseUrl}/api/herdr/agents/w5%3Ap1/prompt`, {
      body: JSON.stringify({ message: "  hi  " }),
      headers: {
        authorization: "Bearer test-secret",
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(service.promptAgent).toHaveBeenCalledWith("w5:p1", "hi");
  });

  test("rejects malformed resource IDs without touching herdr", async () => {
    const service = fakeService();
    const baseUrl = await startApi(service);

    const response = await fetch(`${baseUrl}/api/herdr/agents/%/prompt`, {
      body: JSON.stringify({ message: "hi" }),
      headers: {
        authorization: "Bearer test-secret",
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(service.promptAgent).not.toHaveBeenCalled();
  });

  test("rejects empty prompts without touching herdr", async () => {
    const service = fakeService();
    const baseUrl = await startApi(service);

    const response = await fetch(`${baseUrl}/api/herdr/agents/w5:p1/prompt`, {
      body: JSON.stringify({ message: "   " }),
      headers: {
        authorization: "Bearer test-secret",
        "content-type": "application/json",
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(service.promptAgent).not.toHaveBeenCalled();
  });
});
