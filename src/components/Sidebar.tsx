import {
  ChevronRightIcon,
  Component1Icon,
  ExclamationTriangleIcon,
  GearIcon,
  KeyboardIcon,
  PlusIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { DropdownMenu } from "@radix-ui/themes";
import { useId, useRef } from "react";
import type { HerdrState } from "../state";
import { HedrLogo } from "./HedrLogo";
import { agentStatusLabel, StatusPill } from "./StatusPill";

interface SidebarProps {
  state: HerdrState;
  canCreateSpace: boolean;
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onNewSpace: (returnFocus?: HTMLElement | null) => void;
  onOpenSettings: (returnFocus?: HTMLElement | null) => void;
  onOpenKeybindings: (returnFocus?: HTMLElement | null) => void;
  onRefresh: () => void | Promise<void>;
  onDismiss?: () => void;
}

export function Sidebar({
  state,
  canCreateSpace,
  onSelectWorkspace,
  onSelectAgent,
  onNewSpace,
  onOpenSettings,
  onOpenKeybindings,
  onRefresh,
  onDismiss,
}: SidebarProps) {
  const spacesHeadingId = useId();
  const agentsHeadingId = useId();
  const menuTrigger = useRef<HTMLButtonElement>(null);
  const attention = state.agents.filter(
    ({ kind, status }) => kind === "agent" && status === "blocked",
  );
  const workspaceOrder = new Map(
    state.workspaces.map(({ id }, index) => [id, index]),
  );
  const agents = state.agents
    .map((agent, index) => ({ agent, index }))
    .filter(({ agent }) => agent.kind === "agent")
    .sort(
      (left, right) =>
        (workspaceOrder.get(left.agent.workspaceId) ??
          Number.MAX_SAFE_INTEGER) -
          (workspaceOrder.get(right.agent.workspaceId) ??
            Number.MAX_SAFE_INTEGER) ||
        (left.agent.tabNumber ?? Number.MAX_SAFE_INTEGER) -
          (right.agent.tabNumber ?? Number.MAX_SAFE_INTEGER) ||
        left.index - right.index,
    )
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
        <HedrLogo />
      </div>

      <div className="spaces-panel">
        <ScrollArea.Root className="sidebar-scroll">
          <ScrollArea.Viewport className="sidebar-viewport">
            <nav aria-label="Hedr navigation">
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
                  {state.workspaces.map((workspace) => {
                    const selected = workspace.id === state.selectedWorkspaceId;
                    return (
                      <button
                        className="workspace-item"
                        type="button"
                        key={workspace.id}
                        data-active={selected}
                        aria-current={selected ? "page" : undefined}
                        aria-label={`Open ${workspace.name} Space`}
                        onClick={() => selectWorkspace(workspace.id)}
                      >
                        <span
                          className={`workspace-glyph accent-${workspace.accent}`}
                        >
                          <Component1Icon aria-hidden="true" />
                        </span>
                        <span className="workspace-copy">
                          <strong>{workspace.name}</strong>
                          {attention.some(
                            ({ workspaceId }) => workspaceId === workspace.id,
                          ) && (
                            <small>
                              {
                                attention.filter(
                                  ({ workspaceId }) =>
                                    workspaceId === workspace.id,
                                ).length
                              }{" "}
                              needs input
                            </small>
                          )}
                        </span>
                        <ChevronRightIcon
                          className="workspace-chevron"
                          aria-hidden="true"
                        />
                      </button>
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
              <DropdownMenu.Label>Workbench</DropdownMenu.Label>
              <DropdownMenu.Item onSelect={() => runMenuAction(onOpenSettings)}>
                <GearIcon aria-hidden="true" />
                Settings
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

      <section className="agent-panel" aria-labelledby={agentsHeadingId}>
        <div className="section-label-row agent-panel-heading">
          <h2 id={agentsHeadingId}>Agents</h2>
          <span>{agents.length}</span>
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
                  return (
                    <button
                      type="button"
                      className="agent-item"
                      data-active={selected}
                      aria-current={selected ? "page" : undefined}
                      aria-label={`Open ${agent.label} Agent in ${workspace?.name ?? "unknown Space"}, ${agentStatusLabel(agent.status)}`}
                      key={agent.id}
                      onClick={() => selectAgent(agent.id)}
                    >
                      <StatusPill status={agent.status} compact />
                      <span className="agent-item-copy">
                        <strong>{agent.label}</strong>
                        <small>{workspace?.name ?? "Unknown Space"}</small>
                      </span>
                      <span
                        className={`agent-item-state agent-state-${agent.status}`}
                      >
                        {agentStatusLabel(agent.status)}
                      </span>
                    </button>
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
    </aside>
  );
}
