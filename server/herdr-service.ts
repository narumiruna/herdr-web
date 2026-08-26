import { execFile } from "node:child_process";
import { promisify } from "node:util";
import {
  type FileUploadInput,
  type UploadedFile,
  validateFile,
  writePaneFile,
} from "./file-upload.js";
import { HerdrApiError, type HerdrClient } from "./herdr-client.js";
import { terminalProtocolReason } from "./herdr-status.js";
import {
  type ImageUploadInput,
  type UploadedImage,
  validateImage,
  writePaneImage,
} from "./image-upload.js";

interface SessionSnapshotResult {
  type: "session_snapshot";
  snapshot: {
    agents?: Array<{ agent_status?: string; pane_id?: string }>;
    panes?: Array<{ pane_id?: string }>;
    workspaces?: SnapshotWorkspace[];
    [key: string]: unknown;
  };
}

interface SnapshotWorkspace {
  worktree?: SnapshotWorktree | null;
  [key: string]: unknown;
}

interface SnapshotWorktree {
  branch?: string;
  checkout_path?: string;
  repo_root?: string;
  [key: string]: unknown;
}

interface PaneReadResponse {
  type: "pane_read";
  read: {
    pane_id: string;
    revision: number;
    text: string;
    [key: string]: unknown;
  };
}

interface TabCreatedResponse {
  type: "tab_created";
  tab: { tab_id: string };
  root_pane: { pane_id: string };
}

export interface CreateTerminalInput {
  label: string;
  workspaceId: string;
}

export type AgentLifecycleAction = "archive" | "clear" | "restart" | "stop";
export type IntegrationAction = "install" | "uninstall";

interface PaneInfoResponse {
  type: "pane_info";
  pane: {
    cwd?: string;
    foreground_cwd?: string;
  };
}

interface ServiceOptions {
  herdrClientProtocol?: number;
  projectsRoot?: string;
  terminalStreamingConfigured?: boolean;
  uploadsRoot?: string;
}

export interface CreateSessionInput {
  command: string;
  cwd?: string;
  initialPrompt?: string;
  label: string;
  runtime: string;
  workspaceId: string;
}

export interface CreateWorkspaceInput {
  cwd: string;
  label?: string;
}

export type PaneSplitDirection = "down" | "right";

const execFileAsync = promisify(execFile);

const STRUCTURAL_SUBSCRIPTIONS = [
  "workspace.created",
  "workspace.updated",
  "workspace.metadata_updated",
  "workspace.renamed",
  "workspace.moved",
  "workspace.reordered",
  "workspace.closed",
  "workspace.focused",
  "worktree.created",
  "worktree.opened",
  "worktree.removed",
  "tab.created",
  "tab.closed",
  "tab.focused",
  "tab.renamed",
  "tab.moved",
  "pane.created",
  "pane.closed",
  "pane.updated",
  "pane.focused",
  "pane.moved",
  "pane.exited",
  "pane.agent_detected",
  "layout.updated",
].map((type) => ({ type }));

const RUNTIME_MUTATION_TIMEOUT_MS = 300_000;
const MAX_AGENT_PREVIEWS = 256;
const MAX_AGENT_STATUS_SUBSCRIPTIONS = 512;

async function settleWithConcurrency<T>(
  values: string[],
  concurrency: number,
  run: (value: string) => Promise<T>,
): Promise<Array<PromiseSettledResult<T>>> {
  const results = new Array<PromiseSettledResult<T>>(values.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < values.length) {
      const index = nextIndex;
      nextIndex += 1;
      const value = values[index];
      if (!value) continue;
      try {
        results[index] = { status: "fulfilled", value: await run(value) };
      } catch (reason) {
        results[index] = { reason, status: "rejected" };
      }
    }
  };
  await Promise.all(
    Array.from({ length: Math.min(concurrency, values.length) }, worker),
  );
  return results;
}

const RUNTIMES: Record<
  string,
  { args: string[]; command: string; kind: string }
> = {
  "Claude Code": { args: [], command: "claude", kind: "claude" },
  Codex: {
    args: ["--full-auto"],
    command: "codex --full-auto",
    kind: "codex",
  },
  OpenCode: { args: [], command: "opencode", kind: "opencode" },
  Pi: { args: [], command: "pi", kind: "pi" },
  "Qwen Code": { args: [], command: "qwen", kind: "qwen" },
};

export function parseGitWorktreeBranches(output: string): Map<string, string> {
  const branches = new Map<string, string>();
  let path = "";
  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      path = line.slice("worktree ".length).trim();
      continue;
    }
    if (!path || !line.startsWith("branch ")) continue;
    const branch = line
      .slice("branch ".length)
      .trim()
      .replace(/^refs\/heads\//, "");
    if (branch) branches.set(path, branch);
  }
  return branches;
}

