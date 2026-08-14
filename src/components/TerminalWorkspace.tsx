import {
  ChevronRightIcon,
  CodeIcon,
  ColumnsIcon,
  Cross2Icon,
  ExclamationTriangleIcon,
  ImageIcon,
  PaperPlaneIcon,
} from "@radix-ui/react-icons";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { Button } from "@radix-ui/themes";
import {
  type DragEvent,
  type FormEvent,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { MAX_ATTACHMENT_BYTES, SUPPORTED_IMAGE_TYPES } from "../herdr-api";
import type { Agent, TerminalPane, Workspace } from "../state";
import { RadixDialog } from "./RadixDialog";
import { StatusPill } from "./StatusPill";

interface TerminalWorkspaceProps {
  agent: Agent;
  workspace: Workspace;
  onMessage: (message: string, image?: File) => void | Promise<void>;
  onMessageFailure?: () => void;
  onSplitPane: () => void | Promise<void>;
  onSelectPane: (paneId: string) => void;
  onClosePane: (paneId: string) => void | Promise<void>;
}

interface Draft {
  attachment?: File;
  attachmentError: string;
  message: string;
  sendError: string;
}

const EMPTY_DRAFT: Draft = {
  attachmentError: "",
  message: "",
  sendError: "",
};

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

function imageFromTransfer(data: DataTransfer): File | undefined {
  const file = Array.from(data.files).find(({ type }) =>
    type.startsWith("image/"),
  );
  if (file) return file;
  for (const item of Array.from(data.items)) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const image = item.getAsFile();
    if (image) return image;
  }
  return undefined;
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
  agentLabel: string;
  onFocus: () => void;
  onClose: () => void;
}

