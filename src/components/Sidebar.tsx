import {
  ChevronRightIcon,
  Component1Icon,
  DesktopIcon,
  ExclamationTriangleIcon,
} from "@radix-ui/react-icons";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Separator from "@radix-ui/react-separator";
import { type Agent, agentsForWorkspace, type HerdrState } from "../state";
import { HerdrLogo } from "./HerdrLogo";
import { StatusPill } from "./StatusPill";

interface SidebarProps {
  state: HerdrState;
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onDismiss?: () => void;
}

function SessionButton({
  session,
  selected,
  onSelect,
}: {
  session: Agent;
  selected: boolean;
  onSelect: () => void;
}) {
  const isTerminal = session.kind === "terminal";
  return (
    <button
      type="button"
      className="session-item"
      data-active={selected}
      aria-pressed={selected}
      aria-label={`Open ${session.label} ${isTerminal ? "terminal" : "agent"}`}
      onClick={onSelect}
    >
      <span className="session-kind-icon" aria-hidden="true">
        {isTerminal ? (
          <DesktopIcon />
        ) : (
          <StatusPill status={session.status} compact />
        )}
      </span>
      <span className="session-copy">
        <strong>{session.label}</strong>
      </span>
    </button>
  );
}

export function Sidebar({
  state,
  onSelectWorkspace,
  onSelectAgent,
  onDismiss,
}: SidebarProps) {
  const sessions = agentsForWorkspace(state, state.selectedWorkspaceId);
  const visibleAgents = sessions.filter(
    ({ kind, status }) => kind === "agent" && status !== "blocked",
  );
  const terminals = sessions.filter(({ kind }) => kind === "terminal");
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
        <HerdrLogo />
      </div>
      <ScrollArea.Root className="sidebar-scroll">
        <ScrollArea.Viewport className="sidebar-viewport">
          <nav aria-label="Herdr navigation">
            {attention.length > 0 && (
              <section
                className="nav-section attention-section"
                aria-label="Needs attention"
              >
                <div className="section-label-row attention-label">
                  <h2>Needs attention</h2>
                  <span>{attention.length}</span>
                </div>
                <div className="attention-list">
                  {attention.map((agent) => (
                    <button
                      type="button"
                      className="attention-item"
                      data-active={agent.id === state.selectedAgentId}
                      aria-label={`Open ${agent.label} agent needing attention`}
                      key={agent.id}
                      onClick={() => selectAgent(agent.id)}
                    >
                      <ExclamationTriangleIcon aria-hidden="true" />
                      <span>
                        <strong>{agent.label}</strong>
                        <small>{agent.currentStep}</small>
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

            {(visibleAgents.length > 0 || terminals.length > 0) && (
              <Separator.Root className="sidebar-separator" decorative />
            )}

            {visibleAgents.length > 0 && (
              <section className="nav-section" aria-labelledby="agents-heading">
                <div className="section-label-row">
                  <h2 id="agents-heading">Agents</h2>
                  <span>{visibleAgents.length}</span>
                </div>
                <div className="session-list">
                  {visibleAgents.map((agent) => (
                    <SessionButton
                      key={agent.id}
                      session={agent}
                      selected={agent.id === state.selectedAgentId}
                      onSelect={() => selectAgent(agent.id)}
                    />
                  ))}
                </div>
              </section>
            )}

            {terminals.length > 0 && (
              <section
                className="nav-section"
                aria-labelledby="terminals-heading"
              >
                <div className="section-label-row">
                  <h2 id="terminals-heading">Terminals</h2>
                  <span>{terminals.length}</span>
                </div>
                <div className="session-list">
                  {terminals.map((terminal) => (
                    <SessionButton
                      key={terminal.id}
                      session={terminal}
                      selected={terminal.id === state.selectedAgentId}
                      onSelect={() => selectAgent(terminal.id)}
                    />
                  ))}
                </div>
              </section>
            )}
          </nav>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar className="scrollbar" orientation="vertical">
          <ScrollArea.Thumb className="scrollbar-thumb" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </aside>
  );
}
