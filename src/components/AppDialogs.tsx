import {
  CodeIcon,
  Component1Icon,
  DesktopIcon,
  FilePlusIcon,
  KeyboardIcon,
  MagnifyingGlassIcon,
  MoonIcon,
  RocketIcon,
  SunIcon,
} from "@radix-ui/react-icons";
import { Button, TextField } from "@radix-ui/themes";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { normalizeWorkspacePath, workspaceLabelFromPath } from "../herdr-api";
import type { Agent, HerdrState, RuntimeName, Workspace } from "../state";
import { TERMINAL_FONT_SIZE_PRESETS } from "../terminal-preferences";
import {
  themeAppearance,
  WORKBENCH_THEMES,
  type WorkbenchTheme,
} from "../theme-preferences";
import { RadixDialog } from "./RadixDialog";
import { StatusPill } from "./StatusPill";

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pinnedWorkspaceIds?: string[];
  recentWorkspaceIds?: string[];
  state: HerdrState;
  onSelectWorkspace: (workspaceId: string) => void;
  onSelectAgent: (agentId: string) => void;
  onTogglePinnedWorkspace?: (workspaceId: string) => void;
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
  pinnedWorkspaceIds = [],
  recentWorkspaceIds = [],
  state,
  onSelectWorkspace,
  onSelectAgent,
  onTogglePinnedWorkspace,
}: CommandPaletteProps) {
  const [query, setQuery] = useState("");
  const searchInput = useRef<HTMLInputElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);
  const normalizedQuery = query.trim().toLowerCase();
  const results = useMemo<CommandResult[]>(() => {
    const matches = (value: string) =>
      value.toLowerCase().includes(normalizedQuery);
    const workspaceRank = (workspace: Workspace) => {
      const pinned = pinnedWorkspaceIds.indexOf(workspace.id);
      if (pinned >= 0) return pinned;
      const recent = recentWorkspaceIds.indexOf(workspace.id);
      if (recent >= 0) return 100 + recent;
      return 1_000 + state.workspaces.indexOf(workspace);
    };
    const workspaces = state.workspaces
      .filter((workspace) =>
        matches(
          `${workspace.name} ${workspace.branch} ${workspace.path} ${workspace.worktree?.repoName ?? ""}`,
        ),
      )
      .slice()
      .sort((left, right) => workspaceRank(left) - workspaceRank(right))
      .map((workspace) => ({
        id: workspace.id,
        kind: "workspace" as const,
        workspace,
      }));
    const sessions = state.agents
      .filter((session) => {
        const workspace = state.workspaces.find(
          ({ id }) => id === session.workspaceId,
        );
        return matches(
          `${session.label} ${session.runtime} ${session.summary} ${session.currentStep} ${session.status} ${workspace?.name ?? ""} ${workspace?.branch ?? ""} ${workspace?.path ?? ""} ${session.panes.map(({ cwd, title }) => `${title} ${cwd ?? ""}`).join(" ")}`,
        );
      })
      .map((session) => ({
        id: session.id,
        kind: "session" as const,
        session,
        workspace: state.workspaces.find(
          ({ id }) => id === session.workspaceId,
        ),
      }));
    const attention = sessions.filter(
      ({ session }) => session.status === "blocked",
    );
    const current = sessions.filter(
      ({ session }) =>
        session.status !== "blocked" &&
        session.workspaceId === state.selectedWorkspaceId,
    );
    const other = sessions.filter(
      ({ session }) =>
        session.status !== "blocked" &&
        session.workspaceId !== state.selectedWorkspaceId,
    );
    return [...attention, ...current, ...workspaces, ...other];
  }, [
    normalizedQuery,
    state.agents,
    state.selectedWorkspaceId,
    pinnedWorkspaceIds,
    recentWorkspaceIds,
    state.workspaces,
  ]);

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
  const attentionResults = results.filter(
    (result): result is Extract<CommandResult, { kind: "session" }> =>
      result.kind === "session" && result.session.status === "blocked",
  );
  const currentSessionResults = results.filter(
    (result): result is Extract<CommandResult, { kind: "session" }> =>
      result.kind === "session" &&
      result.session.status !== "blocked" &&
      result.session.workspaceId === state.selectedWorkspaceId,
  );
  const otherSessionResults = results.filter(
    (result): result is Extract<CommandResult, { kind: "session" }> =>
      result.kind === "session" &&
      result.session.status !== "blocked" &&
      result.session.workspaceId !== state.selectedWorkspaceId,
  );

  const resultButton = (result: CommandResult) => {
    const index = results.indexOf(result);
    if (result.kind === "workspace") {
      const pinned = pinnedWorkspaceIds.includes(result.workspace.id);
      const recent = recentWorkspaceIds.includes(result.workspace.id);
      return (
        <button
          id={resultDomId(result)}
          type="button"
          role="option"
          tabIndex={-1}
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
          <span className="command-result-tags">
            {pinned && <kbd>pinned</kbd>}
            {!pinned && recent && <kbd>recent</kbd>}
            <kbd>space</kbd>
          </span>
          {onTogglePinnedWorkspace && (
            <span className="command-pin">
              {pinned ? "Ctrl P unpins" : "Ctrl P pins"}
            </span>
          )}
        </button>
      );
    }
    return (
      <button
        id={resultDomId(result)}
        type="button"
        role="option"
        tabIndex={-1}
        aria-selected={index === activeIndex}
        aria-current={
          result.session.id === state.selectedAgentId ? "page" : undefined
        }
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
      description="Find a Space, detected Agent, or standalone Terminal."
      className="command-dialog"
      initialFocusRef={searchInput}
    >
      <div className="command-search">
        <MagnifyingGlassIcon aria-hidden="true" />
        <input
          ref={searchInput}
          value={query}
          role="combobox"
          aria-label="Search Spaces, Agents, and Terminals"
          aria-expanded="true"
          aria-controls="command-results"
          aria-autocomplete="list"
          aria-activedescendant={
            results[activeIndex] ? resultDomId(results[activeIndex]) : undefined
          }
          placeholder="Search Spaces, Agents, and Terminals…"
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
            } else if (
              event.ctrlKey &&
              event.key.toLowerCase() === "p" &&
              results[activeIndex]?.kind === "workspace"
            ) {
              event.preventDefault();
              onTogglePinnedWorkspace?.(results[activeIndex].workspace.id);
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
        {attentionResults.length > 0 && (
          <fieldset>
            <legend>Needs input</legend>
            {attentionResults.map(resultButton)}
          </fieldset>
        )}
        {currentSessionResults.length > 0 && (
          <fieldset>
            <legend>Current Space</legend>
            {currentSessionResults.map(resultButton)}
          </fieldset>
        )}
        {workspaceResults.length > 0 && (
          <fieldset>
            <legend>Spaces</legend>
            {workspaceResults.map(resultButton)}
          </fieldset>
        )}
        {otherSessionResults.length > 0 && (
          <fieldset>
            <legend>Other sessions</legend>
            {otherSessionResults.map(resultButton)}
          </fieldset>
        )}
        {results.length === 0 && (
          <div className="command-empty">
            <MagnifyingGlassIcon aria-hidden="true" />
            <strong>No matching Space or session</strong>
            <span>Try a runtime, branch, path, Space, or Agent name.</span>
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
          <kbd>ctrl</kbd>
          <kbd>p</kbd> pin Space
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
  }) => void;
}

const RUNTIME_COMMAND: Record<RuntimeName, string> = {
  "Claude Code": "claude",
  Codex: "codex --full-auto",
  OpenCode: "opencode",
  Pi: "pi",
  "Qwen Code": "qwen",
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
  const command = RUNTIME_COMMAND[runtime];

  useEffect(() => {
    if (!open) {
      setLabel("");
      setRuntime("Claude Code");
    }
  }, [open]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!label.trim()) return;
    onCreate({ label: label.trim(), runtime, command });
    onOpenChange(false);
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
            maxLength={80}
            placeholder="e.g. security-audit"
            onChange={(event) => setLabel(event.target.value)}
          >
            <TextField.Slot>
              <RocketIcon />
            </TextField.Slot>
          </TextField.Root>
        </label>
        <fieldset className="runtime-options">
          <legend>Agent runtime</legend>
          {Object.entries(RUNTIME_COMMAND).map(([name, preset]) => (
            <label key={name} data-selected={runtime === name}>
              <input
                type="radio"
                name="agent-runtime"
                value={name}
                checked={runtime === name}
                onChange={() => setRuntime(name as RuntimeName)}
              />
              <span>
                <strong>{name}</strong>
                <code>{preset}</code>
              </span>
            </label>
          ))}
        </fieldset>
        <section className="launch-review" aria-label="Launch preview">
          <span>
            <CodeIcon aria-hidden="true" /> Launch preview
          </span>
          <dl>
            <div className="launch-review-row">
              <dt>Space</dt>
              <dd>{workspace.name}</dd>
            </div>
            <div className="launch-review-row">
              <dt>Directory</dt>
              <dd title={workspace.path}>{workspace.path}</dd>
            </div>
            <div className="launch-review-row">
              <dt>Command</dt>
              <dd>
                <code>{command}</code>
              </dd>
            </div>
          </dl>
        </section>
        <div className="session-note">
          <span className="session-note-dot" aria-hidden="true" />
          <span>
            <strong>Persistent by default</strong>
            The Agent keeps running when this browser disconnects.
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
          <Button type="submit" color="amber" disabled={!label.trim()}>
            <RocketIcon /> Start agent
          </Button>
        </div>
      </form>
    </RadixDialog>
  );
}

