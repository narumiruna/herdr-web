import {
  CodeIcon,
  Component1Icon,
  DesktopIcon,
  MagnifyingGlassIcon,
  RocketIcon,
} from "@radix-ui/react-icons";
import { Button, TextField } from "@radix-ui/themes";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import type { Agent, HerdrState, RuntimeName, Workspace } from "../state";
import { RadixDialog } from "./RadixDialog";
import { StatusPill } from "./StatusPill";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: HerdrState;
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectAgent: (agentId: string) => void;
}

type CommandResult =
  | { id: string; kind: "workspace"; workspace: Workspace }
  | { id: string; kind: "session"; session: Agent; workspace?: Workspace };

function resultDomId(result: CommandResult): string {
  return `command-result-${result.kind}-${result.id.replaceAll(/[^a-zA-Z0-9_-]/g, "-")}`;
}

export function CommandPalette({
  open,
  onOpenChange,
  state,
  onSelectWorkspace,
  onSelectAgent,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedQuery = query.trim().toLowerCase();
  const results = useMemo<CommandResult[]>(() => {
    const workspaces = state.workspaces
      .filter((workspace) =>
        `${workspace.name} ${workspace.branch} ${workspace.path}`
          .toLowerCase()
          .includes(normalizedQuery),
      )
      .map((workspace) => ({
        id: workspace.id,
        kind: "workspace" as const,
        workspace,
      }));
    const sessions = state.agents
      .filter((session) =>
        `${session.label} ${session.runtime} ${session.summary}`
          .toLowerCase()
          .includes(normalizedQuery),
      )
      .map((session) => ({
        id: session.id,
        kind: "session" as const,
        session,
        workspace: state.workspaces.find(
          ({ id }) => id === session.workspaceId,
        ),
      }));
    return [...workspaces, ...sessions];
  }, [normalizedQuery, state.agents, state.workspaces]);

  useEffect(() => {
    if (!open) setQuery("");
    setActiveIndex(0);
  }, [open]);

  const choose = (result: CommandResult) => {
    if (result.kind === "workspace") onSelectWorkspace(result.id);
    else onSelectAgent(result.id);
    onOpenChange(false);
  };

  const move = (nextIndex: number) => {
    if (results.length === 0) return;
    setActiveIndex((nextIndex + results.length) % results.length);
  };

  const workspaceResults = results.filter(
    (result): result is Extract<CommandResult, { kind: "workspace" }> =>
      result.kind === "workspace",
  );
  const sessionResults = results.filter(
    (result): result is Extract<CommandResult, { kind: "session" }> =>
      result.kind === "session",
  );

  const resultButton = (result: CommandResult) => {
    const index = results.indexOf(result);
    if (result.kind === "workspace") {
      return (
        <button
          id={resultDomId(result)}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          className="command-result"
          key={`workspace-${result.id}`}
          onPointerMove={() => setActiveIndex(index)}
          onClick={() => choose(result)}
        >
          <span
            className={`command-result-icon accent-${result.workspace.accent}`}
          >
            <Component1Icon aria-hidden="true" />
          </span>
          <span>
            <strong>{result.workspace.name}</strong>
            <small>{result.workspace.branch || result.workspace.path}</small>
          </span>
          <kbd>workspace</kbd>
        </button>
      );
    }
    return (
      <button
        id={resultDomId(result)}
        type="button"
        role="option"
        aria-selected={index === activeIndex}
        className="command-result"
        key={`session-${result.id}`}
        onPointerMove={() => setActiveIndex(index)}
        onClick={() => choose(result)}
      >
        <span className="command-session-icon">
          {result.session.kind === "agent" ? (
            <StatusPill status={result.session.status} compact />
          ) : (
            <DesktopIcon aria-hidden="true" />
          )}
        </span>
        <span>
          <strong>{result.session.label}</strong>
          <small>
            {result.session.kind === "agent"
              ? result.session.runtime
              : "Terminal"}
            {result.workspace ? ` · ${result.workspace.name}` : ""}
          </small>
        </span>
        <kbd>{result.session.kind}</kbd>
      </button>
    );
  };

  return (
    <RadixDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Jump anywhere"
      description="Find a workspace, detected Agent, or standalone Terminal."
      className="command-dialog"
      initialFocusRef={searchInput}
    >
      <div className="command-search">
        <MagnifyingGlassIcon aria-hidden="true" />
        <input
          ref={searchInput}
          value={query}
          role="combobox"
          aria-label="Search workspaces, agents, and terminals"
          aria-expanded="true"
          aria-controls="command-results"
          aria-autocomplete="list"
          aria-activedescendant={
            results[activeIndex] ? resultDomId(results[activeIndex]) : undefined
          }
          placeholder="Search workspaces, agents, and terminals…"
          onChange={(event) => {
            setQuery(event.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault();
              move(activeIndex + 1);
            } else if (event.key === "ArrowUp") {
              event.preventDefault();
              move(activeIndex - 1);
            } else if (event.key === "Home") {
              event.preventDefault();
              move(0);
            } else if (event.key === "End") {
              event.preventDefault();
              move(results.length - 1);
            } else if (event.key === "Enter" && results[activeIndex]) {
              event.preventDefault();
              choose(results[activeIndex]);
            }
          }}
        />
        <kbd>esc</kbd>
      </div>
      <div
        id="command-results"
        className="command-results"
        role="listbox"
        aria-label="Search results"
      >
        {workspaceResults.length > 0 && (
          <fieldset>
            <legend>Workspaces</legend>
            {workspaceResults.map(resultButton)}
          </fieldset>
        )}
        {sessionResults.length > 0 && (
          <fieldset>
            <legend>Agents and terminals</legend>
            {sessionResults.map(resultButton)}
          </fieldset>
        )}
        {results.length === 0 && (
          <div className="command-empty">
            <MagnifyingGlassIcon aria-hidden="true" />
            <strong>No matching sessions</strong>
            <span>Try a runtime, branch, workspace, or Agent name.</span>
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
        <span>
          <kbd>esc</kbd> close
        </span>
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
  }) => void | Promise<void>;
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
  const nameInput = useRef<HTMLInputElement>(null);
  const [runtime, setRuntime] = useState<RuntimeName>("Claude Code");
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState("");
  const command = RUNTIME_COMMAND[runtime];

  useEffect(() => {
    if (!open) {
      setLabel("");
      setRuntime("Claude Code");
      setSubmitting(false);
      setSubmitError("");
    }
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!label.trim() || submitting) return;
    setSubmitting(true);
    setSubmitError("");
    try {
      await onCreate({ label, runtime, command });
      onOpenChange(false);
    } catch (error) {
      setSubmitError(
        error instanceof Error ? error.message : "Could not start the Agent",
      );
      setSubmitting(false);
    }
  };

  return (
    <RadixDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Start a new Agent"
      description={`Launch an approved Agent runtime inside ${workspace.name}.`}
      className="session-dialog"
      initialFocusRef={nameInput}
    >
      <form className="session-form" onSubmit={submit}>
        <div className="session-location">
          <span className={`command-result-icon accent-${workspace.accent}`}>
            <Component1Icon aria-hidden="true" />
          </span>
          <span>
            <strong>{workspace.name}</strong>
            <small>{workspace.path}</small>
          </span>
          {workspace.branch && <code>{workspace.branch}</code>}
        </div>
        <label className="form-field" htmlFor="session-name">
          <span>Agent name</span>
          <TextField.Root
            ref={nameInput}
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
        <label className="form-field">
          <span>Agent runtime</span>
          <select
            aria-label="Agent runtime"
            value={runtime}
            onChange={(event) => setRuntime(event.target.value as RuntimeName)}
          >
            {Object.keys(RUNTIME_COMMAND).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <div className="command-preset">
          <span>
            <CodeIcon aria-hidden="true" /> Fixed launch command
          </span>
          <code>{command}</code>
        </div>
        <div className="session-note">
          <span className="session-note-dot" aria-hidden="true" />
          <span>
            <strong>Persistent by default</strong>
            The Agent keeps running when this browser disconnects.
          </span>
        </div>
        {submitError && (
          <span className="session-form-error" role="alert">
            {submitError}
          </span>
        )}
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
            disabled={!label.trim() || submitting}
          >
            <RocketIcon /> {submitting ? "Starting…" : "Start agent"}
          </Button>
        </div>
      </form>
    </RadixDialog>
  );
}
