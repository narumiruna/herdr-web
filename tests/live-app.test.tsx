import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, test, vi } from "vitest";
import { App } from "../src/App";

const payload = {
  reads: {
    "w9:p1": { pane_id: "w9:p1", revision: 3, text: "Pi is ready" },
  },
  snapshot: {
    agents: [
      {
        agent: "pi",
        agent_status: "idle",
        cwd: "/repo",
        pane_id: "w9:p1",
        revision: 3,
        tab_id: "w9:t1",
        terminal_title_stripped: "π - live-test",
        workspace_id: "w9",
      },
    ],
    focused_pane_id: "w9:p1",
    focused_workspace_id: "w9",
    layouts: [
      {
        focused_pane_id: "w9:p1",
        panes: [{ focused: true, pane_id: "w9:p1" }],
        tab_id: "w9:t1",
        workspace_id: "w9",
      },
    ],
    panes: [
      {
        agent: "pi",
        agent_status: "idle",
        cwd: "/repo",
        pane_id: "w9:p1",
        revision: 3,
        tab_id: "w9:t1",
        terminal_title_stripped: "π - live-test",
        workspace_id: "w9",
      },
    ],
    protocol: 19,
    tabs: [
      {
        agent_status: "idle",
        focused: true,
        label: "main",
        number: 1,
        pane_count: 1,
        tab_id: "w9:t1",
        workspace_id: "w9",
      },
    ],
    version: "0.8.0",
    workspaces: [
      {
        active_tab_id: "w9:t1",
        agent_status: "idle",
        focused: true,
        label: "live-test",
        number: 1,
        pane_count: 1,
        tab_count: 1,
        workspace_id: "w9",
      },
    ],
  },
};

afterEach(() => {
  vi.unstubAllGlobals();
  window.sessionStorage.clear();
  window.history.replaceState({}, "", "/");
});

