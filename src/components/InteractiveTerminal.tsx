import {
  ActivityLogIcon,
  ChatBubbleIcon,
  CopyIcon,
  EyeOpenIcon,
  FilePlusIcon,
  ImageIcon,
  MagnifyingGlassIcon,
  OpenInNewWindowIcon,
  ReloadIcon,
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
  UploadedFile,
  UploadedImage,
} from "../herdr-api";
import { MAX_GENERIC_FILE_BYTES } from "../herdr-api";
import {
  clampTerminalFontSize,
  DEFAULT_TERMINAL_FONT_SIZE,
} from "../terminal-preferences";
import { RadixDialog } from "./RadixDialog";
import {
  type TerminalDiagnostics,
  TerminalDiagnosticsDialog,
} from "./TerminalDiagnosticsDialog";
import { TerminalImageDialog } from "./TerminalImageDialog";
import type { ComposerDraft } from "./TerminalWorkspace";
import { terminalImageInput } from "./terminal-images";
import { useTerminalImages } from "./use-terminal-images";
import {
  initializeTerminalRenderer,
  waitForTerminalFonts,
} from "./xterm-renderer";

// This file intentionally keeps one terminal's xterm, WebSocket, input,
// diagnostics, search, and attachment lifecycle together because splitting
// those state machines would create competing owners for ordered input and teardown.
const RECONNECT_DELAYS = [500, 1_000, 2_000, 5_000];
const TERMINAL_LINK_PATTERN = /https?:\/\/[^\s"'<>]+|(?:~|\/)[^\s"'<>]*/gu;

function safeBrowserUrl(value: string): string | undefined {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:"
      ? url.toString()
      : undefined;
  } catch {
    return undefined;
  }
}

function terminalLinkAction(
  value: string,
): "browser" | "host-path" | undefined {
  if (safeBrowserUrl(value)) return "browser";
  if (value.startsWith("/") || value.startsWith("~/")) return "host-path";
  return undefined;
}

type TerminalStatus =
  | "connecting"
  | "control-conflict"
  | "error"
  | "exited"
  | "live"
  | "read-only"
  | "reconnecting";

