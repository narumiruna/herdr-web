import { describe, expect, test } from "vitest";
import { mapLiveSnapshot } from "../src/live-state";

describe("mapLiveSnapshot", () => {
  test("maps real herdr workspaces, agents, layouts, and pane output", () => {
    const state = mapLiveSnapshot({
      previews: {
        "w5:p1": {
          pane_id: "w5:p1",
          revision: 9,
          text: "real latest line",
        },
      },
      readErrors: { "w5:p2": "socket read failed" },
      reads: {
        "w5:p1": {
          pane_id: "w5:p1",
          revision: 9,
          text: "user\nhi\nassistant\nHello!",
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
            splits: [
              {
                direction: "down" as const,
                id: "split_0_root",
                ratio: 0.65,
              },
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
            foreground_cwd: "/Users/narumi/workspace/herdr-web/src",
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
            worktree: {
              branch: "narumi/feat/tree",
              checkout_path: "/Users/narumi/workspace/herdr-web",
              is_linked_worktree: false,
              repo_key: "/Users/narumi/workspace/herdr-web/.git",
              repo_name: "herdr-web",
              repo_root: "/Users/narumi/workspace/herdr-web",
            },
          },
        ],
      },
    });

    expect(state.selectedWorkspaceId).toBe("w5");
    expect(state.selectedAgentId).toBe("w5:p1");
    expect(state.selectedSessionByWorkspace).toEqual({ w5: "w5:p1" });
    expect(state.workspaces[0]).toMatchObject({
      branch: "narumi/feat/tree",
      id: "w5",
      name: "herdr-web",
      path: "/Users/narumi/workspace/herdr-web",
      worktree: {
        isLinked: false,
        repoName: "herdr-web",
      },
    });
    expect(state.agents).toHaveLength(1);
    expect(state.agents[0]).toMatchObject({
      canPrompt: true,
      id: "w5:p1",
      kind: "agent",
      label: "π - herdr-web",
      paneSplit: { direction: "down", ratio: 0.65 },
      previewLines: ["real latest line"],
      runtime: "pi",
      status: "idle",
      tabId: "w5:t1",
      tabNumber: 1,
    });
    expect(state.capabilities).toMatchObject({
      herdrVersion: "0.8.0",
      protocol: 19,
    });
    expect(state.agents[0]?.panes).toEqual([
      expect.objectContaining({
        cwd: "/Users/narumi/workspace/herdr-web/src",
        id: "w5:p1",
        lines: ["user", "hi", "assistant", "Hello!"],
      }),
      expect.objectContaining({
        id: "w5:p2",
        outputError: "socket read failed",
        outputState: "unavailable",
        title: "shell",
      }),
    ]);
  });

  test("keeps standalone shell tabs reachable without counting split shells as agents", () => {
    const payload = {
      reads: {
        "w5:p1": { pane_id: "w5:p1", revision: 1, text: "Agent" },
        "w5:p2": { pane_id: "w5:p2", revision: 1, text: "$ pwd" },
        "w5:p3": { pane_id: "w5:p3", revision: 1, text: "$ top" },
      },
      snapshot: {
        agents: [
          {
            agent: "pi",
            agent_status: "working",
            pane_id: "w5:p1",
            revision: 1,
            tab_id: "w5:t1",
            workspace_id: "w5",
          },
        ],
        focused_pane_id: "w5:p3",
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
          {
            focused_pane_id: "w5:p3",
            panes: [{ focused: true, pane_id: "w5:p3" }],
            tab_id: "w5:t2",
            workspace_id: "w5",
          },
        ],
        panes: [
          {
            agent: "pi",
            agent_status: "working",
            pane_id: "w5:p1",
            revision: 1,
            tab_id: "w5:t1",
            workspace_id: "w5",
          },
          {
            agent_status: "unknown",
            pane_id: "w5:p2",
            revision: 1,
            tab_id: "w5:t1",
            title: "split shell",
            workspace_id: "w5",
          },
          {
            agent_status: "unknown",
            pane_id: "w5:p3",
            revision: 1,
            tab_id: "w5:t2",
            title: "monitor",
            workspace_id: "w5",
          },
        ],
        protocol: 19,
        tabs: [
          {
            agent_status: "working",
            focused: false,
            label: "agent",
            number: 1,
            pane_count: 2,
            tab_id: "w5:t1",
            workspace_id: "w5",
          },
          {
            agent_status: "unknown",
            focused: true,
            label: "monitor",
            number: 2,
            pane_count: 1,
            tab_id: "w5:t2",
            workspace_id: "w5",
          },
        ],
        version: "0.8.0",
        workspaces: [
          {
            active_tab_id: "w5:t2",
            agent_status: "unknown",
            focused: true,
            label: "herdr-web",
            number: 5,
            pane_count: 3,
            tab_count: 2,
            workspace_id: "w5",
          },
        ],
      },
    };

    const state = mapLiveSnapshot(payload);

    expect(state.agents).toHaveLength(2);
    expect(state.agents.filter(({ kind }) => kind === "agent")).toHaveLength(1);
    expect(state.agents.filter(({ kind }) => kind === "terminal")).toEqual([
      expect.objectContaining({
        id: "w5:p3",
        label: "monitor",
        tabId: "w5:t2",
        tabNumber: 2,
      }),
    ]);
    expect(state.agents[0]?.panes).toHaveLength(2);
    expect(state.selectedAgentId).toBe("w5:p3");
  });

  test("gates blocked semantic prompts only for protocol 20", () => {
    const pane = {
      agent: "qwen",
      agent_status: "blocked",
      pane_id: "w1:p1",
      revision: 2,
      tab_id: "w1:t1",
      workspace_id: "w1",
    };
    const payload = {
      reads: {},
      snapshot: {
        agents: [pane],
        focused_pane_id: "w1:p1",
        focused_workspace_id: "w1",
        layouts: [
          {
            focused_pane_id: "w1:p1",
            panes: [{ focused: true, pane_id: "w1:p1" }],
            tab_id: "w1:t1",
            workspace_id: "w1",
          },
        ],
        panes: [pane],
        protocol: 20,
        tabs: [
          {
            agent_status: "blocked",
            focused: true,
            label: "qwen",
            number: 1,
            pane_count: 1,
            tab_id: "w1:t1",
            workspace_id: "w1",
          },
        ],
        version: "0.8.2",
        workspaces: [
          {
            active_tab_id: "w1:t1",
            agent_status: "blocked",
            focused: true,
            label: "project",
            number: 1,
            pane_count: 1,
            tab_count: 1,
            workspace_id: "w1",
          },
        ],
      },
    };

    expect(mapLiveSnapshot(payload).agents[0]).toMatchObject({
      canPrompt: false,
      runtime: "qwen",
      status: "blocked",
    });
    expect(
      mapLiveSnapshot({
        ...payload,
        snapshot: { ...payload.snapshot, protocol: 19, version: "0.8.0" },
      }).agents[0],
    ).toMatchObject({
      canPrompt: true,
      runtime: "qwen",
      status: "blocked",
    });
  });

  test("represents missing pane reads as an empty terminal state", () => {
    const payload = {
      reads: {},
      snapshot: {
        agents: [],
        focused_pane_id: "w1:p1",
        focused_workspace_id: "w1",
        layouts: [
          {
            focused_pane_id: "w1:p1",
            panes: [{ focused: true, pane_id: "w1:p1" }],
            tab_id: "w1:t1",
            workspace_id: "w1",
          },
        ],
        panes: [
          {
            agent_status: "unknown",
            pane_id: "w1:p1",
            revision: 0,
            tab_id: "w1:t1",
            workspace_id: "w1",
          },
        ],
        protocol: 19,
        tabs: [
          {
            agent_status: "unknown",
            focused: true,
            label: "shell",
            number: 1,
            pane_count: 1,
            tab_id: "w1:t1",
            workspace_id: "w1",
          },
        ],
        version: "0.8.0",
        workspaces: [
          {
            active_tab_id: "w1:t1",
            agent_status: "unknown",
            focused: true,
            label: "empty-output",
            number: 1,
            pane_count: 1,
            tab_count: 1,
            workspace_id: "w1",
          },
        ],
      },
    };

    const state = mapLiveSnapshot(payload);

    expect(state.agents[0]).toMatchObject({ kind: "terminal" });
    expect(state.agents[0]?.panes[0]?.lines).toEqual([]);
  });
});
