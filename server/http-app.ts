import { timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import {
  type FileUploadInput,
  MAX_FILE_BYTES,
  type UploadedFile,
  validateFile,
} from "./file-upload.js";
import { HerdrApiError } from "./herdr-client.js";
import type {
  AgentLifecycleAction,
  CreateSessionInput,
  CreateTerminalInput,
  CreateWorkspaceInput,
  IntegrationAction,
  PaneSplitDirection,
} from "./herdr-service.js";
import {
  type ImageUploadInput,
  MAX_IMAGE_BYTES,
  type UploadedImage,
  validateImage,
} from "./image-upload.js";
import type {
  BrowserPushSubscription,
  PushNotificationService,
  PushPreferences,
} from "./push-notifications.js";
import {
  projectStateForShare,
  shareScopeAllowsPane,
} from "./share-projection.js";
import type {
  PublicViewerShare,
  ShareScope,
  ViewerShareStore,
} from "./share-store.js";
import type { TerminalTicketStore } from "./terminal-tickets.js";
import {
  type ProjectWorkflowStep,
  type ProjectWorkflowTemplate,
  WORKFLOW_RUNTIMES,
  type WorkflowTemplateStore,
} from "./workflow-template-store.js";

export interface HerdrService {
  agentLifecycle?(
    target: string,
    action: AgentLifecycleAction,
  ): Promise<unknown>;
  closePane(paneId: string): Promise<unknown>;
  closeTab?(tabId: string): Promise<unknown>;
  createSession(input: CreateSessionInput): Promise<unknown>;
  createTerminal?(input: CreateTerminalInput): Promise<unknown>;
  createWorkspace(input: CreateWorkspaceInput): Promise<unknown>;
  getState(): Promise<unknown>;
  invokePluginAction?(actionId: string): Promise<unknown>;
  listPluginActions?(): Promise<unknown>;
  listPluginLogs?(pluginId?: string): Promise<unknown>;
  listPlugins?(): Promise<unknown>;
  manageIntegration?(
    target: string,
    action: IntegrationAction,
  ): Promise<unknown>;
  promptAgent(target: string, text: string): Promise<unknown>;
  moveTab?(tabId: string, direction: "left" | "right"): Promise<unknown>;
  renameTab?(tabId: string, label: string): Promise<unknown>;
  setPluginEnabled?(pluginId: string, enabled: boolean): Promise<unknown>;
  setSplitRatio(
    tabId: string,
    path: boolean[],
    ratio: number,
  ): Promise<unknown>;
  splitPane(paneId: string, direction: PaneSplitDirection): Promise<unknown>;
  subscribeEvents?(
    signal: AbortSignal,
    onEvent: (event: unknown) => void,
    onReady?: () => void,
  ): Promise<void>;
  uploadFile?(paneId: string, input: FileUploadInput): Promise<UploadedFile>;
  uploadImage(paneId: string, input: ImageUploadInput): Promise<UploadedImage>;
}

interface HandlerOptions {
  service: HerdrService;
  terminalConfigured?: boolean;
  pushNotifications?: PushNotificationService;
  shareStore?: ViewerShareStore;
  terminalTickets?: TerminalTicketStore;
  token: string;
  viewToken?: string;
  workflowTemplates?: WorkflowTemplateStore;
}

const RESOURCE_ID = /^[A-Za-z0-9:_-]{1,128}$/;
const EXTENSION_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const INTEGRATION_TARGETS = new Set([
  "antigravity_cli",
  "claude",
  "codex",
  "copilot",
  "cursor",
  "devin",
  "droid",
  "grok",
  "hermes",
  "kilo",
  "kimi",
  "mastracode",
  "omp",
  "opencode",
  "pi",
  "qodercli",
  "qwen",
]);
const MAX_JSON_BODY_BYTES = 16_384;

class PayloadTooLargeError extends Error {}

function sendJson(
  response: ServerResponse,
  status: number,
  value: unknown,
): void {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    "cache-control": "no-store",
    "content-length": Buffer.byteLength(body),
    "content-type": "application/json; charset=utf-8",
    "x-content-type-options": "nosniff",
  });
  response.end(body);
}

function tokenMatches(supplied: string, expected: string): boolean {
  const suppliedBytes = Buffer.from(supplied);
  const expectedBytes = Buffer.from(expected);
  return (
    suppliedBytes.length === expectedBytes.length &&
    timingSafeEqual(suppliedBytes, expectedBytes)
  );
}

interface AccessPrincipal {
  role: "controller" | "viewer";
  share?: PublicViewerShare;
}

function accessPrincipal(
  request: IncomingMessage,
  controllerToken: string,
  viewToken?: string,
  shareStore?: ViewerShareStore,
): AccessPrincipal | undefined {
  const header = request.headers.authorization;
  if (!header?.startsWith("Bearer ")) return undefined;
  const supplied = header.slice(7);
  if (tokenMatches(supplied, controllerToken)) return { role: "controller" };
  if (viewToken && tokenMatches(supplied, viewToken)) return { role: "viewer" };
  const share = shareStore?.resolve(supplied);
  return share ? { role: "viewer", share } : undefined;
}

