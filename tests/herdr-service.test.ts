import { describe, expect, test, vi } from "vitest";
import { HerdrApiError, type HerdrClient } from "../server/herdr-client";
import { LiveHerdrService } from "../server/herdr-service";

describe("LiveHerdrService", () => {
  test("uses the raw protocol spelling when reading pane output", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        snapshot: { panes: [{ pane_id: "w5:p1" }] },
        type: "session_snapshot",
      })
      .mockResolvedValueOnce({
        read: { pane_id: "w5:p1", revision: 1, text: "hi" },
        type: "pane_read",
      });
    const service = new LiveHerdrService({ request } as unknown as HerdrClient);

    await expect(service.getState()).resolves.toMatchObject({
      reads: { "w5:p1": { text: "hi" } },
    });
    expect(request).toHaveBeenNthCalledWith(2, "pane.read", {
      format: "text",
      lines: 240,
      pane_id: "w5:p1",
      source: "recent_unwrapped",
      strip_ansi: true,
    });
  });

  test("waits for a new shell and agent to become prompt-ready", async () => {
    const request = vi
      .fn()
      .mockResolvedValueOnce({
        root_pane: { pane_id: "w5:p9" },
        tab: { tab_id: "w5:t9" },
        type: "tab_created",
      })
      .mockRejectedValueOnce(
        new HerdrApiError("agent_pane_busy", "Shell is still starting"),
      )
      .mockResolvedValueOnce({
        agent: { agent_status: "unknown", pane_id: "w5:p9" },
        type: "agent_started",
      })
      .mockResolvedValueOnce({
        agent: { agent: null, interactive_ready: false },
        type: "agent_info",
      })
      .mockResolvedValueOnce({
        agent: { agent: "pi", interactive_ready: true, pane_id: "w5:p9" },
        type: "agent_info",
      });
    const service = new LiveHerdrService({ request } as unknown as HerdrClient);

    await expect(
      service.createSession({
        command: "pi",
        label: "ready-agent",
        runtime: "Pi",
        workspaceId: "w5",
      }),
    ).resolves.toMatchObject({
      agent: { agent: "pi", interactive_ready: true, pane_id: "w5:p9" },
      type: "agent_started",
    });
    expect(request).toHaveBeenCalledTimes(5);
  });

  test("rejects arbitrary commands before creating a tab", async () => {
    const request = vi.fn();
    const service = new LiveHerdrService({ request } as unknown as HerdrClient);

    await expect(
      service.createSession({
        command: "pi && rm -rf /",
        label: "unsafe",
        runtime: "Pi",
        workspaceId: "w5",
      }),
    ).rejects.toThrow("Unsupported agent runtime or command");
    expect(request).not.toHaveBeenCalled();
  });
});
