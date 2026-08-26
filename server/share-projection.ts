import type { ShareScope } from "./share-store.js";

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is UnknownRecord =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];
}

function strings(value: unknown): Record<string, string> | undefined {
  const source = record(value);
  const selected = Object.fromEntries(
    Object.entries(source).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
  return Object.keys(selected).length > 0 ? selected : undefined;
}

function pick(source: UnknownRecord, names: string[]): UnknownRecord {
  return Object.fromEntries(
    names.flatMap((name) =>
      source[name] === undefined ? [] : [[name, source[name]]],
    ),
  );
}

function sanitizePane(pane: UnknownRecord): UnknownRecord {
  const selected = pick(pane, [
    "agent",
    "agent_status",
    "cwd",
    "display_agent",
    "focused",
    "foreground_cwd",
    "label",
    "pane_id",
    "revision",
    "tab_id",
    "terminal_title_stripped",
    "title",
    "workspace_id",
  ]);
  const stateLabels = strings(pane.state_labels);
  if (stateLabels) selected.state_labels = stateLabels;
  const tokens = record(pane.tokens);
  const safeTokens = pick(tokens, ["context_percent", "model", "summary"]);
  if (Object.keys(safeTokens).length > 0) selected.tokens = safeTokens;
  return selected;
}

function sanitizeWorkspace(workspace: UnknownRecord): UnknownRecord {
  const selected = pick(workspace, [
    "active_tab_id",
    "agent_status",
    "focused",
    "label",
    "number",
    "pane_count",
    "tab_count",
    "workspace_id",
  ]);
  const worktree = record(workspace.worktree);
  const safeWorktree = pick(worktree, [
    "branch",
    "checkout_path",
    "is_linked_worktree",
    "repo_key",
    "repo_name",
    "repo_root",
  ]);
  if (Object.keys(safeWorktree).length > 0) selected.worktree = safeWorktree;
  const branch = record(workspace.tokens).branch;
  if (typeof branch === "string") selected.tokens = { branch };
  return selected;
}

function sanitizeTab(tab: UnknownRecord): UnknownRecord {
  return pick(tab, [
    "agent_status",
    "focused",
    "label",
    "number",
    "pane_count",
    "tab_id",
    "workspace_id",
  ]);
}

function sanitizeReads(
  value: unknown,
  allowedPaneIds: Set<string>,
): UnknownRecord {
  return Object.fromEntries(
    Object.entries(record(value)).flatMap(([id, raw]) => {
      if (!allowedPaneIds.has(id)) return [];
      const read = record(raw);
      const revision = Number(read.revision);
      return [
        [
          id,
          {
            pane_id: id,
            revision:
              Number.isInteger(revision) && revision >= 0 ? revision : 0,
            text:
              typeof read.text === "string" ? read.text.slice(-262_144) : "",
          },
        ],
      ];
    }),
  );
}

function sanitizeReadErrors(
  value: unknown,
  allowedPaneIds: Set<string>,
): UnknownRecord {
  return Object.fromEntries(
    Object.entries(record(value)).flatMap(([id, error]) =>
      allowedPaneIds.has(id) && typeof error === "string"
        ? [[id, error.slice(0, 2_000)]]
        : [],
    ),
  );
}

export function projectStateForShare(
  value: unknown,
  scope: ShareScope,
): UnknownRecord | undefined {
  const state = record(value);
  const snapshot = record(state.snapshot);
  const workspaces = records(snapshot.workspaces).filter(
    ({ workspace_id: id }) => id === scope.workspaceId,
  );
  if (workspaces.length !== 1) return undefined;

  const workspacePanes = records(snapshot.panes).filter(
    ({ workspace_id: id }) => id === scope.workspaceId,
  );
  const workspaceAgents = records(snapshot.agents).filter(
    ({ workspace_id: id }) => id === scope.workspaceId,
  );
  const requestedAgent = scope.agentId
    ? workspaceAgents.find(({ pane_id: id }) => id === scope.agentId)
    : undefined;
  if (scope.agentId && !requestedAgent) return undefined;
  const requestedPane = scope.paneId
    ? workspacePanes.find(({ pane_id: id }) => id === scope.paneId)
    : undefined;
  if (scope.paneId && !requestedPane) return undefined;

  const targetTabId =
    (requestedAgent?.tab_id as string | undefined) ??
    (requestedPane?.tab_id as string | undefined);
  if (
    requestedAgent &&
    requestedPane &&
    requestedAgent.tab_id !== requestedPane.tab_id
  ) {
    return undefined;
  }
  const panes = workspacePanes.filter((pane) => {
    if (scope.paneId) return pane.pane_id === scope.paneId;
    if (targetTabId) return pane.tab_id === targetTabId;
    return true;
  });
  const allowedPaneIds = new Set(panes.map(({ pane_id: id }) => String(id)));
  const allowedTabIds = new Set(panes.map(({ tab_id: id }) => String(id)));
  const tabs = records(snapshot.tabs).filter(
    (tab) =>
      tab.workspace_id === scope.workspaceId &&
      allowedTabIds.has(String(tab.tab_id)),
  );
  const agents = workspaceAgents.filter(
    (agent) =>
      allowedTabIds.has(String(agent.tab_id)) &&
      (!scope.agentId || agent.pane_id === scope.agentId),
  );
  const layouts = records(snapshot.layouts)
    .filter(
      (layout) =>
        layout.workspace_id === scope.workspaceId &&
        allowedTabIds.has(String(layout.tab_id)),
    )
    .map((layout) => {
      const layoutPanes = records(layout.panes).filter(({ pane_id: id }) =>
        allowedPaneIds.has(String(id)),
      );
      return {
        ...pick(layout, ["tab_id", "workspace_id"]),
        focused_pane_id:
          typeof layout.focused_pane_id === "string" &&
          allowedPaneIds.has(layout.focused_pane_id)
            ? layout.focused_pane_id
            : (layoutPanes[0]?.pane_id ?? ""),
        panes: layoutPanes.map((pane) => pick(pane, ["focused", "pane_id"])),
        splits:
          layoutPanes.length > 1
            ? records(layout.splits).map((split) =>
                pick(split, ["direction", "id", "ratio"]),
              )
            : [],
      };
    });
  const firstPaneId = String(panes[0]?.pane_id ?? "");
  const firstTabId = String(tabs[0]?.tab_id ?? "");
  const workspace = sanitizeWorkspace(workspaces[0] as UnknownRecord);
  workspace.active_tab_id = allowedTabIds.has(String(workspace.active_tab_id))
    ? workspace.active_tab_id
    : firstTabId;

  return {
    access: { role: "viewer", share: { expiresAt: 0, scope } },
    capabilities: pick(record(state.capabilities), [
      "terminalReason",
      "terminalStreaming",
    ]),
    previews: sanitizeReads(state.previews, allowedPaneIds),
    readErrors: sanitizeReadErrors(state.readErrors, allowedPaneIds),
    reads: sanitizeReads(state.reads, allowedPaneIds),
    snapshot: {
      agents: agents.map(sanitizePane),
      focused_pane_id: allowedPaneIds.has(String(snapshot.focused_pane_id))
        ? snapshot.focused_pane_id
        : firstPaneId,
      focused_workspace_id: scope.workspaceId,
      layouts,
      panes: panes.map(sanitizePane),
      protocol: snapshot.protocol,
      tabs: tabs.map(sanitizeTab),
      version: snapshot.version,
      workspaces: [workspace],
    },
  };
}

export function shareScopeAllowsPane(
  state: unknown,
  scope: ShareScope,
  paneId: string,
): boolean {
  const projected = projectStateForShare(state, scope);
  return records(record(projected?.snapshot).panes).some(
    ({ pane_id: id }) => id === paneId,
  );
}
