import {
  CheckIcon,
  CodeIcon,
  ColumnsIcon,
  CopyIcon,
  Cross2Icon,
  ExclamationTriangleIcon,
  ImageIcon,
  LockClosedIcon,
  PaperPlaneIcon,
  ReloadIcon,
} from "@radix-ui/react-icons";
import * as ScrollArea from "@radix-ui/react-scroll-area";
import { Button, IconButton } from "@radix-ui/themes";
import {
  type CSSProperties,
  type DragEvent,
  type FormEvent,
  Fragment,
  type KeyboardEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  MAX_ATTACHMENT_BYTES,
  MAX_PROMPT_CHARACTERS,
  SUPPORTED_IMAGE_TYPES,
  type TerminalTicket,
  type TerminalTicketInput,
  type UploadedImage,
} from "../herdr-api";
import type { Agent, TerminalPane, Workspace } from "../state";
import { HerdrMutationError } from "../use-herdr-runtime";
import { IconTooltip } from "./IconTooltip";
import { InteractiveTerminal } from "./InteractiveTerminal";
import { clampPaneRatio, PaneResizeHandle } from "./PaneResizeHandle";
import { RadixDialog } from "./RadixDialog";

export interface ComposerDraft {
  attachment?: File;
  attachmentError: string;
  message: string;
  sendError: string;
  sendOutcome?: "rejected" | "unknown";
  sendStage?: "action" | "prompt" | "upload";
  uploadedPath?: string;
}

export const EMPTY_COMPOSER_DRAFT: ComposerDraft = {
  attachmentError: "",
  message: "",
  sendError: "",
};

interface TerminalWorkspaceProps {
  actionsEnabled: boolean;
  agent: Agent;
  draft: ComposerDraft;
  isSending: boolean;
  workspace: Workspace;
  createTerminalTicket: (
    paneId: string,
    input: TerminalTicketInput,
  ) => Promise<TerminalTicket>;
  onClearDraft: (agentId: string) => void;
  onDraftChange: (agentId: string, update: Partial<ComposerDraft>) => void;
  onMessage: (
    message: string,
    image?: File,
    uploadedPath?: string,
  ) => Promise<{ uploadedPath?: string }> | undefined;
  onMessageFailure?: () => void;
  onRetryOutput: () => void | Promise<void>;
  onResizePanes: (ratio: number) => void | Promise<void>;
  onSendingChange: (agentId: string, sending: boolean) => void;
  onSplitPane: () => void | Promise<void>;
  onSelectPane: (paneId: string) => void;
  onClosePane: (paneId: string) => void | Promise<void>;
  onUploadImage: (paneId: string, image: File) => Promise<UploadedImage>;
  terminalControlEnabled: boolean;
  terminalEnabled: boolean;
  terminalReason: string;
  terminalStreaming: boolean;
}

