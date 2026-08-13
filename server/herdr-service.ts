import { HerdrApiError, type HerdrClient } from "./herdr-client.js";

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

export interface CreateSessionInput {
  command: string;
  label: string;
  runtime: string;
  workspaceId: string;
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
};

export class LiveHerdrService {
  constructor(private readonly client: HerdrClient) {}

  async getState(): Promise<{
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
    const paneIds = (result.snapshot.panes ?? [])
      .map(({ pane_id: paneId }) => paneId)
      .filter((paneId): paneId is string => Boolean(paneId))
      .slice(0, 64);
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
    const reads: Record<string, PaneReadResponse["read"]> = {};
    settled.forEach((entry, index) => {
      if (entry.status !== "fulfilled" || entry.value.type !== "pane_read") {
        return;
      }
      const paneId = paneIds[index];
      if (paneId) reads[paneId] = entry.value.read;
    });
    return { reads, snapshot: result.snapshot };
  }

  promptAgent(target: string, text: string): Promise<unknown> {
    return this.client.request("agent.prompt", { target, text });
  }

  splitPane(paneId: string): Promise<unknown> {
    return this.client.request("pane.split", {
      direction: "right",
      focus: true,
      target_pane_id: paneId,
    });
  }

  closePane(paneId: string): Promise<unknown> {
    return this.client.request("pane.close", { pane_id: paneId });
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
