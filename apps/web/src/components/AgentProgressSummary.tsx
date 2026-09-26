import { ChevronDownIcon } from "@radix-ui/react-icons";
import type { Agent } from "../state";
import { agentStatusLabel, StatusPill } from "./StatusPill";

interface AgentProgressSummaryProps {
  agent: Agent;
}

export function AgentProgressSummary({ agent }: AgentProgressSummaryProps) {
  if (agent.kind !== "agent") return null;

  const currentTask = agent.currentStep.trim() || agent.summary.trim();
  const summary =
    agent.summary.trim() && agent.summary.trim() !== currentTask
      ? agent.summary.trim()
      : "";
  const updated = agent.updated.trim();
  if (!currentTask && !summary && !updated) return null;

  const headline = (
    <>
      <span aria-hidden="true">
        <StatusPill status={agent.status} compact />
      </span>
      <span className="agent-progress-copy">
        <small>{agentStatusLabel(agent.status)}</small>
        {currentTask && <strong>{currentTask}</strong>}
      </span>
    </>
  );

  if (!summary && !updated) {
    return (
      <section className="agent-progress-summary" aria-label="Agent progress">
        <div className="agent-progress-row">{headline}</div>
      </section>
    );
  }

  return (
    <details className="agent-progress-summary">
      <summary>
        {headline}
        <span className="agent-progress-disclosure">
          Details
          <ChevronDownIcon aria-hidden="true" />
        </span>
      </summary>
      <dl>
        {summary && (
          <div>
            <dt>Goal</dt>
            <dd>{summary}</dd>
          </div>
        )}
        {updated && (
          <div>
            <dt>Updated</dt>
            <dd>{updated}</dd>
          </div>
        )}
      </dl>
    </details>
  );
}