interface NewSpaceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (input: { cwd: string; label?: string }) => Promise<void>;
}

export function NewSpaceDialog({
  open,
  onOpenChange,
  onCreate,
}: NewSpaceDialogProps) {
  const [cwd, setCwd] = useState("");
  const [label, setLabel] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const cwdInput = useRef<HTMLInputElement>(null);
  const cleanPath = normalizeWorkspacePath(cwd);
  const derivedLabel = workspaceLabelFromPath(cleanPath);

  useEffect(() => {
    if (!open) {
      setCwd("");
      setLabel("");
      setError("");
      setSubmitting(false);
    }
  }, [open]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!cleanPath || submitting) return;
    setError("");
    setSubmitting(true);
    try {
      await onCreate({
        cwd: cleanPath,
        ...(label.trim() ? { label: label.trim() } : {}),
      });
      onOpenChange(false);
    } catch (createError) {
      setError(
        createError instanceof Error
          ? createError.message
          : "The Space could not be created.",
      );
      setSubmitting(false);
    }
  };

  return (
    <RadixDialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!submitting) onOpenChange(nextOpen);
      }}
      title="Create a new Space"
      description="Open a persistent Herdr Space for a directory on this machine."
      className="space-dialog"
      initialFocusRef={cwdInput}
    >
      <form className="space-form" onSubmit={submit}>
        <label className="form-field" htmlFor="space-directory">
          <span>Directory</span>
          <TextField.Root
            ref={cwdInput}
            id="space-directory"
            value={cwd}
            maxLength={4096}
            placeholder="/path/to/project"
            disabled={submitting}
            onChange={(event) => setCwd(event.target.value)}
          >
            <TextField.Slot>
              <FilePlusIcon />
            </TextField.Slot>
          </TextField.Root>
        </label>
        <label className="form-field" htmlFor="space-label">
          <span>
            Label <small>optional</small>
          </span>
          <TextField.Root
            id="space-label"
            value={label}
            maxLength={80}
            placeholder={derivedLabel || "project name"}
            disabled={submitting}
            onChange={(event) => setLabel(event.target.value)}
          />
        </label>
        <section className="space-review" aria-label="Space preview">
          <span>New Space</span>
          <strong>{label.trim() || derivedLabel || "Project"}</strong>
          <code>{cleanPath || "/path/to/project"}</code>
        </section>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <div className="form-actions">
          <Button
            type="button"
            variant="soft"
            color="gray"
            disabled={submitting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="submit"
            color="amber"
            disabled={!cleanPath || submitting}
          >
            <FilePlusIcon /> {submitting ? "Creating…" : "Create Space"}
          </Button>
        </div>
      </form>
    </RadixDialog>
  );
}

