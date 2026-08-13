import {
  CodeIcon,
  Component1Icon,
  MagnifyingGlassIcon,
  RocketIcon,
} from "@radix-ui/react-icons";
import { Button, TextField } from "@radix-ui/themes";
import { type FormEvent, useEffect, useState } from "react";
import type { HerdrState, RuntimeName, Workspace } from "../state";
import { RadixDialog } from "./RadixDialog";
import { StatusPill } from "./StatusPill";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: HerdrState;
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectAgent: (agentId: string) => void;
}

export function CommandPalette({
  open,
  onOpenChange,
  state,
  onSelectWorkspace,
  onSelectAgent,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const workspaces = state.workspaces.filter((workspace) =>
    `${workspace.name} ${workspace.branch}`
      .toLowerCase()
      .includes(normalizedQuery),
  );
  const agents = state.agents.filter((agent) =>
    `${agent.label} ${agent.runtime} ${agent.summary}`
      .toLowerCase()
      .includes(normalizedQuery),
  );

  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);

  const chooseWorkspace = (workspaceId: string) => {
    onSelectWorkspace(workspaceId);
    onOpenChange(false);
  };
  const chooseAgent = (agentId: string) => {
    onSelectAgent(agentId);
    onOpenChange(false);
  };

  return (
    <RadixDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Jump anywhere"
      description="Find a space or agent. Press ⌘K from anywhere to return."
      className="command-dialog"
    >
      <div className="command-search">
        <MagnifyingGlassIcon aria-hidden="true" />
        <input
          value={query}
          aria-label="Search spaces and agents"
          placeholder="Search spaces and agents…"
          onChange={(event) => setQuery(event.target.value)}
        />
        <kbd>esc</kbd>
      </div>
      <div
        className="command-results"
        role="listbox"
        aria-label="Search results"
      >
        {workspaces.length > 0 && (
          <section aria-labelledby="space-results">
            <h3 id="space-results">Spaces</h3>
            {workspaces.map((workspace) => (
              <button
                type="button"
                role="option"
                aria-selected={workspace.id === state.selectedWorkspaceId}
                className="command-result"
                key={workspace.id}
                onClick={() => chooseWorkspace(workspace.id)}
              >
                <span
                  className={`command-result-icon accent-${workspace.accent}`}
                >
                  <Component1Icon />
                </span>
                <span>
                  <strong>{workspace.name}</strong>
                  <small>{workspace.branch}</small>
                </span>
                <kbd>space</kbd>
              </button>
            ))}
          </section>
        )}
        {agents.length > 0 && (
          <section aria-labelledby="agent-results">
            <h3 id="agent-results">Agents</h3>
            {agents.map((agent) => {
              const workspace = state.workspaces.find(
                ({ id }) => id === agent.workspaceId,
              );
              return (
                <button
                  type="button"
                  role="option"
                  aria-selected={agent.id === state.selectedAgentId}
                  className="command-result"
                  key={agent.id}
                  onClick={() => chooseAgent(agent.id)}
                >
                  <StatusPill status={agent.status} compact />
                  <span>
                    <strong>{agent.label}</strong>
                    <small>
                      {agent.runtime} · {workspace?.name}
                    </small>
                  </span>
                  <kbd>agent</kbd>
                </button>
              );
            })}
          </section>
        )}
        {workspaces.length === 0 && agents.length === 0 && (
          <div className="command-empty">
            <MagnifyingGlassIcon />
            <strong>No matching sessions</strong>
            <span>Try an agent, runtime, branch, or workspace name.</span>
          </div>
        )}
      </div>
      <footer className="command-footer">
        <span>
          <kbd>↑</kbd>
          <kbd>↓</kbd> navigate
        </span>
        <span>
          <kbd>↵</kbd> open
        </span>
        <span>herdr command deck</span>
      </footer>
    </RadixDialog>
  );
}

interface NewSessionDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  workspace: Workspace;
  onCreate: (details: {
    label: string;
    runtime: RuntimeName;
    command: string;
  }) => void;
}

const RUNTIME_COMMAND: Record<RuntimeName, string> = {
  "Claude Code": "claude",
  Codex: "codex --full-auto",
  OpenCode: "opencode",
  Pi: "pi",
};

export function NewSessionDialog({
  open,
  onOpenChange,
  workspace,
  onCreate,
}: NewSessionDialogProps) {
  const [label, setLabel] = useState("");
  const [runtime, setRuntime] = useState<RuntimeName>("Claude Code");
  const [command, setCommand] = useState(RUNTIME_COMMAND["Claude Code"]);

  useEffect(() => {
    if (!open) {
      setLabel("");
      setRuntime("Claude Code");
      setCommand(RUNTIME_COMMAND["Claude Code"]);
    }
  }, [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!label.trim() || !command.trim()) return;
    onCreate({ label, runtime, command });
    onOpenChange(false);
  };

  return (
    <RadixDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start a new session"
      description={`Launch an agent inside ${workspace.name}. Herdr keeps it running when this browser closes.`}
      className="session-dialog"
    >
      <form className="session-form" onSubmit={submit}>
        <div className="session-location">
          <span className={`command-result-icon accent-${workspace.accent}`}>
            <Component1Icon />
          </span>
          <span>
            <strong>{workspace.name}</strong>
            <small>{workspace.path}</small>
          </span>
          <code>{workspace.branch}</code>
        </div>
        <label className="form-field" htmlFor="session-name">
          <span>Session name</span>
          <TextField.Root
            id="session-name"
            value={label}
            placeholder="e.g. security-audit"
            onChange={(event) => setLabel(event.target.value)}
          >
            <TextField.Slot>
              <RocketIcon />
            </TextField.Slot>
          </TextField.Root>
        </label>
        <div className="form-row">
          <label className="form-field">
            <span>Agent runtime</span>
            <select
              value={runtime}
              onChange={(event) => {
                const value = event.target.value as RuntimeName;
                setRuntime(value);
                setCommand(RUNTIME_COMMAND[value]);
              }}
            >
              {Object.keys(RUNTIME_COMMAND).map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label className="form-field form-command">
            <span>Command</span>
            <span className="command-input-wrap">
              <CodeIcon aria-hidden="true" />
              <input
                value={command}
                onChange={(event) => setCommand(event.target.value)}
              />
            </span>
          </label>
        </div>
        <div className="session-note">
          <span className="session-note-dot" />
          <span>
            <strong>Persistent by default</strong>
            The session survives disconnects and can be reattached from any
            client.
          </span>
        </div>
        <div className="form-actions">
          <Button
            type="button"
            variant="soft"
            color="gray"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            color="amber"
            disabled={!label.trim() || !command.trim()}
          >
            <RocketIcon /> Start session
          </Button>
        </div>
      </form>
    </RadixDialog>
  );
}
