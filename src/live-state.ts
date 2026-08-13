import type {
  Activity,
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
  tab_id: string;
  workspace_id: string;
}

interface LiveRead {
  pane_id: string;
  revision: number;
  text: string;
}

export interface LiveSnapshotPayload {
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
  if (!read?.text) return ["Waiting for terminal output…"];
  return read.text.replaceAll("\r\n", "\n").split("\n").slice(-240);
}

function terminalPanes(
  pane: LivePane,
  allPanes: LivePane[],
  reads: Record<string, LiveRead>,
  layout: LiveLayout | undefined,
): TerminalPane[] {
  const paneIds = layout?.panes.map(({ pane_id: paneId }) => paneId);
  const members = allPanes.filter(
    (candidate) =>
      candidate.tab_id === pane.tab_id &&
      (!paneIds || paneIds.includes(candidate.pane_id)),
  );
  return members.map((candidate) => ({
    command: candidate.agent ?? "shell",
    id: candidate.pane_id,
    lines: paneLines(reads[candidate.pane_id]),
    title: paneTitle(candidate),
  }));
}

function currentStep(pane: LivePane, status: AgentStatus): string {
  return (
    pane.state_labels?.[status] ??
    pane.tokens?.summary ??
    (pane.agent ? `${pane.agent} is ${status}` : "Interactive terminal session")
  );
}

function mapAgent(
  pane: LivePane,
  allPanes: LivePane[],
  agentPaneIds: Set<string>,
  reads: Record<string, LiveRead>,
  layouts: LiveLayout[],
): Agent {
  const status = statusOf(pane.agent_status);
  const layout = layouts.find(({ tab_id: tabId }) => tabId === pane.tab_id);
  const panes = terminalPanes(pane, allPanes, reads, layout);
  const label = paneTitle(pane);
  return {
    activePaneId:
      layout?.focused_pane_id &&
      panes.some(({ id }) => id === layout.focused_pane_id)
        ? layout.focused_pane_id
        : pane.pane_id,
    additions: 0,
    canPrompt: agentPaneIds.has(pane.pane_id) && Boolean(pane.agent),
    contextPercent:
      Number.parseInt(pane.tokens?.context_percent ?? "0", 10) || 0,
    currentStep: currentStep(pane, status),
    deletions: 0,
    filesChanged: 0,
    id: pane.pane_id,
    label,
    model: pane.tokens?.model ?? pane.agent ?? "terminal",
    panes,
    runtime: pane.display_agent ?? pane.agent ?? "Shell",
    started: "live",
    status,
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
    branch:
      workspace.worktree?.branch ?? workspace.tokens?.branch ?? "live session",
    id: workspace.workspace_id,
    name: workspace.label,
    path: workspace.worktree?.checkout_path ?? pane?.cwd ?? "Path unavailable",
  };
}

function liveActivities(agents: Agent[]): Activity[] {
  return agents.slice(0, 24).map((agent, index) => ({
    agentId: agent.id,
    detail: agent.currentStep,
    id: `live-${agent.id}-${index}`,
    kind:
      agent.status === "blocked"
        ? "attention"
        : agent.status === "done"
          ? "completed"
          : "started",
    time: "live",
    title: `${agent.label} is ${agent.status}`,
    workspaceId: agent.workspaceId,
  }));
}

export function mapLiveSnapshot(payload: LiveSnapshotPayload): HerdrState {
  const { snapshot, reads } = payload;
  const agentPaneIds = new Set(snapshot.agents.map(({ pane_id: id }) => id));
  const workspaces = snapshot.workspaces.map((workspace, index) =>
    mapWorkspace(workspace, snapshot.panes, index),
  );
  const agents = snapshot.panes.map((pane) =>
    mapAgent(pane, snapshot.panes, agentPaneIds, reads, snapshot.layouts),
  );
  const selectedWorkspaceId = workspaces.some(
    ({ id }) => id === snapshot.focused_workspace_id,
  )
    ? snapshot.focused_workspace_id
    : (workspaces[0]?.id ?? "");
  const selectedAgentId = agents.some(
    ({ id }) => id === snapshot.focused_pane_id,
  )
    ? snapshot.focused_pane_id
    : (agents.find(({ workspaceId }) => workspaceId === selectedWorkspaceId)
        ?.id ??
      agents[0]?.id ??
      "");
  return {
    activities: liveActivities(agents),
    agents,
    selectedAgentId,
    selectedWorkspaceId,
    workspaces,
  };
}
