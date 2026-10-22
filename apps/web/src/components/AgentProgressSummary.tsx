import { ChevronDownIcon } from "@radix-ui/react-icons";
import type { Agent } from "../state";

interface AgentProgressSummaryProps {
  agent: Agent;
}

export function AgentProgressSummary({ agent }: AgentProgressSummaryProps) {
  if (agent.kind !== "agent") return null;

  const goal = agent.summary?.trim() ?? "";
  const currentTask = agent.currentStep?.trim() || goal;
  const summary = goal !== currentTask ? goal : "";
  const updated = agent.updated?.trim();
  if (!currentTask) return null;

  const headline = (
    <span className="agent-progress-copy">
      <strong>{currentTask}</strong>
    </span>
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
