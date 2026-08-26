import type { LiveSnapshotPayload } from "./live-state";
import { readProductStorage, writeProductStorage } from "./product-storage";
import type { PaneSplitDirection, RuntimeName } from "./state";
import type { WorkflowTemplate } from "./workflow-templates";

interface ApiErrorBody {
  error?: { code?: string; message?: string };
}

// Cover tab creation, pane-busy retries, a final Agent start request,
// readiness polling, cleanup, and transport overhead.
const AGENT_CREATION_TIMEOUT_MS = 205_000;
const RUNTIME_MUTATION_TIMEOUT_MS = 305_000;

export class HerdrBridgeError extends Error {
  readonly code: string;
  readonly status: number;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "HerdrBridgeError";
    this.code = code;
    this.status = status;
  }
}

export interface NewLiveSession {
  command: string;
  cwd?: string;
  initialPrompt?: string;
  label: string;
  runtime: RuntimeName;
  workspaceId: string;
}

export interface CreatedLiveSession {
  initial_prompt_error?: string;
  [key: string]: unknown;
}

export interface NewLiveTerminal {
  label: string;
  workspaceId: string;
}

export type AgentLifecycleAction = "archive" | "clear" | "restart" | "stop";
export type IntegrationAction = "install" | "uninstall";
export type IntegrationTarget =
  | "antigravity_cli"
  | "claude"
  | "codex"
  | "copilot"
  | "cursor"
  | "devin"
  | "droid"
  | "grok"
  | "hermes"
  | "kilo"
  | "kimi"
  | "mastracode"
  | "omp"
  | "opencode"
  | "pi"
  | "qodercli"
  | "qwen";

export interface PluginInfo {
  description?: string | null;
  enabled: boolean;
  name: string;
  plugin_id: string;
  version: string;
  warnings?: string[];
}

export interface PluginActionInfo {
  action_id: string;
  description?: string | null;
  plugin_id: string;
  title: string;
}

export interface PluginLogInfo {
  action_id?: string | null;
  error?: string | null;
  exit_code?: number | null;
  log_id: string;
  plugin_id: string;
  started_unix_ms: number;
  status: string;
  stderr?: string | null;
  stdout?: string | null;
}

export interface PluginListResult {
  plugins: PluginInfo[];
  type: "plugin_list";
}

export interface PluginActionListResult {
  actions: PluginActionInfo[];
  type: "plugin_action_list";
}

export interface PluginLogListResult {
  logs: PluginLogInfo[];
  type: "plugin_log_list";
}

export interface NewLiveWorkspace {
  cwd: string;
  label?: string;
}

export interface CreatedLiveWorkspace {
  type: "workspace_created";
  workspace: { workspace_id: string };
}

export interface PushConfig {
  publicKey: string;
  type: "push_config";
}

export interface BrowserPushPreferences {
  cooldownMs: number;
  mutedAgentIds: string[];
  privacy: "full" | "private";
  soundEnabled: boolean;
}

export interface ViewerShareScope {
  agentId?: string;
  paneId?: string;
  workspaceId: string;
}

export interface ViewerShare {
  createdAt: number;
  expiresAt: number;
  id: string;
  revokedAt?: number;
  scope: ViewerShareScope;
}

export interface ViewerShareList {
  shares: ViewerShare[];
  type: "viewer_share_list";
}

export interface CreatedViewerShare {
  share: ViewerShare;
  token: string;
  type: "viewer_share_created";
  url: string;
}

export interface WorkflowTemplateList {
  templates: WorkflowTemplate[];
  type: "workflow_template_list";
}

export interface TerminalTicket {
  expiresAt: number;
  path: string;
  ticket: string;
  type: "terminal_ticket";
}

export interface TerminalTicketInput {
  cols: number;
  mode: "control" | "observe";
  purpose?: "attention-reply";
  rows: number;
  takeover?: boolean;
}

export interface UploadedImage {
  mediaType: string;
  path: string;
  size: number;
  type: "image_uploaded";
}

export interface UploadedFile {
  mediaType: string;
  path: string;
  size: number;
  type: "file_uploaded";
}

export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;
export const MAX_GENERIC_FILE_BYTES = 16 * 1024 * 1024;
export const MAX_PROMPT_CHARACTERS = 20_000;

