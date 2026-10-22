import {
  BellIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CubeIcon,
  DashboardIcon,
  DotsHorizontalIcon,
  GearIcon,
  KeyboardIcon,
  Link2Icon,
  PlusIcon,
  ReloadIcon,
  StackIcon,
} from "@radix-ui/react-icons";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { DropdownMenu } from "@radix-ui/themes";
import { type CSSProperties, useEffect, useId, useRef, useState } from "react";
import type { AgentStatus, HerdrState, Workspace } from "../state";
import { HerdrWebLogo } from "./HerdrWebLogo";
import {
  clampSidebarSpacesRatio,
  SidebarSectionResizeHandle,
} from "./SidebarSectionResizeHandle";
import { agentStatusLabel, StatusPill } from "./StatusPill";

export type AgentSortMode = "grouped" | "priority";

interface SidebarProps {
  state: HerdrState;
  agentSort: AgentSortMode;
  spacesRatio: number;
  attentionCount: number;
  canCreateSpace: boolean;
  onAgentSortChange: (sort: AgentSortMode) => void;
  onSpacesRatioChange: (ratio: number) => void;
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onNewSpace: (returnFocus?: HTMLElement | null) => void;
  onOpenAttention: (returnFocus?: HTMLElement | null) => void;
  onOpenMissionControl: (returnFocus?: HTMLElement | null) => void;
  onOpenSettings: (returnFocus?: HTMLElement | null) => void;
  onOpenShares: (returnFocus?: HTMLElement | null) => void;
  onOpenWorkflows: (returnFocus?: HTMLElement | null) => void;
  onOpenKeybindings: (returnFocus?: HTMLElement | null) => void;
  onOpenRuntime: (returnFocus?: HTMLElement | null) => void;
  onRefresh: () => void | Promise<void>;
  onDismiss?: () => void;
}

const STATUS_PRIORITY: Record<AgentStatus, number> = {
  failed: 6,
  blocked: 5,
  done: 4,
  working: 3,
  idle: 2,
  unknown: 1,
};

interface WorkspaceTreeItem {
  children: Workspace[];
  workspace: Workspace;
}

function workspaceRepoKey(workspace: Workspace): string {
  return (
    workspace.worktree?.repoKey ||
    workspace.worktree?.repoRoot ||
    workspace.worktree?.repoName ||
    ""
  );
}

function workspaceTrees(workspaces: Workspace[]): WorkspaceTreeItem[] {
  const parentByRepoKey = new Map<string, Workspace>();
  for (const workspace of workspaces) {
    const key = workspaceRepoKey(workspace);
    if (!key || workspace.worktree?.isLinked) continue;
    if (!parentByRepoKey.has(key)) parentByRepoKey.set(key, workspace);
  }

  const childrenByParentId = new Map<string, Workspace[]>();
  const childIds = new Set<string>();
  for (const workspace of workspaces) {
    if (!workspace.worktree?.isLinked) continue;
    const parent = parentByRepoKey.get(workspaceRepoKey(workspace));
    if (!parent || parent.id === workspace.id) continue;
    childIds.add(workspace.id);
    const children = childrenByParentId.get(parent.id) ?? [];
    children.push(workspace);
    childrenByParentId.set(parent.id, children);
  }

  return workspaces
    .filter(({ id }) => !childIds.has(id))
    .map((workspace) => ({
      children: childrenByParentId.get(workspace.id) ?? [],
      workspace,
    }));
}

