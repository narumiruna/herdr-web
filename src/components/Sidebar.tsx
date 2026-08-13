import {
  ChevronRightIcon,
  Component1Icon,
  DesktopIcon,
  GitHubLogoIcon,
} from "@radix-ui/react-icons";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Separator from "@radix-ui/react-separator";
import { agentsForWorkspace, type HerdrState } from "../state";
import { HerdrLogo } from "./HerdrLogo";
import { StatusPill } from "./StatusPill";

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
  const activeAgents = agentsForWorkspace(state, state.selectedWorkspaceId);

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
            <section className="nav-section" aria-labelledby="spaces-heading">
              <div className="section-label-row">
                <h2 id="spaces-heading">Spaces</h2>
                <span>{String(state.workspaces.length).padStart(2, "0")}</span>
              </div>
              <div className="workspace-list">
                {state.workspaces.map((workspace) => {
                  const agents = agentsForWorkspace(state, workspace.id);
                  const urgent = agents.find(
                    ({ status }) => status === "blocked",
                  );
                  const working = agents.find(
                    ({ status }) => status === "working",
                  );
                  const aggregateStatus = urgent
                    ? "blocked"
                    : working
                      ? "working"
                      : (agents[0]?.status ?? "idle");
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
                        <small>
                          {agents.length}{" "}
                          {agents.length === 1 ? "agent" : "agents"}
                        </small>
                      </span>
                      <StatusPill status={aggregateStatus} compact />
                      <ChevronRightIcon
                        className="workspace-chevron"
                        aria-hidden="true"
                      />
                    </button>
                  );
                })}
              </div>
            </section>

            <Separator.Root className="sidebar-separator" decorative />

            <section
              className="nav-section agent-section"
              aria-labelledby="agents-heading"
            >
              <div className="section-label-row">
                <h2 id="agents-heading">Agents</h2>
                <span>by priority</span>
              </div>
              <div className="agent-list">
                {activeAgents.map((agent) => {
                  const selected = agent.id === state.selectedAgentId;
                  return (
                    <button
                      type="button"
                      className="agent-item"
                      key={agent.id}
                      data-active={selected}
                      aria-pressed={selected}
                      onClick={() => selectAgent(agent.id)}
                    >
                      <span className="agent-status-column">
                        <StatusPill status={agent.status} compact />
                        <span className="agent-thread" aria-hidden="true" />
                      </span>
                      <span className="agent-copy">
                        <strong>{agent.label}</strong>
                        <small>{agent.currentStep}</small>
                        <span className="agent-runtime">
                          {agent.runtime} · {agent.updated}
                        </span>
                      </span>
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

      <div className="server-card">
        <span className="server-icon">
          <DesktopIcon aria-hidden="true" />
        </span>
        <span>
          <strong>narumi-mac</strong>
          <small>
            <i /> local · connected
          </small>
        </span>
        <a
          href="https://github.com/herdrdev/herdr"
          target="_blank"
          rel="noreferrer"
          aria-label="Open herdr on GitHub"
        >
          <GitHubLogoIcon />
        </a>
      </div>
    </aside>
  );
}