interface SettingsPreferences {
  terminalFontSize: number;
  theme: WorkbenchTheme;
}

interface SettingsDialogProps extends SettingsPreferences {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApply: (preferences: SettingsPreferences) => void;
}

export function SettingsDialog({
  open,
  terminalFontSize,
  theme,
  onOpenChange,
  onApply,
}: SettingsDialogProps) {
  const [draftTheme, setDraftTheme] = useState(theme);
  const [draftFontSize, setDraftFontSize] = useState(terminalFontSize);

  useEffect(() => {
    if (!open) return;
    setDraftTheme(theme);
    setDraftFontSize(terminalFontSize);
  }, [open, terminalFontSize, theme]);

  return (
    <RadixDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Settings"
      description="Workbench preferences saved in this browser."
      className="settings-dialog"
    >
      <form
        className="settings-form"
        onSubmit={(event) => {
          event.preventDefault();
          onApply({
            terminalFontSize: draftFontSize,
            theme: draftTheme,
          });
          onOpenChange(false);
        }}
      >
        <fieldset className="theme-options">
          <legend>Theme</legend>
          {WORKBENCH_THEMES.map(({ description, label, theme: option }) => (
            <label key={option} data-selected={draftTheme === option}>
              <input
                type="radio"
                name="theme"
                value={option}
                checked={draftTheme === option}
                onChange={() => setDraftTheme(option)}
              />
              {themeAppearance(option) === "light" ? (
                <SunIcon aria-hidden="true" />
              ) : (
                <MoonIcon aria-hidden="true" />
              )}
              <span>
                <strong>{label}</strong>
                <small>{description}</small>
              </span>
            </label>
          ))}
        </fieldset>
        <fieldset className="terminal-size-options">
          <legend>
            <span>Terminal text size</span>
            <small>{draftFontSize} px</small>
          </legend>
          {TERMINAL_FONT_SIZE_PRESETS.map(({ label, size }) => (
            <label key={size} data-selected={draftFontSize === size}>
              <input
                type="radio"
                name="terminal-font-size"
                value={size}
                checked={draftFontSize === size}
                onChange={() => setDraftFontSize(size)}
              />
              <span>
                <strong>{label}</strong>
                <small>{size} px</small>
              </span>
            </label>
          ))}
        </fieldset>
        <div className="form-actions">
          <Button
            type="button"
            variant="soft"
            color="gray"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="submit" color="amber">
            Apply
          </Button>
        </div>
      </form>
    </RadixDialog>
  );
}

