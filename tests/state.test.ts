import { describe, expect, test } from "vitest";
import {
  agentsForWorkspace,
  appReducer,
  createDemoState,
  tabsForWorkspace,
} from "../src/state";

describe("herdr state", () => {
  test("orders blocked and working agents before completed agents and terminals", () => {
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
      "agent-build",
      "agent-tests",
      "terminal-shell",
    ]);
  });

  test("orders Agent and standalone Terminal tabs by their Herdr tab number", () => {
    const state = createDemoState();
    state.agents.push({
      ...state.agents[0],
      id: "terminal-shell",
      kind: "terminal",
      tabNumber: 4,
    });
    const sessions = state.agents.filter(
      ({ workspaceId }) => workspaceId === "herdr-core",
    );
    const numbers = [3, 1, 2, 4];
    sessions.forEach((session, index) => {
      session.tabNumber = numbers[index];
    });

    expect(tabsForWorkspace(state, "herdr-core").map(({ id }) => id)).toEqual([
      "agent-review",
      "agent-tests",
      "agent-build",
      "terminal-shell",
    ]);
  });

  test("remembers the selected tab independently for each workspace", () => {
    const state = createDemoState();
    const docsAgent = state.agents.find(({ id }) => id === "agent-docs");
    if (!docsAgent) throw new Error("Missing docs Agent");
    state.agents.push({
      ...docsAgent,
      id: "agent-docs-second",
      label: "docs-second",
      tabNumber: 2,
    });
    const selected = appReducer(state, {
      type: "agent.selected",
      agentId: "agent-docs-second",
    });
    const switchedAway = appReducer(selected, {
      type: "workspace.selected",
      workspaceId: "herdr-core",
    });
    const returned = appReducer(switchedAway, {
      type: "workspace.selected",
      workspaceId: "docs-site",
    });

    expect(returned.selectedAgentId).toBe("agent-docs-second");
    expect(returned.selectedSessionByWorkspace["docs-site"]).toBe(
      "agent-docs-second",
    );
  });

  test("uses Herdr tab order when a workspace has no remembered tab", () => {
    const state = createDemoState();
    state.selectedSessionByWorkspace = {};
    const sessions = state.agents.filter(
      ({ workspaceId }) => workspaceId === "herdr-core",
    );
    sessions.forEach((session, index) => {
      session.tabNumber = [3, 1, 2][index];
    });

    const next = appReducer(state, {
      type: "workspace.selected",
      workspaceId: "herdr-core",
    });

    expect(next.selectedAgentId).toBe("agent-review");
  });

  test("adds and selects a newly created empty Space", () => {
    const state = createDemoState();

    const next = appReducer(state, {
      type: "workspace.created",
      id: "new-space",
      label: "New Space",
      path: "/repo/new",
    });

    expect(next.workspaces.at(-1)).toMatchObject({
      branch: "",
      id: "new-space",
      name: "New Space",
      path: "/repo/new",
    });
    expect(next.selectedWorkspaceId).toBe("new-space");
    expect(next.selectedAgentId).toBe("");
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
      tabNumber: 4,
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
      direction: "down",
    });
    const unchanged = appReducer(split, {
      type: "pane.split",
      agentId: "agent-build",
      paneId: "pane-third",
      direction: "right",
    });

    const splitAgent = split.agents.find(({ id }) => id === "agent-build");
    const unchangedAgent = unchanged.agents.find(
      ({ id }) => id === "agent-build",
    );
    expect(splitAgent?.panes).toHaveLength(2);
    expect(splitAgent?.activePaneId).toBe("pane-new");
    expect(splitAgent?.paneSplit).toEqual({ direction: "down", ratio: 0.5 });
    expect(unchangedAgent?.panes).toHaveLength(2);
  });

  test("resizes only a two-pane layout and clamps its ratio", () => {
    const state = appReducer(createDemoState(), {
      type: "pane.split",
      agentId: "agent-build",
      paneId: "pane-new",
      direction: "right",
    });

    const resized = appReducer(state, {
      type: "pane.resized",
      agentId: "agent-build",
      ratio: 2,
    });
    const untouched = appReducer(resized, {
      type: "pane.resized",
      agentId: "agent-review",
      ratio: 0.25,
    });

    expect(
      resized.agents.find(({ id }) => id === "agent-build")?.paneSplit?.ratio,
    ).toBe(0.9);
    expect(
      untouched.agents.find(({ id }) => id === "agent-review")?.paneSplit,
    ).toBeUndefined();
  });
});
