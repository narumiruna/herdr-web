import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import {
  ActivityLogIcon,
  ChevronRightIcon,
  CodeIcon,
  ColumnsIcon,
  Cross2Icon,
  DotsHorizontalIcon,
  ExclamationTriangleIcon,
  FileTextIcon,
  GitHubLogoIcon,
  PaperPlaneIcon,
  PlusIcon,
  StopwatchIcon,
} from "@radix-ui/react-icons";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { Badge, Button } from "@radix-ui/themes";
import { type FormEvent, useState } from "react";
import type { Agent, TerminalPane, Workspace } from "../state";
import { StatusPill } from "./StatusPill";

interface TerminalWorkspaceProps {
  agent: Agent;
  workspace: Workspace;
  onMessage: (message: string) => void | Promise<void>;
  onNewSession: () => void;
  onSplitPane: () => void | Promise<void>;
  onSelectPane: (paneId: string) => void;
  onClosePane: (paneId: string) => void | Promise<void>;
  onShowActivity: () => void;
}

function lineClass(line: string): string {
  if (line.startsWith("$")) return "terminal-command";
  if (line.startsWith("●")) return "terminal-action";
  if (line.startsWith("◆")) return "terminal-attention";
  if (line.startsWith("✓") || line.startsWith("test result: ok")) {
    return "terminal-success";
  }
  if (line.startsWith("›")) return "terminal-message";
  if (line.startsWith("╭") || line.startsWith("│") || line.startsWith("╰")) {
    return "terminal-frame";
  }
  return "";
}

function terminalLineEntries(lines: string[]) {
  const occurrences = new Map<string, number>();
  return lines.map((line) => {
    const occurrence = (occurrences.get(line) ?? 0) + 1;
    occurrences.set(line, occurrence);
    return { key: `${line}-${occurrence}`, line };
  });
}

interface TerminalPaneViewProps {
  pane: TerminalPane;
  focused: boolean;
  canClose: boolean;
  onFocus: () => void;
  onClose: () => void | Promise<void>;
}

function TerminalPaneView({
  pane,
  focused,
  canClose,
  onFocus,
  onClose,
}: TerminalPaneViewProps) {
  return (
    <section
      className="terminal-pane"
      data-focused={focused}
      aria-label={`${pane.title} terminal`}
      onPointerDown={onFocus}
    >
      <div className="pane-titlebar">
        <span className="pane-leds" aria-hidden="true">
          <i />
          <i />
        </span>
        <span className="pane-title">
          <CodeIcon aria-hidden="true" />
          {pane.title}
        </span>
        {canClose && (
          <button
            type="button"
            className="pane-close"
            aria-label={`Close ${pane.title} pane`}
            onClick={(event) => {
              event.stopPropagation();
              void Promise.resolve(onClose()).catch(() => undefined);
            }}
          >
            <Cross2Icon />
          </button>
        )}
      </div>
      <ScrollArea.Root className="terminal-scroll">
        <ScrollArea.Viewport className="terminal-viewport">
          <div className="terminal-lines" aria-live="polite">
            {terminalLineEntries(pane.lines).map(({ key, line }) => (
              <div className={lineClass(line)} key={`${pane.id}-${key}`}>
                {line.startsWith("● ") ? (
                  <>
                    <span aria-hidden="true">● </span>
                    {line.slice(2)}
                  </>
                ) : (
                  line || "\u00a0"
                )}
              </div>
            ))}
            {focused && <span className="terminal-cursor" aria-hidden="true" />}
          </div>
        </ScrollArea.Viewport>
        <ScrollArea.Scrollbar
          className="terminal-scrollbar"
          orientation="vertical"
        >
          <ScrollArea.Thumb className="terminal-scrollbar-thumb" />
        </ScrollArea.Scrollbar>
      </ScrollArea.Root>
    </section>
  );
}