export function normalizeWorkspacePath(value: string): string {
  return value.trim();
}

export function workspaceLabelFromPath(value: string): string {
  const path = normalizeWorkspacePath(value);
  const windowsPath = /^[a-z]:[\\/]/iu.test(path) || path.startsWith("\\\\");
  const parts = path.split(windowsPath ? /[\\/]+/u : /\/+/u).filter(Boolean);
  return parts.at(-1) ?? "";
}
export const SUPPORTED_IMAGE_TYPES = [
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
] as const;

export class HerdrApiClient {
  constructor(private readonly token: string) {}

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const suppliedHeaders = Object.fromEntries(new Headers(init.headers));
    const hasContentType = Object.keys(suppliedHeaders).some(
      (name) => name.toLowerCase() === "content-type",
    );
    const response = await fetch(path, {
      ...init,
      signal: init.signal ?? AbortSignal.timeout(15_000),
      headers: {
        ...(init.body && !hasContentType
          ? { "content-type": "application/json" }
          : {}),
        ...suppliedHeaders,
        authorization: `Bearer ${this.token}`,
      },
    });
    if (!response.ok) {
      let body: ApiErrorBody = {};
      try {
        body = (await response.json()) as ApiErrorBody;
      } catch {
        // The status remains useful when an intermediary returns a non-JSON error.
      }
      throw new HerdrBridgeError(
        response.status,
        body.error?.code ?? "request_failed",
        body.error?.message ?? `Request failed with status ${response.status}`,
      );
    }
    return (await response.json()) as T;
  }

  state(): Promise<LiveSnapshotPayload> {
    return this.request("/api/herdr/state");
  }

  pushConfig(): Promise<PushConfig> {
    return this.request("/api/herdr/push/config");
  }

  savePushSubscription(
    subscription: PushSubscriptionJSON,
    preferences: BrowserPushPreferences,
  ): Promise<unknown> {
    return this.request("/api/herdr/push/subscription", {
      body: JSON.stringify({ preferences, subscription }),
      method: "PUT",
    });
  }

  removePushSubscription(endpoint: string): Promise<unknown> {
    return this.request("/api/herdr/push/subscription", {
      body: JSON.stringify({ endpoint }),
      method: "DELETE",
    });
  }

  viewerShares(): Promise<ViewerShareList> {
    return this.request("/api/herdr/viewer-shares");
  }

  createViewerShare(
    scope: ViewerShareScope,
    expiresInMinutes: number,
  ): Promise<CreatedViewerShare> {
    return this.request("/api/herdr/viewer-shares", {
      body: JSON.stringify({ expiresInMinutes, scope }),
      method: "POST",
    });
  }

  revokeViewerShare(id: string): Promise<unknown> {
    return this.request(`/api/herdr/viewer-shares/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
  }

  workflowTemplates(projectKey: string): Promise<WorkflowTemplateList> {
    return this.request(
      `/api/herdr/workflow-templates?projectKey=${encodeURIComponent(projectKey)}`,
    );
  }

  saveWorkflowTemplate(template: WorkflowTemplate): Promise<unknown> {
    return this.request(
      `/api/herdr/workflow-templates/${encodeURIComponent(template.id)}`,
      { body: JSON.stringify(template), method: "PUT" },
    );
  }

  deleteWorkflowTemplate(id: string, projectKey: string): Promise<unknown> {
    return this.request(
      `/api/herdr/workflow-templates/${encodeURIComponent(id)}?projectKey=${encodeURIComponent(projectKey)}`,
      { method: "DELETE" },
    );
  }

  async events(
    signal: AbortSignal,
    onEvent: (event: unknown) => void,
    onReady?: () => void,
  ): Promise<void> {
    const response = await fetch("/api/herdr/events", {
      headers: { authorization: `Bearer ${this.token}` },
      signal,
    });
    if (!response.ok) {
      throw new HerdrBridgeError(
        response.status,
        "event_stream_failed",
        `Event stream failed with status ${response.status}`,
      );
    }
    if (
      !response.headers.get("content-type")?.includes("application/x-ndjson") ||
      !response.body
    ) {
      throw new HerdrBridgeError(
        502,
        "invalid_event_stream",
        "The bridge did not return a Herdr event stream",
      );
    }
    onReady?.();
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    while (!signal.aborted) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      if (buffer.length > 1024 * 1024) {
        throw new Error("Herdr event stream exceeded its buffer limit");
      }
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        newline = buffer.indexOf("\n");
        if (!line) continue;
        let event: unknown;
        try {
          event = JSON.parse(line);
        } catch {
          throw new Error("Herdr event stream returned invalid JSON");
        }
        onEvent(event);
      }
    }
    if (!signal.aborted) throw new Error("Herdr event stream disconnected");
  }

  plugins(): Promise<PluginListResult> {
    return this.request("/api/herdr/plugins");
  }

  pluginActions(): Promise<PluginActionListResult> {
    return this.request("/api/herdr/plugin-actions");
  }

  pluginLogs(pluginId?: string): Promise<PluginLogListResult> {
    const query = pluginId ? `?pluginId=${encodeURIComponent(pluginId)}` : "";
    return this.request(`/api/herdr/plugin-logs${query}`);
  }

  setPluginEnabled(pluginId: string, enabled: boolean): Promise<unknown> {
    return this.request(`/api/herdr/plugins/${encodeURIComponent(pluginId)}`, {
      body: JSON.stringify({ enabled }),
      method: "PATCH",
    });
  }

  invokePluginAction(actionId: string): Promise<unknown> {
    return this.request(
      `/api/herdr/plugin-actions/${encodeURIComponent(actionId)}/invoke`,
      {
        body: "{}",
        method: "POST",
        signal: AbortSignal.timeout(RUNTIME_MUTATION_TIMEOUT_MS),
      },
    );
  }

  manageIntegration(
    target: IntegrationTarget,
    action: IntegrationAction,
  ): Promise<unknown> {
    return this.request(
      `/api/herdr/integrations/${encodeURIComponent(target)}`,
      {
        body: JSON.stringify({ action }),
        method: "POST",
        signal: AbortSignal.timeout(RUNTIME_MUTATION_TIMEOUT_MS),
      },
    );
  }

  promptAgent(paneId: string, message: string): Promise<unknown> {
    return this.request(
      `/api/herdr/agents/${encodeURIComponent(paneId)}/prompt`,
      { body: JSON.stringify({ message }), method: "POST" },
    );
  }

  terminalTicket(
    paneId: string,
    input: TerminalTicketInput,
  ): Promise<TerminalTicket> {
    return this.request(
      `/api/herdr/panes/${encodeURIComponent(paneId)}/terminal-ticket`,
      { body: JSON.stringify(input), method: "POST" },
    );
  }

  async quickReply(paneId: string, message: string): Promise<void> {
    const ticket = await this.terminalTicket(paneId, {
      cols: 80,
      mode: "control",
      purpose: "attention-reply",
      rows: 24,
      takeover: false,
    });
    await new Promise<void>((resolve, reject) => {
      const url = new URL(ticket.path, window.location.href);
      url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
      url.search = new URLSearchParams({ ticket: ticket.ticket }).toString();
      const socket = new WebSocket(url);
      let sent = false;
      let settled = false;
      const requestId = crypto.randomUUID?.() ?? `${Date.now()}`;
      const fail = (reason: string) => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        socket.close();
        reject(new Error(reason));
      };
      const timeout = window.setTimeout(
        () => fail("The quick reply terminal did not acknowledge input."),
        10_000,
      );
      socket.onerror = () =>
        fail("The quick reply terminal could not connect.");
      socket.onclose = (event) => {
        if (!sent) fail(event.reason || "Terminal control is unavailable.");
      };
      socket.onmessage = (event) => {
        let frame: {
          message?: string;
          reason?: string;
          requestId?: string;
          type?: string;
        };
        try {
          frame = JSON.parse(String(event.data)) as typeof frame;
        } catch {
          fail("The quick reply terminal returned invalid data.");
          return;
        }
        if (
          frame.type === "terminal.closed" ||
          frame.type === "terminal.error"
        ) {
          fail(
            frame.reason ||
              frame.message ||
              "Terminal control is held elsewhere.",
          );
          return;
        }
        if (
          frame.type === "terminal.input-accepted" &&
          frame.requestId === requestId &&
          sent
        ) {
          settled = true;
          window.clearTimeout(timeout);
          if (socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: "terminal.release" }));
            socket.close(1000, "quick reply accepted");
          }
          resolve();
          return;
        }
        if (frame.type !== "terminal.frame" || sent) return;
        sent = true;
        socket.send(
          JSON.stringify({
            data: `${message}\r`,
            requestId,
            type: "terminal.input",
          }),
        );
      };
    });
  }

  uploadImage(paneId: string, image: File): Promise<UploadedImage> {
    return this.request(
      `/api/herdr/agents/${encodeURIComponent(paneId)}/images`,
      {
        body: image,
        headers: { "content-type": image.type },
        method: "POST",
      },
    );
  }

  uploadFile(paneId: string, file: File): Promise<UploadedFile> {
    return this.request(
      `/api/herdr/panes/${encodeURIComponent(paneId)}/files`,
      {
        body: file,
        headers: {
          "content-type": file.type || "application/octet-stream",
          "x-herdr-filename": file.name,
        },
        method: "POST",
      },
    );
  }

  splitPane(paneId: string, direction: PaneSplitDirection): Promise<unknown> {
    return this.request(
      `/api/herdr/panes/${encodeURIComponent(paneId)}/split`,
      {
        body: JSON.stringify({ direction }),
        method: "POST",
      },
    );
  }

  setSplitRatio(
    tabId: string,
    path: boolean[],
    ratio: number,
  ): Promise<unknown> {
    return this.request(
      `/api/herdr/tabs/${encodeURIComponent(tabId)}/split-ratio`,
      {
        body: JSON.stringify({ path, ratio }),
        method: "PATCH",
      },
    );
  }

  closePane(paneId: string): Promise<unknown> {
    return this.request(`/api/herdr/panes/${encodeURIComponent(paneId)}`, {
      method: "DELETE",
    });
  }

  createSession(input: NewLiveSession): Promise<CreatedLiveSession> {
    return this.request("/api/herdr/sessions", {
      body: JSON.stringify(input),
      method: "POST",
      signal: AbortSignal.timeout(AGENT_CREATION_TIMEOUT_MS),
    });
  }

  createTerminal(input: NewLiveTerminal): Promise<unknown> {
    return this.request("/api/herdr/terminals", {
      body: JSON.stringify(input),
      method: "POST",
    });
  }

  renameTab(tabId: string, label: string): Promise<unknown> {
    return this.request(`/api/herdr/tabs/${encodeURIComponent(tabId)}`, {
      body: JSON.stringify({ label }),
      method: "PATCH",
    });
  }

  closeTab(tabId: string): Promise<unknown> {
    return this.request(`/api/herdr/tabs/${encodeURIComponent(tabId)}`, {
      method: "DELETE",
    });
  }

  moveTab(tabId: string, direction: "left" | "right"): Promise<unknown> {
    return this.request(`/api/herdr/tabs/${encodeURIComponent(tabId)}/move`, {
      body: JSON.stringify({ direction }),
      method: "POST",
    });
  }

  agentLifecycle(
    target: string,
    action: AgentLifecycleAction,
  ): Promise<unknown> {
    return this.request(
      `/api/herdr/agents/${encodeURIComponent(target)}/lifecycle`,
      { body: JSON.stringify({ action }), method: "POST" },
    );
  }

  createWorkspace(input: NewLiveWorkspace): Promise<CreatedLiveWorkspace> {
    return this.request("/api/herdr/workspaces", {
      body: JSON.stringify(input),
      method: "POST",
    });
  }
}

export function browserAccessToken(): string {
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.replace(/^#/, ""));
  const supplied =
    url.searchParams.get("token")?.trim() || fragment.get("token")?.trim();
  if (supplied) {
    writeProductStorage(window.sessionStorage, "token", supplied);
    url.searchParams.delete("token");
    fragment.delete("token");
    const hash = fragment.toString();
    window.history.replaceState(
      {},
      "",
      `${url.pathname}${url.search}${hash ? `#${hash}` : ""}`,
    );
    return supplied;
  }
  return readProductStorage(window.sessionStorage, "token")?.trim() ?? "";
}

export function rememberAccessToken(token: string): void {
  writeProductStorage(window.sessionStorage, "token", token.trim());
}
