export type AgentStatus = "working" | "blocked" | "idle" | "done";

export type RuntimeName = "Claude Code" | "Codex" | "Pi" | "OpenCode";

export interface Workspace {
  id: string;
  name: string;
  path: string;
  branch: string;
  ahead: number;
  behind: number;
  accent: "amber" | "blue" | "grass";
}

export interface TerminalPane {
  id: string;
  title: string;
  command: string;
  lines: string[];
}

export interface Agent {
  id: string;
  workspaceId: string;
  label: string;
  runtime: RuntimeName;
  model: string;
  status: AgentStatus;
  summary: string;
  currentStep: string;
  started: string;
  updated: string;
  contextPercent: number;
  filesChanged: number;
  additions: number;
  deletions: number;
  panes: TerminalPane[];
  activePaneId: string;
}

export type ActivityKind =
  | "attention"
  | "commit"
  | "completed"
  | "created"
  | "reply"
  | "started";

export interface Activity {
  id: string;
  workspaceId: string;
  agentId: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  time: string;
}

export interface HerdrState {
  workspaces: Workspace[];
  agents: Agent[];
  activities: Activity[];
  selectedWorkspaceId: string;
  selectedAgentId: string;
}

export type HerdrAction =
  | { type: "workspace.selected"; workspaceId: string }
  | { type: "agent.selected"; agentId: string }
  | {
      type: "agent.replied";
      agentId: string;
      message: string;
    }
  | {
      type: "session.created";
      id: string;
      workspaceId: string;
      label: string;
      runtime: RuntimeName;
      command: string;
    }
  | { type: "pane.split"; agentId: string; paneId: string }
  | { type: "pane.selected"; agentId: string; paneId: string }
  | { type: "pane.closed"; agentId: string; paneId: string };

const STATUS_PRIORITY: Record<AgentStatus, number> = {
  blocked: 4,
  done: 3,
  working: 2,
  idle: 1,
};

export function agentsForWorkspace(
  state: HerdrState,
  workspaceId: string,
): Agent[] {
  return state.agents
    .filter((agent) => agent.workspaceId === workspaceId)
    .sort(
      (left, right) =>
        STATUS_PRIORITY[right.status] - STATUS_PRIORITY[left.status],
    );
}

export function selectedWorkspace(state: HerdrState): Workspace {
  return (
    state.workspaces.find(({ id }) => id === state.selectedWorkspaceId) ??
    state.workspaces[0]
  );
}

export function selectedAgent(state: HerdrState): Agent {
  return (
    state.agents.find(({ id }) => id === state.selectedAgentId) ??
    state.agents[0]
  );
}

function updateAgent(
  state: HerdrState,
  agentId: string,
  update: (agent: Agent) => Agent,
): HerdrState {
  const target = state.agents.find(({ id }) => id === agentId);
  if (!target) {
    return state;
  }
  return {
    ...state,
    agents: state.agents.map((agent) =>
      agent.id === agentId ? update(agent) : agent,
    ),
  };
}

