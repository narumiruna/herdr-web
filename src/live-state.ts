import type {
  Agent,
  AgentStatus,
  HerdrState,
  TerminalPane,
  Workspace,
} from "./state";

interface LiveWorkspace {
  active_tab_id: string;
  agent_status: string;
  focused: boolean;
  label: string;
  number: number;
  pane_count: number;
  tab_count: number;
  tokens?: Record<string, string>;
  workspace_id: string;
  worktree?: { branch?: string; checkout_path?: string } | null;
}

interface LiveTab {
  agent_status: string;
  focused: boolean;
  label: string;
  number: number;
  pane_count: number;
  tab_id: string;
  workspace_id: string;
}

interface LivePane {
  agent?: string | null;
  agent_status: string;
  cwd?: string | null;
  display_agent?: string | null;
  focused?: boolean;
  foreground_cwd?: string | null;
  label?: string | null;
  pane_id: string;
  revision: number;
  state_labels?: Record<string, string>;
  tab_id: string;
  terminal_title_stripped?: string | null;
  title?: string | null;
  tokens?: Record<string, string>;
  workspace_id: string;
}

interface LiveLayout {
  focused_pane_id: string;
  panes: Array<{ focused: boolean; pane_id: string }>;
  splits?: Array<{
    direction: "down" | "right";
    id: string;
    ratio: number;
  }>;
  tab_id: string;
  workspace_id: string;
}

interface LiveRead {
  pane_id: string;
  revision: number;
  text: string;
}

export interface LiveSnapshotPayload {
  access?: {
    role?: "controller" | "viewer";
  };
  capabilities?: {
    terminalReason?: string;
    terminalStreaming?: boolean;
  };
  readErrors?: Record<string, string>;
  reads: Record<string, LiveRead>;
  snapshot: {
    agents: LivePane[];
    focused_pane_id: string;
    focused_workspace_id: string;
    layouts: LiveLayout[];
    panes: LivePane[];
    protocol: number;
    tabs: LiveTab[];
    version: string;
    workspaces: LiveWorkspace[];
  };
}

const STATUS: AgentStatus[] = ["blocked", "done", "idle", "unknown", "working"];

function statusOf(value: string): AgentStatus {
  return STATUS.includes(value as AgentStatus)
    ? (value as AgentStatus)
    : "unknown";
}

function paneTitle(pane: LivePane): string {
  return (
    pane.label?.trim() ||
    pane.title?.trim() ||
    pane.terminal_title_stripped?.trim() ||
    pane.display_agent?.trim() ||
    pane.agent?.trim() ||
    "shell"
  );
}

function paneLines(read: LiveRead | undefined): string[] {
  if (!read?.text) return [];
  return read.text.replaceAll("\r\n", "\n").split("\n").slice(-240);
}

function terminalPanes(
  pane: LivePane,
  allPanes: LivePane[],
  reads: Record<string, LiveRead>,
  readErrors: Record<string, string>,
  layout: LiveLayout | undefined,
): TerminalPane[] {
  const paneIds = layout?.panes.map(({ pane_id: paneId }) => paneId);
  const members = paneIds
    ? paneIds.flatMap((paneId) => {
        const candidate = allPanes.find(
          (entry) => entry.pane_id === paneId && entry.tab_id === pane.tab_id,
        );
        return candidate ? [candidate] : [];
      })
    : allPanes.filter((candidate) => candidate.tab_id === pane.tab_id);
  return members.map((candidate) => {
    const outputError = readErrors[candidate.pane_id];
    return {
      command: candidate.agent ?? "shell",
      cwd: (candidate.foreground_cwd ?? candidate.cwd)?.trim() ?? "",
      id: candidate.pane_id,
      lines: paneLines(reads[candidate.pane_id]),
      outputError,
      outputState: outputError ? "unavailable" : "ready",
      title: paneTitle(candidate),
    };
  });
}

function currentStep(pane: LivePane, status: AgentStatus): string {
  return pane.state_labels?.[status] ?? pane.tokens?.summary ?? "";
}