export function applyWorktreeBranches(
  snapshot: SessionSnapshotResult["snapshot"],
  branchesByPath: Map<string, string>,
): void {
  for (const workspace of snapshot.workspaces ?? []) {
    const worktree = workspace.worktree;
    if (!worktree || worktree.branch?.trim()) continue;
    const branch = worktree.checkout_path
      ? branchesByPath.get(worktree.checkout_path)
      : undefined;
    if (branch) worktree.branch = branch;
  }
}

export function branchlessWorktreeRepoRoots(
  snapshot: SessionSnapshotResult["snapshot"],
): string[] {
  return [
    ...new Set(
      (snapshot.workspaces ?? [])
        .map(({ worktree }) =>
          worktree && !worktree.branch?.trim()
            ? worktree.repo_root?.trim()
            : "",
        )
        .filter((repoRoot): repoRoot is string => Boolean(repoRoot)),
    ),
  ];
}

async function loadRepoWorktreeBranches(
  repoRoot: string,
): Promise<Map<string, string>> {
  const { stdout } = await execFileAsync(
    "git",
    ["-C", repoRoot, "worktree", "list", "--porcelain"],
    { timeout: 2_000 },
  );
  return parseGitWorktreeBranches(stdout);
}

async function enrichSnapshotWorktreeBranches(
  snapshot: SessionSnapshotResult["snapshot"],
): Promise<void> {
  const repoRoots = branchlessWorktreeRepoRoots(snapshot);
  if (repoRoots.length === 0) return;

  const settled = await Promise.allSettled(
    repoRoots.map((repoRoot) => loadRepoWorktreeBranches(repoRoot)),
  );
  const branchesByPath = new Map<string, string>();
  for (const entry of settled) {
    if (entry.status !== "fulfilled") continue;
    for (const [path, branch] of entry.value) branchesByPath.set(path, branch);
  }
  applyWorktreeBranches(snapshot, branchesByPath);
}

export class LiveHerdrService {
  constructor(
    private readonly client: HerdrClient,
    private readonly options: ServiceOptions = {},
  ) {}

  async getState(): Promise<{
    capabilities: {
      previewsTruncated: boolean;
      statusSubscriptionsTruncated: boolean;
      terminalReason: string;
      terminalStreaming: boolean;
    };
    previews: Record<string, PaneReadResponse["read"]>;
    readErrors: Record<string, string>;
    reads: Record<string, PaneReadResponse["read"]>;
    snapshot: SessionSnapshotResult["snapshot"];
  }> {
    const result = await this.client.request<SessionSnapshotResult>(
      "session.snapshot",
      {},
    );
    if (result.type !== "session_snapshot" || !result.snapshot) {
      throw new Error("Herdr returned an invalid session snapshot");
    }
    await enrichSnapshotWorktreeBranches(result.snapshot);
    const protocol = Number(result.snapshot.protocol ?? 0);
    const protocolReason = terminalProtocolReason(
      protocol,
      this.options.herdrClientProtocol,
    );
    const terminalStreaming =
      this.options.terminalStreamingConfigured === true && !protocolReason;
    const terminalReason = terminalStreaming
      ? ""
      : protocolReason ||
        "This herdr-web bridge is not configured for Herdr terminal sessions.";
    const allPaneIds = (result.snapshot.panes ?? [])
      .map(({ pane_id: paneId }) => paneId)
      .filter((paneId): paneId is string => Boolean(paneId));
    const paneIds = terminalStreaming ? [] : allPaneIds.slice(0, 64);
    const agentPaneIds = (result.snapshot.agents ?? [])
      .map(({ pane_id: paneId }) => paneId)
      .filter((paneId): paneId is string => Boolean(paneId));
    const previewPaneIds = terminalStreaming
      ? agentPaneIds.slice(0, MAX_AGENT_PREVIEWS)
      : [];
    const readPane = (paneId: string, lines: number) =>
      this.client.request<PaneReadResponse>("pane.read", {
        format: "text",
        lines,
        pane_id: paneId,
        source: "recent_unwrapped",
        strip_ansi: true,
      });
    const [settled, previewSettled] = await Promise.all([
      Promise.allSettled(paneIds.map((paneId) => readPane(paneId, 240))),
      settleWithConcurrency(previewPaneIds, 8, (paneId) =>
        readPane(paneId, 12),
      ),
    ]);
    const readErrors: Record<string, string> = Object.fromEntries(
      (terminalStreaming ? [] : allPaneIds)
        .slice(64)
        .map((paneId) => [
          paneId,
          "Output was not loaded because the snapshot contains more than 64 panes",
        ]),
    );
    const reads: Record<string, PaneReadResponse["read"]> = {};
    settled.forEach((entry, index) => {
      const paneId = paneIds[index];
      if (!paneId) return;
      if (entry.status === "rejected") {
        readErrors[paneId] =
          entry.reason instanceof Error
            ? entry.reason.message
            : "Terminal output could not be read";
        return;
      }
      if (entry.value.type !== "pane_read") {
        readErrors[paneId] = "Herdr returned invalid terminal output";
        return;
      }
      reads[paneId] = entry.value.read;
    });
    const previews: Record<string, PaneReadResponse["read"]> = {};
    previewSettled.forEach((entry, index) => {
      const paneId = previewPaneIds[index];
      if (
        paneId &&
        entry.status === "fulfilled" &&
        entry.value.type === "pane_read"
      ) {
        previews[paneId] = {
          ...entry.value.read,
          text: entry.value.read.text.slice(-65_536),
        };
      }
    });
    return {
      capabilities: {
        previewsTruncated:
          terminalStreaming && agentPaneIds.length > MAX_AGENT_PREVIEWS,
        statusSubscriptionsTruncated:
          agentPaneIds.length > MAX_AGENT_STATUS_SUBSCRIPTIONS,
        terminalReason,
        terminalStreaming,
      },
      previews,
      readErrors,
      reads,
      snapshot: result.snapshot,
    };
  }

