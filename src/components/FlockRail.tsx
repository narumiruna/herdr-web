import type { Agent } from "../state";

interface FlockRailProps {
  agents: Agent[];
  onSelect: (agentId: string) => void;
}

export function FlockRail({ agents, onSelect }: FlockRailProps) {
  const attention = agents.filter(({ status }) => status === "blocked").length;

  return (
    <fieldset className="flock-rail">
      <legend className="sr-only">Live flock status</legend>
      <div className="flock-rail-label">
        <span>live flock</span>
        <strong>{String(agents.length).padStart(2, "0")} agents</strong>
      </div>
      <div className="flock-track" aria-hidden="true" />
      <div className="flock-nodes">
        {agents.map((agent) => (
          <button
            type="button"
            key={agent.id}
            className={`flock-node status-${agent.status}`}
            onClick={() => onSelect(agent.id)}
            aria-label={`${agent.label}: ${agent.status}`}
          />
        ))}
      </div>
      <span className={attention > 0 ? "flock-alert" : "flock-clear"}>
        {attention > 0 ? `${attention} needs you` : "all clear"}
      </span>
    </fieldset>
  );
}
