import { createServer, type Server } from "node:http";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createHerdrHttpHandler, type HerdrService } from "../server/http-app";
import { TerminalTicketStore } from "../server/terminal-tickets";

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

async function startApi(
  service: HerdrService,
  terminal?: {
    configured: boolean;
    tickets: TerminalTicketStore;
    viewToken?: string;
  },
): Promise<string> {
  const server = createServer(
    createHerdrHttpHandler({
      service,
      terminalConfigured: terminal?.configured,
      terminalTickets: terminal?.tickets,
      token: "test-secret",
      viewToken: terminal?.viewToken,
    }),
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
    uploadImage: vi.fn().mockResolvedValue({
      mediaType: "image/png",
      path: "/repo/.hedr/uploads/image.png",
      size: 11,
      type: "image_uploaded",
    }),
  };
}

describe("herdr HTTP bridge", () => {
  test("fails closed without a bearer token", async () => {
    const baseUrl = await startApi(fakeService());

    const response = await fetch(`${baseUrl}/api/herdr/state`);

    expect(response.status).toBe(401);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  test("enforces independent viewer and controller permissions", async () => {
    const service = fakeService();
    const baseUrl = await startApi(service, {
      configured: true,
      tickets: new TerminalTicketStore(),
      viewToken: "view-secret",
    });
    const headers = {
      authorization: "Bearer view-secret",
      "content-type": "application/json",
    };

    const state = await fetch(`${baseUrl}/api/herdr/state`, { headers });
    expect(await state.json()).toMatchObject({ access: { role: "viewer" } });
    const mutation = await fetch(`${baseUrl}/api/herdr/agents/w5:p1/prompt`, {
      body: JSON.stringify({ message: "do not send" }),
      headers,
      method: "POST",
    });
    expect(mutation.status).toBe(403);
    expect(service.promptAgent).not.toHaveBeenCalled();
    const control = await fetch(
      `${baseUrl}/api/herdr/panes/w5:p1/terminal-ticket`,
      {
        body: JSON.stringify({ cols: 80, mode: "control", rows: 24 }),
        headers,
        method: "POST",
      },
    );
    expect(control.status).toBe(403);
    const observe = await fetch(
      `${baseUrl}/api/herdr/panes/w5:p1/terminal-ticket`,
      {
        body: JSON.stringify({ cols: 80, mode: "observe", rows: 24 }),
        headers,
        method: "POST",
      },
    );
    expect(observe.status).toBe(201);
  });

  test("streams authenticated structural Herdr events as NDJSON", async () => {
    const service = fakeService();
    service.subscribeEvents = vi.fn(async (_signal, onEvent, onReady) => {
      onReady?.();
      onEvent({ data: { pane_id: "w5:p1" }, event: "pane_updated" });
    });
    const baseUrl = await startApi(service);

    const response = await fetch(`${baseUrl}/api/herdr/events`, {
      headers: { authorization: "Bearer test-secret" },
    });

    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain(
      "application/x-ndjson",
    );
    expect((await response.text()).trim()).toBe(
      JSON.stringify({ data: { pane_id: "w5:p1" }, event: "pane_updated" }),
    );
    expect(service.subscribeEvents).toHaveBeenCalledOnce();
  });

  test("returns live state with a valid token", async () => {
    const service = fakeService();
    const baseUrl = await startApi(service);

    const response = await fetch(`${baseUrl}/api/herdr/state`, {
      headers: { authorization: "Bearer test-secret" },
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      access: { role: "controller" },
      reads: {},
      snapshot: {},
    });
    expect(service.getState).toHaveBeenCalledOnce();
  });

  test("issues a short-lived one-use terminal ticket without exposing the bearer token", async () => {
    const tickets = new TerminalTicketStore();
    const baseUrl = await startApi(fakeService(), {
      configured: true,
      tickets,
    });

    const response = await fetch(
      `${baseUrl}/api/herdr/panes/w5%3Ap1/terminal-ticket`,
      {
        body: JSON.stringify({
          cols: 120,
          mode: "control",
          rows: 40,
          takeover: false,
        }),
        headers: {
          authorization: "Bearer test-secret",
          "content-type": "application/json",
        },
        method: "POST",
      },
    );
    const body = (await response.json()) as {
      path: string;
      ticket: string;
      type: string;
    };

    expect(response.status).toBe(201);
    expect(body).toMatchObject({
      path: "/api/herdr/terminal",
      type: "terminal_ticket",
    });
    expect(body.ticket).not.toContain("test-secret");
    expect(tickets.consume(body.ticket)).toMatchObject({
      cols: 120,
      mode: "control",
      paneId: "w5:p1",
      rows: 40,
      takeover: false,
    });
  });

  test("rejects invalid terminal dimensions and unsupported bridge configuration", async () => {
    const tickets = new TerminalTicketStore();
    const configured = await startApi(fakeService(), {
      configured: true,
      tickets,
    });
    const headers = {
      authorization: "Bearer test-secret",
      "content-type": "application/json",
    };
    const invalid = await fetch(
      `${configured}/api/herdr/panes/w5%3Ap1/terminal-ticket`,
      {
        body: JSON.stringify({ cols: 0, mode: "observe", rows: 40 }),
        headers,
        method: "POST",
      },
    );
    expect(invalid.status).toBe(400);
    expect(await invalid.json()).toMatchObject({
      error: { code: "invalid_request" },
    });

    const unavailable = await startApi(fakeService());
    const unsupported = await fetch(
      `${unavailable}/api/herdr/panes/w5%3Ap1/terminal-ticket`,
      {
        body: JSON.stringify({ cols: 80, mode: "control", rows: 24 }),
        headers,
        method: "POST",
      },
    );
    expect(unsupported.status).toBe(409);
    expect(await unsupported.json()).toMatchObject({
      error: { code: "terminal_streaming_unavailable" },
    });
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

  test("authenticates and forwards a verified binary image", async () => {
    const service = fakeService();
    const baseUrl = await startApi(service);
    const png = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3]);

    const response = await fetch(`${baseUrl}/api/herdr/agents/w5%3Ap1/images`, {
      body: Buffer.from(png),
      headers: {
        authorization: "Bearer test-secret",
        "content-type": "image/png",
      },
      method: "POST",
    });

    expect(response.status).toBe(200);
    expect(service.uploadImage).toHaveBeenCalledWith("w5:p1", {
      data: expect.any(Buffer),
      mediaType: "image/png",
    });
    const upload = vi.mocked(service.uploadImage).mock.calls[0]?.[1];
    expect(upload?.data).toEqual(Buffer.from(png));
  });

  test("rejects unsupported image content before touching herdr", async () => {
    const service = fakeService();
    const baseUrl = await startApi(service);

    const response = await fetch(`${baseUrl}/api/herdr/agents/w5:p1/images`, {
      body: "<svg/>",
      headers: {
        authorization: "Bearer test-secret",
        "content-type": "image/svg+xml",
      },
      method: "POST",
    });

    expect(response.status).toBe(400);
    expect(service.uploadImage).not.toHaveBeenCalled();
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
