import {
  ChatBubbleIcon,
  EyeOpenIcon,
  ImageIcon,
  MagnifyingGlassIcon,
  ReloadIcon,
  UploadIcon,
} from "@radix-ui/react-icons";
import { Button } from "@radix-ui/themes";
import { FitAddon } from "@xterm/addon-fit";
import { SearchAddon } from "@xterm/addon-search";
import { Terminal } from "@xterm/xterm";
import {
  type ClipboardEvent,
  type DragEvent,
  type FormEvent,
  type KeyboardEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import type {
  TerminalTicket,
  TerminalTicketInput,
  UploadedImage,
} from "../herdr-api";
import { RadixDialog } from "./RadixDialog";
import type { ComposerDraft } from "./TerminalWorkspace";

const RECONNECT_DELAYS = [500, 1_000, 2_000, 5_000];

type TerminalStatus =
  | "connecting"
  | "control-conflict"
  | "error"
  | "exited"
  | "live"
  | "read-only"
  | "reconnecting";

interface InteractiveTerminalProps {
  actionsEnabled: boolean;
  controlEnabled: boolean;
  structuredActionsEnabled: boolean;
  agentId: string;
  agentLabel: string;
  canPrompt: boolean;
  createTicket: (
    paneId: string,
    input: TerminalTicketInput,
  ) => Promise<TerminalTicket>;
  draft: ComposerDraft;
  focused: boolean;
  onDraftChange: (agentId: string, update: Partial<ComposerDraft>) => void;
  onPrompt: (message: string) => Promise<unknown> | undefined;
  onUploadImage: (paneId: string, image: File) => Promise<UploadedImage>;
  paneId: string;
  toolbarActions?: ReactNode;
  toolbarContext?: ReactNode;
}

interface TerminalFrame {
  bytes: string;
  encoding: "ansi";
  full: boolean;
  height: number;
  seq: number;
  type: "terminal.frame";
  width: number;
}

interface TerminalError {
  code: string;
  message: string;
  recoverable: boolean;
  type: "terminal.error";
}

type TerminalMessage =
  | TerminalFrame
  | TerminalError
  | { reason?: string | null; type: "terminal.closed" }
  | { type: "terminal.flow"; writable: boolean };

function decodeBase64(value: string): Uint8Array {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function imageFromClipboard(data: DataTransfer): File | undefined {
  const direct = Array.from(data.files).find(({ type }) =>
    type.startsWith("image/"),
  );
  if (direct) return direct;
  for (const item of Array.from(data.items)) {
    if (item.kind !== "file" || !item.type.startsWith("image/")) continue;
    const file = item.getAsFile();
    if (file) return file;
  }
  return undefined;
}

async function imageFromClipboardApi(): Promise<File | undefined> {
  if (typeof navigator.clipboard?.read !== "function") return undefined;
  try {
    const items = await navigator.clipboard.read();
    for (const item of items) {
      const mediaType = item.types.find((type) => type.startsWith("image/"));
      if (!mediaType) continue;
      const blob = await item.getType(mediaType);
      const extension =
        mediaType.split("/")[1]?.replace("jpeg", "jpg") || "png";
      return new File([blob], `clipboard-image.${extension}`, {
        type: mediaType,
      });
    }
  } catch {
    // Native paste data remains the primary path when Clipboard API access is unavailable.
  }
  return undefined;
}

function shellEscapePath(path: string): string {
  return `'${path.replaceAll("'", `'"'"'`)}'`;
}

function controlConflict(reason: string): boolean {
  return /already|controller|control|owned|owner|takeover/i.test(reason);
}

function statusLabel(status: TerminalStatus): string {
  switch (status) {
    case "connecting":
      return "Connecting terminal";
    case "control-conflict":
      return "Control is held elsewhere";
    case "error":
      return "Terminal unavailable";
    case "exited":
      return "Terminal exited";
    case "live":
      return "Interactive";
    case "read-only":
      return "Watching";
    case "reconnecting":
      return "Reconnecting terminal";
  }
}

export function InteractiveTerminal({
  actionsEnabled,
  controlEnabled,
  structuredActionsEnabled,
  agentId,
  agentLabel,
  canPrompt,
  createTicket,
  draft,
  focused,
  onDraftChange,
  onPrompt,
  onUploadImage,
  paneId,
  toolbarActions,
  toolbarContext,
}: InteractiveTerminalProps) {
  const host = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const pasteSink = useRef<HTMLTextAreaElement>(null);
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<Terminal | undefined>(undefined);
  const fitRef = useRef<FitAddon | undefined>(undefined);
  const createTicketRef = useRef(createTicket);
  const searchRef = useRef<SearchAddon | undefined>(undefined);
  const socketRef = useRef<WebSocket | undefined>(undefined);
  const connectGeneration = useRef(0);
  const connectingRef = useRef(false);
  const connectRef = useRef<
    | ((
        mode?: "control" | "observe",
        takeover?: boolean,
        reconnecting?: boolean,
      ) => Promise<void>)
    | undefined
  >(undefined);
  const reconnectAttempt = useRef(0);
  const reconnectTimer = useRef<number | undefined>(undefined);
  const stopReason = useRef<"manual" | "terminal" | undefined>(undefined);
  const flowWritable = useRef(true);
  const writable = useRef(false);
  const ctrlArmedRef = useRef(false);
  const modeRef = useRef<"control" | "observe">("control");
  const [status, setStatus] = useState<TerminalStatus>("connecting");
  const [sessionMode, setSessionMode] = useState<"control" | "observe">(
    "control",
  );
  const [error, setError] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [image, setImage] = useState<File>();
  const [imageError, setImageError] = useState("");
  const [imagePath, setImagePath] = useState("");
  const [imageUploading, setImageUploading] = useState(false);
  const [previewUrl, setPreviewUrl] = useState("");
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptSending, setPromptSending] = useState(false);
  const [promptError, setPromptError] = useState("");
  const [ctrlArmed, setCtrlArmed] = useState(false);
  createTicketRef.current = createTicket;

  const send = useCallback((message: object): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const closeSocket = useCallback(() => {
    stopReason.current = "manual";
    window.clearTimeout(reconnectTimer.current);
    const socket = socketRef.current;
    socketRef.current = undefined;
    if (socket?.readyState === WebSocket.OPEN) {
      socket.send(JSON.stringify({ type: "terminal.release" }));
      socket.close(1000, "terminal released");
    } else {
      socket?.close();
    }
    writable.current = false;
    ctrlArmedRef.current = false;
    connectingRef.current = false;
  }, []);

  const connectTerminal = useCallback(
    async (
      mode: "control" | "observe" = "control",
      takeover = false,
      reconnecting = false,
    ) => {
      const terminal = terminalRef.current;
      if (!terminal || !actionsEnabled || connectingRef.current) return;
      connectingRef.current = true;
      const previousSocket = socketRef.current;
      if (previousSocket) {
        stopReason.current = "manual";
        previousSocket.close(1000, "terminal replaced");
        socketRef.current = undefined;
      }
      const generation = ++connectGeneration.current;
      stopReason.current = undefined;
      modeRef.current = mode;
      setSessionMode(mode);
      flowWritable.current = true;
      writable.current = false;
      ctrlArmedRef.current = false;
      setCtrlArmed(false);
      setError("");
      setStatus(reconnecting ? "reconnecting" : "connecting");
      try {
        fitRef.current?.fit();
        const ticket = await createTicketRef.current(paneId, {
          cols: Math.max(1, terminal.cols),
          mode,
          rows: Math.max(1, terminal.rows),
          takeover,
        });
        if (generation !== connectGeneration.current) return;
        const url = new URL(ticket.path, window.location.href);
        url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
        url.search = new URLSearchParams({ ticket: ticket.ticket }).toString();
        const socket = new WebSocket(url);
        socketRef.current = socket;
        connectingRef.current = false;
        socket.onopen = () => {
          if (generation !== connectGeneration.current || mode !== "control") {
            return;
          }
          send({
            cols: Math.max(1, terminal.cols),
            rows: Math.max(1, terminal.rows),
            type: "terminal.resize",
          });
        };
        socket.onmessage = (event) => {
          if (generation !== connectGeneration.current) return;
          let message: TerminalMessage;
          try {
            message = JSON.parse(String(event.data)) as TerminalMessage;
          } catch {
            stopReason.current = "terminal";
            setError("The bridge returned invalid terminal data.");
            setStatus("error");
            socket.close();
            return;
          }
          if (message.type === "terminal.frame") {
            reconnectAttempt.current = 0;
            if (message.full) terminal.reset();
            terminal.write(decodeBase64(message.bytes));
            writable.current = mode === "control" && flowWritable.current;
            setStatus(mode === "control" ? "live" : "read-only");
            return;
          }
          if (message.type === "terminal.flow") {
            flowWritable.current = message.writable;
            writable.current = message.writable && mode === "control";
            return;
          }
          if (message.type === "terminal.closed") {
            const reason =
              message.reason?.trim() || "The terminal session ended.";
            stopReason.current = "terminal";
            writable.current = false;
            setError(reason);
            setStatus(controlConflict(reason) ? "control-conflict" : "exited");
            return;
          }
          setError(message.message);
          if (
            ["terminal_output_backpressure", "terminal_sequence_gap"].includes(
              message.code,
            )
          ) {
            stopReason.current = "manual";
            writable.current = false;
            setStatus("reconnecting");
            socket.close(1012, "terminal resynchronization required");
            reconnectTimer.current = window.setTimeout(
              () => void connectRef.current?.(mode, false, true),
              RECONNECT_DELAYS[0],
            );
            return;
          }
          if (
            ![
              "invalid_terminal_json",
              "invalid_terminal_message",
              "terminal_backpressure",
            ].includes(message.code)
          ) {
            stopReason.current = "terminal";
            writable.current = false;
            setStatus("error");
          }
        };
        socket.onclose = (event) => {
          if (generation !== connectGeneration.current) return;
          socketRef.current = undefined;
          writable.current = false;
          if (stopReason.current) return;
          if (!actionsEnabled || event.code === 1000) return;
          const delay =
            RECONNECT_DELAYS[
              Math.min(reconnectAttempt.current, RECONNECT_DELAYS.length - 1)
            ] ?? 5_000;
          reconnectAttempt.current += 1;
          setStatus("reconnecting");
          reconnectTimer.current = window.setTimeout(
            () => void connectRef.current?.(mode, false, true),
            delay,
          );
        };
        socket.onerror = () => {
          if (generation !== connectGeneration.current) return;
          setError("The terminal stream could not connect.");
        };
      } catch (requestError) {
        connectingRef.current = false;
        if (generation !== connectGeneration.current) return;
        setError(
          requestError instanceof Error
            ? requestError.message
            : "The terminal stream could not connect.",
        );
        setStatus("error");
      }
    },
    [actionsEnabled, paneId, send],
  );
  connectRef.current = connectTerminal;

  useLayoutEffect(() => {
    const element = host.current;
    if (!element) return;
    const terminal = new Terminal({
      allowProposedApi: false,
      convertEol: false,
      cursorBlink: true,
      cursorStyle: "block",
      fontFamily: '"JetBrains Mono", "Symbols Nerd Font Mono", monospace',
      fontSize: 13,
      lineHeight: 1.2,
      screenReaderMode: true,
      scrollback: 5_000,
      theme: {
        background: "#0c0c0c",
        cursor: "#ffc53d",
        foreground: "#eeeeec",
        selectionBackground: "#5c3d0577",
      },
    });
    const fit = new FitAddon();
    const searchAddon = new SearchAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(searchAddon);
    terminal.open(element);
    terminalRef.current = terminal;
    fitRef.current = fit;
    searchRef.current = searchAddon;
    const data = terminal.onData((value) => {
      if (!actionsEnabled || !writable.current) return;
      let terminalInput = value;
      if (ctrlArmedRef.current) {
        ctrlArmedRef.current = false;
        setCtrlArmed(false);
        if (value.length === 1) {
          const code = value.toUpperCase().charCodeAt(0);
          if (code >= 64 && code <= 95) {
            terminalInput = String.fromCharCode(code - 64);
          }
        }
      }
      send({ data: terminalInput, type: "terminal.input" });
    });
    const resize = terminal.onResize(({ cols, rows }) => {
      if (!actionsEnabled || !writable.current) return;
      send({ cols, rows, type: "terminal.resize" });
    });
    terminal.attachCustomWheelEventHandler((event) => {
      if (!actionsEnabled || !writable.current || event.deltaY === 0)
        return true;
      send({
        direction: event.deltaY < 0 ? "up" : "down",
        lines: Math.max(
          1,
          Math.min(20, Math.ceil(Math.abs(event.deltaY) / 24)),
        ),
        type: "terminal.scroll",
      });
      return false;
    });
    terminal.attachCustomKeyEventHandler((event) => {
      if (
        event.type === "keydown" &&
        event.shiftKey &&
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === "f"
      ) {
        setSearchOpen(true);
        return false;
      }
      if (
        event.type === "keydown" &&
        terminal.hasSelection() &&
        ((event.metaKey && event.key.toLowerCase() === "c") ||
          (event.ctrlKey && event.shiftKey && event.key.toLowerCase() === "c"))
      ) {
        void navigator.clipboard?.writeText(terminal.getSelection());
        return false;
      }
      return true;
    });
    const fitTerminal = () => {
      try {
        fit.fit();
      } catch {
        // The terminal can be temporarily hidden while a responsive dialog moves focus.
      }
    };
    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(fitTerminal)
        : undefined;
    observer?.observe(element);
    window.addEventListener("resize", fitTerminal);
    const frame = window.requestAnimationFrame(() => {
      fitTerminal();
      void connectTerminal(controlEnabled ? "control" : "observe");
    });
    return () => {
      connectGeneration.current += 1;
      closeSocket();
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", fitTerminal);
      observer?.disconnect();
      data.dispose();
      resize.dispose();
      terminal.dispose();
      terminalRef.current = undefined;
      fitRef.current = undefined;
      searchRef.current = undefined;
    };
  }, [actionsEnabled, closeSocket, connectTerminal, controlEnabled, send]);

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (!actionsEnabled) {
      closeSocket();
      setStatus("reconnecting");
    }
  }, [actionsEnabled, closeSocket]);

  useEffect(() => {
    if (!image || typeof URL.createObjectURL !== "function") {
      setPreviewUrl("");
      return;
    }
    const url = URL.createObjectURL(image);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [image]);

  const stageImage = useCallback((file: File) => {
    if (!file.type.startsWith("image/")) {
      setImageError("Choose an image file.");
      return;
    }
    setImage(file);
    setImageError("");
    setImagePath("");
  }, []);

  const imagePasteEnabled =
    focused &&
    structuredActionsEnabled &&
    sessionMode === "control" &&
    ["connecting", "live", "reconnecting"].includes(status);

  useEffect(() => {
    let active = true;
    const pasteImage = (event: globalThis.ClipboardEvent) => {
      if (!imagePasteEnabled) return;
      const file = event.clipboardData
        ? imageFromClipboard(event.clipboardData)
        : undefined;
      if (file) {
        event.preventDefault();
        event.stopPropagation();
        stageImage(file);
        return;
      }
      if (!event.clipboardData?.types?.length) {
        void imageFromClipboardApi().then((fallback) => {
          if (active && fallback) stageImage(fallback);
        });
      }
    };
    window.addEventListener("paste", pasteImage, true);
    return () => {
      active = false;
      window.removeEventListener("paste", pasteImage, true);
    };
  }, [imagePasteEnabled, stageImage]);

  useEffect(() => {
    const redirectTerminalPaste = (event: globalThis.KeyboardEvent) => {
      const activeElement = document.activeElement;
      if (
        event.key.toLowerCase() !== "v" ||
        (!event.metaKey && !event.ctrlKey) ||
        event.altKey ||
        !imagePasteEnabled ||
        !activeElement ||
        !host.current?.contains(activeElement)
      ) {
        return;
      }
      pasteSink.current?.focus({ preventScroll: true });
      event.stopPropagation();
    };
    window.addEventListener("keydown", redirectTerminalPaste, true);
    return () =>
      window.removeEventListener("keydown", redirectTerminalPaste, true);
  }, [imagePasteEnabled]);

  const pasteTextFromSink = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    event.preventDefault();
    event.stopPropagation();
    const text = event.clipboardData.getData("text/plain");
    if (text) terminalRef.current?.paste(text);
    event.currentTarget.value = "";
    terminalRef.current?.focus();
  };

  const drop = (event: DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (!structuredActionsEnabled || status !== "live") return;
    const file = imageFromClipboard(event.dataTransfer);
    if (file) stageImage(file);
  };

  const insertUploadedPath = (path: string): boolean => {
    if (
      !writable.current ||
      !send({ data: shellEscapePath(path), type: "terminal.input" })
    ) {
      setImageError(
        `Uploaded to ${path}, but the path could not be inserted because this terminal is not writable.`,
      );
      return false;
    }
    setImage(undefined);
    setImagePath("");
    terminalRef.current?.focus();
    return true;
  };

  const insertImage = async () => {
    if (!image || imageUploading) return;
    setImageUploading(true);
    setImageError("");
    try {
      const uploaded = await onUploadImage(paneId, image);
      setImagePath(uploaded.path);
      insertUploadedPath(uploaded.path);
    } catch (uploadError) {
      setImageError(
        uploadError instanceof Error
          ? uploadError.message
          : "Image upload failed.",
      );
    } finally {
      setImageUploading(false);
    }
  };

  const submitPrompt = async (event: FormEvent) => {
    event.preventDefault();
    const message = draft.message.trim();
    if (!message || promptSending) return;
    setPromptSending(true);
    setPromptError("");
    try {
      await onPrompt(message);
      onDraftChange(agentId, { message: "", sendError: "" });
      setPromptOpen(false);
    } catch (promptFailure) {
      setPromptError(
        promptFailure instanceof Error
          ? promptFailure.message
          : "Prompt failed.",
      );
    } finally {
      setPromptSending(false);
    }
  };

  const searchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setSearchOpen(false);
      terminalRef.current?.focus();
      return;
    }
    if (event.key === "Enter" && event.shiftKey) {
      searchRef.current?.findPrevious(search);
    } else if (event.key === "Enter") {
      searchRef.current?.findNext(search);
    }
  };

  return (
    <section
      className="interactive-terminal"
      data-status={status}
      aria-label={`${agentLabel} terminal controls`}
      onDragOver={(event) => event.preventDefault()}
      onDrop={drop}
    >
      <div className="interactive-terminal-tools">
        <span className="terminal-toolbar-context">
          {toolbarContext}
          <span className="interactive-terminal-state" role="status">
            <i aria-hidden="true" /> {statusLabel(status)}
          </span>
        </span>
        <span className="interactive-terminal-actions">
          {toolbarActions}
          <button
            type="button"
            aria-label="Search terminal"
            onClick={() => setSearchOpen((open) => !open)}
          >
            <MagnifyingGlassIcon />
          </button>
          <input
            ref={fileInput}
            className="composer-file-input"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            aria-label="Choose image for terminal"
            onChange={(event) => {
              const file = event.currentTarget.files?.item(0);
              if (file) stageImage(file);
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            aria-label="Insert image path"
            disabled={!structuredActionsEnabled || status !== "live"}
            onClick={() => fileInput.current?.click()}
          >
            <ImageIcon />
          </button>
          {canPrompt && (
            <button
              type="button"
              aria-label="Prompt Agent"
              disabled={!structuredActionsEnabled}
              onClick={() => setPromptOpen(true)}
            >
              <ChatBubbleIcon />
            </button>
          )}
        </span>
      </div>
      <div
        className="terminal-mobile-keys"
        aria-label="Mobile terminal keys"
        role="toolbar"
      >
        <button
          type="button"
          disabled={!actionsEnabled || !controlEnabled || status !== "live"}
          onClick={() => {
            send({ data: "\u001b", type: "terminal.input" });
            terminalRef.current?.focus();
          }}
        >
          Esc
        </button>
        <button
          type="button"
          aria-pressed={ctrlArmed}
          disabled={!actionsEnabled || !controlEnabled || status !== "live"}
          onClick={() => {
            ctrlArmedRef.current = !ctrlArmedRef.current;
            setCtrlArmed(ctrlArmedRef.current);
            terminalRef.current?.focus();
          }}
        >
          Ctrl
        </button>
        <button
          type="button"
          disabled={!actionsEnabled || !controlEnabled || status !== "live"}
          onClick={() => {
            send({ data: "\t", type: "terminal.input" });
            terminalRef.current?.focus();
          }}
        >
          Tab
        </button>
      </div>
      {searchOpen && (
        <label className="terminal-search">
          <span className="sr-only">Search terminal output</span>
          <MagnifyingGlassIcon aria-hidden="true" />
          <input
            ref={searchInput}
            value={search}
            placeholder="Search terminal"
            onChange={(event) => {
              setSearch(event.target.value);
              searchRef.current?.findNext(event.target.value, {
                incremental: true,
              });
            }}
            onKeyDown={searchKey}
          />
          <span>Enter next · Shift+Enter previous · Esc close</span>
        </label>
      )}
      <textarea
        ref={pasteSink}
        className="terminal-paste-sink"
        aria-label="Terminal paste catcher"
        tabIndex={-1}
        onPaste={pasteTextFromSink}
      />
      <section
        ref={host}
        className="xterm-host"
        aria-label={`${agentLabel} interactive terminal`}
      />
      {(status === "connecting" || status === "reconnecting") && (
        <div className="terminal-state-overlay" role="status">
          <ReloadIcon aria-hidden="true" />
          <span>{statusLabel(status)}…</span>
        </div>
      )}
      {(status === "error" ||
        status === "exited" ||
        status === "control-conflict") && (
        <div
          className="terminal-state-overlay terminal-state-action"
          role="alert"
        >
          <strong>{statusLabel(status)}</strong>
          <span>{error}</span>
          <div>
            {status === "control-conflict" && (
              <>
                <Button
                  type="button"
                  size="1"
                  variant="soft"
                  onClick={() => void connectTerminal("observe")}
                >
                  <EyeOpenIcon /> Watch read-only
                </Button>
                <Button
                  type="button"
                  size="1"
                  color="amber"
                  onClick={() => void connectTerminal("control", true)}
                >
                  Take control
                </Button>
              </>
            )}
            {status !== "control-conflict" && (
              <Button
                type="button"
                size="1"
                variant="soft"
                onClick={() => void connectTerminal(modeRef.current)}
              >
                <ReloadIcon /> Reconnect
              </Button>
            )}
          </div>
        </div>
      )}

      <RadixDialog
        open={Boolean(image)}
        onOpenChange={(open) => {
          if (!open && !imageUploading) {
            setImage(undefined);
            setImageError("");
            setImagePath("");
          }
        }}
        title="Insert image path"
        description="Review the image before uploading it to the active pane directory. Hedr inserts the path without pressing Enter."
        className="terminal-image-dialog"
        onCloseAutoFocus={() => terminalRef.current?.focus()}
      >
        <div className="terminal-image-preview">
          {previewUrl && (
            <img
              src={previewUrl}
              alt={`Preview of ${image?.name ?? "upload"}`}
            />
          )}
          <strong>{image?.name}</strong>
          {imagePath && <code>{imagePath}</code>}
          {imageError && <span role="alert">{imageError}</span>}
          {!imageError && !structuredActionsEnabled && (
            <span role="status">
              Image ready. Controller access is required before uploading.
            </span>
          )}
          {!imageError && structuredActionsEnabled && status !== "live" && (
            <span role="status">
              Image ready. Wait for an Interactive terminal before uploading.
            </span>
          )}
          {imagePath && (
            <Button
              type="button"
              variant="soft"
              onClick={() => void navigator.clipboard?.writeText(imagePath)}
            >
              Copy uploaded path
            </Button>
          )}
          <div className="form-actions">
            <Button
              type="button"
              variant="soft"
              color="gray"
              disabled={imageUploading}
              onClick={() => setImage(undefined)}
            >
              Cancel
            </Button>
            {imagePath ? (
              <Button
                type="button"
                size="2"
                variant="solid"
                color="amber"
                highContrast
                disabled={status !== "live"}
                onClick={() => insertUploadedPath(imagePath)}
              >
                Insert uploaded path
              </Button>
            ) : (
              <Button
                type="button"
                size="2"
                variant="solid"
                color="amber"
                highContrast
                disabled={
                  imageUploading ||
                  !structuredActionsEnabled ||
                  status !== "live"
                }
                onClick={() => void insertImage()}
              >
                <UploadIcon aria-hidden="true" />
                {imageUploading ? "Uploading…" : "Upload and insert path"}
              </Button>
            )}
          </div>
        </div>
      </RadixDialog>

      <RadixDialog
        open={promptOpen}
        onOpenChange={(open) => {
          if (!promptSending) setPromptOpen(open);
        }}
        title={`Prompt ${agentLabel}`}
        description="Send a structured Herdr Agent prompt instead of typing in the terminal."
        className="terminal-prompt-dialog"
        initialFocusRef={promptInput}
      >
        <form className="terminal-prompt-form" onSubmit={submitPrompt}>
          <label>
            <span>Instruction</span>
            <textarea
              ref={promptInput}
              rows={5}
              maxLength={20_000}
              value={draft.message}
              disabled={promptSending}
              onChange={(event) =>
                onDraftChange(agentId, {
                  message: event.target.value,
                  sendError: "",
                })
              }
            />
          </label>
          {promptError && <span role="alert">{promptError}</span>}
          <div className="form-actions">
            <Button
              type="button"
              variant="soft"
              color="gray"
              disabled={promptSending}
              onClick={() => setPromptOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              color="amber"
              disabled={promptSending || !draft.message.trim()}
            >
              {promptSending ? "Sending…" : "Send structured prompt"}
            </Button>
          </div>
        </form>
      </RadixDialog>
    </section>
  );
}
