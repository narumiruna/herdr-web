import {
  CheckCircledIcon,
  CommitIcon,
  ExclamationTriangleIcon,
  PaperPlaneIcon,
  PlayIcon,
  PlusCircledIcon,
} from "@radix-ui/react-icons";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import * as Separator from "@radix-ui/react-separator";
import type { Activity, Agent, HerdrState, Workspace } from "../state";
import { StatusPill } from "./StatusPill";

interface ActivityRailProps {
  state: HerdrState;
  workspace: Workspace;
  agent: Agent;
  onSelectAgent: (agentId: string) => void;
  mobile?: boolean;
}

function ActivityIcon({ activity }: { activity: Activity }) {
  const Icon =
    activity.kind === "attention"
      ? ExclamationTriangleIcon
      : activity.kind === "completed"
        ? CheckCircledIcon
        : activity.kind === "commit"
          ? CommitIcon
          : activity.kind === "reply"
            ? PaperPlaneIcon
            : activity.kind === "created"
              ? PlusCircledIcon
              : PlayIcon;
  return (
    <span className={`activity-icon activity-${activity.kind}`}>
      <Icon aria-hidden="true" />
    </span>
  );
}

export function ActivityRail({
  state,
  workspace,
  agent,
  onSelectAgent,
  mobile = false,
}: ActivityRailProps) {
  const workspaceAgents = state.agents.filter(
    ({ workspaceId }) => workspaceId === workspace.id,
  );
  const activity = state.activities.filter(
    ({ workspaceId }) => workspaceId === workspace.id,
  );
  const working = state.agents.filter(
    ({ status }) => status === "working",
  ).length;
  const blocked = state.agents.filter(
    ({ status }) => status === "blocked",
  ).length;
  const done = state.agents.filter(({ status }) => status === "done").length;

  return (
    <aside
      className={
        mobile ? "activity-rail activity-rail-mobile" : "activity-rail"
      }
    >
      <header className="activity-header">
        <div>
          <span className="rail-eyebrow">Runtime pulse</span>
          <h2>Activity</h2>
        </div>
        <span className="live-indicator">
          <i /> live
        </span>
      </header>

      <fieldset className="flock-summary">
        <legend className="sr-only">Agent status summary</legend>
        <div className="summary-block summary-attention">
          <strong>{blocked}</strong>
          <span>needs you</span>
        </div>
        <div className="summary-block">
          <strong>{working}</strong>
          <span>working</span>
        </div>
        <div className="summary-block">
          <strong>{done}</strong>
          <span>done</span>
        </div>
      </fieldset>

      <Separator.Root className="rail-separator" decorative />

      <section className="agent-inspector" aria-labelledby="focus-heading">
        <div className="rail-section-heading">
          <span id="focus-heading">In focus</span>
          <StatusPill status={agent.status} compact />
        </div>
        <strong className="inspector-name">{agent.label}</strong>
        <span className="inspector-runtime">
          {agent.runtime} · {agent.model}
        </span>
        <p>{agent.currentStep}</p>
        <div className="context-meter-label">
          <span>Context window</span>
          <strong>{agent.contextPercent}%</strong>
        </div>
        <div
          className="context-meter"
          role="progressbar"
          aria-label={`${agent.label} context usage`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={agent.contextPercent}
        >
          <i style={{ width: `${agent.contextPercent}%` }} />
        </div>
        {workspaceAgents.length > 1 && (
          <fieldset className="agent-jump-list">
            <legend className="sr-only">Agents in this workspace</legend>
            {workspaceAgents.map((item) => (
              <button
                type="button"
                key={item.id}
                data-active={item.id === agent.id}
                onClick={() => onSelectAgent(item.id)}
              >
                <StatusPill status={item.status} compact />
                <span>{item.label}</span>
              </button>
            ))}
          </fieldset>
        )}
      </section>

      <Separator.Root className="rail-separator" decorative />

      <section className="activity-feed" aria-labelledby="recent-heading">
        <div className="rail-section-heading">
          <span id="recent-heading">Recent · {workspace.name}</span>
          <span>{activity.length}</span>
        </div>
        <ScrollArea.Root className="activity-scroll">
          <ScrollArea.Viewport className="activity-viewport">
            <ol>
              {activity.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => onSelectAgent(item.agentId)}
                  >
                    <ActivityIcon activity={item} />
                    <span className="activity-copy">
                      <strong>{item.title}</strong>
                      <span>{item.detail}</span>
                    </span>
                    <time>{item.time}</time>
                  </button>
                </li>
              ))}
            </ol>
          </ScrollArea.Viewport>
          <ScrollArea.Scrollbar className="scrollbar" orientation="vertical">
            <ScrollArea.Thumb className="scrollbar-thumb" />
          </ScrollArea.Scrollbar>
        </ScrollArea.Root>
      </section>
    </aside>
  );
}
