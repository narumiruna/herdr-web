import { HerdrApiError, type HerdrClient } from "./herdr-client.js";
import {
  type ImageUploadInput,
  type UploadedImage,
  validateImage,
  writePaneImage,
} from "./image-upload.js";

interface SessionSnapshotResult {
  type: "session_snapshot";
  snapshot: {
    panes?: Array<{ pane_id?: string }>;
    [key: string]: unknown;
  };
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

interface PaneInfoResponse {
  type: "pane_info";
  pane: {
    cwd?: string;
    foreground_cwd?: string;
  };
}

interface ServiceOptions {
  projectsRoot?: string;
  terminalStreamingConfigured?: boolean;
}

export interface CreateSessionInput {
  command: string;
  label: string;
  runtime: string;
  workspaceId: string;
}

export interface CreateWorkspaceInput {
  cwd: string;
  label?: string;
}

export type PaneSplitDirection = "down" | "right";

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
};

export class LiveHerdrService {
  constructor(
    private readonly client: HerdrClient,
    private readonly options: ServiceOptions = {},
  ) {}

  async getState(): Promise<{
    capabilities: {
      terminalReason: string;
      terminalStreaming: boolean;
    };
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
    const protocol = Number(result.snapshot.protocol ?? 0);
    const terminalStreaming =
      this.options.terminalStreamingConfigured === true && protocol >= 19;
    const terminalReason = terminalStreaming
      ? ""
      : protocol < 19
        ? `Herdr protocol ${protocol || "unknown"} does not provide terminal sessions; Herdr 0.8 or newer is required.`
        : "This Hedr bridge is not configured for Herdr terminal sessions.";
    const allPaneIds = (result.snapshot.panes ?? [])
      .map(({ pane_id: paneId }) => paneId)
      .filter((paneId): paneId is string => Boolean(paneId));
    const paneIds = terminalStreaming ? [] : allPaneIds.slice(0, 64);
    const settled = await Promise.allSettled(
      paneIds.map((paneId) =>
        this.client.request<PaneReadResponse>("pane.read", {
          format: "text",
          lines: 240,
          pane_id: paneId,
          source: "recent_unwrapped",
          strip_ansi: true,
        }),
      ),
    );
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
    return {
      capabilities: { terminalReason, terminalStreaming },
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
        .slice(0, 128)
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

  async uploadImage(
    paneId: string,
    input: ImageUploadInput,
  ): Promise<UploadedImage> {
    validateImage(input);
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
    return writePaneImage(cwd, input, this.options.projectsRoot);
  }

  promptAgent(target: string, text: string): Promise<unknown> {
    return this.client.request("agent.prompt", { target, text });
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
    const deadline = Date.now() + 60_000;
    let started: unknown;
    while (Date.now() < deadline) {
      try {
        started = await this.client.request("agent.start", {
          args: runtime.args,
          kind: runtime.kind,
          name: input.label,
          pane_id: paneId,
          timeout_ms: 60_000,
        });
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
    while (Date.now() < deadline) {
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
      },
    );
    if (created.type !== "tab_created" || !created.root_pane?.pane_id) {
      throw new Error("Herdr did not return the new root pane");
    }
    try {
      return await this.startAgent(input, created.root_pane.pane_id);
    } catch (error) {
      await this.client
        .request("tab.close", { tab_id: created.tab.tab_id })
        .catch(() => undefined);
      throw error;
    }
  }
}