  async subscribeEvents(
    signal: AbortSignal,
    onEvent: (event: unknown) => void,
    onReady?: () => void,
  ): Promise<void> {
    let ready = false;
    while (!signal.aborted) {
      const snapshot = await this.client.request<SessionSnapshotResult>(
        "session.snapshot",
        {},
      );
      if (snapshot.type !== "session_snapshot" || !snapshot.snapshot) {
        throw new Error("Herdr returned an invalid session snapshot");
      }
      const agentStatusSubscriptions = (snapshot.snapshot.panes ?? [])
        .map(({ pane_id: paneId }) => paneId)
        .filter((paneId): paneId is string => Boolean(paneId))
        .slice(0, MAX_AGENT_STATUS_SUBSCRIPTIONS)
        .map((paneId) => ({
          pane_id: paneId,
          type: "pane.agent_status_changed",
        }));
      const controller = new AbortController();
      let resubscribe = false;
      const abort = () => controller.abort();
      signal.addEventListener("abort", abort, { once: true });
      try {
        await this.client.subscribe(
          "events.subscribe",
          {
            subscriptions: [
              ...STRUCTURAL_SUBSCRIPTIONS,
              ...agentStatusSubscriptions,
            ],
          },
          {
            onEvent: (event) => {
              onEvent(event);
              const name =
                event && typeof event === "object" && "event" in event
                  ? String(event.event)
                  : "";
              if (name === "pane_created" || name === "pane_closed") {
                resubscribe = true;
                controller.abort();
              }
            },
            onReady: () => {
              if (!ready) onReady?.();
              ready = true;
            },
            signal: controller.signal,
          },
        );
      } finally {
        signal.removeEventListener("abort", abort);
      }
      if (!resubscribe) return;
    }
  }

  private async paneCwd(paneId: string): Promise<string> {
    const result = await this.client.request<PaneInfoResponse>("pane.get", {
      pane_id: paneId,
    });
    if (result.type !== "pane_info" || !result.pane) {
      throw new TypeError("Herdr returned invalid pane information");
    }
    const cwd = result.pane.foreground_cwd ?? result.pane.cwd;
    if (!cwd) {
      throw new TypeError("Herdr pane did not report a working directory");
    }
    return cwd;
  }

  async uploadImage(
    paneId: string,
    input: ImageUploadInput,
  ): Promise<UploadedImage> {
    validateImage(input);
    return writePaneImage(
      await this.paneCwd(paneId),
      input,
      this.options.projectsRoot,
      this.options.uploadsRoot,
    );
  }

  async uploadFile(
    paneId: string,
    input: FileUploadInput,
  ): Promise<UploadedFile> {
    validateFile(input);
    return writePaneFile(
      await this.paneCwd(paneId),
      input,
      this.options.projectsRoot,
      this.options.uploadsRoot,
    );
  }

  promptAgent(target: string, text: string): Promise<unknown> {
    return this.client.request("agent.prompt", { target, text });
  }

  listPlugins(): Promise<unknown> {
    return this.client.request("plugin.list", {});
  }

  listPluginActions(): Promise<unknown> {
    return this.client.request("plugin.action.list", {});
  }

  listPluginLogs(pluginId?: string): Promise<unknown> {
    return this.client.request("plugin.log.list", {
      limit: 50,
      ...(pluginId ? { plugin_id: pluginId } : {}),
    });
  }

  setPluginEnabled(pluginId: string, enabled: boolean): Promise<unknown> {
    return this.client.request(enabled ? "plugin.enable" : "plugin.disable", {
      plugin_id: pluginId,
    });
  }

