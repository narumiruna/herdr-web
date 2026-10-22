import {
  CodeIcon,
  Component1Icon,
  CopyIcon,
  DesktopIcon,
  InfoCircledIcon,
} from "@radix-ui/react-icons";
import { useRef, useState } from "react";
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
  const activePane =
    agent.panes.find(({ id }) => id === agent.activePaneId) ?? agent.panes[0];
  const cwd = activePane?.cwd || workspace.path;
  const panel = useRef<HTMLDivElement>(null);
  const copyContext = `${agent.id}\0${cwd}`;
  const currentCopyContext = useRef(copyContext);
  currentCopyContext.current = copyContext;
  const [copyResult, setCopyResult] = useState({
    context: "",
    copied: false,
    error: "",
  });
  const copyDirectory = async () => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(cwd);
      } else {
        const previousFocus = document.activeElement;
        const target = document.createElement("textarea");
        target.value = cwd;
        target.style.position = "fixed";
        target.style.opacity = "0";
        // Keep the fallback inside the dialog focus scope.
        (panel.current ?? document.body).append(target);
        try {
          target.select();
          if (!document.execCommand("copy")) throw new Error("Copy failed");
        } finally {
          target.remove();
          if (previousFocus instanceof HTMLElement) previousFocus.focus();
        }
      }
      if (currentCopyContext.current !== copyContext) return;
      setCopyResult({ context: copyContext, copied: true, error: "" });
    } catch {
      if (currentCopyContext.current !== copyContext) return;
      setCopyResult({
        context: copyContext,
        copied: false,
        error: "The current directory could not be copied.",
      });
    }
  };
  const hasContextPercent =
    agent.kind === "agent" &&
    agent.contextPercent !== undefined &&
    Number.isFinite(agent.contextPercent) &&
    agent.contextPercent >= 0 &&
    agent.contextPercent <= 100;
  return (
    <div ref={panel} className="details-panel">
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
          <dt>Space</dt>
          <dd>
            <Component1Icon aria-hidden="true" /> {workspace.name}
          </dd>
        </div>
        {cwd && (
          <div>
            <dt>Current directory</dt>
            <dd className="details-directory">
              <code>{cwd}</code>
              <button
                className="workspace-copy-cwd"
                type="button"
                aria-label="Copy current working directory"
                onClick={() => void copyDirectory()}
              >
                <CopyIcon aria-hidden="true" /> Copy
              </button>
              {copyResult.context === copyContext && copyResult.copied && (
                <span role="status">Current working directory copied</span>
              )}
              {copyResult.context === copyContext && copyResult.error && (
                <span role="alert">{copyResult.error}</span>
              )}
            </dd>
          </div>
        )}
        {agent.kind === "agent" && agent.currentStep && (
          <div>
            <dt>Current task</dt>
            <dd>{agent.currentStep}</dd>
          </div>
        )}
        {agent.kind === "agent" &&
          agent.summary &&
          agent.summary !== agent.currentStep && (
            <div>
              <dt>Goal</dt>
              <dd>{agent.summary}</dd>
            </div>
          )}
        {agent.kind === "agent" && agent.updated && (
          <div>
            <dt>Updated</dt>
            <dd>{agent.updated}</dd>
          </div>
        )}
        {agent.runtime?.trim() && (
          <div>
            <dt>Runtime</dt>
            <dd>{agent.runtime}</dd>
          </div>
        )}
        {agent.model?.trim() && agent.model !== agent.runtime && (
          <div>
            <dt>Model</dt>
            <dd>{agent.model}</dd>
          </div>
        )}
        {hasContextPercent && (
          <div>
            <dt>Context</dt>
            <dd>{agent.contextPercent}%</dd>
          </div>
        )}
        <div>
          <dt>Focused pane</dt>
          <dd>{activePane?.title || "Unavailable"}</dd>
        </div>
        {activePane?.command && (
          <div>
            <dt>Command</dt>
            <dd>{activePane.command}</dd>
          </div>
        )}
        <div>
          <dt>Panes</dt>
          <dd>{agent.panes.length}</dd>
        </div>
      </dl>

      <section className="details-note" aria-label="Session behavior">
        <InfoCircledIcon aria-hidden="true" />
        <p>
          Herdr keeps this session running when the browser disconnects. The
          workbench shows up to 240 recent lines per pane. Prompts are available
          only for detected Agents.
        </p>
      </section>
    </div>
  );
}