function mapAgent(
  pane: LivePane,
  allPanes: LivePane[],
  reads: Record<string, LiveRead>,
  readErrors: Record<string, string>,
  layouts: LiveLayout[],
  kind: Agent["kind"],
  tab: LiveTab | undefined,
): Agent {
  const status = statusOf(pane.agent_status);
  const layout = layouts.find(({ tab_id: tabId }) => tabId === pane.tab_id);
  const panes = terminalPanes(pane, allPanes, reads, readErrors, layout);
  const label = paneTitle(pane);
  const rootSplit = panes.length === 2 ? layout?.splits?.[0] : undefined;
  const splitRatio = rootSplit?.ratio ?? 0.5;
  return {
    activePaneId:
      layout?.focused_pane_id &&
      panes.some(({ id }) => id === layout.focused_pane_id)
        ? layout.focused_pane_id
        : pane.pane_id,
    additions: 0,
    canPrompt: kind === "agent" && Boolean(pane.agent),
    contextPercent:
      Number.parseInt(pane.tokens?.context_percent ?? "0", 10) || 0,
    currentStep: currentStep(pane, status),
    deletions: 0,
    filesChanged: 0,
    id: pane.pane_id,
    kind,
    label,
    model: pane.tokens?.model ?? "",
    panes,
    paneSplit:
      panes.length === 2
        ? {
            direction: rootSplit?.direction === "down" ? "down" : "right",
            ratio:
              Number.isFinite(splitRatio) &&
              splitRatio >= 0.1 &&
              splitRatio <= 0.9
                ? splitRatio
                : 0.5,
          }
        : undefined,
    runtime: pane.display_agent ?? pane.agent ?? "Shell",
    started: "",
    status,
    tabId: pane.tab_id,
    tabNumber: tab?.number,
    summary: pane.tokens?.summary ?? label,
    updated: `revision ${pane.revision}`,
    workspaceId: pane.workspace_id,
  };
}

function mapWorkspace(
  workspace: LiveWorkspace,
  panes: LivePane[],
  index: number,
): Workspace {
  const pane = panes.find(
    ({ workspace_id: workspaceId }) => workspaceId === workspace.workspace_id,
  );
  return {
    accent: (["amber", "blue", "grass"] as const)[index % 3] ?? "amber",
    ahead: 0,
    behind: 0,
    branch: workspace.worktree?.branch ?? workspace.tokens?.branch ?? "",
    id: workspace.workspace_id,
    name: workspace.label,
    path: workspace.worktree?.checkout_path ?? pane?.cwd ?? "",
  };
}

function paneFromSnapshot(pane: LivePane, allPanes: LivePane[]): LivePane {
  const details = allPanes.find(({ pane_id: id }) => id === pane.pane_id);
  return details ? { ...details, ...pane } : pane;
}

export function mapLiveSnapshot(payload: LiveSnapshotPayload): HerdrState {
  const { snapshot, reads } = payload;
  const readErrors = payload.readErrors ?? {};
  const workspaces = snapshot.workspaces.map((workspace, index) =>
    mapWorkspace(workspace, snapshot.panes, index),
  );
  const agentTabIds = new Set(snapshot.agents.map(({ tab_id: id }) => id));
  const detectedAgents = snapshot.agents.map((pane) =>
    mapAgent(
      paneFromSnapshot(pane, snapshot.panes),
      snapshot.panes,
      reads,
      readErrors,
      snapshot.layouts,
      "agent",
      snapshot.tabs.find(({ tab_id: tabId }) => tabId === pane.tab_id),
    ),
  );
  const standaloneTerminals = snapshot.tabs
    .filter(({ tab_id: tabId }) => !agentTabIds.has(tabId))
    .flatMap((tab) => {
      const layout = snapshot.layouts.find(
        ({ tab_id: tabId }) => tabId === tab.tab_id,
      );
      const paneId =
        layout?.panes[0]?.pane_id ??
        snapshot.panes.find(({ tab_id: tabId }) => tabId === tab.tab_id)
          ?.pane_id;
      const pane = snapshot.panes.find(({ pane_id: id }) => id === paneId);
      return pane
        ? [
            mapAgent(
              pane,
              snapshot.panes,
              reads,
              readErrors,
              snapshot.layouts,
              "terminal",
              tab,
            ),
          ]
        : [];
    });
  const agents = [...detectedAgents, ...standaloneTerminals];
  const selectedWorkspaceId = workspaces.some(
    ({ id }) => id === snapshot.focused_workspace_id,
  )
    ? snapshot.focused_workspace_id
    : (workspaces[0]?.id ?? "");
  const selectedTarget = agents.find(
    (agent) =>
      agent.id === snapshot.focused_pane_id ||
      agent.panes.some(({ id }) => id === snapshot.focused_pane_id),
  );
  const selectedAgentId =
    selectedTarget?.id ??
    agents.find(({ workspaceId }) => workspaceId === selectedWorkspaceId)?.id ??
    agents[0]?.id ??
    "";
  const selectedSessionByWorkspace = Object.fromEntries(
    snapshot.workspaces.flatMap((workspace) => {
      const session = agents.find(
        ({ tabId, workspaceId }) =>
          workspaceId === workspace.workspace_id &&
          tabId === workspace.active_tab_id,
      );
      return session ? [[workspace.workspace_id, session.id]] : [];
    }),
  );
  if (selectedAgentId && selectedWorkspaceId) {
    selectedSessionByWorkspace[selectedWorkspaceId] = selectedAgentId;
  }
  return {
    activities: [],
    agents,
    capabilities: {
      terminalReason:
        payload.capabilities?.terminalReason ??
        "This Herdr version supports snapshot output only.",
      terminalStreaming: payload.capabilities?.terminalStreaming === true,
    },
    selectedAgentId,
    selectedSessionByWorkspace,
    selectedWorkspaceId,
    workspaces,
  };
}
