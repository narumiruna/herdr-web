import {
  Component1Icon,
  DesktopIcon,
  ExclamationTriangleIcon,
} from "@radix-ui/react-icons";
import { useEffect, useState } from "react";
import type { Agent, HerdrState } from "../state";
import type { AccessRole, RuntimeConnection } from "../use-herdr-runtime";
import { RadixDialog } from "./RadixDialog";
import { StatusPill } from "./StatusPill";

interface MissionControlProps {
  accessRole: AccessRole;
  attentionStartedAt: Record<string, number>;
  connection: RuntimeConnection;
  open: boolean;
  state: HerdrState;
  onOpenAgent: (agentId: string, paneId: string) => void;
  onOpenChange: (open: boolean) => void;
}

function attentionAge(timestamp: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - timestamp) / 60_000));
  if (minutes < 1) return "attention just observed";
  if (minutes < 60) return `attention observed ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `attention observed ${hours}h ago`;
  return `attention observed ${Math.floor(hours / 24)}d ago`;
}

function agentPreview(agent: Agent): string {
  const preview = agent.previewLines?.filter(Boolean).at(-1);
  if (preview) return preview;
  return agent.currentStep || agent.summary || "No recent preview available";
}

export function MissionControl({
  accessRole,
  attentionStartedAt,
  connection,
  open,
  state,
  onOpenAgent,
  onOpenChange,
}: MissionControlProps) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!open) return;
    setNow(Date.now());
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [open]);
  const attentionByAgent = new Map(
    state.agents.flatMap((agent) => {
      const timestamp = attentionStartedAt[agent.id];
      return timestamp ? [[agent.id, timestamp] as const] : [];
    }),
  );

  return (
    <RadixDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Mission Control"
      description="A real-time supervision overview. The terminal-first workbench remains the primary workspace."
      className="mission-control-dialog"
    >
      <div className="mission-control-summary" role="status">
        <span data-state={connection}>
          <i aria-hidden="true" />
          {connection === "connected" ? "Connected" : "Reconnecting"}
        </span>
        <span>
          {accessRole === "controller" ? "Controller" : "Read-only viewer"}
        </span>
        <span>{state.workspaces.length} Spaces</span>
        <span>
          {state.agents.filter(({ kind }) => kind === "agent").length} Agents
        </span>
        <span>
          {state.agents.filter(({ status }) => status === "blocked").length}{" "}
          need input
        </span>
        {(state.capabilities.previewsTruncated ||
          state.capabilities.statusSubscriptionsTruncated) && (
          <span data-state="limited">
            Large session: some previews or live status subscriptions are
            limited
          </span>
        )}
      </div>
      <div className="mission-control-grid">
        {state.workspaces.map((workspace) => {
          const agents = state.agents.filter(
            ({ workspaceId }) => workspaceId === workspace.id,
          );
          return (
            <section key={workspace.id} className="mission-space-card">
              <header>
                <span className={`workspace-glyph accent-${workspace.accent}`}>
                  <Component1Icon aria-hidden="true" />
                </span>
                <span>
                  <h3>{workspace.name}</h3>
                  <small>{workspace.branch || workspace.path}</small>
                </span>
                <strong>
                  {agents.filter(({ status }) => status === "blocked").length ||
                    ""}
                  {agents.some(({ status }) => status === "blocked") && (
                    <ExclamationTriangleIcon aria-label="Needs input" />
                  )}
                </strong>
              </header>
              <div className="mission-agent-list">
                {agents.length === 0 ? (
                  <p>No Agent or Terminal sessions.</p>
                ) : (
                  agents.map((agent) => (
                    <button
                      type="button"
                      key={agent.id}
                      onClick={() => onOpenAgent(agent.id, agent.activePaneId)}
                    >
                      {agent.kind === "agent" ? (
                        <StatusPill status={agent.status} compact />
                      ) : (
                        <DesktopIcon aria-hidden="true" />
                      )}
                      <span>
                        <strong>{agent.label}</strong>
                        <small>{agentPreview(agent)}</small>
                      </span>
                      <span>
                        {attentionByAgent.has(agent.id)
                          ? attentionAge(
                              attentionByAgent.get(agent.id) ?? now,
                              now,
                            )
                          : agent.status}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </section>
          );
        })}
      </div>
    </RadixDialog>
  );
}
