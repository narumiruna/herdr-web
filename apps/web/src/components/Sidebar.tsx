import {
  BellIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  CodeIcon,
  Component1Icon,
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
import { useEffect, useId, useRef, useState } from "react";
import type { HerdrState, Workspace } from "../state";
import { HerdrWebLogo } from "./HerdrWebLogo";
import { agentStatusLabel, StatusPill } from "./StatusPill";

interface SidebarProps {
  state: HerdrState;
  attentionCount: number;
  canCreateSpace: boolean;
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
  attentionCount,
  canCreateSpace,
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
  const treeId = useId();
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const workspaceRows = workspaceTrees(state.workspaces);
  const selectedWorkspaceId =
    state.agents.find(({ id }) => id === state.selectedAgentId)?.workspaceId ??
    state.selectedWorkspaceId;
  const selectedParentId = workspaceRows.find(({ children }) =>
    children.some(({ id }) => id === selectedWorkspaceId),
  )?.workspace.id;
  const [expandedWorkspaceIds, setExpandedWorkspaceIds] = useState(
    () =>
      new Set([
        selectedWorkspaceId,
        ...(selectedParentId ? [selectedParentId] : []),
      ]),
  );

  // Selection can change while mobile navigation is unmounted, or from search,
  // tabs, and attention while desktop navigation stays mounted.
  useEffect(() => {
    if (!selectedWorkspaceId && !state.selectedAgentId) return;
    setExpandedWorkspaceIds((current) => {
      const next = new Set(current);
      next.add(selectedWorkspaceId);
      if (selectedParentId) next.add(selectedParentId);
      return next;
    });
  }, [selectedWorkspaceId, selectedParentId, state.selectedAgentId]);

  const agentsByWorkspace = new Map<string, HerdrState["agents"]>();
  const attentionByWorkspace = new Map<string, number>();
  for (const agent of state.agents) {
    if (agent.kind !== "agent") continue;
    const agents = agentsByWorkspace.get(agent.workspaceId) ?? [];
    agents.push(agent);
    agentsByWorkspace.set(agent.workspaceId, agents);
    if (agent.status === "blocked") {
      attentionByWorkspace.set(
        agent.workspaceId,
        (attentionByWorkspace.get(agent.workspaceId) ?? 0) + 1,
      );
    }
  }
  for (const agents of agentsByWorkspace.values()) {
    agents.sort(
      (left, right) =>
        (left.tabNumber ?? Number.MAX_SAFE_INTEGER) -
        (right.tabNumber ?? Number.MAX_SAFE_INTEGER),
    );
  }

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
    const label = isWorktree ? worktreeLabel(workspace) : workspace.name;
    const branch = workspace.branch || workspace.worktree?.branch || "";
    const needsInput = attentionByWorkspace.get(workspace.id) ?? 0;
    const agents = agentsByWorkspace.get(workspace.id) ?? [];
    const expanded = expandedWorkspaceIds.has(workspace.id);
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
            onClick={() => selectWorkspace(workspace.id)}
          >
            <span
              className={`workspace-glyph accent-${workspace.accent}`}
              aria-hidden="true"
            >
              <Component1Icon />
            </span>
            <span className="workspace-copy">
              <strong>{label}</strong>
              {needsInput > 0 ? (
                <small data-attention="true">{needsInput} needs input</small>
              ) : branch && branch !== label ? (
                <small>{branch}</small>
              ) : null}
            </span>
          </button>
          <span className="sr-only" id={detailsId}>
            {[workspace.name, workspace.path, branch]
              .filter(Boolean)
              .join(" — ")}
          </span>
          <button
            type="button"
            className="workspace-group-toggle"
            aria-expanded={expanded}
            aria-controls={expanded ? childrenId : undefined}
            aria-label={`${expanded ? "Collapse" : "Expand"} ${label} Space`}
            onClick={() =>
              setExpandedWorkspaceIds((current) => {
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
        </div>
        {expanded && (
          <div className="workspace-contents" id={childrenId}>
            {agents.length > 0 ? (
              <ul className="agent-list" aria-label={`${label} Agents`}>
                {agents.map((agent) => {
                  const task = agent.currentStep || agent.summary;
                  const selectedAgent = agent.id === state.selectedAgentId;
                  return (
                    <li key={agent.id}>
                      <button
                        type="button"
                        className="agent-item"
                        data-active={selectedAgent}
                        aria-current={selectedAgent ? "page" : undefined}
                        aria-label={`Open ${agent.label} Agent in ${workspace.name}, ${agentStatusLabel(agent.status)}`}
                        onClick={() => selectAgent(agent.id)}
                      >
                        <span className="agent-identity" aria-hidden="true">
                          <CodeIcon />
                        </span>
                        <span className="agent-item-copy">
                          <strong>{agent.label}</strong>
                          {task && (
                            <span className="agent-item-task">{task}</span>
                          )}
                        </span>
                        <StatusPill status={agent.status} compact />
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="workspace-empty">No detected Agents</p>
            )}
            {children.length > 0 && (
              <ul
                className="worktree-list"
                aria-label={`${workspace.name} worktrees`}
              >
                {children.map((child) => renderWorkspace(child, [], true))}
              </ul>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <HerdrWebLogo />
      </div>
      <button
        type="button"
        className="sidebar-attention"
        aria-label={`Open Attention Inbox, ${attentionCount} items`}
        onClick={(event) => {
          const returnFocus = event.currentTarget;
          onDismiss?.();
          onOpenAttention(returnFocus);
        }}
      >
        <BellIcon aria-hidden="true" />
        <span>Attention Inbox</span>
        <span className="sidebar-attention-count">{attentionCount}</span>
      </button>
      <ScrollArea.Root className="sidebar-scroll">
        <ScrollArea.Viewport className="sidebar-viewport">
          <nav aria-label="herdr-web navigation">
            <section className="nav-section" aria-labelledby={spacesHeadingId}>
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
        <DropdownMenu.Root>
          <DropdownMenu.Trigger>
            <button ref={menuTrigger} type="button" aria-label="Open menu">
              <DotsHorizontalIcon aria-hidden="true" />
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
            <DropdownMenu.Item
              disabled={!canCreateSpace}
              onSelect={() => runMenuAction(onNewSpace)}
            >
              <PlusIcon aria-hidden="true" />
              New Space
            </DropdownMenu.Item>
            <DropdownMenu.Separator />
            <DropdownMenu.Label>Supervision</DropdownMenu.Label>
            <DropdownMenu.Item
              onSelect={() => runMenuAction(onOpenMissionControl)}
            >
              <DashboardIcon aria-hidden="true" />
              Mission Control
            </DropdownMenu.Item>
            <DropdownMenu.Item onSelect={() => runMenuAction(onOpenWorkflows)}>
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
            <DropdownMenu.Item onSelect={() => runMenuAction(onOpenSettings)}>
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
      </div>
    </aside>
  );
}
