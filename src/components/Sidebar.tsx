import {
  BellIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CodeIcon,
  Component1Icon,
  CubeIcon,
  DashboardIcon,
  ExclamationTriangleIcon,
  GearIcon,
  HamburgerMenuIcon,
  KeyboardIcon,
  Link2Icon,
  PlusIcon,
  ReloadIcon,
  StackIcon,
} from "@radix-ui/react-icons";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Tooltip from "@radix-ui/react-tooltip";
import { DropdownMenu, SegmentedControl } from "@radix-ui/themes";
import { useId, useRef, useState } from "react";
import { compactBranchLabel } from "../branch-label";
import type { HerdrState, Workspace } from "../state";
import { HerdrWebLogo } from "./HerdrWebLogo";
import { SidebarSectionResizeHandle } from "./SidebarSectionResizeHandle";
import { agentStatusLabel, StatusPill } from "./StatusPill";

export type AgentSortMode = "grouped" | "priority";

interface SidebarProps {
  state: HerdrState;
  agentSort: AgentSortMode;
  canCreateSpace: boolean;
  spacesRatio: number;
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

const AGENT_ATTENTION_PRIORITY = {
  blocked: 5,
  failed: 6,
  done: 4,
  working: 3,
  idle: 2,
  unknown: 1,
} as const;

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

function worktreeLabel(workspace: Workspace): string {
  return workspace.branch || workspace.worktree?.branch || workspace.name;
}

export function Sidebar({
  state,
  agentSort,
  canCreateSpace,
  spacesRatio,
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
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const [collapsedWorkspaceIds, setCollapsedWorkspaceIds] = useState<
    Set<string>
  >(() => new Set());
  const attention = state.agents.filter(
    ({ kind, status }) => kind === "agent" && status === "blocked",
  );
  const attentionByWorkspace = new Map<string, number>();
  for (const agent of attention) {
    attentionByWorkspace.set(
      agent.workspaceId,
      (attentionByWorkspace.get(agent.workspaceId) ?? 0) + 1,
    );
  }
  const workspaceOrder = new Map(
    state.workspaces.map(({ id }, index) => [id, index]),
  );
  const agents = state.agents
    .map((agent, index) => ({ agent, index }))
    .filter(({ agent }) => agent.kind === "agent")
    .sort((left, right) => {
      const groupedOrder =
        (workspaceOrder.get(left.agent.workspaceId) ??
          Number.MAX_SAFE_INTEGER) -
          (workspaceOrder.get(right.agent.workspaceId) ??
            Number.MAX_SAFE_INTEGER) ||
        (left.agent.tabNumber ?? Number.MAX_SAFE_INTEGER) -
          (right.agent.tabNumber ?? Number.MAX_SAFE_INTEGER) ||
        left.index - right.index;
      if (agentSort === "grouped") return groupedOrder;
      return (
        AGENT_ATTENTION_PRIORITY[right.agent.status] -
          AGENT_ATTENTION_PRIORITY[left.agent.status] || groupedOrder
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
  const startNewSpace = (returnFocus: HTMLElement) => {
    onDismiss?.();
    onNewSpace(returnFocus);
  };
  const workspaceRows = workspaceTrees(state.workspaces);
  const workspaceAttentionDetail = (workspace: Workspace) => {
    const count = attentionByWorkspace.get(workspace.id) ?? 0;
    return count > 0 ? `${count} needs input` : "";
  };
  const workspaceDetail = (workspace: Workspace) =>
    workspaceAttentionDetail(workspace) || workspace.branch;
  const renderWorkspaceButton = (
    workspace: Workspace,
    variant: "space" | "worktree",
    grouped = false,
  ) => {
    const selected = workspace.id === state.selectedWorkspaceId;
    const isWorktree = variant === "worktree";
    const label = isWorktree ? worktreeLabel(workspace) : workspace.name;
    const branch = workspace.branch || workspace.worktree?.branch || "";
    const detail = isWorktree
      ? workspaceAttentionDetail(workspace)
      : workspaceDetail(workspace);
    const displayLabel = isWorktree ? compactBranchLabel(label) : label;
    const displayDetail =
      detail && detail !== workspaceAttentionDetail(workspace)
        ? compactBranchLabel(detail)
        : detail;
    const button = (
      <button
        className={
          isWorktree ? "workspace-item worktree-item" : "workspace-item"
        }
        type="button"
        key={workspace.id}
        data-active={selected}
        aria-current={selected ? "page" : undefined}
        aria-label={
          isWorktree
            ? `Open ${label} worktree Space`
            : `Open ${workspace.name} Space`
        }
        title={[label, branch !== label ? branch : "", workspace.path]
          .filter(Boolean)
          .join(" — ")}
        onClick={() => selectWorkspace(workspace.id)}
      >
        {isWorktree ? (
          <span className="worktree-rail" aria-hidden="true">
            <span className="worktree-elbow" />
            <span className="worktree-dot" data-active={selected} />
          </span>
        ) : (
          <span className={`workspace-glyph accent-${workspace.accent}`}>
            <Component1Icon aria-hidden="true" />
          </span>
        )}
        <span className="workspace-copy">
          <strong title={label}>{displayLabel}</strong>
          {detail && (
            <small
              data-attention={Boolean(workspaceAttentionDetail(workspace))}
              title={detail}
            >
              {displayDetail}
            </small>
          )}
        </span>
        {!grouped && (
          <ChevronRightIcon className="workspace-chevron" aria-hidden="true" />
        )}
      </button>
    );
    if (!branch) return button;
    return (
      <Tooltip.Root key={workspace.id} delayDuration={350}>
        <Tooltip.Trigger asChild>{button}</Tooltip.Trigger>
        <Tooltip.Portal>
          <Tooltip.Content className="tooltip-content" sideOffset={7}>
            Branch: {branch}
            <Tooltip.Arrow className="tooltip-arrow" />
          </Tooltip.Content>
        </Tooltip.Portal>
      </Tooltip.Root>
    );
  };
  const runMenuAction = (
    action: (returnFocus?: HTMLElement | null) => void,
  ) => {
    const returnFocus = menuTrigger.current;
    onDismiss?.();
    action(returnFocus);
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <HerdrWebLogo />
      </div>

      <div
        className="sidebar-sections"
        style={{
          gridTemplateRows: `minmax(0, ${spacesRatio}fr) var(--sidebar-section-handle-size) minmax(0, ${1 - spacesRatio}fr)`,
        }}
      >
        <div className="spaces-panel">
          <ScrollArea.Root className="sidebar-scroll">
            <ScrollArea.Viewport className="sidebar-viewport">
              <nav aria-label="herdr-web navigation">
                {attention.length > 0 && (
                  <section
                    className="nav-section attention-section"
                    aria-label="Needs input"
                  >
                    <div className="section-label-row attention-label">
                      <h2>Needs input</h2>
                      <span>{attention.length}</span>
                    </div>
                    <div className="attention-list">
                      {attention.map((agent) => (
                        <button
                          type="button"
                          className="attention-item"
                          data-active={agent.id === state.selectedAgentId}
                          aria-label={`Open ${agent.label} Agent needing input`}
                          key={agent.id}
                          onClick={() => selectAgent(agent.id)}
                        >
                          <ExclamationTriangleIcon aria-hidden="true" />
                          <span>
                            <strong>{agent.label}</strong>
                            <small>
                              {state.workspaces.find(
                                ({ id }) => id === agent.workspaceId,
                              )?.name ?? "Unknown Space"}
                            </small>
                          </span>
                          <ChevronRightIcon aria-hidden="true" />
                        </button>
                      ))}
                    </div>
                  </section>
                )}

                <section
                  className="nav-section"
                  aria-labelledby={spacesHeadingId}
                >
                  <div className="section-label-row">
                    <h2 id={spacesHeadingId}>Spaces</h2>
                    <span>{state.workspaces.length}</span>
                  </div>
                  <div className="workspace-list">
                    {workspaceRows.map(({ children, workspace }) => {
                      const collapsed = collapsedWorkspaceIds.has(workspace.id);
                      return (
                        <div className="workspace-tree" key={workspace.id}>
                          <div className="workspace-tree-heading">
                            {renderWorkspaceButton(
                              workspace,
                              "space",
                              children.length > 0,
                            )}
                            {children.length > 0 && (
                              <button
                                type="button"
                                className="workspace-group-toggle"
                                aria-expanded={!collapsed}
                                aria-label={`${collapsed ? "Expand" : "Collapse"} ${workspace.name} worktrees`}
                                title={`${collapsed ? "Expand" : "Collapse"} ${workspace.name} worktrees`}
                                onClick={() =>
                                  setCollapsedWorkspaceIds((current) => {
                                    const next = new Set(current);
                                    if (next.has(workspace.id)) {
                                      next.delete(workspace.id);
                                    } else {
                                      next.add(workspace.id);
                                    }
                                    return next;
                                  })
                                }
                              >
                                {collapsed ? (
                                  <ChevronRightIcon aria-hidden="true" />
                                ) : (
                                  <ChevronDownIcon aria-hidden="true" />
                                )}
                              </button>
                            )}
                          </div>
                          {children.length > 0 && !collapsed && (
                            <fieldset className="worktree-list">
                              <legend className="sr-only">
                                {workspace.name} worktrees
                              </legend>
                              {children.map((child) =>
                                renderWorkspaceButton(child, "worktree"),
                              )}
                            </fieldset>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </section>
              </nav>
            </ScrollArea.Viewport>
            <ScrollArea.Scrollbar className="scrollbar" orientation="vertical">
              <ScrollArea.Thumb className="scrollbar-thumb" />
            </ScrollArea.Scrollbar>
          </ScrollArea.Root>

          <fieldset className="spaces-actions">
            <legend className="sr-only">Space actions</legend>
            <button
              type="button"
              disabled={!canCreateSpace}
              aria-label="Create a new Space"
              onClick={(event) => startNewSpace(event.currentTarget)}
            >
              <PlusIcon aria-hidden="true" />
              New
            </button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                <button ref={menuTrigger} type="button" aria-label="Open menu">
                  <HamburgerMenuIcon aria-hidden="true" />
                  Menu
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Content
                className="sidebar-menu"
                align="end"
                side="top"
                sideOffset={6}
                size="1"
              >
                <DropdownMenu.Label>Supervision</DropdownMenu.Label>
                <DropdownMenu.Item
                  onSelect={() => runMenuAction(onOpenAttention)}
                >
                  <BellIcon aria-hidden="true" />
                  Attention Inbox
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => runMenuAction(onOpenMissionControl)}
                >
                  <DashboardIcon aria-hidden="true" />
                  Mission Control
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => runMenuAction(onOpenWorkflows)}
                >
                  <StackIcon aria-hidden="true" />
                  Workflow templates
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  disabled={!canCreateSpace}
                  onSelect={() => runMenuAction(onOpenShares)}
                >
                  <Link2Icon aria-hidden="true" />
                  Viewer shares
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Label>Workbench</DropdownMenu.Label>
                <DropdownMenu.Item
                  onSelect={() => runMenuAction(onOpenSettings)}
                >
                  <GearIcon aria-hidden="true" />
                  Settings
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  disabled={!canCreateSpace}
                  onSelect={() => runMenuAction(onOpenRuntime)}
                >
                  <CubeIcon aria-hidden="true" />
                  Herdr runtime
                </DropdownMenu.Item>
                <DropdownMenu.Item
                  onSelect={() => runMenuAction(onOpenKeybindings)}
                >
                  <KeyboardIcon aria-hidden="true" />
                  Keybindings
                </DropdownMenu.Item>
                <DropdownMenu.Separator />
                <DropdownMenu.Item
                  onSelect={() => {
                    onDismiss?.();
                    void onRefresh();
                  }}
                >
                  <ReloadIcon aria-hidden="true" />
                  Reload Herdr
                </DropdownMenu.Item>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
          </fieldset>
        </div>

        <SidebarSectionResizeHandle
          ratio={spacesRatio}
          onResize={onSpacesRatioChange}
        />

        <section className="agent-panel" aria-labelledby={agentsHeadingId}>
          <div className="section-label-row agent-panel-heading">
            <div className="agent-panel-title">
              <h2 id={agentsHeadingId}>Agents</h2>
              <span>{agents.length}</span>
            </div>
            <SegmentedControl.Root
              className="agent-sort-control"
              aria-label="Agent ordering"
              size="1"
              value={agentSort}
              onValueChange={(value) => {
                if (value === "grouped" || value === "priority") {
                  onAgentSortChange(value);
                }
              }}
            >
              <SegmentedControl.Item value="grouped">
                Grouped
              </SegmentedControl.Item>
              <SegmentedControl.Item value="priority">
                Priority
              </SegmentedControl.Item>
            </SegmentedControl.Root>
          </div>
          <ScrollArea.Root className="agent-panel-scroll">
            <ScrollArea.Viewport className="agent-panel-viewport">
              {agents.length > 0 ? (
                <nav className="agent-list" aria-label="Detected Agents">
                  {agents.map((agent) => {
                    const workspace = state.workspaces.find(
                      ({ id }) => id === agent.workspaceId,
                    );
                    const selected = agent.id === state.selectedAgentId;
                    const task = agent.currentStep || agent.summary;
                    const tooltip = [
                      agent.label,
                      task,
                      workspace?.name ?? "Unknown Space",
                      agentStatusLabel(agent.status),
                    ]
                      .filter(Boolean)
                      .join(" — ");
                    return (
                      <Tooltip.Root key={agent.id} delayDuration={350}>
                        <Tooltip.Trigger asChild>
                          <button
                            type="button"
                            className="agent-item"
                            data-active={selected}
                            aria-current={selected ? "page" : undefined}
                            aria-label={`Open ${agent.label} Agent in ${workspace?.name ?? "unknown Space"}, ${agentStatusLabel(agent.status)}`}
                            title={tooltip}
                            onClick={() => selectAgent(agent.id)}
                          >
                            <span className="agent-identity" aria-hidden="true">
                              <CodeIcon />
                            </span>
                            <span className="agent-item-copy">
                              <strong title={agent.label}>{agent.label}</strong>
                              {task && (
                                <span className="agent-item-task" title={task}>
                                  {task}
                                </span>
                              )}
                              <small>
                                {workspace?.name ?? "Unknown Space"}
                              </small>
                            </span>
                            <StatusPill status={agent.status} compact />
                          </button>
                        </Tooltip.Trigger>
                        <Tooltip.Portal>
                          <Tooltip.Content
                            className="tooltip-content"
                            sideOffset={7}
                          >
                            {tooltip}
                            <Tooltip.Arrow className="tooltip-arrow" />
                          </Tooltip.Content>
                        </Tooltip.Portal>
                      </Tooltip.Root>
                    );
                  })}
                </nav>
              ) : (
                <p className="agent-panel-empty">No detected Agents</p>
              )}
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