function compactPath(path: string): string {
  const parts = path.split("/").filter(Boolean);
  if (parts.length <= 2) return path;
  return `…/${parts.slice(-2).join("/")}`;
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

function movePaneTab(event: KeyboardEvent<HTMLButtonElement>) {
  if (
    !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
  ) {
    return;
  }
  const tabs = Array.from(
    event.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>(
      '[role="tab"]',
    ) ?? [],
  );
  const current = tabs.indexOf(event.currentTarget);
  if (current < 0 || tabs.length < 2) return;
  event.preventDefault();
  const offset = event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
  const next = tabs[(current + offset + tabs.length) % tabs.length];
  next?.focus();
  next?.click();
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
  showTitle: boolean;
  agentLabel: string;
  onFocus: () => void;
  onClose: () => void;
  onRetryOutput: () => void;
}

function TerminalPaneView({
  pane,
  focused,
  canClose,
  showTitle,
  agentLabel,
  onFocus,
  onClose,
  onRetryOutput,
}: TerminalPaneViewProps) {
  const viewport = useRef<HTMLDivElement>(null);
  const followsOutput = useRef(true);

  // biome-ignore lint/correctness/useExhaustiveDependencies: rendered output is the scroll trigger.
  useLayoutEffect(() => {
    const element = viewport.current;
    if (element && followsOutput.current) {
      element.scrollTop = element.scrollHeight;
    }
  }, [pane.lines]);

  const navigatePane = (event: KeyboardEvent<HTMLElement>) => {
    if (
      !["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)
    ) {
      return;
    }
    const panes = Array.from(
      event.currentTarget
        .closest(".pane-grid")
        ?.querySelectorAll<HTMLElement>(".pane-focus-target") ?? [],
    );
    const current = panes.indexOf(event.currentTarget);
    if (current < 0 || panes.length < 2) return;
    event.preventDefault();
    const offset =
      event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 1;
    panes[(current + offset + panes.length) % panes.length]?.focus();
  };

  return (
    <section
      className="terminal-pane"
      data-focused={focused}
      aria-label={`${pane.title} terminal`}
      onPointerDown={onFocus}
    >
      {showTitle && (
        <div className="pane-titlebar">
          <button
            type="button"
            className="pane-title pane-focus-target"
            aria-label={`Focus ${pane.title} pane`}
            onFocus={onFocus}
            onKeyDown={navigatePane}
          >
            <CodeIcon aria-hidden="true" />
            {pane.title}
          </button>
          {focused && canClose && (
            <span className="pane-active-label">Active</span>
          )}
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
      )}
      <ScrollArea.Root className="terminal-scroll">
        <ScrollArea.Viewport
          ref={viewport}
          className="terminal-viewport"
          onScroll={(event) => {
            const element = event.currentTarget;
            const distanceFromBottom =
              element.scrollHeight - element.clientHeight - element.scrollTop;
            followsOutput.current = distanceFromBottom <= 24;
          }}
        >
          <div
            className="terminal-lines"
            role="document"
            aria-label={`${agentLabel} output`}
          >
            {pane.outputState === "unavailable" ? (
              <div className="terminal-output-error" role="status">
                <ReloadIcon aria-hidden="true" />
                <strong>Terminal output is temporarily unavailable.</strong>
                <span>{pane.outputError}</span>
                <button type="button" onClick={onRetryOutput}>
                  Retry output
                </button>
              </div>
            ) : pane.lines.length === 0 ? (
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
  actionsEnabled,
  agent,
  createTerminalTicket,
  draft,
  isSending,
  workspace,
  onClearDraft,
  onDraftChange,
  onMessage,
  onMessageFailure,
  onRetryOutput,
  onResizePanes,
  onSendingChange,
  onSplitPane,
  onSelectPane,
  onClosePane,
  onUploadImage,
  terminalControlEnabled,
  terminalEnabled,
  terminalReason,
  terminalStreaming,
}: TerminalWorkspaceProps) {
  const [dragging, setDragging] = useState(false);
  const [closingPane, setClosingPane] = useState<TerminalPane>();
  const [closeError, setCloseError] = useState("");
  const [closing, setClosing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [copiedCwdPaneId, setCopiedCwdPaneId] = useState("");
  const [sentAgentId, setSentAgentId] = useState("");
  const [paneRatio, setPaneRatio] = useState(() =>
    clampPaneRatio(agent.paneSplit?.ratio ?? 0.5),
  );
  const [paneResizeDragging, setPaneResizeDragging] = useState(false);
  const [paneResizePending, setPaneResizePending] = useState(false);
  const dragDepth = useRef(0);
  const imageInput = useRef<HTMLInputElement>(null);
  const composerForm = useRef<HTMLFormElement>(null);
  const messageInput = useRef<HTMLTextAreaElement>(null);
  const cancelCloseButton = useRef<HTMLButtonElement>(null);
  const canPrompt = agent.kind === "agent" && agent.canPrompt !== false;
  const canSend =
    actionsEnabled && Boolean(draft.message.trim() || draft.attachment);
  const activePane =
    agent.panes.find(({ id }) => id === agent.activePaneId) ?? agent.panes[0];
  const currentWorkingDirectory = activePane?.cwd || workspace.path;
  const sourcePaneRatio = clampPaneRatio(agent.paneSplit?.ratio ?? 0.5);
  const paneSplitDirection = agent.paneSplit?.direction ?? "right";
  const visiblePanes = agent.panes.filter(
    (pane) => agent.panes.length <= 2 || pane.id === agent.activePaneId,
  );
  const showsPaneSplit = agent.panes.length === 2 && visiblePanes.length === 2;
  const paneGridStyle = showsPaneSplit
    ? ({
        "--pane-first": `${paneRatio}fr`,
        "--pane-second": `${1 - paneRatio}fr`,
      } as CSSProperties)
    : undefined;

  const updateDraft = useCallback(
    (agentId: string, update: Partial<ComposerDraft>) => {
      onDraftChange(agentId, update);
    },
    [onDraftChange],
  );

  useEffect(() => {
    if (!paneResizeDragging && !paneResizePending) {
      setPaneRatio(sourcePaneRatio);
    }
  }, [paneResizeDragging, paneResizePending, sourcePaneRatio]);

  useEffect(() => {
    if (!draft.attachment || typeof URL.createObjectURL !== "function") {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(draft.attachment);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [draft.attachment]);

  useLayoutEffect(() => {
    const element = messageInput.current;
    if (!element) return;
    element.style.height = "auto";
    element.style.height = `${Math.min(element.scrollHeight, 120)}px`;
  });

  const queueImage = useCallback(
    (file: File, agentId = agent.id) => {
      if (!actionsEnabled) return;
      if (draft.attachment) {
        updateDraft(agentId, {
          attachmentError: "Remove the current image before attaching another.",
        });
        return;
      }
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
        sendOutcome: undefined,
        sendStage: undefined,
        uploadedPath: undefined,
      });
    },
    [actionsEnabled, agent.id, draft.attachment, updateDraft],
  );

  useEffect(() => {
    const activeAgentId = agent.id;
    const pasteImage = (event: globalThis.ClipboardEvent) => {
      if (!actionsEnabled || !canPrompt || isSending || !event.clipboardData) {
        return;
      }
      const image = imageFromTransfer(event.clipboardData);
      if (!image) return;
      event.preventDefault();
      queueImage(image, activeAgentId);
    };
    window.addEventListener("paste", pasteImage);
    return () => window.removeEventListener("paste", pasteImage);
  }, [actionsEnabled, agent.id, canPrompt, isSending, queueImage]);

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
    updateDraft(agentId, {
      sendError: "",
      sendOutcome: undefined,
      sendStage: undefined,
    });
    onSendingChange(agentId, true);
    try {
      await onMessage(
        pending.message,
        pending.attachment,
        pending.uploadedPath,
      );
      onClearDraft(agentId);
      setSentAgentId(agentId);
      window.setTimeout(
        () => setSentAgentId((current) => (current === agentId ? "" : current)),
        2_500,
      );
    } catch (error) {
      onMessageFailure?.();
      const mutationError =
        error instanceof HerdrMutationError ? error : undefined;
      updateDraft(agentId, {
        sendError:
          mutationError?.outcome === "unknown"
            ? mutationError.stage === "upload"
              ? "The image upload could not be confirmed, so the prompt was not sent. Retrying may store another copy."
              : "Delivery could not be confirmed. Check the terminal before sending this prompt again."
            : error instanceof Error
              ? error.message
              : "Message could not be sent.",
        sendOutcome: mutationError?.outcome ?? "rejected",
        sendStage: mutationError?.stage,
        uploadedPath: mutationError?.uploadedPath ?? pending.uploadedPath,
      });
    } finally {
      onSendingChange(agentId, false);
    }
  };

  const submitMessage = (event: FormEvent) => {
    event.preventDefault();
    void sendDraft();
  };

  const copyWorkingDirectory = async (path: string, paneId: string) => {
    if (!path) return;
    if (navigator.clipboard) {
      await navigator.clipboard.writeText(path);
    } else {
      const copyTarget = document.createElement("textarea");
      copyTarget.value = path;
      copyTarget.style.position = "fixed";
      copyTarget.style.opacity = "0";
      document.body.append(copyTarget);
      copyTarget.select();
      document.execCommand("copy");
      copyTarget.remove();
    }
    setCopiedCwdPaneId(paneId);
    window.setTimeout(
      () =>
        setCopiedCwdPaneId((current) => (current === paneId ? "" : current)),
      1_500,
    );
  };

  const commitPaneResize = async (ratio: number) => {
    const next = clampPaneRatio(ratio);
    setPaneResizeDragging(false);
    if (!actionsEnabled || paneResizePending || next === sourcePaneRatio) {
      setPaneRatio(sourcePaneRatio);
      return;
    }
    setPaneResizePending(true);
    try {
      await onResizePanes(next);
    } catch {
      setPaneRatio(sourcePaneRatio);
    } finally {
      setPaneResizePending(false);
    }
  };

  const confirmClose = async () => {
    if (!actionsEnabled || !closingPane || closing) return;
    setClosing(true);
    setCloseError("");
    try {
      await onClosePane(closingPane.id);
      setClosingPane(undefined);
    } catch (error) {
      setCloseError(
        error instanceof HerdrMutationError && error.outcome === "unknown"
          ? "The close result could not be confirmed. Refresh before trying again."
          : error instanceof Error
            ? error.message
            : "Could not close the pane.",
      );
    } finally {
      setClosing(false);
    }
  };

  const terminalContext = (pane: TerminalPane) => {
    const paneWorkingDirectory = pane.cwd || workspace.path;
    return (
      <>
        {paneWorkingDirectory && (
          <span className="terminal-toolbar-location">
            <code className="workspace-cwd" title={paneWorkingDirectory}>
              <span className="sr-only">
                Current working directory: {paneWorkingDirectory}
              </span>
              <span className="workspace-cwd-full" aria-hidden="true">
                {paneWorkingDirectory}
              </span>
              <span className="workspace-cwd-compact" aria-hidden="true">
                {compactPath(paneWorkingDirectory)}
              </span>
            </code>
            <button
              type="button"
              className="workspace-copy-cwd"
              aria-label={
                copiedCwdPaneId === pane.id
                  ? "Current working directory copied"
                  : "Copy current working directory"
              }
              onClick={() =>
                void copyWorkingDirectory(paneWorkingDirectory, pane.id)
              }
            >
              {copiedCwdPaneId === pane.id ? <CheckIcon /> : <CopyIcon />}
            </button>
          </span>
        )}
        {workspace.branch && (
          <code className="terminal-toolbar-branch" title={workspace.branch}>
            {workspace.branch}
          </code>
        )}
        <span className="terminal-toolbar-title" title={pane.title}>
          <CodeIcon aria-hidden="true" />
          {pane.title}
        </span>
      </>
    );
  };

  const terminalStructureActions = (
    pane: TerminalPane,
    includeClose: boolean,
  ) => (
    <>
      <IconTooltip label="Split pane">
        <IconButton
          type="button"
          variant="ghost"
          color="gray"
          aria-label="Split pane"
          title={
            agent.panes.length >= 2
              ? "This session already has two panes."
              : undefined
          }
          disabled={!actionsEnabled || agent.panes.length >= 2}
          onClick={() =>
            void Promise.resolve(onSplitPane()).catch(() => undefined)
          }
        >
          <ColumnsIcon />
        </IconButton>
      </IconTooltip>
      {includeClose && actionsEnabled && (
        <IconTooltip label={`Close ${pane.title} pane`}>
          <IconButton
            type="button"
            variant="ghost"
            color="gray"
            aria-label={`Close ${pane.title} pane`}
            onClick={() => {
              setCloseError("");
              setClosingPane(pane);
            }}
          >
            <Cross2Icon />
          </IconButton>
        </IconTooltip>
      )}
    </>
  );

  return (
    <main className="main-workspace">
      {agent.status === "blocked" && (
        <section className="attention-banner" aria-label="Agent needs input">
          <ExclamationTriangleIcon aria-hidden="true" />
          <div>
            <strong>Waiting for your direction</strong>
            <span>{agent.currentStep}</span>
          </div>
        </section>
      )}

      <section className="terminal-shell" aria-label={`${agent.label} session`}>
        {!terminalStreaming && activePane && (
          <div className="interactive-terminal-tools terminal-fallback-tools">
            <span className="terminal-toolbar-context">
              {terminalContext(activePane)}
              <span
                className="interactive-terminal-state"
                role="status"
                title={terminalReason}
              >
                <i aria-hidden="true" /> Snapshot
                <span className="terminal-status-detail">
                  Interactive unavailable
                </span>
              </span>
            </span>
            <span className="interactive-terminal-actions">
              {terminalStructureActions(activePane, false)}
            </span>
          </div>
        )}
        {agent.panes.length > 1 && (
          <div
            className="pane-switcher"
            data-two={agent.panes.length === 2}
            role="tablist"
            aria-label="Session panes"
          >
            {agent.panes.map((pane) => (
              <button
                type="button"
                role="tab"
                aria-selected={pane.id === agent.activePaneId}
                tabIndex={pane.id === agent.activePaneId ? 0 : -1}
                key={pane.id}
                onClick={() => onSelectPane(pane.id)}
                onKeyDown={movePaneTab}
              >
                <CodeIcon aria-hidden="true" /> {pane.title}
              </button>
            ))}
          </div>
        )}
        <div
          className="pane-grid"
          data-direction={paneSplitDirection}
          data-many={!terminalStreaming && agent.panes.length > 2}
          data-resizing={paneResizeDragging}
          data-split={showsPaneSplit}
          style={paneGridStyle}
        >
          {visiblePanes.map((pane, index) => (
            <Fragment key={pane.id}>
              {index === 1 && showsPaneSplit && (
                <PaneResizeHandle
                  direction={paneSplitDirection}
                  disabled={!actionsEnabled || paneResizePending}
                  ratio={paneRatio}
                  onCancel={() => {
                    setPaneResizeDragging(false);
                    setPaneRatio(sourcePaneRatio);
                  }}
                  onCommit={(ratio) => void commitPaneResize(ratio)}
                  onDragStart={() => setPaneResizeDragging(true)}
                  onPreview={setPaneRatio}
                />
              )}
              {terminalStreaming ? (
                <section
                  className="terminal-pane"
                  data-focused={pane.id === agent.activePaneId}
                  aria-label={`${pane.title} terminal`}
                  onPointerDown={() => onSelectPane(pane.id)}
                >
                  <InteractiveTerminal
                    actionsEnabled={terminalEnabled}
                    controlEnabled={terminalControlEnabled}
                    structuredActionsEnabled={actionsEnabled}
                    agentId={agent.id}
                    agentLabel={agent.label}
                    canPrompt={canPrompt}
                    createTicket={createTerminalTicket}
                    draft={draft}
                    onDraftChange={onDraftChange}
                    onPrompt={(message) => onMessage(message)}
                    onUploadImage={onUploadImage}
                    paneId={pane.id}
                    toolbarContext={terminalContext(pane)}
                    toolbarActions={terminalStructureActions(
                      pane,
                      agent.panes.length > 1,
                    )}
                  />
                </section>
              ) : (
                <TerminalPaneView
                  pane={pane}
                  agentLabel={agent.label}
                  focused={pane.id === agent.activePaneId}
                  canClose={actionsEnabled && agent.panes.length > 1}
                  showTitle={agent.panes.length > 1}
                  onFocus={() => onSelectPane(pane.id)}
                  onClose={() => {
                    setCloseError("");
                    setClosingPane(pane);
                  }}
                  onRetryOutput={() => void onRetryOutput()}
                />
              )}
            </Fragment>
          ))}
        </div>

        {!terminalStreaming && canPrompt ? (
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
                    {Math.max(1, Math.ceil(draft.attachment.size / 1024))} KB ·{" "}
                    {draft.uploadedPath
                      ? `stored at ${draft.uploadedPath}`
                      : `will be stored under ${currentWorkingDirectory}/.hedr/uploads`}
                  </small>
                </span>
                <button
                  type="button"
                  aria-label={`Remove ${draft.attachment.name}`}
                  disabled={isSending}
                  onClick={() =>
                    updateDraft(agent.id, {
                      attachment: undefined,
                      attachmentError: "",
                      uploadedPath: undefined,
                    })
                  }
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
                  aria-label={
                    draft.sendOutcome === "unknown" &&
                    draft.sendStage !== "upload"
                      ? "Send message again"
                      : "Retry message"
                  }
                  onClick={() => composerForm.current?.requestSubmit()}
                >
                  {draft.sendOutcome === "unknown" &&
                  draft.sendStage !== "upload"
                    ? "Send again"
                    : "Retry"}
                </button>
              </div>
            )}
            {isSending && (
              <span className="composer-progress" role="status">
                Sending message…
              </span>
            )}
            {!isSending && sentAgentId === agent.id && (
              <span className="composer-success" role="status">
                Prompt sent. Waiting for terminal output…
              </span>
            )}
            <input
              ref={imageInput}
              className="composer-file-input"
              type="file"
              accept={SUPPORTED_IMAGE_TYPES.join(",")}
              aria-label="Choose image"
              disabled={!actionsEnabled || isSending}
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
              disabled={!actionsEnabled || isSending}
              title={
                !actionsEnabled ? "Reconnect to attach an image." : undefined
              }
              onClick={() => imageInput.current?.click()}
            >
              <ImageIcon />
            </button>
            <textarea
              ref={messageInput}
              rows={1}
              maxLength={MAX_PROMPT_CHARACTERS}
              value={draft.message}
              aria-label={`Message ${agent.label}`}
              placeholder={
                agent.status === "blocked"
                  ? "Reply with a decision or instruction…"
                  : `Message ${agent.label}…`
              }
              disabled={!actionsEnabled || isSending}
              onChange={(event) =>
                updateDraft(agent.id, {
                  message: event.target.value,
                  sendError: "",
                  sendOutcome: undefined,
                  sendStage: undefined,
                })
              }
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
            <Button
              type="submit"
              color="amber"
              variant={canSend ? "solid" : "soft"}
              aria-label="Send message"
              disabled={!canSend || isSending}
            >
              <PaperPlaneIcon />
              <span>{isSending ? "Sending…" : "Send"}</span>
            </Button>
            <div className="composer-hint">
              <span>Enter to send · Shift+Enter for a new line</span>
              <span>
                {draft.message.length.toLocaleString()} /{" "}
                {MAX_PROMPT_CHARACTERS.toLocaleString()}
              </span>
            </div>
          </form>
        ) : !terminalStreaming ? (
          <div className="terminal-readonly" role="note">
            <LockClosedIcon aria-hidden="true" />
            <span>
              <strong>Read-only terminal</strong>
              Prompts are available only for detected Agents.
            </span>
          </div>
        ) : null}
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
              disabled={closing || !actionsEnabled}
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