async function readBody(
  request: IncomingMessage,
  maxBytes: number,
): Promise<Buffer> {
  const declaredLength = Number.parseInt(
    request.headers["content-length"] ?? "0",
    10,
  );
  if (declaredLength > maxBytes) {
    throw new PayloadTooLargeError("Request body is too large");
  }
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > maxBytes) {
      throw new PayloadTooLargeError("Request body is too large");
    }
    chunks.push(buffer);
  }
  return Buffer.concat(chunks);
}

async function readJson(request: IncomingMessage): Promise<unknown> {
  const body = await readBody(request, MAX_JSON_BODY_BYTES);
  if (body.length === 0) return {};
  return JSON.parse(body.toString("utf8")) as unknown;
}

function objectBody(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new TypeError("Request body must be a JSON object");
  }
  return value as Record<string, unknown>;
}

function cleanId(value: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new TypeError("Invalid herdr resource id");
  }
  if (!RESOURCE_ID.test(decoded))
    throw new TypeError("Invalid herdr resource id");
  return decoded;
}

function cleanExtensionId(value: string, field: string): string {
  let decoded: string;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    throw new TypeError(`Invalid ${field}`);
  }
  if (!EXTENSION_ID.test(decoded)) throw new TypeError(`Invalid ${field}`);
  return decoded;
}

function cleanIntegrationTarget(value: string): string {
  const target = cleanExtensionId(value, "integration target");
  if (!INTEGRATION_TARGETS.has(target)) {
    throw new TypeError("Unsupported Herdr integration target");
  }
  return target;
}

function cleanIntegrationAction(value: unknown): IntegrationAction {
  if (value !== "install" && value !== "uninstall") {
    throw new TypeError("action must be install or uninstall");
  }
  return value;
}

function cleanText(value: unknown, field: string, max: number): string {
  if (typeof value !== "string")
    throw new TypeError(`${field} must be a string`);
  const text = value.trim();
  if (!text || text.length > max) {
    throw new TypeError(`${field} must contain 1-${max} characters`);
  }
  return text;
}

function cleanTerminalDimension(value: unknown, field: string): number {
  if (!Number.isInteger(value) || Number(value) < 1 || Number(value) > 1_000) {
    throw new RangeError(`${field} must be an integer between 1 and 1000`);
  }
  return Number(value);
}

function cleanSplitPath(value: unknown): boolean[] {
  if (
    !Array.isArray(value) ||
    value.length > 32 ||
    value.some((segment) => typeof segment !== "boolean")
  ) {
    throw new TypeError("path must be an array of at most 32 booleans");
  }
  return value;
}

function cleanSplitDirection(value: unknown): PaneSplitDirection {
  if (value !== "right" && value !== "down") {
    throw new TypeError("direction must be right or down");
  }
  return value;
}

function cleanHorizontalDirection(value: unknown): "left" | "right" {
  if (value !== "left" && value !== "right") {
    throw new TypeError("direction must be left or right");
  }
  return value;
}

function cleanAgentLifecycleAction(value: unknown): AgentLifecycleAction {
  if (
    value !== "archive" &&
    value !== "clear" &&
    value !== "restart" &&
    value !== "stop"
  ) {
    throw new TypeError("action must be restart, stop, archive, or clear");
  }
  return value;
}

function cleanSplitRatio(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isFinite(value) ||
    value < 0.1 ||
    value > 0.9
  ) {
    throw new RangeError("ratio must be a finite number between 0.1 and 0.9");
  }
  return value;
}

function cleanPath(value: unknown, field = "cwd"): string {
  const path = cleanText(value, field, 4_096);
  if (
    [...path].some((character) => {
      const code = character.codePointAt(0) ?? 0;
      return code < 32 || code === 127;
    })
  ) {
    throw new TypeError(`${field} must not contain control characters`);
  }
  return path;
}

function cleanShareScope(value: unknown): ShareScope {
  const body = objectBody(value);
  const workspaceId = cleanId(cleanText(body.workspaceId, "workspaceId", 128));
  const agentId =
    body.agentId === undefined
      ? undefined
      : cleanId(cleanText(body.agentId, "agentId", 128));
  const paneId =
    body.paneId === undefined
      ? undefined
      : cleanId(cleanText(body.paneId, "paneId", 128));
  return {
    workspaceId,
    ...(agentId ? { agentId } : {}),
    ...(paneId ? { paneId } : {}),
  };
}

function cleanPushSubscription(value: unknown): BrowserPushSubscription {
  const body = objectBody(value);
  const endpoint = cleanText(body.endpoint, "endpoint", 4_096);
  const url = new URL(endpoint);
  if (url.protocol !== "https:") {
    throw new TypeError("push endpoint must use HTTPS");
  }
  const keys = objectBody(body.keys);
  const auth = cleanText(keys.auth, "auth", 512);
  const p256dh = cleanText(keys.p256dh, "p256dh", 512);
  if (!/^[A-Za-z0-9_-]+$/.test(auth) || !/^[A-Za-z0-9_-]+$/.test(p256dh)) {
    throw new TypeError("push subscription keys must be base64url values");
  }
  return { endpoint, keys: { auth, p256dh } };
}

