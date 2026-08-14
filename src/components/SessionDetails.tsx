import {
  CodeIcon,
  Component1Icon,
  DesktopIcon,
  InfoCircledIcon,
} from "@radix-ui/react-icons";
import type { Agent, Workspace } from "../state";
import type { RuntimeConnection } from "../use-herdr-runtime";
import { StatusPill } from "./StatusPill";

interface SessionDetailsProps {
  agent: Agent;
  connection: RuntimeConnection;
  workspace: Workspace;
}

export function SessionDetails({
  agent,
  connection,
  workspace,
}: SessionDetailsProps) {
  const activePane = agent.panes.find(({ id }) => id === agent.activePaneId);
  return (
    <div className="details-panel">
      <section className="details-status" aria-label="Current status">
        <div className="details-session-icon" aria-hidden="true">
          {agent.kind === "agent" ? <CodeIcon /> : <DesktopIcon />}
        </div>
        <div>
          <span>{agent.kind === "agent" ? "Agent" : "Terminal"}</span>
          <strong>{agent.label}</strong>
        </div>
        <StatusPill status={agent.status} />
      </section>

      <dl className="details-list">
        <div>
          <dt>Connection</dt>
          <dd className="details-connection" data-state={connection}>
            <i aria-hidden="true" />
            {connection === "connected" ? "Connected" : "Reconnecting"}
          </dd>
        </div>
        <div>
          <dt>Workspace</dt>
          <dd>
            <Component1Icon aria-hidden="true" /> {workspace.name}
          </dd>
        </div>
        {workspace.path && (
          <div>
            <dt>Path</dt>
            <dd title={workspace.path}>{workspace.path}</dd>
          </div>
        )}
        {workspace.branch && (
          <div>
            <dt>Branch</dt>
            <dd>
              <CodeIcon aria-hidden="true" /> {workspace.branch}
            </dd>
          </div>
        )}
        <div>
          <dt>Runtime</dt>
          <dd>{agent.runtime}</dd>
        </div>
        {agent.model && agent.model !== agent.runtime && (
          <div>
            <dt>Model</dt>
            <dd>{agent.model}</dd>
          </div>
        )}
        <div>
          <dt>Focused pane</dt>
          <dd>{activePane?.title ?? "Unavailable"}</dd>
        </div>
        <div>
          <dt>Panes</dt>
          <dd>{agent.panes.length}</dd>
        </div>
      </dl>

      <section className="details-note" aria-label="Session behavior">
        <InfoCircledIcon aria-hidden="true" />
        <p>
          Herdr keeps this session running when the browser disconnects.
          Terminal output is read-only; prompts are available only for detected
          Agents.
        </p>
      </section>
    </div>
  );
}