export function appReducer(state: HerdrState, action: HerdrAction): HerdrState {
  switch (action.type) {
    case "workspace.selected": {
      const workspace = state.workspaces.find(
        ({ id }) => id === action.workspaceId,
      );
      if (!workspace) {
        return state;
      }
      const firstAgent = agentsForWorkspace(state, workspace.id)[0];
      return {
        ...state,
        selectedWorkspaceId: workspace.id,
        selectedAgentId: firstAgent?.id ?? state.selectedAgentId,
      };
    }
    case "agent.selected": {
      const agent = state.agents.find(({ id }) => id === action.agentId);
      if (!agent) {
        return state;
      }
      return {
        ...state,
        selectedWorkspaceId: agent.workspaceId,
        selectedAgentId: agent.id,
      };
    }
    case "agent.replied": {
      const message = action.message.trim();
      if (!message) {
        return state;
      }
      const agent = state.agents.find(({ id }) => id === action.agentId);
      if (!agent) {
        return state;
      }
      const withUpdatedAgent = updateAgent(state, agent.id, (current) => ({
        ...current,
        status: "working",
        currentStep: "Applying your direction",
        updated: "just now",
        panes: current.panes.map((pane) =>
          pane.id === current.activePaneId
            ? {
                ...pane,
                lines: [
                  ...pane.lines,
                  "",
                  `› ${message}`,
                  "● Direction received. Continuing implementation…",
                ],
              }
            : pane,
        ),
      }));
      return {
        ...withUpdatedAgent,
        activities: [
          {
            id: `reply-${state.activities.length + 1}`,
            workspaceId: agent.workspaceId,
            agentId: agent.id,
            kind: "reply",
            title: `Replied to ${agent.label}`,
            detail: message,
            time: "now",
          },
          ...state.activities,
        ],
      };
    }
    case "session.created": {
      const workspace = state.workspaces.find(
        ({ id }) => id === action.workspaceId,
      );
      const label = action.label.trim();
      const command = action.command.trim();
      if (!workspace || !label || !command) {
        return state;
      }
      const paneId = `${action.id}-main`;
      const agent: Agent = {
        id: action.id,
        workspaceId: workspace.id,
        label,
        runtime: action.runtime,
        model: action.runtime === "Claude Code" ? "Sonnet 4.6" : "gpt-5.4",
        status: "working",
        summary: "Starting a new agent session",
        currentStep: "Reading workspace context",
        started: "just now",
        updated: "just now",
        contextPercent: 1,
        filesChanged: 0,
        additions: 0,
        deletions: 0,
        panes: [
          {
            id: paneId,
            title: label,
            command,
            lines: [
              `$ cd ${workspace.path}`,
              `$ ${command}`,
              `● ${action.runtime} connected to herdr`,
              "  Reading AGENTS.md and workspace context…",
            ],
          },
        ],
        activePaneId: paneId,
      };
      return {
        ...state,
        agents: [...state.agents, agent],
        selectedWorkspaceId: workspace.id,
        selectedAgentId: agent.id,
        activities: [
          {
            id: `created-${state.activities.length + 1}`,
            workspaceId: workspace.id,
            agentId: agent.id,
            kind: "created",
            title: `${label} joined the flock`,
            detail: `${action.runtime} · ${workspace.name}`,
            time: "now",
          },
          ...state.activities,
        ],
      };
    }
    case "pane.split": {
      return updateAgent(state, action.agentId, (agent) => {
        if (agent.panes.length >= 2) {
          return agent;
        }
        return {
          ...agent,
          panes: [
            ...agent.panes,
            {
              id: action.paneId,
              title: "shell",
              command: "zsh",
              lines: [
                `Last login: today on herdr/${agent.label}`,
                `$ cd ~/Projects/${agent.workspaceId}`,
                "$ ",
              ],
            },
          ],
          activePaneId: action.paneId,
        };
      });
    }
    case "pane.selected": {
      return updateAgent(state, action.agentId, (agent) =>
        agent.panes.some(({ id }) => id === action.paneId)
          ? { ...agent, activePaneId: action.paneId }
          : agent,
      );
    }
    case "pane.closed": {
      return updateAgent(state, action.agentId, (agent) => {
        if (agent.panes.length === 1) {
          return agent;
        }
        const panes = agent.panes.filter(({ id }) => id !== action.paneId);
        return {
          ...agent,
          panes,
          activePaneId:
            agent.activePaneId === action.paneId
              ? (panes[0]?.id ?? agent.activePaneId)
              : agent.activePaneId,
        };
      });
    }
  }
}

