import {
  type BellIcon,
  CheckIcon,
  ClockIcon,
  CrossCircledIcon,
  ExclamationTriangleIcon,
  EyeOpenIcon,
  PaperPlaneIcon,
  SpeakerLoudIcon,
  SpeakerOffIcon,
} from "@radix-ui/react-icons";
import { Button } from "@radix-ui/themes";
import {
  type FormEvent,
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AttentionGroups,
  AttentionItem,
  AttentionPreferences,
} from "../attention-center";
import type { Agent, HerdrState } from "../state";
import { RadixDialog } from "./RadixDialog";
import { StatusPill } from "./StatusPill";

interface AttentionInboxProps {
  canReply: boolean;
  groups: AttentionGroups;
  open: boolean;
  preferences: AttentionPreferences;
  state: HerdrState;
  onMarkReviewed: (agent: Agent) => void;
  onMute: (agentId: string, muted: boolean) => void;
  onOpenAgent: (agentId: string, paneId: string) => void;
  onOpenChange: (open: boolean) => void;
  onPrompt: (agentId: string, message: string) => Promise<unknown>;
  onSnooze: (agentId: string, durationMs: number) => void;
}

interface GroupDefinition {
  description: string;
  icon: typeof BellIcon;
  items: AttentionItem[];
  key: keyof AttentionGroups;
  label: string;
}

function ageLabel(timestamp: number, now: number): string {
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1_000));
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

function previewLines(agent: Agent): string[] {
  if (agent.previewLines?.length) return agent.previewLines.slice(-6);
  const pane =
    agent.panes.find(({ id }) => id === agent.activePaneId) ?? agent.panes[0];
  return pane?.lines.slice(-6) ?? [];
}

function previewEntries(agent: Agent): Array<{ key: string; line: string }> {
  const occurrences = new Map<string, number>();
  return previewLines(agent).map((line) => {
    const occurrence = (occurrences.get(line) ?? 0) + 1;
    occurrences.set(line, occurrence);
    return { key: `${line}-${occurrence}`, line };
  });
}