export function TerminalWorkspace({
  agent,
  workspace,
  onMessage,
  onNewSession,
  onSplitPane,
  onSelectPane,
  onClosePane,
  onShowActivity,
}: TerminalWorkspaceProps) {
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const canPrompt = agent.canPrompt !== false;

  const submitMessage = async (event: FormEvent) => {
    event.preventDefault();
    if (!message.trim() || !canPrompt || sending) return;
    setSending(true);
    try {
      await onMessage(message);
      setMessage("");
    } catch {
      // The runtime-level alert presents the bridge error and keeps the draft.
    } finally {
      setSending(false);
    }
  };

  return (
    <main className="main-workspace">
      <header className="workspace-header">
        <div className="workspace-breadcrumb">
          <span>{workspace.name}</span>
          <ChevronRightIcon aria-hidden="true" />
          <span>{agent.runtime}</span>
        </div>
        <div className="workspace-heading-row">
          <div className="agent-title-group">
            <div className="agent-title-line">
              <h1>{agent.label}</h1>
              <StatusPill status={agent.status} />
            </div>
            <p>{agent.summary}</p>
          </div>
          <div className="workspace-actions">
            <Button
              type="button"
              variant="soft"
              color="gray"
              className="activity-mobile-button"
              onClick={onShowActivity}
            >
              <ActivityLogIcon /> Activity
            </Button>
            <Button
              type="button"
              variant="soft"
              color="gray"
              aria-label="Split terminal"
              disabled={agent.panes.length >= 2}
              onClick={() =>
                void Promise.resolve(onSplitPane()).catch(() => undefined)
              }
            >
              <ColumnsIcon /> Split
            </Button>
            <Button type="button" color="amber" onClick={onNewSession}>
              <PlusIcon /> New session
            </Button>
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  type="button"
                  className="bare-icon session-menu-trigger"
                  aria-label="Session actions"
                >
                  <DotsHorizontalIcon />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  className="menu-content"
                  sideOffset={6}
                  align="end"
                >
                  <DropdownMenu.Item
                    className="menu-item menu-mobile-only"
                    disabled={agent.panes.length >= 2}
                    onSelect={onSplitPane}
                  >
                    <ColumnsIcon /> Split terminal
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className="menu-item">
                    <FileTextIcon /> Copy session summary
                  </DropdownMenu.Item>
                  <DropdownMenu.Item className="menu-item">
                    <GitHubLogoIcon /> Open branch on GitHub
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="menu-separator" />
                  <DropdownMenu.Item className="menu-item menu-item-danger">
                    Stop session
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </div>
        <div className="workspace-metadata">
          <Badge color="gray" variant="soft">
            <CodeIcon /> {workspace.branch}
          </Badge>
          <span>{workspace.path}</span>
          <span className="metadata-divider" aria-hidden="true" />
          <span>
            <StopwatchIcon aria-hidden="true" /> started {agent.started}
          </span>
          <span>
            <FileTextIcon aria-hidden="true" /> {agent.filesChanged} files
          </span>
          <span className="diff-positive">+{agent.additions}</span>
          <span className="diff-negative">−{agent.deletions}</span>
        </div>
      </header>

      {agent.status === "blocked" && (
        <section
          className="attention-banner"
          aria-labelledby="decision-heading"
        >
          <span className="attention-icon">
            <ExclamationTriangleIcon aria-hidden="true" />
          </span>
          <div>
            <span className="attention-eyebrow">Decision needed</span>
            <h2 id="decision-heading">
              This agent is waiting for your direction.
            </h2>
            <p>
              Choose whether the browser event schema should preserve numeric
              pane IDs for existing clients.
            </p>
          </div>
          <span className="attention-time">2m ago</span>
        </section>
      )}

      <section className="terminal-shell" aria-label={`${agent.label} session`}>
        <div className="terminal-tabs">
          <div
            className="terminal-tab-list"
            role="tablist"
            aria-label="Terminal panes"
          >
            {agent.panes.map((pane) => (
              <button
                type="button"
                role="tab"
                aria-selected={pane.id === agent.activePaneId}
                className="terminal-tab"
                key={pane.id}
                onClick={() => onSelectPane(pane.id)}
              >
                <span className="terminal-tab-dot" />
                {pane.title}
              </button>
            ))}
          </div>
          <span className="terminal-runtime">herdr / {agent.model}</span>
        </div>

        <div className="pane-grid" data-split={agent.panes.length > 1}>
          {agent.panes.map((pane) => (
            <TerminalPaneView
              pane={pane}
              key={pane.id}
              focused={pane.id === agent.activePaneId}
              canClose={agent.panes.length > 1}
              onFocus={() => onSelectPane(pane.id)}
              onClose={() => onClosePane(pane.id)}
            />
          ))}
        </div>

        <form className="message-composer" onSubmit={submitMessage}>
          <span className="composer-prompt" aria-hidden="true">
            ›
          </span>
          <textarea
            rows={1}
            value={message}
            aria-label={`Message ${agent.label}`}
            placeholder={
              !canPrompt
                ? "This pane is not a detected agent"
                : agent.status === "blocked"
                  ? "Type a decision or instruction…"
                  : `Send a follow-up to ${agent.label}…`
            }
            disabled={!canPrompt || sending}
            onChange={(event) => setMessage(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                event.currentTarget.form?.requestSubmit();
              }
            }}
          />
          <Button
            type="submit"
            color="amber"
            variant={message.trim() ? "solid" : "soft"}
            aria-label="Send message"
            disabled={!canPrompt || !message.trim() || sending}
          >
            <PaperPlaneIcon />
            <span>Send</span>
          </Button>
        </form>
        <footer className="terminal-statusbar">
          <span className="terminal-status-left">
            <span className="statusbar-mode">NORMAL</span>
            <span>⎇ {workspace.branch}</span>
            <span>↑{workspace.ahead}</span>
          </span>
          <span className="terminal-status-right">
            <span>{agent.contextPercent}% ctx</span>
            <span>UTF-8</span>
            <span>online</span>
          </span>
        </footer>
      </section>
    </main>
  );
}
