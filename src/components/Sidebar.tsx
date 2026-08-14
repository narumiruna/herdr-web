import {
  ChevronRightIcon,
  Component1Icon,
  ExclamationTriangleIcon,
} from "@radix-ui/react-icons";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import type { HerdrState } from "../state";
import { HedrLogo } from "./HedrLogo";

interface SidebarProps {
  state: HerdrState;
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onDismiss?: () => void;
}

export function Sidebar({
  state,
  onSelectWorkspace,
  onSelectAgent,
  onDismiss,
}: SidebarProps) {
  const attention = state.agents.filter(
    ({ kind, status }) => kind === "agent" && status === "blocked",
  );

  const selectWorkspace = (workspaceId: string) => {
    onSelectWorkspace(workspaceId);
    onDismiss?.();
  };
  const selectAgent = (agentId: string) => {
    onSelectAgent(agentId);
    onDismiss?.();
  };

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">
        <HedrLogo />
      </div>
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
                          )?.name ?? "Unknown workspace"}
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
              aria-labelledby="workspaces-heading"
            >
              <div className="section-label-row">
                <h2 id="workspaces-heading">Workspaces</h2>
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
                      aria-label={`Open ${workspace.name} workspace`}
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
    </aside>
  );
}