interface KeybindingsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const KEYBINDINGS = [
  ["Jump to a Space, Agent, or Terminal", "⌘ K / Ctrl K"],
  ["Move between focused tabs", "← / →"],
  ["Send an Agent message", "Enter"],
  ["Insert a message line break", "Shift Enter"],
  ["Paste an image", "⌘ V / Ctrl V"],
  ["Increase Terminal text", "⌘ + / Ctrl +"],
  ["Decrease Terminal text", "⌘ - / Ctrl -"],
  ["Reset Terminal text", "⌘ 0 / Ctrl 0"],
  ["Close a dialog or Terminal search", "Esc"],
] as const;

export function KeybindingsDialog({
  open,
  onOpenChange,
}: KeybindingsDialogProps) {
  return (
    <RadixDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Keybindings"
      description="Keyboard shortcuts available in the web workbench."
      className="keybindings-dialog"
    >
      <div className="keybindings-content">
        <div className="keybindings-heading">
          <KeyboardIcon aria-hidden="true" />
          <span>Workbench</span>
        </div>
        <dl className="keybindings-list">
          {KEYBINDINGS.map(([action, keys]) => (
            <div key={action}>
              <dt>{action}</dt>
              <dd>
                <kbd>{keys}</kbd>
              </dd>
            </div>
          ))}
        </dl>
        <p>Terminal programs continue to receive their own native shortcuts.</p>
      </div>
    </RadixDialog>
  );
}