function TerminalPaneView({
  pane,
  focused,
  canClose,
  agentLabel,
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
        <span className="pane-title">
          <CodeIcon aria-hidden="true" />
          {pane.title}
        </span>
        {focused && <span className="pane-focus-label">Focused</span>}
        {canClose && (
          <button
            type="button"
            className="pane-close"
            aria-label={`Close ${pane.title} pane`}
            onClick={(event) => {
              event.stopPropagation();
              onClose();
            }}
          >
            <Cross2Icon />
          </button>
        )}
      </div>
      <ScrollArea.Root className="terminal-scroll">
        <ScrollArea.Viewport className="terminal-viewport">
          <div
            className="terminal-lines"
            role="document"
            aria-label={`${agentLabel} output`}
          >
            {pane.lines.length === 0 ? (
              <p className="terminal-empty">No terminal output yet.</p>
            ) : (
              terminalLineEntries(pane.lines).map(({ key, line }) => (
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
              ))
            )}
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
  onMessageFailure,
  onSplitPane,
  onSelectPane,
  onClosePane,
}: TerminalWorkspaceProps) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [sending, setSending] = useState<Record<string, boolean>>({});
  const [dragging, setDragging] = useState(false);
  const [closingPane, setClosingPane] = useState<TerminalPane>();
  const [closeError, setCloseError] = useState("");
  const [closing, setClosing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const dragDepth = useRef(0);
  const imageInput = useRef<HTMLInputElement>(null);
  const composerForm = useRef<HTMLFormElement>(null);
  const cancelCloseButton = useRef<HTMLButtonElement>(null);
  const draft = drafts[agent.id] ?? EMPTY_DRAFT;
  const isSending = sending[agent.id] === true;
  const canPrompt = agent.kind === "agent" && agent.canPrompt !== false;
  const canSend = Boolean(draft.message.trim() || draft.attachment);

  const updateDraft = useCallback((agentId: string, update: Partial<Draft>) => {
    setDrafts((current) => ({
      ...current,
      [agentId]: { ...(current[agentId] ?? EMPTY_DRAFT), ...update },
    }));
  }, []);

  useEffect(() => {
    if (!draft.attachment || typeof URL.createObjectURL !== "function") {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(draft.attachment);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [draft.attachment]);

  const queueImage = useCallback(
    (file: File, agentId = agent.id) => {
      if (
        !SUPPORTED_IMAGE_TYPES.includes(
          file.type as (typeof SUPPORTED_IMAGE_TYPES)[number],
        )
      ) {
        updateDraft(agentId, {
          attachmentError: "Choose a PNG, JPEG, GIF, or WebP image.",
        });
        return;
      }
      if (file.size === 0 || file.size > MAX_ATTACHMENT_BYTES) {
        updateDraft(agentId, {
          attachmentError: "Image size must be between 1 byte and 8 MiB.",
        });
        return;
      }
      updateDraft(agentId, {
        attachment: file,
        attachmentError: "",
        sendError: "",
      });
    },
    [agent.id, updateDraft],
  );

  useEffect(() => {
    const activeAgentId = agent.id;
    const pasteImage = (event: globalThis.ClipboardEvent) => {
      if (!canPrompt || sending[activeAgentId] || !event.clipboardData) return;
      const image = imageFromTransfer(event.clipboardData);
      if (!image) return;
      event.preventDefault();
      queueImage(image, activeAgentId);
    };
    window.addEventListener("paste", pasteImage);
    return () => window.removeEventListener("paste", pasteImage);
  }, [agent.id, canPrompt, queueImage, sending]);

  const dropImage = (event: DragEvent<HTMLFormElement>) => {
    event.preventDefault();
    dragDepth.current = 0;
    setDragging(false);
    const image = imageFromTransfer(event.dataTransfer);
    if (image) queueImage(image);
  };

  const sendDraft = async () => {
    if (!canSend || !canPrompt || isSending) return;
    const agentId = agent.id;
    const pending = draft;
    updateDraft(agentId, { sendError: "" });
    setSending((current) => ({ ...current, [agentId]: true }));
    try {
      await onMessage(pending.message, pending.attachment);
      setDrafts((current) => ({ ...current, [agentId]: EMPTY_DRAFT }));
    } catch (error) {
      onMessageFailure?.();
      updateDraft(agentId, {
        sendError:
          error instanceof Error ? error.message : "Message could not be sent.",
      });
    } finally {
      setSending((current) => ({ ...current, [agentId]: false }));
    }
  };

  const submitMessage = (event: FormEvent) => {
    event.preventDefault();
    void sendDraft();
  };

  const confirmClose = async () => {
    if (!closingPane || closing) return;
    setClosing(true);
    setCloseError("");
    try {
      await onClosePane(closingPane.id);
      setClosingPane(undefined);
    } catch (error) {
      setCloseError(
        error instanceof Error ? error.message : "Could not close the pane.",
      );
    } finally {
      setClosing(false);
    }
  };

  return (
    <main className="main-workspace">
      <header className="workspace-header">
        <div className="workspace-identity">
          <div className="workspace-breadcrumb">
            <span>{workspace.name}</span>
            <ChevronRightIcon aria-hidden="true" />
            <span>{agent.kind === "agent" ? "Agent" : "Terminal"}</span>
          </div>
          <div className="agent-title-line">
            <h1>{agent.label}</h1>
            <StatusPill status={agent.status} />
          </div>
          <p>{agent.currentStep}</p>
        </div>
        <div className="workspace-actions">
          <Button
            type="button"
            variant="soft"
            color="gray"
            aria-label="Split terminal"
            title={
              agent.panes.length >= 2
                ? "This session already has two panes."
                : undefined
            }
            disabled={agent.panes.length >= 2}
            onClick={() =>
              void Promise.resolve(onSplitPane()).catch(() => undefined)
            }
          >
            <ColumnsIcon /> Split terminal
          </Button>
        </div>
        <div className="workspace-metadata">
          <span>{agent.runtime}</span>
          {agent.model && agent.model !== agent.runtime && (
            <span>{agent.model}</span>
          )}
          {workspace.branch && <code>{workspace.branch}</code>}
          {workspace.path && (
            <span title={workspace.path}>{workspace.path}</span>
          )}
        </div>
      </header>

      {agent.status === "blocked" && (
        <section
          className="attention-banner"
          aria-label="Agent needs attention"
        >
          <ExclamationTriangleIcon aria-hidden="true" />
          <div>
            <strong>Waiting for your direction</strong>
            <span>{agent.currentStep}</span>
          </div>
        </section>
      )}

      <section className="terminal-shell" aria-label={`${agent.label} session`}>
        <div className="pane-grid" data-split={agent.panes.length > 1}>
          {agent.panes.map((pane) => (
            <TerminalPaneView
              pane={pane}
              key={pane.id}
              agentLabel={agent.label}
              focused={pane.id === agent.activePaneId}
              canClose={agent.panes.length > 1}
              onFocus={() => onSelectPane(pane.id)}
              onClose={() => {
                setCloseError("");
                setClosingPane(pane);
              }}
            />
          ))}
        </div>

        <form
          ref={composerForm}
          className="message-composer"
          aria-label="Message composer"
          data-dragging={dragging}
          onDragEnter={(event) => {
            event.preventDefault();
            dragDepth.current += 1;
            setDragging(true);
          }}
          onDragLeave={() => {
            dragDepth.current = Math.max(0, dragDepth.current - 1);
            if (dragDepth.current === 0) setDragging(false);
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={dropImage}
          onSubmit={submitMessage}
        >
          {draft.attachment && (
            <div className="composer-attachment">
              {previewUrl ? (
                <img src={previewUrl} alt="" />
              ) : (
                <span className="composer-attachment-icon" aria-hidden="true">
                  <ImageIcon />
                </span>
              )}
              <span className="composer-attachment-copy">
                <strong>{draft.attachment.name}</strong>
                <small>
                  {Math.max(1, Math.ceil(draft.attachment.size / 1024))} KB
                </small>
              </span>
              <button
                type="button"
                aria-label={`Remove ${draft.attachment.name}`}
                disabled={isSending}
                onClick={() => updateDraft(agent.id, { attachment: undefined })}
              >
                <Cross2Icon />
              </button>
            </div>
          )}
          {draft.attachmentError && (
            <span className="composer-error" role="alert">
              {draft.attachmentError}
            </span>
          )}
          {draft.sendError && (
            <div
              className="composer-send-error"
              role="alert"
              aria-label="Message failed"
            >
              <span>{draft.sendError}</span>
              <button
                type="button"
                aria-label="Retry message"
                onClick={() => composerForm.current?.requestSubmit()}
              >
                Retry
              </button>
            </div>
          )}
          {isSending && (
            <span className="composer-progress" role="status">
              Sending message…
            </span>
          )}
          <input
            ref={imageInput}
            className="composer-file-input"
            type="file"
            accept={SUPPORTED_IMAGE_TYPES.join(",")}
            aria-label="Choose image"
            disabled={!canPrompt || isSending}
            onChange={(event) => {
              const file = event.currentTarget.files?.item(0);
              if (file) queueImage(file);
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            className="composer-attach"
            aria-label="Attach image"
            disabled={!canPrompt || isSending}
            title={
              !canPrompt ? "Image prompts require a detected Agent." : undefined
            }
            onClick={() => imageInput.current?.click()}
          >
            <ImageIcon />
          </button>
          <textarea
            rows={1}
            value={draft.message}
            aria-label={`Message ${agent.label}`}
            placeholder={
              canPrompt
                ? agent.status === "blocked"
                  ? "Type a decision or instruction…"
                  : `Send a follow-up to ${agent.label}…`
                : "This is a read-only terminal"
            }
            disabled={!canPrompt || isSending}
            onChange={(event) =>
              updateDraft(agent.id, {
                message: event.target.value,
                sendError: "",
              })
            }
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
            variant={canSend ? "solid" : "soft"}
            aria-label="Send message"
            disabled={!canPrompt || !canSend || isSending}
          >
            <PaperPlaneIcon />
            <span>{isSending ? "Sending…" : "Send"}</span>
          </Button>
          {!canPrompt && (
            <span className="composer-disabled-note">
              Prompts are available only for detected Agents.
            </span>
          )}
        </form>
      </section>

      <RadixDialog
        open={Boolean(closingPane)}
        onOpenChange={(open) => {
          if (!open && !closing) setClosingPane(undefined);
        }}
        title={`Close ${closingPane?.title ?? "terminal"} pane?`}
        description="The pane will stop and disappear from every attached Herdr client."
        className="confirm-dialog"
        initialFocusRef={cancelCloseButton}
      >
        <div className="confirm-body">
          <p>This action cannot be undone from the web workbench.</p>
          {closeError && (
            <span className="session-form-error" role="alert">
              {closeError}
            </span>
          )}
          <div className="form-actions">
            <Button
              ref={cancelCloseButton}
              type="button"
              variant="soft"
              color="gray"
              disabled={closing}
              onClick={() => setClosingPane(undefined)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              color="red"
              disabled={closing}
              onClick={() => void confirmClose()}
            >
              {closing ? "Closing…" : "Confirm close pane"}
            </Button>
          </div>
        </div>
      </RadixDialog>
    </main>
  );
}