function cleanPushPreferences(value: unknown): PushPreferences {
  const body = objectBody(value);
  const cooldownMs = Number(body.cooldownMs);
  if (
    !Number.isInteger(cooldownMs) ||
    cooldownMs < 5_000 ||
    cooldownMs > 600_000
  ) {
    throw new RangeError(
      "cooldownMs must be an integer between 5000 and 600000",
    );
  }
  if (!Array.isArray(body.mutedAgentIds) || body.mutedAgentIds.length > 256) {
    throw new TypeError("mutedAgentIds must contain at most 256 Agent ids");
  }
  const mutedAgentIds = body.mutedAgentIds.map((id) =>
    cleanId(cleanText(id, "muted Agent id", 128)),
  );
  if (body.privacy !== "full" && body.privacy !== "private") {
    throw new TypeError("privacy must be full or private");
  }
  if (typeof body.soundEnabled !== "boolean") {
    throw new TypeError("soundEnabled must be a boolean");
  }
  return {
    cooldownMs,
    mutedAgentIds: [...new Set(mutedAgentIds)],
    privacy: body.privacy,
    soundEnabled: body.soundEnabled,
  };
}

function cleanShareDuration(value: unknown): number {
  if (!Number.isInteger(value) || Number(value) < 5 || Number(value) > 10_080) {
    throw new RangeError(
      "expiresInMinutes must be an integer between 5 and 10080",
    );
  }
  return Number(value) * 60_000;
}

function cleanWorkflowStep(value: unknown, index: number): ProjectWorkflowStep {
  const step = objectBody(value);
  const runtime = cleanText(step.runtime, "runtime", 40);
  if (
    !WORKFLOW_RUNTIMES.includes(runtime as (typeof WORKFLOW_RUNTIMES)[number])
  ) {
    throw new TypeError("Unsupported workflow Agent runtime");
  }
  if (
    step.waitForPrevious !== undefined &&
    typeof step.waitForPrevious !== "boolean"
  ) {
    throw new TypeError("waitForPrevious must be a boolean");
  }
  const cwd =
    step.cwd === undefined || step.cwd === "" ? "" : cleanPath(step.cwd);
  const prompt =
    step.prompt === undefined || step.prompt === ""
      ? ""
      : cleanText(step.prompt, "prompt", 20_000);
  return {
    cwd,
    id: cleanExtensionId(cleanText(step.id, "step id", 128), "step id"),
    label: cleanText(step.label, "label", 80),
    order:
      Number.isInteger(step.order) &&
      Number(step.order) >= 0 &&
      Number(step.order) < 12
        ? Number(step.order)
        : index,
    prompt,
    runtime: runtime as ProjectWorkflowStep["runtime"],
    waitForPrevious: step.waitForPrevious === true,
  };
}

function cleanWorkflowTemplate(
  id: string,
  value: unknown,
): ProjectWorkflowTemplate {
  const body = objectBody(value);
  if (
    !Array.isArray(body.steps) ||
    body.steps.length < 1 ||
    body.steps.length > 12
  ) {
    throw new TypeError("steps must contain 1-12 workflow steps");
  }
  const steps = body.steps.map(cleanWorkflowStep);
  if (new Set(steps.map((step) => step.id)).size !== steps.length) {
    throw new TypeError("workflow step ids must be unique");
  }
  return {
    id,
    name: cleanText(body.name, "name", 80),
    projectKey: cleanPath(body.projectKey, "projectKey"),
    scope: "project",
    steps,
    version: 1,
  };
}

function blockedAgentOwnsPane(state: unknown, paneId: string): boolean {
  if (!state || typeof state !== "object" || Array.isArray(state)) return false;
  const snapshot = (state as { snapshot?: unknown }).snapshot;
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return false;
  }
  const source = snapshot as {
    agents?: Array<{ agent_status?: unknown; pane_id?: unknown }>;
  };
  return (
    source.agents?.some(
      (agent) => agent.agent_status === "blocked" && agent.pane_id === paneId,
    ) === true
  );
}

function shareEventAllowed(
  event: unknown,
  scope: ShareScope,
  state: unknown,
): boolean {
  if (!event || typeof event !== "object" || Array.isArray(event)) return false;
  const data = (event as { data?: unknown }).data;
  if (!data || typeof data !== "object" || Array.isArray(data)) return false;
  const fields = data as Record<string, unknown>;
  if (
    typeof fields.workspace_id === "string" &&
    fields.workspace_id !== scope.workspaceId
  ) {
    return false;
  }
  if (typeof fields.pane_id === "string") {
    return shareScopeAllowsPane(state, scope, fields.pane_id);
  }
  if (scope.paneId) {
    return fields.target === scope.paneId;
  }
  if (scope.agentId) {
    return fields.agent_id === scope.agentId || fields.target === scope.agentId;
  }
  return fields.workspace_id === scope.workspaceId;
}

