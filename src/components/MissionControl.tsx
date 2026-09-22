import {
  Component1Icon,
  DesktopIcon,
  ExclamationTriangleIcon,
} from "@radix-ui/react-icons";
import { useEffect, useState } from "react";
import type { SavedMachineListResult } from "../herdr-api";
import type { Agent, AgentStatus, HerdrState } from "../state";
import type { AccessRole, RuntimeConnection } from "../use-herdr-runtime";
import { MachineFleet } from "./MachineFleet";
import { RadixDialog } from "./RadixDialog";
import { StatusPill } from "./StatusPill";

interface MissionControlProps {
  accessRole: AccessRole;
  attentionStartedAt: Record<string, number>;
  connection: RuntimeConnection;
  loadMachines?: (forceRefresh?: boolean) => Promise<SavedMachineListResult>;
  open: boolean;
  state: HerdrState;
  statusFilter?: AgentStatus | "other";
  onOpenAgent: (agentId: string, paneId: string) => void;
  onOpenChange: (open: boolean) => void;
  onStatusFilterChange?: (status?: AgentStatus | "other") => void;
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

function statusFilterLabel(status: AgentStatus | "other"): string {
  if (status === "blocked") return "Needs input";
  if (status === "done") return "Done";
  if (status === "failed") return "Failed";
  if (status === "working") return "Working";
  if (status === "other") return "Other status";
  return status === "idle" ? "Idle" : "Unknown";
}

function matchesStatusFilter(
  agent: Agent,
  status: AgentStatus | "other" | undefined,
): boolean {
  if (!status) return true;
  if (agent.kind !== "agent") return false;
  if (status === "other") {
    return agent.status === "idle" || agent.status === "unknown";
  }
  return agent.status === status;
}

export function MissionControl({
  accessRole,
  attentionStartedAt,
  connection,
  loadMachines,
  open,
  state,
  statusFilter,
  onOpenAgent,
  onOpenChange,
  onStatusFilterChange,
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
  const visibleWorkspaces = state.workspaces
    .map((workspace) => ({
      agents: state.agents.filter(
        (agent) =>
          agent.workspaceId === workspace.id &&
          matchesStatusFilter(agent, statusFilter),
      ),
      workspace,
    }))
    .filter(({ agents }) => !statusFilter || agents.length > 0);

  return (
    <RadixDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Mission Control"
      description={
        statusFilter
          ? `Agents filtered by ${statusFilterLabel(statusFilter)}.`
          : "A real-time supervision overview. The terminal-first workbench remains the primary workspace."
      }
      className="mission-control-dialog"
    >
      <div className="mission-control-summary">
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
        {statusFilter && (
          <button
            type="button"
            className="mission-filter-clear"
            aria-label={`Clear ${statusFilterLabel(statusFilter)} Agent filter`}
            onClick={() => onStatusFilterChange?.(undefined)}
          >
            {statusFilterLabel(statusFilter)} only{" "}
            <span aria-hidden="true">×</span>
          </button>
        )}
        {(state.capabilities.previewsTruncated ||
          state.capabilities.statusSubscriptionsTruncated) && (
          <span data-state="limited">
            Large session: some previews or live status subscriptions are
            limited
          </span>
        )}
      </div>
      <div className="mission-control-grid">
        {visibleWorkspaces.length === 0 && (
          <p className="mission-control-empty">
            No Agents match{" "}
            {statusFilter ? statusFilterLabel(statusFilter) : "this view"}.
          </p>
        )}
        {visibleWorkspaces.map(({ agents, workspace }) => {
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
      {loadMachines && <MachineFleet load={loadMachines} open={open} />}
    </RadixDialog>
  );
}
