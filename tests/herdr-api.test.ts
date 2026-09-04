import { afterEach, describe, expect, test, vi } from "vitest";
import {
  browserAccessToken,
  HerdrApiClient,
  normalizeWorkspacePath,
  workspaceLabelFromPath,
} from "../src/herdr-api";

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  window.history.replaceState({}, "", "/");
});

describe("workspace paths", () => {
  test("preserves separators for the Herdr host to interpret", () => {
    expect(normalizeWorkspacePath(" /repo/project/// ")).toBe(
      "/repo/project///",
    );
    expect(normalizeWorkspacePath("/tmp/project\\")).toBe("/tmp/project\\");
    expect(normalizeWorkspacePath("/tmp/project\\/")).toBe("/tmp/project\\/");
    expect(normalizeWorkspacePath("C:\\")).toBe("C:\\");
    expect(normalizeWorkspacePath("\\\\server\\share\\")).toBe(
      "\\\\server\\share\\",
    );
  });

  test("suggests labels without changing POSIX backslashes", () => {
    expect(workspaceLabelFromPath("/repo/project///")).toBe("project");
    expect(workspaceLabelFromPath("/tmp/project\\/")).toBe("project\\");
    expect(workspaceLabelFromPath("/tmp/project\\name")).toBe("project\\name");
    expect(workspaceLabelFromPath("C:\\repo\\project\\")).toBe("project");
    expect(workspaceLabelFromPath("\\\\server\\share\\project\\")).toBe(
      "project",
    );
  });
});

describe("Herdr API requests", () => {
  test("consumes viewer-share fragments without sending the secret in a request URL", () => {
    const values = new Map<string, string>();
    Object.defineProperty(window, "sessionStorage", {
      configurable: true,
      value: {
        getItem: (key: string) => values.get(key) ?? null,
        removeItem: (key: string) => values.delete(key),
        setItem: (key: string, value: string) => values.set(key, value),
      },
    });
    window.history.replaceState({}, "", "/#token=share_secret");

    expect(browserAccessToken()).toBe("share_secret");
    expect(window.location.href).not.toContain("share_secret");
    expect(values.get("herdr-web-token")).toBe("share_secret");
  });

  test("allows Agent creation to cover startup and readiness", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ type: "agent_started" }), {
        headers: { "content-type": "application/json" },
        status: 200,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = new HerdrApiClient("secret");

    await api.createSession({
      command: "pi",
      label: "slow-agent",
      runtime: "Pi",
      workspaceId: "w1",
    });

    expect(timeout).toHaveBeenCalledWith(205_000);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/herdr/sessions",
      expect.objectContaining({
        method: "POST",
        signal: expect.any(AbortSignal),
      }),
    );
  });

  test("retries transient image failures with one stable upload id and a longer timeout", async () => {
    vi.useFakeTimers();
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new TypeError("Network connection lost"))
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            mediaType: "image/png",
            path: "/uploads/recovered.png",
            size: 11,
            type: "image_uploaded",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        ),
      );
    vi.stubGlobal("fetch", fetchMock);
    const api = new HerdrApiClient("secret");
    const image = new File(["image"], "retry.png", { type: "image/png" });

    const upload = api.uploadImage("w1:p1", image);
    await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledOnce());
    await vi.advanceTimersByTimeAsync(250);
    await expect(upload).resolves.toMatchObject({
      path: "/uploads/recovered.png",
    });

    expect(timeout).toHaveBeenCalledTimes(2);
    expect(timeout).toHaveBeenNthCalledWith(1, 120_000);
    expect(timeout).toHaveBeenNthCalledWith(2, 120_000);
    const uploadIds = fetchMock.mock.calls.map(
      ([, init]) => init.headers["x-herdr-upload-id"],
    );
    expect(uploadIds[0]).toMatch(/^[A-Za-z0-9_-]{16,128}$/);
    expect(uploadIds[1]).toBe(uploadIds[0]);
  });

  test("does not retry permanent image upload rejections", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          error: { code: "invalid_request", message: "Invalid image" },
        }),
        { headers: { "content-type": "application/json" }, status: 400 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = new HerdrApiClient("secret");

    await expect(
      api.uploadImage(
        "w1:p1",
        new File(["bad"], "bad.png", { type: "image/png" }),
      ),
    ).rejects.toMatchObject({ code: "invalid_request", status: 400 });
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  test("sends an exact one-shot terminal quick reply without changing navigation", async () => {
    class QuickReplySocket {
      static readonly OPEN = 1;
      static instances: QuickReplySocket[] = [];
      readyState = QuickReplySocket.OPEN;
      sent: string[] = [];
      onclose?: (event: { reason: string }) => void;
      onerror?: () => void;
      onmessage?: (event: { data: string }) => void;

      constructor(readonly url: string | URL) {
        QuickReplySocket.instances.push(this);
      }

      send(value: string) {
        this.sent.push(value);
      }

      close() {}
    }
    vi.stubGlobal("WebSocket", QuickReplySocket);
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            expiresAt: Date.now() + 30_000,
            path: "/api/herdr/terminal",
            ticket: "reply-ticket",
            type: "terminal_ticket",
          }),
          { headers: { "content-type": "application/json" }, status: 201 },
        ),
      ),
    );
    const api = new HerdrApiClient("secret");
    const reply = api.quickReply("w1:p1", "Keep numeric IDs");
    await vi.waitFor(() => expect(QuickReplySocket.instances).toHaveLength(1));
    const socket = QuickReplySocket.instances[0];
    if (!socket) throw new Error("Missing quick reply socket");
    socket.onmessage?.({
      data: JSON.stringify({ bytes: "", full: true, type: "terminal.frame" }),
    });
    const input = JSON.parse(socket.sent[0] ?? "{}") as { requestId: string };
    socket.onmessage?.({
      data: JSON.stringify({
        requestId: input.requestId,
        type: "terminal.input-accepted",
      }),
    });
    await reply;

    expect(String(socket.url)).toContain("ticket=reply-ticket");
    expect(String(socket.url)).not.toContain("secret");
    expect(socket.sent.map((value) => JSON.parse(value))).toEqual([
      {
        data: "Keep numeric IDs\r",
        requestId: expect.any(String),
        type: "terminal.input",
      },
      { type: "terminal.release" },
    ]);
  });

  test("uses authenticated plugin and integration routes", async () => {
    const timeout = vi.spyOn(AbortSignal, "timeout");
    const fetchMock = vi.fn().mockImplementation(
      async () =>
        new Response(JSON.stringify({ type: "ok" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const api = new HerdrApiClient("secret");

    await api.setPluginEnabled("example.board", true);
    await api.invokePluginAction("example.board.refresh");
    await api.manageIntegration("qwen", "install");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/herdr/plugins/example.board",
      expect.objectContaining({
        body: JSON.stringify({ enabled: true }),
        method: "PATCH",
      }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "/api/herdr/plugin-actions/example.board.refresh/invoke",
      expect.objectContaining({ method: "POST" }),
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      3,
      "/api/herdr/integrations/qwen",
      expect.objectContaining({
        body: JSON.stringify({ action: "install" }),
        method: "POST",
      }),
    );
    for (const [, init] of fetchMock.mock.calls) {
      expect(init.headers).toMatchObject({ authorization: "Bearer secret" });
    }
    expect(timeout).toHaveBeenCalledTimes(3);
    expect(timeout).toHaveBeenNthCalledWith(1, 15_000);
    expect(timeout).toHaveBeenNthCalledWith(2, 305_000);
    expect(timeout).toHaveBeenNthCalledWith(3, 305_000);
  });
});