export function Sidebar({
  state,
  agentSort,
  spacesRatio,
  attentionCount,
  canCreateSpace,
  onAgentSortChange,
  onSpacesRatioChange,
  onSelectWorkspace,
  onSelectAgent,
  onNewSpace,
  onOpenAttention,
  onOpenMissionControl,
  onOpenSettings,
  onOpenShares,
  onOpenWorkflows,
  onOpenKeybindings,
  onOpenRuntime,
  onRefresh,
  onDismiss,
}: SidebarProps) {
  const spacesHeadingId = useId();
  const agentsHeadingId = useId();
  const menuAttentionId = useId();
  const treeId = useId();
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const workspaceRows = workspaceTrees(state.workspaces);
  const selectedWorkspaceId =
    state.agents.find(({ id }) => id === state.selectedAgentId)?.workspaceId ??
    state.selectedWorkspaceId;
  const selectedParentId = workspaceRows.find(({ children }) =>
    children.some(({ id }) => id === selectedWorkspaceId),
  )?.workspace.id;
  const [collapsedWorkspaceIds, setCollapsedWorkspaceIds] = useState(
    () => new Set<string>(),
  );

  // Reopen the selected worktree's parent only when selection changes.
  // A new snapshot alone must not undo a manual collapse.
  // biome-ignore lint/correctness/useExhaustiveDependencies: Selection of another Agent in the same worktree must also reveal its parent.
  useEffect(() => {
    if (!selectedParentId) return;
    setCollapsedWorkspaceIds((current) => {
      if (!current.has(selectedParentId)) return current;
      const next = new Set(current);
      next.delete(selectedParentId);
      return next;
    });
  }, [selectedWorkspaceId, selectedParentId, state.selectedAgentId]);

  const workspaceOrder = new Map(
    state.workspaces.map(({ id }, index) => [id, index]),
  );
  const workspacesById = new Map(
    state.workspaces.map((workspace) => [workspace.id, workspace]),
  );
  const tabsByWorkspace = new Map<string, Set<string>>();
  const statusByWorkspace = new Map<string, AgentStatus>();
  for (const agent of state.agents) {
    const tabs = tabsByWorkspace.get(agent.workspaceId) ?? new Set<string>();
    tabs.add(agent.tabId ?? agent.id);
    tabsByWorkspace.set(agent.workspaceId, tabs);
    if (agent.kind !== "agent") continue;
    const status = statusByWorkspace.get(agent.workspaceId);
    if (!status || STATUS_PRIORITY[agent.status] > STATUS_PRIORITY[status]) {
      statusByWorkspace.set(agent.workspaceId, agent.status);
    }
  }
  const agents = state.agents
    .map((agent, index) => ({ agent, index }))
    .filter(({ agent }) => agent.kind === "agent")
    .sort((left, right) => {
      const groupedOrder =
        (workspaceOrder.get(left.agent.workspaceId) ??
          Number.MAX_SAFE_INTEGER) -
          (workspaceOrder.get(right.agent.workspaceId) ??
            Number.MAX_SAFE_INTEGER) ||
        (left.agent.tabOrder ??
          left.agent.tabNumber ??
          Number.MAX_SAFE_INTEGER) -
          (right.agent.tabOrder ??
            right.agent.tabNumber ??
            Number.MAX_SAFE_INTEGER) ||
        left.index - right.index;
      if (agentSort === "grouped") return groupedOrder;
      return (
        STATUS_PRIORITY[right.agent.status] -
          STATUS_PRIORITY[left.agent.status] ||
        (right.agent.stateChangeSeq ?? 0) - (left.agent.stateChangeSeq ?? 0) ||
        groupedOrder
      );
    })
    .map(({ agent }) => agent);

  const selectWorkspace = (workspaceId: string) => {
    onSelectWorkspace(workspaceId);
    onDismiss?.();
  };
  const selectAgent = (agentId: string) => {
    onSelectAgent(agentId);
    onDismiss?.();
  };
  const runMenuAction = (
    action: (returnFocus?: HTMLElement | null) => void,
  ) => {
    const returnFocus = menuTrigger.current;
    onDismiss?.();
    action(returnFocus);
  };
  const renderWorkspace = (
    workspace: Workspace,
    children: Workspace[] = [],
    isWorktree = false,
  ) => {
    const selected = workspace.id === state.selectedWorkspaceId;
    const label = isWorktree
      ? workspace.branch || workspace.worktree?.branch || workspace.name
      : workspace.name;
    const branch = workspace.branch || workspace.worktree?.branch || "";
    const expanded = !collapsedWorkspaceIds.has(workspace.id);
    let status = statusByWorkspace.get(workspace.id) ?? "unknown";
    if (!expanded) {
      for (const child of children) {
        const childStatus = statusByWorkspace.get(child.id) ?? "unknown";
        if (STATUS_PRIORITY[childStatus] > STATUS_PRIORITY[status]) {
          status = childStatus;
        }
      }
    }
    const details = [
      workspace.name,
      workspace.path,
      branch,
      agentStatusLabel(status),
    ]
      .filter(Boolean)
      .join(" — ");
    const childrenId = `${treeId}-${workspace.id}-children`;
    const detailsId = `${treeId}-${workspace.id}-details`;
    return (
      <li className="workspace-tree" key={workspace.id}>
        <div className="workspace-tree-heading">
          <button
            className={
              isWorktree ? "workspace-item worktree-item" : "workspace-item"
            }
            type="button"
            data-active={selected}
            aria-current={selected ? "page" : undefined}
            aria-label={
              isWorktree
                ? `Open ${label} worktree Space`
                : `Open ${label} Space`
            }
            aria-describedby={detailsId}
            title={details}
            onClick={() => selectWorkspace(workspace.id)}
          >
            <span
              className={`workspace-glyph accent-${workspace.accent}`}
              aria-hidden="true"
            >
              <StatusPill status={status} compact />
            </span>
            <span className="workspace-copy">
              <strong>{label}</strong>
              {branch && branch !== label && <small>{branch}</small>}
            </span>
          </button>
          <span className="sr-only" id={detailsId}>
            {details}
          </span>
          {children.length > 0 && (
            <button
              type="button"
              className="workspace-group-toggle"
              aria-expanded={expanded}
              aria-controls={expanded ? childrenId : undefined}
              aria-label={`${expanded ? "Collapse" : "Expand"} ${workspace.name} worktrees`}
              onClick={() =>
                setCollapsedWorkspaceIds((current) => {
                  const next = new Set(current);
                  if (next.has(workspace.id)) next.delete(workspace.id);
                  else next.add(workspace.id);
                  return next;
                })
              }
            >
              {expanded ? (
                <ChevronDownIcon aria-hidden="true" />
              ) : (
                <ChevronRightIcon aria-hidden="true" />
              )}
            </button>
          )}
        </div>
        {children.length > 0 && expanded && (
          <div className="workspace-contents" id={childrenId}>
            <ul
              className="worktree-list"
              aria-label={`${workspace.name} worktrees`}
            >
              {children.map((child) => renderWorkspace(child, [], true))}
            </ul>
          </div>
        )}
      </li>
    );
  };
  const ratio = clampSidebarSpacesRatio(spacesRatio);
  const sortLabel = agentSort === "priority" ? "Priority" : "Grouped";

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <HerdrWebLogo />
      </div>
      <div
        className="sidebar-sections"
        style={
          {
            "--sidebar-spaces-track": `${ratio}fr`,
            "--sidebar-agents-track": `${1 - ratio}fr`,
          } as CSSProperties
        }
      >
        <div className="spaces-panel">
          <ScrollArea.Root className="sidebar-scroll">
            <ScrollArea.Viewport className="sidebar-viewport">
              <nav aria-label="herdr-web navigation">
                <section
                  className="nav-section"
                  aria-labelledby={spacesHeadingId}
                >
                  <div className="section-label-row">
                    <h2 id={spacesHeadingId}>Spaces</h2>
                    <span>{state.workspaces.length}</span>
                  </div>
                  {workspaceRows.length > 0 ? (
                    <ul className="workspace-list">
                      {workspaceRows.map(({ workspace, children }) =>
                        renderWorkspace(workspace, children),
                      )}
                    </ul>
                  ) : (
                    <p className="workspace-empty">No Spaces</p>
                  )}
                </section>
              </nav>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar className="scrollbar" orientation="vertical">
              <ScrollArea.Thumb className="scrollbar-thumb" />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
          <div className="spaces-actions">
            <button
              type="button"
              disabled={!canCreateSpace}
              aria-label="Create a new Space"
              onClick={(event) => {
                const returnFocus = event.currentTarget;
                onDismiss?.();
                onNewSpace(returnFocus);
              }}
            >
              <PlusIcon aria-hidden="true" />
              New
            </button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <button
                  ref={menuTrigger}
                  type="button"
                  aria-label="Open menu"
                  aria-describedby={menuAttentionId}
                  data-attention={attentionCount > 0}
                >
                  <DotsHorizontalIcon aria-hidden="true" />
                  Menu
                  {attentionCount > 0 && (
                    <span
                      className="sidebar-menu-attention-dot"
                      aria-hidden="true"
                    />
                  )}
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content
                className="sidebar-menu"
                align="end"
                side="top"
                sideOffset={6}
                size="1"
              >
                <DropdownMenu.Item
                  disabled={!canCreateSpace}
                  onSelect={() => runMenuAction(onNewSpace)}
                >
                  <PlusIcon aria-hidden="true" /> New Space
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Label>Supervision</DropdownMenu.Label>
                <DropdownMenu.Item
                  aria-label={`Open Attention Inbox, ${attentionCount} items`}
                  onSelect={() => runMenuAction(onOpenAttention)}
                >
                  <BellIcon aria-hidden="true" /> Attention Inbox
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => runMenuAction(onOpenMissionControl)}
                >
                  <DashboardIcon aria-hidden="true" /> Mission Control
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => runMenuAction(onOpenWorkflows)}
                >
                  <StackIcon aria-hidden="true" /> Workflow templates
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  disabled={!canCreateSpace}
                  onSelect={() => runMenuAction(onOpenShares)}
                >
                  <Link2Icon aria-hidden="true" /> Viewer shares
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Label>Workbench</DropdownMenu.Label>
                <DropdownMenu.Item
                  onSelect={() => runMenuAction(onOpenSettings)}
                >
                  <GearIcon aria-hidden="true" /> Settings
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  disabled={!canCreateSpace}
                  onSelect={() => runMenuAction(onOpenRuntime)}
                >
                  <CubeIcon aria-hidden="true" /> Herdr runtime
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => runMenuAction(onOpenKeybindings)}
                >
                  <KeyboardIcon aria-hidden="true" /> Keybindings
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item
                  onSelect={() => {
                    onDismiss?.();
                    void onRefresh();
                  }}
                >
                  <ReloadIcon aria-hidden="true" /> Reload Herdr
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
            <span id={menuAttentionId} className="sr-only">
              Attention Inbox, {attentionCount} items
            </span>
          </div>
        </div>
        <SidebarSectionResizeHandle
          ratio={ratio}
          onResize={onSpacesRatioChange}
        />
        <section className="agent-panel" aria-labelledby={agentsHeadingId}>
          <div className="section-label-row agent-panel-heading">
            <div className="agent-panel-title">
              <h2 id={agentsHeadingId}>Agents</h2>
              <span>{agents.length}</span>
            </div>
            <button
              type="button"
              className="agent-sort-toggle"
              aria-label={`Agent ordering: ${sortLabel}`}
              onClick={() =>
                onAgentSortChange(
                  agentSort === "grouped" ? "priority" : "grouped",
                )
              }
            >
              {sortLabel}
            </button>
          </div>
          <ScrollArea.Root className="agent-panel-scroll">
            <ScrollArea.Viewport className="agent-panel-viewport">
              <nav className="agent-list" aria-label="Detected Agents">
                {agents.length > 0 ? (
                  agents.map((agent) => {
                    const workspaceName =
                      workspacesById.get(agent.workspaceId)?.name ??
                      "Unknown Space";
                    const tabLabel =
                      agent.tabLabel ??
                      (agent.tabNumber === undefined
                        ? undefined
                        : String(agent.tabNumber));
                    const showTab =
                      (tabsByWorkspace.get(agent.workspaceId)?.size ?? 0) > 1 ||
                      agent.tabCustomLabel;
                    const selected = agent.id === state.selectedAgentId;
                    return (
                      <button
                        type="button"
                        className="agent-item"
                        key={agent.id}
                        data-active={selected}
                        aria-current={selected ? "page" : undefined}
                        aria-label={`Open ${agent.label} Agent in ${workspaceName}, ${agentStatusLabel(agent.status)}${showTab && tabLabel ? `, tab ${tabLabel}` : ""}${agent.runtime ? `, ${agent.runtime}` : ""}`}
                        title={[
                          agent.label,
                          agent.currentStep || agent.summary,
                          workspaceName,
                          agentStatusLabel(agent.status),
                        ]
                          .filter(Boolean)
                          .join(" — ")}
                        onClick={() => selectAgent(agent.id)}
                      >
                        <span className="agent-identity" aria-hidden="true">
                          <StatusPill status={agent.status} compact />
                        </span>
                        <span className="agent-item-copy">
                          <strong
                            title={`${workspaceName}${showTab && tabLabel ? ` · ${tabLabel}` : ""}`}
                          >
                            {workspaceName}
                            {showTab && tabLabel ? ` · ${tabLabel}` : ""}
                          </strong>
                          <small title={agent.runtime}>{agent.runtime}</small>
                        </span>
                      </button>
                    );
                  })
                ) : (
                  <p className="agent-panel-empty">No detected Agents</p>
                )}
              </nav>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar className="scrollbar" orientation="vertical">
              <ScrollArea.Thumb className="scrollbar-thumb" />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>
        </section>
      </div>
    </aside>
  );
}