interface InteractiveTerminalProps {
  accessibilityMode?: boolean;
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
  fontSize: number;
  onDraftChange: (agentId: string, update: Partial<ComposerDraft>) => void;
  onFontSizeChange: (fontSize: number) => void;
  onPrompt: (message: string) => Promise<unknown> | undefined;
  onUploadFile?: (paneId: string, file: File) => Promise<UploadedFile>;
  onUploadImage: (paneId: string, image: File) => Promise<UploadedImage>;
  paneId: string;
  protocol?: number;
  reducedMotion?: boolean;
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
  serverUnixMs?: number;
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
  | { requestId: string; type: "terminal.input-accepted" }
  | { type: "terminal.flow"; writable: boolean }
  | { id: string; serverUnixMs: number; type: "terminal.pong" };

function decodeBase64(value: string): Uint8Array {
  const binary = window.atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
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
  accessibilityMode = false,
  actionsEnabled,
  controlEnabled,
  structuredActionsEnabled,
  agentId,
  agentLabel,
  canPrompt,
  createTicket,
  draft,
  focused,
  fontSize,
  onDraftChange,
  onFontSizeChange,
  onPrompt,
  onUploadFile,
  onUploadImage,
  paneId,
  protocol = 0,
  reducedMotion = false,
  toolbarActions,
  toolbarContext,
}: InteractiveTerminalProps) {
  const host = useRef<HTMLDivElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const genericFileInput = useRef<HTMLInputElement>(null);
  const pasteSink = useRef<HTMLTextAreaElement>(null);
  const promptInput = useRef<HTMLTextAreaElement>(null);
  const searchInput = useRef<HTMLInputElement>(null);
  const terminalRef = useRef<Terminal | undefined>(undefined);
  const fitRef = useRef<FitAddon | undefined>(undefined);
  const scheduleFitRef = useRef<(() => void) | undefined>(undefined);
  const createTicketRef = useRef(createTicket);
  const fontSizeRef = useRef(fontSize);
  const onFontSizeChangeRef = useRef(onFontSizeChange);
  const lastSentSize = useRef("");
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
  const [searchCaseSensitive, setSearchCaseSensitive] = useState(false);
  const [searchWholeWord, setSearchWholeWord] = useState(false);
  const [searchRegex, setSearchRegex] = useState(false);
  const [promptOpen, setPromptOpen] = useState(false);
  const [promptSending, setPromptSending] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [selectionText, setSelectionText] = useState("");
  const [fileUploadError, setFileUploadError] = useState("");
  const [clipboardStatus, setClipboardStatus] = useState("");
  const [promptError, setPromptError] = useState("");
  const [ctrlArmed, setCtrlArmed] = useState(false);
  const [diagnosticsOpen, setDiagnosticsOpen] = useState(false);
  const [rendererKind, setRendererKind] = useState<"canvas" | "webgl">(
    "canvas",
  );
  const [dimensions, setDimensions] = useState({ cols: 80, rows: 24 });
  const [inputRoundTripMs, setInputRoundTripMs] = useState<number>();
  const [outputDeliveryMs, setOutputDeliveryMs] = useState<number>();
  const [reconnects, setReconnects] = useState(0);
  const [unicodeVersion, setUnicodeVersion] = useState("");
  const pendingPings = useRef(
    new Map<string, { performanceStarted: number; unixStarted: number }>(),
  );
  const serverClockOffset = useRef<number | undefined>(undefined);
  createTicketRef.current = createTicket;
  fontSizeRef.current = fontSize;
  onFontSizeChangeRef.current = onFontSizeChange;

  const send = useCallback((message: object): boolean => {
    const socket = socketRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return false;
    socket.send(JSON.stringify(message));
    return true;
  }, []);

  const imagePasteEnabled =
    focused &&
    structuredActionsEnabled &&
    sessionMode === "control" &&
    ["connecting", "live", "reconnecting"].includes(status);
  const insertImagePaths = useCallback(
    (paths: string[]) => {
      if (
        !writable.current ||
        !send({ data: terminalImageInput(paths), type: "terminal.input" })
      ) {
        return false;
      }
      terminalRef.current?.focus();
      return true;
    },
    [send],
  );
  const imageQueue = useTerminalImages({
    onInsert: insertImagePaths,
    onUpload: onUploadImage,
    paneId,
    pasteEnabled: imagePasteEnabled,
  });

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
      lastSentSize.current = "";
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
          const cols = Math.max(1, terminal.cols);
          const rows = Math.max(1, terminal.rows);
          if (send({ cols, rows, type: "terminal.resize" })) {
            lastSentSize.current = `${cols}x${rows}`;
          }
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
          if (message.type === "terminal.pong") {
            const started = pendingPings.current.get(message.id);
            pendingPings.current.delete(message.id);
            if (started) {
              const roundTrip = performance.now() - started.performanceStarted;
              setInputRoundTripMs(roundTrip);
              serverClockOffset.current =
                message.serverUnixMs -
                (started.unixStarted + (Date.now() - started.unixStarted) / 2);
            }
            return;
          }
          if (message.type === "terminal.input-accepted") {
            window.dispatchEvent(
              new CustomEvent("herdr-web:terminal-quick-reply-result", {
                detail: { accepted: true, requestId: message.requestId },
              }),
            );
            return;
          }
          if (message.type === "terminal.frame") {
            reconnectAttempt.current = 0;
            if (
              typeof message.serverUnixMs === "number" &&
              serverClockOffset.current !== undefined
            ) {
              const browserSentAt =
                message.serverUnixMs - serverClockOffset.current;
              setOutputDeliveryMs(Math.max(0, Date.now() - browserSentAt));
            }
            const scrollLine = terminal.buffer?.active?.viewportY ?? 0;
            if (message.full) terminal.reset();
            terminal.write(decodeBase64(message.bytes), () => {
              if (message.full && scrollLine > 0)
                terminal.scrollToLine(scrollLine);
            });
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
            setReconnects((current) => current + 1);
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
          setReconnects((current) => current + 1);
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
      allowProposedApi: true,
      convertEol: false,
      cursorBlink: true,
      cursorInactiveStyle: "outline",
      cursorStyle: "block",
      customGlyphs: true,
      fontFamily: '"JetBrains Mono", "Symbols Nerd Font Mono", monospace',
      fontSize: clampTerminalFontSize(fontSizeRef.current),
      fontWeight: "400",
      fontWeightBold: "600",
      lineHeight: 1.2,
      rescaleOverlappingGlyphs: true,
      screenReaderMode: accessibilityMode,
      scrollback: 5_000,
      smoothScrollDuration: reducedMotion ? 0 : 80,
      theme: {
        background: "#0c0c0c",
        black: "#171717",
        blue: "#3b9eff",
        brightBlack: "#6f6f6b",
        brightBlue: "#70b8ff",
        brightCyan: "#3db9cf",
        brightGreen: "#65ba75",
        brightMagenta: "#cf91d8",
        brightRed: "#ff8d85",
        brightWhite: "#eeeeec",
        brightYellow: "#ffe629",
        cursor: "#ffc53d",
        cursorAccent: "#0c0c0c",
        cyan: "#12a594",
        foreground: "#eeeeec",
        green: "#46a758",
        magenta: "#ab4aba",
        red: "#e5484d",
        selectionBackground: "#5c3d05aa",
        selectionInactiveBackground: "#5c3d0570",
        white: "#b4b4b0",
        yellow: "#f5d90a",
      },
    });
    const fit = new FitAddon();
    const searchAddon = new SearchAddon();
    terminal.loadAddon(fit);
    terminal.loadAddon(searchAddon);
    terminal.open(element);
    element.dataset.renderer = "canvas";
    const renderer = initializeTerminalRenderer(terminal, {
      onRendererChange: (kind) => {
        element.dataset.renderer = kind;
        element.dataset.unicodeVersion = terminal.unicode.activeVersion;
        setRendererKind(kind);
        setUnicodeVersion(terminal.unicode.activeVersion);
      },
    });
    terminalRef.current = terminal;
    void renderer.ready.then((kind) => {
      if (terminalRef.current !== terminal) return;
      element.dataset.renderer = kind;
      element.dataset.rendererReady = "true";
      element.dataset.unicodeVersion = terminal.unicode.activeVersion;
      setRendererKind(kind);
      setUnicodeVersion(terminal.unicode.activeVersion);
    });
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
      setDimensions({ cols, rows });
      if (!actionsEnabled || !writable.current) return;
      const size = `${cols}x${rows}`;
      if (size === lastSentSize.current) return;
      if (send({ cols, rows, type: "terminal.resize" })) {
        lastSentSize.current = size;
      }
    });
    const terminalWithOptionalLinks = terminal as Terminal & {
      onSelectionChange?: (callback: () => void) => { dispose(): void };
      registerLinkProvider?: Terminal["registerLinkProvider"];
    };
    const selection = terminalWithOptionalLinks.onSelectionChange?.(() => {
      setSelectionText(terminal.getSelection());
    }) ?? { dispose() {} };
    const links = terminalWithOptionalLinks.registerLinkProvider?.({
      provideLinks: (bufferLineNumber, callback) => {
        const line = terminal.buffer?.active
          ?.getLine(bufferLineNumber - 1)
          ?.translateToString(true);
        if (!line) {
          callback(undefined);
          return;
        }
        const found = Array.from(line.matchAll(TERMINAL_LINK_PATTERN)).flatMap(
          (match) => {
            const text = match[0];
            const action = terminalLinkAction(text);
            const index = match.index ?? -1;
            if (!action || index < 0) return [];
            return [
              {
                activate: () => {
                  if (action === "browser") {
                    window.open(
                      safeBrowserUrl(text),
                      "_blank",
                      "noopener,noreferrer",
                    );
                  } else {
                    void navigator.clipboard
                      ?.writeText(text)
                      .catch(() =>
                        setFileUploadError(
                          "The host path could not be copied.",
                        ),
                      );
                  }
                },
                range: {
                  end: { x: index + text.length + 1, y: bufferLineNumber },
                  start: { x: index + 1, y: bufferLineNumber },
                },
                text,
              },
            ];
          },
        );
        callback(found.length > 0 ? found : undefined);
      },
    }) ?? { dispose() {} };
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
        (event.metaKey || event.ctrlKey) &&
        !event.altKey &&
        ["+", "-", "0", "=", "_"].includes(event.key)
      ) {
        event.preventDefault();
        event.stopPropagation();
        const current = fontSizeRef.current;
        const next =
          event.key === "0"
            ? DEFAULT_TERMINAL_FONT_SIZE
            : clampTerminalFontSize(
                current + (["+", "="].includes(event.key) ? 1 : -1),
              );
        if (next !== current) {
          fontSizeRef.current = next;
          onFontSizeChangeRef.current(next);
        }
        terminal.focus();
        return false;
      }
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
        void navigator.clipboard
          ?.writeText(terminal.getSelection())
          .catch(() =>
            setFileUploadError("The terminal selection could not be copied."),
          );
        return false;
      }
      return true;
    });
    let fitFrame: number | undefined;
    let startFrame: number | undefined;
    let fitReady = false;
    let disposed = false;
    const fitTerminalNow = () => {
      try {
        fit.fit();
      } catch {
        // The terminal can be temporarily hidden while a responsive dialog moves focus.
      }
    };
    const scheduleFit = () => {
      if (!fitReady || disposed || fitFrame !== undefined) return;
      fitFrame = window.requestAnimationFrame(() => {
        fitFrame = undefined;
        fitTerminalNow();
      });
    };
    scheduleFitRef.current = scheduleFit;
    const observer =
      typeof ResizeObserver === "function"
        ? new ResizeObserver(scheduleFit)
        : undefined;
    observer?.observe(element);
    window.addEventListener("resize", scheduleFit);
    void Promise.all([
      waitForTerminalFonts(
        document.fonts,
        clampTerminalFontSize(fontSizeRef.current),
      ),
      renderer.unicodeReady,
    ]).then(() => {
      if (disposed) return;
      element.dataset.fonts = "ready";
      startFrame = window.requestAnimationFrame(() => {
        startFrame = undefined;
        if (disposed) return;
        fitReady = true;
        fitTerminalNow();
        void connectTerminal(controlEnabled ? "control" : "observe");
      });
    });
    return () => {
      disposed = true;
      connectGeneration.current += 1;
      closeSocket();
      if (fitFrame !== undefined) window.cancelAnimationFrame(fitFrame);
      if (startFrame !== undefined) window.cancelAnimationFrame(startFrame);
      window.removeEventListener("resize", scheduleFit);
      observer?.disconnect();
      data.dispose();
      resize.dispose();
      selection.dispose();
      links.dispose();
      renderer.dispose();
      terminal.dispose();
      terminalRef.current = undefined;
      fitRef.current = undefined;
      scheduleFitRef.current = undefined;
      searchRef.current = undefined;
    };
  }, [
    accessibilityMode,
    actionsEnabled,
    closeSocket,
    connectTerminal,
    controlEnabled,
    reducedMotion,
    send,
  ]);

  useEffect(() => {
    const terminal = terminalRef.current;
    if (!terminal) return;
    const next = clampTerminalFontSize(fontSize);
    if (terminal.options.fontSize !== next) terminal.options.fontSize = next;
    scheduleFitRef.current?.();
  }, [fontSize]);

  useEffect(() => {
    if (searchOpen) searchInput.current?.focus();
  }, [searchOpen]);

  useEffect(() => {
    if (status !== "live" && status !== "read-only") return;
    const ping = () => {
      const id = crypto.randomUUID?.() ?? `${Date.now()}`;
      pendingPings.current.set(id, {
        performanceStarted: performance.now(),
        unixStarted: Date.now(),
      });
      if (!send({ id, type: "terminal.ping" })) pendingPings.current.delete(id);
    };
    ping();
    const timer = window.setInterval(ping, 10_000);
    return () => {
      window.clearInterval(timer);
      pendingPings.current.clear();
    };
  }, [send, status]);

  useEffect(() => {
    const onTerminalAction = (event: Event) => {
      const detail = (
        event as CustomEvent<{
          action?: string;
          message?: string;
          paneId?: string;
          requestId?: string;
        }>
      ).detail;
      if (!focused || (detail.paneId && detail.paneId !== paneId)) return;
      if (detail.action === "quick-reply" && detail.requestId) {
        const accepted =
          typeof detail.message === "string" &&
          writable.current &&
          send({
            data: `${detail.message}\r`,
            requestId: detail.requestId,
            type: "terminal.input",
          });
        if (!accepted) {
          window.dispatchEvent(
            new CustomEvent("herdr-web:terminal-quick-reply-result", {
              detail: { accepted: false, requestId: detail.requestId },
            }),
          );
        }
      } else if (detail.action === "search") setSearchOpen(true);
      else if (
        detail.action === "prompt" &&
        canPrompt &&
        structuredActionsEnabled
      ) {
        setPromptOpen(true);
      } else if (detail.action === "take-control" && controlEnabled) {
        void connectTerminal("control", true);
      } else if (detail.action === "diagnostics") {
        setDiagnosticsOpen(true);
      }
    };
    window.addEventListener("herdr-web:terminal-action", onTerminalAction);
    return () =>
      window.removeEventListener("herdr-web:terminal-action", onTerminalAction);
  }, [
    canPrompt,
    connectTerminal,
    controlEnabled,
    focused,
    paneId,
    send,
    structuredActionsEnabled,
  ]);

  useEffect(() => {
    if (!actionsEnabled) {
      closeSocket();
      setStatus("reconnecting");
    }
  }, [actionsEnabled, closeSocket]);

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
    if (!imagePasteEnabled || status !== "live") return;
    imageQueue.stageTransfer(event.dataTransfer);
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

  const canUploadImages =
    structuredActionsEnabled && sessionMode === "control" && status === "live";
  const canUploadFiles =
    canUploadImages && Boolean(onUploadFile) && !fileUploading;

  const uploadGenericFile = async (file: File | undefined) => {
    if (!file || !canUploadFiles) return;
    setFileUploadError("");
    if (file.size === 0 || file.size > MAX_GENERIC_FILE_BYTES) {
      setFileUploadError("File size must be between 1 byte and 16 MiB.");
      return;
    }
    setFileUploading(true);
    try {
      const uploaded = await onUploadFile?.(paneId, file);
      if (!uploaded?.path)
        throw new Error("The bridge did not return a file path.");
      if (!insertImagePaths([uploaded.path])) {
        setFileUploadError(
          "The file was uploaded, but its path could not be inserted because this terminal is not writable.",
        );
      }
    } catch (error) {
      setFileUploadError(
        error instanceof Error ? error.message : "File upload failed.",
      );
    } finally {
      setFileUploading(false);
    }
  };

  const searchOptions = {
    caseSensitive: searchCaseSensitive,
    regex: searchRegex,
    wholeWord: searchWholeWord,
  };

  const runSearch = (direction: "next" | "previous", value = search) => {
    if (!value) return;
    if (direction === "previous")
      searchRef.current?.findPrevious(value, searchOptions);
    else searchRef.current?.findNext(value, searchOptions);
  };

  const openDetachedPane = () => {
    const url = new URL(window.location.href);
    url.searchParams.set("session", agentId);
    url.searchParams.set("pane", paneId);
    url.searchParams.set("detached", "1");
    const opened = window.open(
      url,
      `herdr-pane-${paneId}`,
      "popup,noopener,noreferrer",
    );
    if (!opened)
      setError("The detached pane window was blocked by the browser.");
  };

  const diagnostics: TerminalDiagnostics = {
    accessMode: sessionMode,
    cols: dimensions.cols,
    inputRoundTripMs,
    outputDeliveryMs,
    protocol,
    reconnects,
    renderer: rendererKind,
    rows: dimensions.rows,
    status: statusLabel(status),
    unicodeVersion,
  };

  const searchKey = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Escape") {
      setSearchOpen(false);
      terminalRef.current?.focus();
      return;
    }
    if (event.key === "Enter" && event.shiftKey) {
      runSearch("previous");
    } else if (event.key === "Enter") {
      runSearch("next");
    }
  };

  return (
    <section
      className="interactive-terminal"
      data-font-size={fontSize}
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
          <button
            type="button"
            aria-label="Terminal diagnostics"
            onClick={() => setDiagnosticsOpen(true)}
          >
            <ActivityLogIcon />
          </button>
          <input
            ref={fileInput}
            className="composer-file-input"
            type="file"
            accept="image/png,image/jpeg,image/gif,image/webp"
            aria-label="Choose images for terminal"
            multiple
            onChange={(event) => {
              imageQueue.stage(Array.from(event.currentTarget.files ?? []));
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            aria-label="Insert image path"
            disabled={!canUploadImages}
            onClick={() => fileInput.current?.click()}
          >
            <ImageIcon />
          </button>
          <input
            ref={genericFileInput}
            className="composer-file-input"
            type="file"
            aria-label="Choose file for terminal"
            onChange={(event) => {
              void uploadGenericFile(
                event.currentTarget.files?.item(0) ?? undefined,
              );
              event.currentTarget.value = "";
            }}
          />
          <button
            type="button"
            aria-label="Upload file and insert path"
            disabled={!canUploadFiles}
            onClick={() => genericFileInput.current?.click()}
          >
            <FilePlusIcon />
          </button>
          <button
            type="button"
            aria-label="Detach pane"
            onClick={openDetachedPane}
          >
            <OpenInNewWindowIcon />
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
        <search className="terminal-search">
          <label>
            <span className="sr-only">Search terminal output</span>
            <MagnifyingGlassIcon aria-hidden="true" />
            <input
              ref={searchInput}
              value={search}
              placeholder="Search terminal"
              onChange={(event) => {
                setSearch(event.target.value);
                searchRef.current?.findNext(event.target.value, {
                  ...searchOptions,
                  incremental: true,
                });
              }}
              onKeyDown={searchKey}
            />
          </label>
          <button type="button" onClick={() => runSearch("previous")}>
            Previous
          </button>
          <button type="button" onClick={() => runSearch("next")}>
            Next
          </button>
          <label>
            <input
              type="checkbox"
              checked={searchCaseSensitive}
              onChange={(event) => setSearchCaseSensitive(event.target.checked)}
            />
            Case
          </label>
          <label>
            <input
              type="checkbox"
              checked={searchWholeWord}
              onChange={(event) => setSearchWholeWord(event.target.checked)}
            />
            Word
          </label>
          <label>
            <input
              type="checkbox"
              checked={searchRegex}
              onChange={(event) => setSearchRegex(event.target.checked)}
            />
            Regex
          </label>
          <span>Enter next · Shift+Enter previous · Esc close</span>
        </search>
      )}
      {selectionText && (
        <div
          className="terminal-selection-toolbar"
          role="toolbar"
          aria-label="Terminal selection actions"
        >
          <span>{selectionText.length.toLocaleString()} selected</span>
          <button
            type="button"
            onClick={() => {
              setClipboardStatus("");
              void navigator.clipboard
                ?.writeText(selectionText)
                .then(() => {
                  setClipboardStatus("Terminal selection copied");
                  window.setTimeout(() => setClipboardStatus(""), 1_500);
                })
                .catch(() =>
                  setFileUploadError(
                    "The terminal selection could not be copied.",
                  ),
                );
            }}
          >
            <CopyIcon /> Copy
          </button>
          <button
            type="button"
            onClick={() => {
              setSearch(selectionText);
              setSearchOpen(true);
              searchRef.current?.findNext(selectionText, searchOptions);
            }}
          >
            <MagnifyingGlassIcon /> Search
          </button>
          {canPrompt && (
            <button
              type="button"
              disabled={!structuredActionsEnabled}
              onClick={() => {
                onDraftChange(agentId, { message: selectionText });
                setPromptOpen(true);
              }}
            >
              <ChatBubbleIcon /> Prompt
            </button>
          )}
        </div>
      )}
      <span className="sr-only" aria-live="polite">
        {clipboardStatus}
      </span>
      {fileUploadError && (
        <div className="terminal-inline-error" role="alert">
          {fileUploadError}
        </div>
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

      <TerminalDiagnosticsDialog
        diagnostics={diagnostics}
        open={diagnosticsOpen}
        onOpenChange={setDiagnosticsOpen}
      />

      <TerminalImageDialog
        batch={imageQueue.batch}
        busy={imageQueue.busy}
        canRequestControl={
          controlEnabled &&
          focused &&
          status !== "connecting" &&
          status !== "reconnecting"
        }
        canUpload={canUploadImages}
        controlActive={sessionMode === "control"}
        terminalReady={status === "live"}
        onCancel={imageQueue.reset}
        onCloseAutoFocus={() => terminalRef.current?.focus()}
        onRemove={imageQueue.remove}
        onRequestControl={() =>
          void connectTerminal("control", status === "control-conflict")
        }
        onSubmit={() => void imageQueue.submit()}
      />

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