export function createDemoState(): HerdrState {
  return {
    selectedWorkspaceId: "herdr-core",
    selectedAgentId: "agent-review",
    workspaces: [
      {
        id: "herdr-core",
        name: "herdr",
        path: "~/Projects/herdr",
        branch: "feat/web-bridge",
        ahead: 3,
        behind: 0,
        accent: "amber",
      },
      {
        id: "docs-site",
        name: "herdr.dev",
        path: "~/Projects/herdr/website",
        branch: "docs/agent-guide",
        ahead: 1,
        behind: 0,
        accent: "blue",
      },
      {
        id: "marketplace",
        name: "plugin-marketplace",
        path: "~/Projects/herdr/workers/plugin-marketplace",
        branch: "main",
        ahead: 0,
        behind: 0,
        accent: "grass",
      },
    ],
    agents: [
      {
        id: "agent-build",
        workspaceId: "herdr-core",
        label: "web-bridge",
        runtime: "Codex",
        model: "gpt-5.4",
        status: "working",
        summary: "Expose session events through a browser-safe transport",
        currentStep: "Implementing the event stream adapter",
        started: "42m ago",
        updated: "12s ago",
        contextPercent: 68,
        filesChanged: 7,
        additions: 286,
        deletions: 41,
        activePaneId: "build-main",
        panes: [
          {
            id: "build-main",
            title: "codex · web bridge",
            command: "codex --full-auto",
            lines: [
              "╭──────────────────────────────────────────────────────╮",
              "│ Codex · gpt-5.4                         68% context │",
              "╰──────────────────────────────────────────────────────╯",
              "",
              "● Read src/api/server.rs",
              "● Read src/events.rs",
              "● Search WebSocket|EventStream in src/",
              "",
              "I’ll keep the native socket unchanged and add a narrow adapter.",
              "The browser client will receive typed session snapshots first,",
              "then ordered incremental events.",
              "",
              "● Write src/api/server/web_bridge.rs",
              "  Added 184 lines",
              "● Running cargo test api::server::web_bridge",
              "  ⠋ compiling herdr v0.8.0",
            ],
          },
        ],
      },
      {
        id: "agent-review",
        workspaceId: "herdr-core",
        label: "api-review",
        runtime: "Claude Code",
        model: "Sonnet 4.6",
        status: "blocked",
        summary: "Review the browser transport contract before merge",
        currentStep: "Waiting for a compatibility decision",
        started: "27m ago",
        updated: "2m ago",
        contextPercent: 31,
        filesChanged: 2,
        additions: 34,
        deletions: 12,
        activePaneId: "review-main",
        panes: [
          {
            id: "review-main",
            title: "claude · API review",
            command: "claude",
            lines: [
              "╭──────────────────────────────────────────────────────╮",
              "│ Claude Code · Sonnet 4.6                31% context │",
              "╰──────────────────────────────────────────────────────╯",
              "",
              "● Read docs/next/api/herdr-api.schema.json",
              "● Read src/api/schema/mod.rs",
              "● Search protocol_version in src/ tests/",
              "",
              "The proposed snapshot event changes `pane_id` from an integer",
              "to a namespaced string. Existing socket clients may persist the",
              "numeric value.",
              "",
              "◆ Decision needed",
              "  Should the browser bridge preserve numeric pane IDs, or may the",
              "  shared v2 event schema introduce opaque string IDs?",
              "",
              "  Waiting for direction…",
            ],
          },
        ],
      },
      {
        id: "agent-tests",
        workspaceId: "herdr-core",
        label: "integration-tests",
        runtime: "Pi",
        model: "Claude Sonnet 4.6",
        status: "done",
        summary: "Cover reconnect and ordered event delivery",
        currentStep: "6 tests passed",
        started: "1h ago",
        updated: "8m ago",
        contextPercent: 54,
        filesChanged: 3,
        additions: 192,
        deletions: 4,
        activePaneId: "tests-main",
        panes: [
          {
            id: "tests-main",
            title: "pi · integration tests",
            command: "pi",
            lines: [
              "$ cargo test web_bridge -- --nocapture",
              "running 6 tests",
              "test reconnect_replays_snapshot ... ok",
              "test events_remain_ordered ... ok",
              "test closed_pane_is_removed ... ok",
              "test unknown_client_is_rejected ... ok",
              "test heartbeat_keeps_session_alive ... ok",
              "test lagged_client_gets_snapshot ... ok",
              "",
              "test result: ok. 6 passed; 0 failed; finished in 1.84s",
              "",
              "✓ Task complete",
            ],
          },
        ],
      },
      {
        id: "agent-docs",
        workspaceId: "docs-site",
        label: "agent-guide",
        runtime: "OpenCode",
        model: "gpt-5.4 mini",
        status: "idle",
        summary: "Document remote browser attachment",
        currentStep: "Ready for the transport contract",
        started: "18m ago",
        updated: "4m ago",
        contextPercent: 22,
        filesChanged: 1,
        additions: 63,
        deletions: 8,
        activePaneId: "docs-main",
        panes: [
          {
            id: "docs-main",
            title: "opencode · agent guide",
            command: "opencode",
            lines: [
              "● Read website/agent-guide.md",
              "● Read docs/next/README.md",
              "",
              "Drafted the remote browser attachment section.",
              "Waiting for the final endpoint and authentication details.",
              "",
              "$ git diff --stat",
              " website/agent-guide.md | 71 ++++++++++++++++++++++++++++++---",
            ],
          },
        ],
      },
      {
        id: "agent-plugin",
        workspaceId: "marketplace",
        label: "plugin-index",
        runtime: "Claude Code",
        model: "Haiku 4.5",
        status: "working",
        summary: "Add capability filters to the plugin index",
        currentStep: "Updating filter tests",
        started: "11m ago",
        updated: "24s ago",
        contextPercent: 17,
        filesChanged: 4,
        additions: 118,
        deletions: 25,
        activePaneId: "plugin-main",
        panes: [
          {
            id: "plugin-main",
            title: "claude · plugin index",
            command: "claude",
            lines: [
              "● Read workers/plugin-marketplace/src/index.ts",
              "● Read website/src/pages/plugins.astro",
              "",
              "I found the filter contract and existing fixture data.",
              "Adding multi-select capability filters without changing URLs.",
              "",
              "● Edit src/plugin-filters.ts",
              "● Running bun test plugin-filters",
            ],
          },
        ],
      },
    ],
    activities: [
      {
        id: "activity-1",
        workspaceId: "herdr-core",
        agentId: "agent-review",
        kind: "attention",
        title: "api-review needs direction",
        detail: "Choose whether pane IDs stay numeric in the shared schema.",
        time: "2m",
      },
      {
        id: "activity-2",
        workspaceId: "herdr-core",
        agentId: "agent-tests",
        kind: "completed",
        title: "integration-tests finished",
        detail: "6 reconnect and event ordering tests passed.",
        time: "8m",
      },
      {
        id: "activity-3",
        workspaceId: "herdr-core",
        agentId: "agent-build",
        kind: "commit",
        title: "web-bridge changed 7 files",
        detail: "+286 −41 on feat/web-bridge",
        time: "12m",
      },
      {
        id: "activity-4",
        workspaceId: "marketplace",
        agentId: "agent-plugin",
        kind: "started",
        title: "plugin-index started",
        detail: "Claude Code · Haiku 4.5",
        time: "18m",
      },
    ],
  };
}