describe("live Herdeer app", () => {
  test("requires an access token before reading herdr", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<App live />);

    expect(
      screen.getByRole("heading", { name: "Enter the access token" }),
    ).toBeVisible();
    expect(screen.getByLabelText("Herdeer access token")).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("shows a stable loading workbench while reading the first snapshot", () => {
    window.history.replaceState({}, "", "/?token=test-token");
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise<Response>(() => undefined)),
    );

    render(<App live />);

    expect(
      screen.getByRole("main", { name: "Connecting to Herdr" }),
    ).toHaveAttribute("aria-busy", "true");
    expect(
      screen.getByRole("heading", { name: "Preparing your workbench…" }),
    ).toBeVisible();
  });

  test("keeps an empty live workspace navigable and offers New Agent", async () => {
    window.history.replaceState({}, "", "/?token=test-token");
    const emptyPayload = {
      reads: {},
      snapshot: {
        ...payload.snapshot,
        agents: [],
        focused_pane_id: "",
        layouts: [],
        panes: [],
        tabs: [],
      },
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify(emptyPayload), {
            headers: { "content-type": "application/json" },
            status: 200,
          }),
      ),
    );

    render(<App live />);

    expect(
      await screen.findByRole("heading", { name: "Start your first Agent" }),
    ).toBeVisible();
    expect(
      screen.getByRole("button", { name: "Open live-test workspace" }),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "New agent" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Start Agent" })).toBeVisible();
  });

  test("moves long-running Agent launch failures into a recoverable background status", async () => {
    window.history.replaceState({}, "", "/?token=test-token");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/sessions")) {
        return new Response(
          JSON.stringify({
            error: {
              code: "agent_failed",
              message: "Agent did not become ready",
            },
          }),
          { headers: { "content-type": "application/json" }, status: 502 },
        );
      }
      return new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    render(<App live />);

    await screen.findByRole("tab", { name: /π - live-test.*Idle/i });
    await user.click(screen.getByRole("button", { name: "New agent" }));
    await user.type(screen.getByLabelText("Agent name"), "background-agent");
    await user.click(screen.getByRole("button", { name: "Start agent" }));

    expect(
      screen.queryByRole("dialog", { name: "Start a new Agent" }),
    ).not.toBeInTheDocument();
    expect(
      await screen.findByText("background-agent could not start."),
    ).toBeVisible();
    expect(screen.getByRole("button", { name: "Retry" })).toBeVisible();
  });

  test("uploads a selected image and prompts the agent with its host path", async () => {
    window.history.replaceState({}, "", "/?token=test-token");
    const imagePath = "/repo/.herdeer/uploads/remote-shot.png";
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/images")) {
        return new Response(
          JSON.stringify({
            mediaType: "image/png",
            path: imagePath,
            size: 11,
            type: "image_uploaded",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        );
      }
      if (url.endsWith("/prompt")) {
        return new Response(JSON.stringify({ type: "agent_prompted" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      }
      return new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const file = new File(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])],
      "remote-shot.png",
      { type: "image/png" },
    );

    render(<App live />);

    await screen.findByRole("tab", { name: /π - live-test.*Idle/i });
    await user.upload(screen.getByLabelText("Choose image"), file);
    expect(screen.getByText("remote-shot.png")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/herdr/agents/w9%3Ap1/images",
        expect.objectContaining({
          body: file,
          headers: expect.objectContaining({
            authorization: "Bearer test-token",
            "content-type": "image/png",
          }),
          method: "POST",
        }),
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/herdr/agents/w9%3Ap1/prompt",
      expect.objectContaining({
        body: JSON.stringify({
          message: `Please inspect the attached image.\n\nAttached image: \`${imagePath}\``,
        }),
        method: "POST",
      }),
    );
    expect(screen.queryByText("remote-shot.png")).not.toBeInTheDocument();
  });

  test("uploads images to the focused split pane but prompts the detected Agent", async () => {
    window.history.replaceState({}, "", "/?token=test-token");
    const splitPayload = {
      reads: {
        ...payload.reads,
        "w9:p2": { pane_id: "w9:p2", revision: 1, text: "$ pwd" },
      },
      snapshot: {
        ...payload.snapshot,
        focused_pane_id: "w9:p2",
        layouts: [
          {
            focused_pane_id: "w9:p2",
            panes: [
              { focused: false, pane_id: "w9:p1" },
              { focused: true, pane_id: "w9:p2" },
            ],
            tab_id: "w9:t1",
            workspace_id: "w9",
          },
        ],
        panes: [
          ...payload.snapshot.panes,
          {
            agent_status: "unknown",
            cwd: "/repo/tools",
            foreground_cwd: "/repo/tools",
            pane_id: "w9:p2",
            revision: 1,
            tab_id: "w9:t1",
            terminal_title_stripped: "tools",
            workspace_id: "w9",
          },
        ],
      },
    };
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/images")) {
        return new Response(
          JSON.stringify({
            mediaType: "image/png",
            path: "/repo/tools/.herdeer/uploads/split.png",
            size: 11,
            type: "image_uploaded",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        );
      }
      if (url.endsWith("/prompt")) {
        return new Response(JSON.stringify({ type: "agent_prompted" }), {
          headers: { "content-type": "application/json" },
          status: 200,
        });
      }
      return new Response(JSON.stringify(splitPayload), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const file = new File(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])],
      "split.png",
      { type: "image/png" },
    );

    render(<App live />);
    await screen.findByRole("tab", { name: /π - live-test.*Idle/i });
    await user.upload(screen.getByLabelText("Choose image"), file);
    expect(
      screen.getByText(/will be stored under \/repo\/tools/),
    ).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/herdr/agents/w9%3Ap2/images",
        expect.objectContaining({ method: "POST" }),
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/herdr/agents/w9%3Ap1/prompt",
      expect.objectContaining({ method: "POST" }),
    );
  });

  test("reuses a successful image upload when a rejected prompt is retried", async () => {
    window.history.replaceState({}, "", "/?token=test-token");
    const imagePath = "/repo/.herdeer/uploads/retry.png";
    let prompts = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/images")) {
        return new Response(
          JSON.stringify({
            mediaType: "image/png",
            path: imagePath,
            size: 11,
            type: "image_uploaded",
          }),
          { headers: { "content-type": "application/json" }, status: 200 },
        );
      }
      if (url.endsWith("/prompt")) {
        prompts += 1;
        return new Response(
          JSON.stringify(
            prompts === 1
              ? { error: { code: "agent_busy", message: "Agent is busy" } }
              : { type: "agent_prompted" },
          ),
          {
            headers: { "content-type": "application/json" },
            status: prompts === 1 ? 409 : 200,
          },
        );
      }
      return new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();
    const file = new File(
      [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10, 1, 2, 3])],
      "retry.png",
      { type: "image/png" },
    );

    render(<App live />);
    await screen.findByRole("tab", { name: /π - live-test.*Idle/i });
    await user.upload(screen.getByLabelText("Choose image"), file);
    await user.click(screen.getByRole("button", { name: "Send message" }));
    await user.click(
      await screen.findByRole("button", { name: "Retry message" }),
    );

    await waitFor(() => expect(prompts).toBe(2));
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        String(input).endsWith("/images"),
      ),
    ).toHaveLength(1);
  });

  test("keeps a failed prompt draft and offers inline retry", async () => {
    window.history.replaceState({}, "", "/?token=test-token");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.endsWith("/prompt")) {
        return new Response(
          JSON.stringify({
            error: { code: "agent_busy", message: "Agent is busy" },
          }),
          {
            headers: { "content-type": "application/json" },
            status: 409,
          },
        );
      }
      return new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App live />);

    const message = await screen.findByRole("textbox", {
      name: "Message π - live-test",
    });
    await user.type(message, "keep this draft");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      await screen.findByRole("alert", { name: "Message failed" }),
    ).toHaveTextContent("Agent is busy");
    expect(message).toHaveValue("keep this draft");
    expect(screen.getByRole("button", { name: "Retry message" })).toBeVisible();
  });

  test("warns when prompt delivery cannot be confirmed", async () => {
    window.history.replaceState({}, "", "/?token=test-token");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      if (String(input).endsWith("/prompt")) {
        throw new TypeError("Failed to fetch");
      }
      return new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App live />);
    const message = await screen.findByRole("textbox", {
      name: "Message π - live-test",
    });
    await user.type(message, "check once");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    expect(
      await screen.findByRole("button", { name: "Send message again" }),
    ).toBeVisible();
    expect(
      screen.getByRole("alert", { name: "Message failed" }),
    ).toHaveTextContent("Check the terminal");
    expect(message).toHaveValue("check once");
  });

  test("keeps the last valid snapshot visible during a transient disconnect", async () => {
    window.history.replaceState({}, "", "/?token=test-token");
    let requests = 0;
    const fetchMock = vi.fn(async () => {
      requests += 1;
      if (requests > 1) throw new TypeError("Failed to fetch");
      return new Response(JSON.stringify(payload), {
        headers: { "content-type": "application/json" },
        status: 200,
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App live />);

    expect(
      await screen.findByRole("tab", { name: /π - live-test.*Idle/i }),
    ).toBeVisible();
    expect(
      await screen.findByRole(
        "status",
        { name: "Connection interrupted" },
        { timeout: 3_000 },
      ),
    ).toHaveTextContent("Showing the last update");
    expect(
      screen.getByRole("tab", { name: /π - live-test.*Idle/i }),
    ).toBeVisible();
    expect(
      screen.queryByRole("heading", { name: "Herdr is unavailable" }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole("textbox", { name: "Message π - live-test" }),
    ).toBeDisabled();
  });

  test("loads live state and forwards a prompt with bearer auth", async () => {
    window.history.replaceState({}, "", "/?token=test-token");
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      return new Response(
        JSON.stringify(
          url.endsWith("/prompt") ? { type: "agent_prompted" } : payload,
        ),
        { headers: { "content-type": "application/json" }, status: 200 },
      );
    });
    vi.stubGlobal("fetch", fetchMock);
    const user = userEvent.setup();

    render(<App live />);

    expect(
      await screen.findByRole("tab", { name: /π - live-test.*Idle/i }),
    ).toBeVisible();
    expect(window.location.search).toBe("");
    const message = screen.getByRole("textbox", {
      name: "Message π - live-test",
    });
    await user.type(message, "hi");
    await user.click(screen.getByRole("button", { name: "Send message" }));

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/herdr/agents/w9%3Ap1/prompt",
        expect.objectContaining({
          body: JSON.stringify({ message: "hi" }),
          headers: expect.objectContaining({
            authorization: "Bearer test-token",
          }),
          method: "POST",
        }),
      ),
    );
  });
});