function errorResponse(response: ServerResponse, error: unknown): void {
  if (error instanceof PayloadTooLargeError) {
    sendJson(response, 413, {
      error: { code: "payload_too_large", message: error.message },
    });
    return;
  }
  if (
    error instanceof TypeError ||
    error instanceof RangeError ||
    error instanceof SyntaxError
  ) {
    sendJson(response, 400, {
      error: { code: "invalid_request", message: error.message },
    });
    return;
  }
  if (error instanceof HerdrApiError) {
    sendJson(response, 502, {
      error: { code: error.code, message: error.message },
    });
    return;
  }
  const nodeError = error as NodeJS.ErrnoException;
  if (nodeError?.code === "ENOENT" || nodeError?.code === "ECONNREFUSED") {
    sendJson(response, 503, {
      error: {
        code: "herdr_unavailable",
        message: "Cannot connect to the herdr socket",
      },
    });
    return;
  }
  console.error("herdr bridge request failed", error);
  sendJson(response, 500, {
    error: { code: "bridge_error", message: "Herdr bridge request failed" },
  });
}

// Route authorization, validation, and response ordering stay in one handler so
// controller, global viewer, and scoped-share policy has one auditable gate;
// persistence, projection, uploads, and terminal streaming remain separate owners.
export function createHerdrHttpHandler({
  service,
  pushNotifications,
  shareStore,
  terminalConfigured = false,
  terminalTickets,
  token,
  viewToken,
  workflowTemplates,
}: HandlerOptions) {
  if (!token) throw new Error("HERDR_WEB_TOKEN must not be empty");
  if (viewToken === token) {
    throw new Error("HERDR_WEB_VIEW_TOKEN must differ from HERDR_WEB_TOKEN");
  }
  let activeEventStreams = 0;
  return async (request: IncomingMessage, response: ServerResponse) => {
    const url = new URL(request.url ?? "/", "http://herdr.local");
    if (!url.pathname.startsWith("/api/herdr/")) {
      sendJson(response, 404, {
        error: { code: "not_found", message: "Not found" },
      });
      return;
    }
    const principal = accessPrincipal(request, token, viewToken, shareStore);
    if (!principal) {
      response.setHeader("www-authenticate", "Bearer");
      sendJson(response, 401, {
        error: {
          code: "unauthorized",
          message: "A valid access token is required",
        },
      });
      return;
    }

    const { role } = principal;
    try {
      if (request.method === "GET" && url.pathname === "/api/herdr/events") {
        if (!service.subscribeEvents) {
          sendJson(response, 404, {
            error: {
              code: "event_stream_unavailable",
              message: "Herdr event streaming is unavailable",
            },
          });
          return;
        }
        if (activeEventStreams >= 32) {
          sendJson(response, 429, {
            error: {
              code: "event_stream_capacity",
              message: "Too many event streams are active",
            },
          });
          return;
        }
        activeEventStreams += 1;
        const controller = new AbortController();
        let keepalive: NodeJS.Timeout | undefined;
        const shareExpiry = principal.share
          ? setTimeout(
              () => controller.abort(),
              Math.max(0, principal.share.expiresAt - Date.now()),
            )
          : undefined;
        shareExpiry?.unref();
        const stopRevocationListener =
          principal.share && shareStore
            ? shareStore.onRevoked((shareId) => {
                if (shareId === principal.share?.id) controller.abort();
              })
            : undefined;
        response.once("close", () => controller.abort());
        try {
          const shareState = principal.share
            ? await service.getState()
            : undefined;
          await service.subscribeEvents(
            controller.signal,
            (event) => {
              if (response.writableEnded) return;
              if (
                principal.share &&
                !shareEventAllowed(event, principal.share.scope, shareState)
              ) {
                return;
              }
              const projectedEvent = principal.share
                ? {
                    data: { shareId: principal.share.id },
                    event: "scope_updated",
                  }
                : event;
              const writable = response.write(
                `${JSON.stringify(projectedEvent)}\n`,
              );
              if (!writable) controller.abort();
            },
            () => {
              response.writeHead(200, {
                "cache-control": "no-store",
                connection: "keep-alive",
                "content-type": "application/x-ndjson; charset=utf-8",
                "x-accel-buffering": "no",
                "x-content-type-options": "nosniff",
              });
              response.flushHeaders();
              keepalive = setInterval(() => {
                if (!response.writableEnded) response.write("\n");
              }, 15_000);
              keepalive.unref();
            },
          );
          if (!response.writableEnded) response.end();
        } catch (error) {
          if (!response.headersSent) errorResponse(response, error);
          else if (!response.writableEnded) response.end();
        } finally {
          activeEventStreams -= 1;
          stopRevocationListener?.();
          if (shareExpiry) clearTimeout(shareExpiry);
          if (keepalive) clearInterval(keepalive);
        }
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/herdr/state") {
        const state = await service.getState();
        if (principal.share) {
          if (!shareStore?.isActive(principal.share.id)) {
            sendJson(response, 401, {
              error: {
                code: "share_expired_or_revoked",
                message: "This viewer share is no longer active",
              },
            });
            return;
          }
          const projected = projectStateForShare(state, principal.share.scope);
          if (!projected) {
            sendJson(response, 404, {
              error: {
                code: "share_scope_unavailable",
                message: "The shared Herdr scope is no longer available",
              },
            });
            return;
          }
          projected.access = {
            role: "viewer",
            share: {
              expiresAt: principal.share.expiresAt,
              id: principal.share.id,
              scope: principal.share.scope,
            },
          };
          sendJson(response, 200, projected);
          return;
        }
        sendJson(
          response,
          200,
          state && typeof state === "object" && !Array.isArray(state)
            ? { ...state, access: { role } }
            : state,
        );
        return;
      }
      const terminalTicket = url.pathname.match(
        /^\/api\/herdr\/panes\/([^/]+)\/terminal-ticket$/,
      );
      if (request.method === "POST" && terminalTicket?.[1]) {
        if (!terminalConfigured || !terminalTickets) {
          sendJson(response, 409, {
            error: {
              code: "terminal_streaming_unavailable",
              message:
                "This herdr-web bridge is not configured for Herdr terminal sessions",
            },
          });
          return;
        }
        const body = objectBody(await readJson(request));
        const mode = body.mode ?? "control";
        if (mode !== "control" && mode !== "observe") {
          throw new TypeError("mode must be control or observe");
        }
        if (body.takeover !== undefined && typeof body.takeover !== "boolean") {
          throw new TypeError("takeover must be a boolean");
        }
        if (body.purpose !== undefined && body.purpose !== "attention-reply") {
          throw new TypeError("purpose must be attention-reply when supplied");
        }
        if (body.purpose === "attention-reply" && mode !== "control") {
          throw new TypeError("attention replies require terminal control");
        }
        if (mode === "observe" && body.takeover === true) {
          throw new TypeError("observe mode cannot take control");
        }
        if (role === "viewer" && mode !== "observe") {
          sendJson(response, 403, {
            error: {
              code: "read_only_access",
              message: "This access token permits observation only",
            },
          });
          return;
        }
        const paneId = cleanId(terminalTicket[1]);
        if (
          body.purpose === "attention-reply" &&
          !blockedAgentOwnsPane(await service.getState(), paneId)
        ) {
          sendJson(response, 409, {
            error: {
              code: "agent_not_blocked",
              message:
                "Quick reply is available only while the Agent needs input",
            },
          });
          return;
        }
        if (
          principal.share &&
          !shareScopeAllowsPane(
            await service.getState(),
            principal.share.scope,
            paneId,
          )
        ) {
          sendJson(response, 403, {
            error: {
              code: "share_scope_denied",
              message: "This viewer share does not include the requested pane",
            },
          });
          return;
        }
        if (principal.share && !shareStore?.isActive(principal.share.id)) {
          sendJson(response, 401, {
            error: {
              code: "share_expired_or_revoked",
              message: "This viewer share is no longer active",
            },
          });
          return;
        }
        const issued = terminalTickets.issue({
          cols: cleanTerminalDimension(body.cols, "cols"),
          ...(body.purpose === "attention-reply"
            ? {
                expiresInMs: 5_000,
                purpose: "attention-reply" as const,
              }
            : {}),
          mode,
          paneId,
          rows: cleanTerminalDimension(body.rows, "rows"),
          ...(principal.share
            ? {
                shareExpiresAt: principal.share.expiresAt,
                shareId: principal.share.id,
              }
            : {}),
          takeover: body.takeover === true,
        });
        sendJson(response, 201, {
          ...issued,
          path: "/api/herdr/terminal",
          type: "terminal_ticket",
        });
        return;
      }
      if (
        request.method === "GET" &&
        url.pathname === "/api/herdr/viewer-shares"
      ) {
        if (role !== "controller" || !shareStore) {
          sendJson(response, role === "controller" ? 404 : 403, {
            error: {
              code:
                role === "controller"
                  ? "share_api_unavailable"
                  : "read_only_access",
              message:
                role === "controller"
                  ? "Viewer share management is unavailable"
                  : "Viewer shares require controller access",
            },
          });
          return;
        }
        sendJson(response, 200, {
          shares: shareStore.list(),
          type: "viewer_share_list",
        });
        return;
      }
      if (
        request.method === "POST" &&
        url.pathname === "/api/herdr/viewer-shares"
      ) {
        if (role !== "controller" || !shareStore) {
          sendJson(response, role === "controller" ? 404 : 403, {
            error: {
              code:
                role === "controller"
                  ? "share_api_unavailable"
                  : "read_only_access",
              message: "Viewer share management requires controller access",
            },
          });
          return;
        }
        const body = objectBody(await readJson(request));
        const scope = cleanShareScope(body.scope);
        if (!projectStateForShare(await service.getState(), scope)) {
          sendJson(response, 404, {
            error: {
              code: "share_scope_unavailable",
              message: "The requested Space, Agent, or pane does not exist",
            },
          });
          return;
        }
        const created = await shareStore.create(
          scope,
          cleanShareDuration(body.expiresInMinutes),
        );
        sendJson(response, 201, {
          share: created.share,
          token: created.token,
          type: "viewer_share_created",
          url: `/#token=${encodeURIComponent(created.token)}`,
        });
        return;
      }
      const viewerShare = url.pathname.match(
        /^\/api\/herdr\/viewer-shares\/([^/]+)$/,
      );
      if (request.method === "DELETE" && viewerShare?.[1]) {
        if (role !== "controller" || !shareStore) {
          sendJson(response, role === "controller" ? 404 : 403, {
            error: {
              code:
                role === "controller"
                  ? "share_api_unavailable"
                  : "read_only_access",
              message: "Viewer share management requires controller access",
            },
          });
          return;
        }
        const id = cleanId(viewerShare[1]);
        if (!(await shareStore.revoke(id))) {
          sendJson(response, 404, {
            error: {
              code: "share_not_found",
              message: "Viewer share not found",
            },
          });
          return;
        }
        terminalTickets?.revokeShare(id);
        sendJson(response, 200, { id, type: "viewer_share_revoked" });
        return;
      }
      if (role === "viewer") {
        sendJson(response, 403, {
          error: {
            code: "read_only_access",
            message: "This access token does not permit Herdr mutations",
          },
        });
        return;
      }
      if (
        request.method === "GET" &&
        url.pathname === "/api/herdr/push/config"
      ) {
        if (!pushNotifications) {
          sendJson(response, 404, {
            error: {
              code: "push_api_unavailable",
              message: "Background push notifications are unavailable",
            },
          });
          return;
        }
        sendJson(response, 200, {
          publicKey: pushNotifications.publicKey(),
          type: "push_config",
        });
        return;
      }
      if (
        request.method === "PUT" &&
        url.pathname === "/api/herdr/push/subscription"
      ) {
        if (!pushNotifications) {
          sendJson(response, 404, {
            error: {
              code: "push_api_unavailable",
              message: "Background push notifications are unavailable",
            },
          });
          return;
        }
        const body = objectBody(await readJson(request));
        await pushNotifications.upsert(
          cleanPushSubscription(body.subscription),
          cleanPushPreferences(body.preferences),
          await service.getState(),
        );
        sendJson(response, 200, { type: "push_subscription_saved" });
        return;
      }
      if (
        request.method === "DELETE" &&
        url.pathname === "/api/herdr/push/subscription"
      ) {
        if (!pushNotifications) {
          sendJson(response, 404, {
            error: {
              code: "push_api_unavailable",
              message: "Background push notifications are unavailable",
            },
          });
          return;
        }
        const body = objectBody(await readJson(request));
        const endpoint = cleanText(body.endpoint, "endpoint", 4_096);
        await pushNotifications.remove(endpoint);
        sendJson(response, 200, { type: "push_subscription_removed" });
        return;
      }
      if (
        request.method === "GET" &&
        url.pathname === "/api/herdr/workflow-templates"
      ) {
        if (!workflowTemplates) {
          sendJson(response, 404, {
            error: {
              code: "workflow_template_api_unavailable",
              message: "Project workflow template storage is unavailable",
            },
          });
          return;
        }
        const projectKey = cleanPath(
          url.searchParams.get("projectKey"),
          "projectKey",
        );
        sendJson(response, 200, {
          templates: await workflowTemplates.list(projectKey),
          type: "workflow_template_list",
        });
        return;
      }
      const workflowTemplate = url.pathname.match(
        /^\/api\/herdr\/workflow-templates\/([^/]+)$/,
      );
      if (request.method === "PUT" && workflowTemplate?.[1]) {
        if (!workflowTemplates) {
          sendJson(response, 404, {
            error: {
              code: "workflow_template_api_unavailable",
              message: "Project workflow template storage is unavailable",
            },
          });
          return;
        }
        const id = cleanExtensionId(
          workflowTemplate[1],
          "workflow template id",
        );
        const template = cleanWorkflowTemplate(id, await readJson(request));
        await workflowTemplates.save(template);
        sendJson(response, 200, { template, type: "workflow_template_saved" });
        return;
      }
      if (request.method === "DELETE" && workflowTemplate?.[1]) {
        if (!workflowTemplates) {
          sendJson(response, 404, {
            error: {
              code: "workflow_template_api_unavailable",
              message: "Project workflow template storage is unavailable",
            },
          });
          return;
        }
        const id = cleanExtensionId(
          workflowTemplate[1],
          "workflow template id",
        );
        const projectKey = cleanPath(
          url.searchParams.get("projectKey"),
          "projectKey",
        );
        if (!(await workflowTemplates.delete(projectKey, id))) {
          sendJson(response, 404, {
            error: {
              code: "workflow_template_not_found",
              message: "Workflow template not found",
            },
          });
          return;
        }
        sendJson(response, 200, { id, type: "workflow_template_deleted" });
        return;
      }
      if (request.method === "GET" && url.pathname === "/api/herdr/plugins") {
        if (!service.listPlugins) {
          sendJson(response, 404, {
            error: {
              code: "plugin_api_unavailable",
              message: "Herdr plugin management is unavailable",
            },
          });
          return;
        }
        sendJson(response, 200, await service.listPlugins());
        return;
      }
      if (
        request.method === "GET" &&
        url.pathname === "/api/herdr/plugin-actions"
      ) {
        if (!service.listPluginActions) {
          sendJson(response, 404, {
            error: {
              code: "plugin_api_unavailable",
              message: "Herdr plugin actions are unavailable",
            },
          });
          return;
        }
        sendJson(response, 200, await service.listPluginActions());
        return;
      }
      if (
        request.method === "GET" &&
        url.pathname === "/api/herdr/plugin-logs"
      ) {
        if (!service.listPluginLogs) {
          sendJson(response, 404, {
            error: {
              code: "plugin_api_unavailable",
              message: "Herdr plugin logs are unavailable",
            },
          });
          return;
        }
        const pluginId = url.searchParams.get("pluginId")?.trim();
        sendJson(
          response,
          200,
          await service.listPluginLogs(
            pluginId ? cleanExtensionId(pluginId, "plugin id") : undefined,
          ),
        );
        return;
      }
      const plugin = url.pathname.match(/^\/api\/herdr\/plugins\/([^/]+)$/);
      if (request.method === "PATCH" && plugin?.[1]) {
        if (!service.setPluginEnabled) {
          sendJson(response, 404, {
            error: {
              code: "plugin_api_unavailable",
              message: "Herdr plugin management is unavailable",
            },
          });
          return;
        }
        const body = objectBody(await readJson(request));
        if (typeof body.enabled !== "boolean") {
          throw new TypeError("enabled must be a boolean");
        }
        sendJson(
          response,
          200,
          await service.setPluginEnabled(
            cleanExtensionId(plugin[1], "plugin id"),
            body.enabled,
          ),
        );
        return;
      }
      const pluginAction = url.pathname.match(
        /^\/api\/herdr\/plugin-actions\/([^/]+)\/invoke$/,
      );
      if (request.method === "POST" && pluginAction?.[1]) {
        if (!service.invokePluginAction) {
          sendJson(response, 404, {
            error: {
              code: "plugin_api_unavailable",
              message: "Herdr plugin actions are unavailable",
            },
          });
          return;
        }
        sendJson(
          response,
          200,
          await service.invokePluginAction(
            cleanExtensionId(pluginAction[1], "plugin action id"),
          ),
        );
        return;
      }
      const integration = url.pathname.match(
        /^\/api\/herdr\/integrations\/([^/]+)$/,
      );
      if (request.method === "POST" && integration?.[1]) {
        if (!service.manageIntegration) {
          sendJson(response, 404, {
            error: {
              code: "integration_api_unavailable",
              message: "Herdr integration management is unavailable",
            },
          });
          return;
        }
        const body = objectBody(await readJson(request));
        sendJson(
          response,
          200,
          await service.manageIntegration(
            cleanIntegrationTarget(integration[1]),
            cleanIntegrationAction(body.action),
          ),
        );
        return;
      }
      const image = url.pathname.match(
        /^\/api\/herdr\/agents\/([^/]+)\/images$/,
      );
      if (request.method === "POST" && image?.[1]) {
        const mediaType = request.headers["content-type"]
          ?.split(";", 1)[0]
          ?.trim()
          .toLowerCase();
        const input: ImageUploadInput = {
          data: await readBody(request, MAX_IMAGE_BYTES),
          mediaType: mediaType ?? "",
        };
        validateImage(input);
        sendJson(
          response,
          200,
          await service.uploadImage(cleanId(image[1]), input),
        );
        return;
      }
      const file = url.pathname.match(/^\/api\/herdr\/panes\/([^/]+)\/files$/);
      if (request.method === "POST" && file?.[1]) {
        if (!service.uploadFile) {
          sendJson(response, 404, {
            error: {
              code: "file_upload_unavailable",
              message: "Generic file upload is unavailable",
            },
          });
          return;
        }
        const mediaType = request.headers["content-type"]
          ?.split(";", 1)[0]
          ?.trim()
          .toLowerCase();
        const input: FileUploadInput = {
          data: await readBody(request, MAX_FILE_BYTES),
          filename: request.headers["x-herdr-filename"]?.toString(),
          mediaType: mediaType ?? "",
        };
        validateFile(input);
        sendJson(
          response,
          200,
          await service.uploadFile(cleanId(file[1]), input),
        );
        return;
      }
      const prompt = url.pathname.match(
        /^\/api\/herdr\/agents\/([^/]+)\/prompt$/,
      );
      if (request.method === "POST" && prompt?.[1]) {
        const body = objectBody(await readJson(request));
        const result = await service.promptAgent(
          cleanId(prompt[1]),
          cleanText(body.message, "message", 20_000),
        );
        sendJson(response, 200, result);
        return;
      }
      const split = url.pathname.match(/^\/api\/herdr\/panes\/([^/]+)\/split$/);
      if (request.method === "POST" && split?.[1]) {
        const body = objectBody(await readJson(request));
        sendJson(
          response,
          200,
          await service.splitPane(
            cleanId(split[1]),
            cleanSplitDirection(
              body.direction === undefined ? "right" : body.direction,
            ),
          ),
        );
        return;
      }
      const splitRatio = url.pathname.match(
        /^\/api\/herdr\/tabs\/([^/]+)\/split-ratio$/,
      );
      if (request.method === "PATCH" && splitRatio?.[1]) {
        const body = objectBody(await readJson(request));
        sendJson(
          response,
          200,
          await service.setSplitRatio(
            cleanId(splitRatio[1]),
            cleanSplitPath(body.path),
            cleanSplitRatio(body.ratio),
          ),
        );
        return;
      }
      const close = url.pathname.match(/^\/api\/herdr\/panes\/([^/]+)$/);
      if (request.method === "DELETE" && close?.[1]) {
        sendJson(response, 200, await service.closePane(cleanId(close[1])));
        return;
      }
      const tab = url.pathname.match(/^\/api\/herdr\/tabs\/([^/]+)$/);
      if (request.method === "PATCH" && tab?.[1]) {
        if (!service.renameTab) {
          sendJson(response, 404, {
            error: {
              code: "tab_rename_unavailable",
              message: "Herdr tab rename is unavailable",
            },
          });
          return;
        }
        const body = objectBody(await readJson(request));
        sendJson(
          response,
          200,
          await service.renameTab(
            cleanId(tab[1]),
            cleanText(body.label, "label", 80),
          ),
        );
        return;
      }
      if (request.method === "DELETE" && tab?.[1]) {
        if (!service.closeTab) {
          sendJson(response, 404, {
            error: {
              code: "tab_close_unavailable",
              message: "Herdr tab close is unavailable",
            },
          });
          return;
        }
        sendJson(response, 200, await service.closeTab(cleanId(tab[1])));
        return;
      }
      const moveTab = url.pathname.match(/^\/api\/herdr\/tabs\/([^/]+)\/move$/);
      if (request.method === "POST" && moveTab?.[1]) {
        if (!service.moveTab) {
          sendJson(response, 404, {
            error: {
              code: "tab_move_unavailable",
              message: "Herdr tab ordering is unavailable",
            },
          });
          return;
        }
        const body = objectBody(await readJson(request));
        sendJson(
          response,
          200,
          await service.moveTab(
            cleanId(moveTab[1]),
            cleanHorizontalDirection(body.direction),
          ),
        );
        return;
      }
      const lifecycle = url.pathname.match(
        /^\/api\/herdr\/agents\/([^/]+)\/lifecycle$/,
      );
      if (request.method === "POST" && lifecycle?.[1]) {
        if (!service.agentLifecycle) {
          sendJson(response, 404, {
            error: {
              code: "agent_lifecycle_unavailable",
              message: "Herdr Agent lifecycle controls are unavailable",
            },
          });
          return;
        }
        const body = objectBody(await readJson(request));
        sendJson(
          response,
          200,
          await service.agentLifecycle(
            cleanId(lifecycle[1]),
            cleanAgentLifecycleAction(body.action),
          ),
        );
        return;
      }
      if (
        request.method === "POST" &&
        url.pathname === "/api/herdr/terminals"
      ) {
        if (!service.createTerminal) {
          sendJson(response, 404, {
            error: {
              code: "terminal_lifecycle_unavailable",
              message: "Herdr terminal creation is unavailable",
            },
          });
          return;
        }
        const body = objectBody(await readJson(request));
        sendJson(
          response,
          201,
          await service.createTerminal({
            label: cleanText(body.label, "label", 80),
            workspaceId: cleanText(body.workspaceId, "workspaceId", 128),
          }),
        );
        return;
      }
      if (
        request.method === "POST" &&
        url.pathname === "/api/herdr/workspaces"
      ) {
        const body = objectBody(await readJson(request));
        const input: CreateWorkspaceInput = {
          cwd: cleanPath(body.cwd),
          ...(body.label === undefined
            ? {}
            : { label: cleanText(body.label, "label", 80) }),
        };
        sendJson(response, 201, await service.createWorkspace(input));
        return;
      }
      if (request.method === "POST" && url.pathname === "/api/herdr/sessions") {
        const body = objectBody(await readJson(request));
        const input: CreateSessionInput = {
          command: cleanText(body.command, "command", 120),
          ...(body.cwd === undefined || body.cwd === ""
            ? {}
            : { cwd: cleanPath(body.cwd) }),
          ...(body.initialPrompt === undefined || body.initialPrompt === ""
            ? {}
            : {
                initialPrompt: cleanText(
                  body.initialPrompt,
                  "initialPrompt",
                  20_000,
                ),
              }),
          label: cleanText(body.label, "label", 80),
          runtime: cleanText(body.runtime, "runtime", 40),
          workspaceId: cleanText(body.workspaceId, "workspaceId", 128),
        };
        if (!RESOURCE_ID.test(input.workspaceId)) {
          throw new TypeError("Invalid workspace id");
        }
        sendJson(response, 200, await service.createSession(input));
        return;
      }
      sendJson(response, 404, {
        error: { code: "not_found", message: "Not found" },
      });
    } catch (error) {
      errorResponse(response, error);
    }
  };
}