export function AttentionInbox({
  canReply,
  groups,
  open,
  preferences,
  state,
  onMarkReviewed,
  onMute,
  onOpenAgent,
  onOpenChange,
  onPrompt,
  onSnooze,
}: AttentionInboxProps) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [reply, setReply] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  const replyInput = useRef<HTMLTextAreaElement>(null);
  const definitions = useMemo<GroupDefinition[]>(
    () => [
      {
        description: "Agents waiting for a decision, approval, or direction.",
        icon: ExclamationTriangleIcon,
        items: groups.needsInput,
        key: "needsInput",
        label: "Needs input",
      },
      {
        description: "Agents reporting a real failed or exited status.",
        icon: CrossCircledIcon,
        items: groups.failed,
        key: "failed",
        label: "Failed",
      },
      {
        description: "Completed Agents not yet reviewed in this browser.",
        icon: CheckIcon,
        items: groups.done,
        key: "done",
        label: "Recently done",
      },
    ],
    [groups],
  );
  const items = definitions.flatMap(({ items }) => items);
  const active = items[activeIndex] ?? items[0];

  useEffect(() => {
    if (!open) {
      setActiveIndex(0);
      setReply("");
      setError("");
      return;
    }
    setActiveIndex((current) =>
      Math.min(current, Math.max(0, items.length - 1)),
    );
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, [items.length, open]);

  const selectIndex = (index: number) => {
    setActiveIndex(index);
    setReply("");
    setError("");
  };

  const move = (offset: number) => {
    if (items.length === 0) return;
    selectIndex((activeIndex + offset + items.length) % items.length);
  };

  const completeAndNext = (agent: Agent) => {
    onMarkReviewed(agent);
    setReply("");
    setError("");
    if (items.length <= 1) return;
    setActiveIndex((current) => current % (items.length - 1));
  };

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const message = reply.trim();
    if (active?.agent.status !== "blocked" || !message || sending) {
      return;
    }
    setSending(true);
    setError("");
    try {
      await onPrompt(active.agent.id, message);
      setReply("");
      completeAndNext(active.agent);
    } catch (promptError) {
      setError(
        promptError instanceof Error
          ? promptError.message
          : "The reply could not be sent.",
      );
    } finally {
      setSending(false);
    }
  };

  const keyboard = (event: KeyboardEvent<HTMLFieldSetElement>) => {
    const target = event.target as HTMLElement;
    const editing = target.matches("input, textarea, select");
    if (editing && event.key !== "Escape") return;
    if (["j", "n", "ArrowDown"].includes(event.key)) {
      event.preventDefault();
      move(1);
    } else if (["k", "p", "ArrowUp"].includes(event.key)) {
      event.preventDefault();
      move(-1);
    } else if (event.key.toLowerCase() === "r" && active) {
      event.preventDefault();
      replyInput.current?.focus();
    }
  };

  return (
    <RadixDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Attention Inbox"
      description="Triage real Agent attention across every Space without changing the active terminal."
      className="attention-inbox-dialog"
    >
      <fieldset className="attention-inbox" onKeyDown={keyboard}>
        <legend className="sr-only">Attention triage</legend>
        <aside className="attention-inbox-list" aria-label="Attention groups">
          {definitions.map((group) => (
            <section key={group.key} aria-labelledby={`attention-${group.key}`}>
              <header>
                <group.icon aria-hidden="true" />
                <h3 id={`attention-${group.key}`}>{group.label}</h3>
                <span>{group.items.length}</span>
              </header>
              {group.items.length === 0 ? (
                <p>{group.description}</p>
              ) : (
                group.items.map((item) => {
                  const index = items.indexOf(item);
                  const workspace = state.workspaces.find(
                    ({ id }) => id === item.agent.workspaceId,
                  );
                  return (
                    <button
                      type="button"
                      key={item.agent.id}
                      data-active={item.agent.id === active?.agent.id}
                      aria-current={
                        item.agent.id === active?.agent.id ? "true" : undefined
                      }
                      onClick={() => selectIndex(index)}
                    >
                      <StatusPill status={item.agent.status} compact />
                      <span>
                        <strong>{item.agent.label}</strong>
                        <small>
                          {workspace?.name ?? "Unknown Space"} ·{" "}
                          {ageLabel(item.firstSeenAt, now)}
                        </small>
                      </span>
                    </button>
                  );
                })
              )}
            </section>
          ))}
        </aside>

        <section className="attention-inbox-detail">
          <p className="sr-only" aria-live="polite">
            {active
              ? `${active.agent.label}, ${active.agent.status}`
              : "Attention Inbox clear"}
          </p>
          {active ? (
            <>
              <header>
                <span>
                  <StatusPill status={active.agent.status} />
                  <strong>{active.agent.label}</strong>
                  <small>
                    {state.workspaces.find(
                      ({ id }) => id === active.agent.workspaceId,
                    )?.name ?? "Unknown Space"}
                  </small>
                </span>
                <Button
                  type="button"
                  size="1"
                  variant="soft"
                  onClick={() =>
                    onOpenAgent(active.agent.id, active.agent.activePaneId)
                  }
                >
                  <EyeOpenIcon /> Open Agent
                </Button>
              </header>
              <div className="attention-preview" role="document">
                {previewLines(active.agent).length > 0 ? (
                  previewEntries(active.agent).map(({ key, line }) => (
                    <code key={`${active.agent.id}-${key}`}>
                      {line || "\u00a0"}
                    </code>
                  ))
                ) : (
                  <p>No recent terminal preview is available.</p>
                )}
              </div>
              <div className="attention-triage-actions" role="toolbar">
                <Button
                  type="button"
                  size="1"
                  variant="soft"
                  onClick={() => completeAndNext(active.agent)}
                >
                  <CheckIcon /> Mark reviewed
                </Button>
                <Button
                  type="button"
                  size="1"
                  variant="soft"
                  onClick={() => onSnooze(active.agent.id, 15 * 60_000)}
                >
                  <ClockIcon /> Snooze 15m
                </Button>
                <Button
                  type="button"
                  size="1"
                  variant="soft"
                  onClick={() =>
                    onMute(
                      active.agent.id,
                      !preferences.mutedAgentIds.includes(active.agent.id),
                    )
                  }
                >
                  {preferences.mutedAgentIds.includes(active.agent.id) ? (
                    <SpeakerLoudIcon />
                  ) : (
                    <SpeakerOffIcon />
                  )}
                  {preferences.mutedAgentIds.includes(active.agent.id)
                    ? "Unmute"
                    : "Mute"}
                </Button>
              </div>
              <form className="attention-quick-reply" onSubmit={submit}>
                <label>
                  <span>Quick reply</span>
                  <textarea
                    ref={replyInput}
                    rows={4}
                    maxLength={20_000}
                    value={reply}
                    disabled={
                      !canReply || active.agent.status !== "blocked" || sending
                    }
                    placeholder={
                      active.agent.status === "blocked"
                        ? `Reply to ${active.agent.label} without leaving this inbox…`
                        : "Quick reply is available only while an Agent needs input."
                    }
                    onChange={(event) => setReply(event.target.value)}
                    onKeyDown={(event) => {
                      if (
                        event.key === "Enter" &&
                        !event.shiftKey &&
                        !event.nativeEvent.isComposing
                      ) {
                        event.preventDefault();
                        event.currentTarget.form?.requestSubmit();
                      }
                    }}
                  />
                </label>
                {error && <p role="alert">{error}</p>}
                <Button
                  type="submit"
                  color="amber"
                  disabled={
                    !canReply ||
                    active.agent.status !== "blocked" ||
                    !reply.trim() ||
                    sending
                  }
                >
                  <PaperPlaneIcon /> {sending ? "Sending…" : "Send and next"}
                </Button>
              </form>
            </>
          ) : (
            <div className="attention-empty">
              <CheckIcon aria-hidden="true" />
              <strong>Inbox clear</strong>
              <span>No unreviewed Agent attention is visible.</span>
            </div>
          )}
        </section>
      </fieldset>
      <footer className="attention-inbox-footer">
        <span>
          <kbd>J</kbd>/<kbd>N</kbd> next
        </span>
        <span>
          <kbd>K</kbd>/<kbd>P</kbd> previous
        </span>
        <span>
          <kbd>R</kbd> reply
        </span>
        <span>
          <kbd>Enter</kbd> send and next
        </span>
      </footer>
    </RadixDialog>
  );
}
