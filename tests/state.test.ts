import { describe, expect, test } from "vitest";
import { agentsForWorkspace, appReducer, createDemoState } from "../src/state";

describe("herdr state", () => {
  test("orders blocked agents before other agents and standalone terminals", () => {
    const state = createDemoState();
    state.agents.push({
      ...state.agents[0],
      id: "terminal-shell",
      kind: "terminal",
      label: "shell",
      canPrompt: false,
      status: "unknown",
    });

    const ordered = agentsForWorkspace(state, "herdr-core");

    expect(ordered.map(({ id }) => id)).toEqual([
      "agent-review",
      "agent-tests",
      "agent-build",
      "terminal-shell",
    ]);
  });

  test("selecting an empty workspace clears the previous session focus", () => {
    const state = createDemoState();
    state.workspaces.push({
      accent: "amber",
      ahead: 0,
      behind: 0,
      branch: "main",
      id: "empty",
      name: "empty",
      path: "/empty",
    });

    const next = appReducer(state, {
      type: "workspace.selected",
      workspaceId: "empty",
    });

    expect(next.selectedWorkspaceId).toBe("empty");
    expect(next.selectedAgentId).toBe("");
  });

  test("selecting a workspace focuses its most urgent agent", () => {
    const state = createDemoState();

    const next = appReducer(state, {
      type: "workspace.selected",
      workspaceId: "docs-site",
    });

    expect(next.selectedWorkspaceId).toBe("docs-site");
    expect(next.selectedAgentId).toBe("agent-docs");
  });

  test("replying to a blocked agent resumes it and records the direction", () => {
    const state = createDemoState();

    const next = appReducer(state, {
      type: "agent.replied",
      agentId: "agent-review",
      message: "Keep the public API backwards compatible.",
    });

    const agent = next.agents.find(({ id }) => id === "agent-review");
    const activePane = agent?.panes.find(({ id }) => id === agent.activePaneId);
    expect(agent?.status).toBe("working");
    expect(activePane?.lines.join("\n")).toContain(
      "Keep the public API backwards compatible.",
    );
    expect(next.activities[0]?.kind).toBe("reply");
  });

  test("blank replies do not alter agent state", () => {
    const state = createDemoState();

    const next = appReducer(state, {
      type: "agent.replied",
      agentId: "agent-review",
      message: "   ",
    });

    expect(next).toBe(state);
  });

  test("creating a session adds and selects a working agent", () => {
    const state = createDemoState();

    const next = appReducer(state, {
      type: "session.created",
      id: "agent-new",
      workspaceId: "herdr-core",
      label: "security-audit",
      runtime: "Codex",
      command: "codex --full-auto",
    });

    const agent = next.agents.find(({ id }) => id === "agent-new");
    expect(agent).toMatchObject({
      label: "security-audit",
      runtime: "Codex",
      status: "working",
    });
    expect(next.selectedAgentId).toBe("agent-new");
    expect(next.activities[0]?.kind).toBe("created");
  });

  test("splitting a terminal creates one additional focused pane only", () => {
    const state = createDemoState();

    const split = appReducer(state, {
      type: "pane.split",
      agentId: "agent-build",
      paneId: "pane-new",
    });
    const unchanged = appReducer(split, {
      type: "pane.split",
      agentId: "agent-build",
      paneId: "pane-third",
    });

    const splitAgent = split.agents.find(({ id }) => id === "agent-build");
    const unchangedAgent = unchanged.agents.find(
      ({ id }) => id === "agent-build",
    );
    expect(splitAgent?.panes).toHaveLength(2);
    expect(splitAgent?.activePaneId).toBe("pane-new");
    expect(unchangedAgent?.panes).toHaveLength(2);
  });
});