  invokePluginAction(actionId: string): Promise<unknown> {
    return this.client.request(
      "plugin.action.invoke",
      {
        action_id: actionId,
        context: { invocation_source: "herdr-web" },
      },
      { timeoutMs: RUNTIME_MUTATION_TIMEOUT_MS },
    );
  }

  manageIntegration(
    target: string,
    action: IntegrationAction,
  ): Promise<unknown> {
    return this.client.request(
      `integration.${action}`,
      { target },
      { timeoutMs: RUNTIME_MUTATION_TIMEOUT_MS },
    );
  }

  splitPane(paneId: string, direction: PaneSplitDirection): Promise<unknown> {
    return this.client.request("pane.split", {
      direction,
      focus: true,
      target_pane_id: paneId,
    });
  }

  setSplitRatio(
    tabId: string,
    path: boolean[],
    ratio: number,
  ): Promise<unknown> {
    return this.client.request("layout.set_split_ratio", {
      path,
      ratio,
      tab_id: tabId,
    });
  }

  closePane(paneId: string): Promise<unknown> {
    return this.client.request("pane.close", { pane_id: paneId });
  }

  closeTab(tabId: string): Promise<unknown> {
    return this.client.request("tab.close", { tab_id: tabId });
  }

  createTerminal(input: CreateTerminalInput): Promise<unknown> {
    return this.client.request("tab.create", {
      focus: true,
      label: input.label,
      workspace_id: input.workspaceId,
    });
  }

  renameTab(tabId: string, label: string): Promise<unknown> {
    return this.client.request("tab.rename", { label, tab_id: tabId });
  }

  moveTab(tabId: string, direction: "left" | "right"): Promise<unknown> {
    return this.client.request("tab.move", { direction, tab_id: tabId });
  }

  agentLifecycle(
    target: string,
    action: AgentLifecycleAction,
  ): Promise<unknown> {
    return this.client.request(`agent.${action}`, { target });
  }

  createWorkspace(input: CreateWorkspaceInput): Promise<unknown> {
    return this.client.request("workspace.create", {
      cwd: input.cwd,
      env: {},
      focus: true,
      ...(input.label ? { label: input.label } : {}),
    });
  }

  private async startAgent(
    input: CreateSessionInput,
    paneId: string,
  ): Promise<unknown> {
    const runtime = RUNTIMES[input.runtime];
    if (!runtime) throw new TypeError("Unsupported agent runtime or command");
    const startDeadline = Date.now() + 60_000;
    let started: unknown;
    while (Date.now() < startDeadline) {
      try {
        started = await this.client.request(
          "agent.start",
          {
            args: runtime.args,
            kind: runtime.kind,
            name: input.label,
            pane_id: paneId,
            timeout_ms: 60_000,
          },
          { timeoutMs: 65_000 },
        );
        break;
      } catch (error) {
        if (
          !(error instanceof HerdrApiError) ||
          error.code !== "agent_pane_busy"
        ) {
          throw error;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
    }
    if (!started)
      throw new Error("The new terminal did not reach a shell prompt");
    const readinessDeadline = Date.now() + 60_000;
    while (Date.now() < readinessDeadline) {
      const info = await this.client.request<{
        agent?: { agent?: string | null; interactive_ready?: boolean };
      }>("agent.get", { target: paneId });
      if (info.agent?.agent === runtime.kind && info.agent.interactive_ready) {
        return { ...(started as object), agent: info.agent };
      }
      await new Promise((resolve) => setTimeout(resolve, 250));
    }
    throw new Error("The new agent did not become ready for prompts");
  }

  async createSession(input: CreateSessionInput): Promise<unknown> {
    const runtime = RUNTIMES[input.runtime];
    if (!runtime || runtime.command !== input.command) {
      throw new TypeError("Unsupported agent runtime or command");
    }
    const created = await this.client.request<TabCreatedResponse>(
      "tab.create",
      {
        focus: false,
        label: input.label,
        workspace_id: input.workspaceId,
        ...(input.cwd ? { cwd: input.cwd } : {}),
      },
    );
    if (created.type !== "tab_created" || !created.root_pane?.pane_id) {
      throw new Error("Herdr did not return the new root pane");
    }
    let started: unknown;
    try {
      started = await this.startAgent(input, created.root_pane.pane_id);
    } catch (error) {
      await this.client
        .request("tab.close", { tab_id: created.tab.tab_id })
        .catch(() => undefined);
      throw error;
    }
    if (input.initialPrompt) {
      try {
        await this.promptAgent(created.root_pane.pane_id, input.initialPrompt);
      } catch (error) {
        return {
          ...(started && typeof started === "object" ? started : {}),
          initial_prompt_error:
            error instanceof Error ? error.message : "Initial prompt failed",
        };
      }
    }
    return started;
  }
}
