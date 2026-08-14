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

describe("live herdr app", () => {
  test("requires an access token before reading herdr", () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    render(<App live />);

    expect(
      screen.getByRole("heading", { name: "Enter the access token" }),
    ).toBeVisible();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test("uploads a selected image and prompts the agent with its host path", async () => {
    window.history.replaceState({}, "", "/?token=test-token");
    const imagePath = "/repo/.herdr-web/uploads/remote-shot.png";
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

    await screen.findByRole("heading", { name: "π - live-test" });
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
      await screen.findByRole("heading", { name: "π - live-test" }),
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
