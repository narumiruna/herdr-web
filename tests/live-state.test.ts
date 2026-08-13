import { describe, expect, test } from "vitest";
import { mapLiveSnapshot } from "../src/live-state";

describe("mapLiveSnapshot", () => {
  test("maps real herdr workspaces, agents, layouts, and pane output", () => {
    const state = mapLiveSnapshot({
      reads: {
        "w5:p1": {
          pane_id: "w5:p1",
          revision: 9,
          text: "user\nhi\nassistant\nHello!",
        },
        "w5:p2": {
          pane_id: "w5:p2",
          revision: 2,
          text: "$ pwd\n/Users/narumi/workspace/herdr-web",
        },
      },
      snapshot: {
        agents: [
          {
            agent: "pi",
            agent_status: "idle",
            cwd: "/Users/narumi/workspace/herdr-web",
            pane_id: "w5:p1",
            revision: 9,
            tab_id: "w5:t1",
            terminal_title_stripped: "π - herdr-web",
            workspace_id: "w5",
          },
        ],
        focused_pane_id: "w5:p1",
        focused_workspace_id: "w5",
        layouts: [
          {
            focused_pane_id: "w5:p1",
            panes: [
              { focused: true, pane_id: "w5:p1" },
              { focused: false, pane_id: "w5:p2" },
            ],
            tab_id: "w5:t1",
            workspace_id: "w5",
          },
        ],
        panes: [
          {
            agent: "pi",
            agent_status: "idle",
            cwd: "/Users/narumi/workspace/herdr-web",
            pane_id: "w5:p1",
            revision: 9,
            tab_id: "w5:t1",
            terminal_title_stripped: "π - herdr-web",
            workspace_id: "w5",
          },
          {
            agent_status: "unknown",
            cwd: "/Users/narumi/workspace/herdr-web",
            pane_id: "w5:p2",
            revision: 2,
            tab_id: "w5:t1",
            terminal_title_stripped: "shell",
            workspace_id: "w5",
          },
        ],
        protocol: 19,
        tabs: [
          {
            agent_status: "idle",
            focused: true,
            label: "main",
            number: 1,
            pane_count: 2,
            tab_id: "w5:t1",
            workspace_id: "w5",
          },
        ],
        version: "0.8.0",
        workspaces: [
          {
            active_tab_id: "w5:t1",
            agent_status: "idle",
            focused: true,
            label: "herdr-web",
            number: 5,
            pane_count: 2,
            tab_count: 1,
            workspace_id: "w5",
          },
        ],
      },
    });

    expect(state.selectedWorkspaceId).toBe("w5");
    expect(state.selectedAgentId).toBe("w5:p1");
    expect(state.workspaces[0]).toMatchObject({
      id: "w5",
      name: "herdr-web",
      path: "/Users/narumi/workspace/herdr-web",
    });
    expect(state.agents[0]).toMatchObject({
      canPrompt: true,
      id: "w5:p1",
      label: "π - herdr-web",
      runtime: "pi",
      status: "idle",
    });
    expect(state.agents[0]?.panes).toEqual([
      expect.objectContaining({
        id: "w5:p1",
        lines: ["user", "hi", "assistant", "Hello!"],
      }),
      expect.objectContaining({ id: "w5:p2", title: "shell" }),
    ]);
  });
});
