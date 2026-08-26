import { randomBytes } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import webpush, {
  type PushSubscription as WebPushSubscription,
} from "web-push";

export interface PushPreferences {
  cooldownMs: number;
  mutedAgentIds: string[];
  privacy: "full" | "private";
  soundEnabled: boolean;
}

export interface BrowserPushSubscription extends WebPushSubscription {
  endpoint: string;
  keys: { auth: string; p256dh: string };
}

interface StoredSubscription {
  createdAt: number;
  id: string;
  lastNotifiedAt: Record<string, number>;
  lastStatuses: Record<string, string>;
  preferences: PushPreferences;
  subscription: BrowserPushSubscription;
}

interface PushStore {
  privateKey: string;
  publicKey: string;
  subscriptions: StoredSubscription[];
  version: 1;
}

interface PushOptions {
  contact?: string;
  now?: () => number;
  send?: (
    subscription: BrowserPushSubscription,
    payload: string,
  ) => Promise<unknown>;
}

interface AgentProjection {
  currentStep: string;
  id: string;
  label: string;
  paneId: string;
  status: string;
  workspaceId: string;
  workspaceName: string;
}

type UnknownRecord = Record<string, unknown>;

function record(value: unknown): UnknownRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as UnknownRecord)
    : {};
}

function records(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.filter(
        (entry): entry is UnknownRecord =>
          Boolean(entry) && typeof entry === "object" && !Array.isArray(entry),
      )
    : [];
}

function projectAgents(state: unknown): AgentProjection[] {
  const snapshot = record(record(state).snapshot);
  const workspaces = records(snapshot.workspaces);
  return records(snapshot.agents).flatMap((agent) => {
    const id = typeof agent.pane_id === "string" ? agent.pane_id : "";
    const workspaceId =
      typeof agent.workspace_id === "string" ? agent.workspace_id : "";
    const status =
      typeof agent.agent_status === "string" ? agent.agent_status : "unknown";
    if (!id || !workspaceId) return [];
    const workspace = workspaces.find(
      ({ workspace_id: candidate }) => candidate === workspaceId,
    );
    const tokens = record(agent.tokens);
    return [
      {
        currentStep:
          typeof tokens.summary === "string"
            ? tokens.summary.slice(0, 500)
            : "",
        id,
        label:
          [
            agent.label,
            agent.terminal_title_stripped,
            agent.display_agent,
            agent.agent,
          ]
            .find((value) => typeof value === "string" && value.trim())
            ?.toString()
            .slice(0, 120) ?? "Agent",
        paneId: id,
        status,
        workspaceId,
        workspaceName:
          typeof workspace?.label === "string"
            ? workspace.label.slice(0, 120)
            : "Herdr",
      },
    ];
  });
}

function isAttentionStatus(status: string): boolean {
  return status === "blocked" || status === "done" || status === "failed";
}

function retainAgentHistory<T>(
  history: Record<string, T>,
  agentIds: Set<string>,
): Record<string, T> {
  return Object.fromEntries(
    Object.entries(history).filter(([agentId]) => agentIds.has(agentId)),
  );
}

function pushPayload(
  agent: AgentProjection,
  preferences: PushPreferences,
): string {
  const privateMode = preferences.privacy === "private";
  const title = privateMode
    ? agent.status === "done"
      ? "A Herdr Agent completed"
      : "A Herdr Agent needs attention"
    : agent.status === "blocked"
      ? `${agent.label} needs input`
      : agent.status === "failed"
        ? `${agent.label} failed`
        : `${agent.label} completed`;
  const query = new URLSearchParams({
    pane: agent.paneId,
    session: agent.id,
    workspace: agent.workspaceId,
  });
  return JSON.stringify({
    body: privateMode
      ? "Open herdr-web to review this Agent."
      : `${agent.workspaceName} · ${agent.currentStep || agent.status}`,
    data: { url: `/?${query}` },
    icon: "/icons/herdr-web-192.png",
    silent: !preferences.soundEnabled,
    tag: `herdr-web-${agent.id}-${agent.status}`,
    title,
  });
}

export class PushNotificationService {
  private store?: PushStore;
  private writes: Promise<void> = Promise.resolve();
  private readonly now: () => number;
  private readonly send: (
    subscription: BrowserPushSubscription,
    payload: string,
  ) => Promise<unknown>;
  private readonly contact: string;

  constructor(
    private readonly filePath: string,
    options: PushOptions = {},
  ) {
    this.now = options.now ?? Date.now;
    this.contact = options.contact ?? "mailto:herdr-web@localhost";
    this.send =
      options.send ??
      ((subscription, payload) =>
        webpush.sendNotification(subscription, payload, { TTL: 60 }));
  }

  async load(): Promise<void> {
    try {
      const parsed = JSON.parse(
        await readFile(this.filePath, "utf8"),
      ) as PushStore;
      if (
        parsed?.version === 1 &&
        typeof parsed.publicKey === "string" &&
        typeof parsed.privateKey === "string" &&
        Array.isArray(parsed.subscriptions)
      ) {
        this.store = parsed;
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    if (!this.store) {
      const keys = webpush.generateVAPIDKeys();
      this.store = {
        privateKey: keys.privateKey,
        publicKey: keys.publicKey,
        subscriptions: [],
        version: 1,
      };
      await this.persist();
    }
    webpush.setVapidDetails(
      this.contact,
      this.store.publicKey,
      this.store.privateKey,
    );
  }

  private requireStore(): PushStore {
    if (!this.store)
      throw new Error("PushNotificationService must be loaded first");
    return this.store;
  }

  private persist(): Promise<void> {
    const write = this.writes.then(async () => {
      const store = this.requireStore();
      await mkdir(dirname(this.filePath), { recursive: true });
      const temporary = `${this.filePath}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
      await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, {
        mode: 0o600,
      });
      await rename(temporary, this.filePath);
    });
    this.writes = write.catch(() => undefined);
    return write;
  }

  publicKey(): string {
    return this.requireStore().publicKey;
  }

  hasSubscriptions(): boolean {
    return this.requireStore().subscriptions.length > 0;
  }

  async upsert(
    subscription: BrowserPushSubscription,
    preferences: PushPreferences,
    state: unknown,
  ): Promise<void> {
    const store = this.requireStore();
    const existing = store.subscriptions.find(
      (entry) => entry.subscription.endpoint === subscription.endpoint,
    );
    const agents = projectAgents(state);
    const agentIds = new Set(agents.map(({ id }) => id));
    const lastStatuses = Object.fromEntries(
      agents.map((agent) => [agent.id, agent.status]),
    );
    if (existing) {
      existing.preferences = preferences;
      existing.subscription = subscription;
      existing.lastNotifiedAt = retainAgentHistory(
        existing.lastNotifiedAt,
        agentIds,
      );
      existing.lastStatuses = lastStatuses;
    } else {
      if (store.subscriptions.length >= 32) {
        throw new RangeError(
          "At most 32 browser push subscriptions may be stored",
        );
      }
      store.subscriptions.push({
        createdAt: this.now(),
        id: randomBytes(12).toString("base64url"),
        lastNotifiedAt: {},
        lastStatuses,
        preferences,
        subscription,
      });
    }
    await this.persist();
  }

  async remove(endpoint: string): Promise<boolean> {
    const store = this.requireStore();
    const subscriptions = store.subscriptions.filter(
      (entry) => entry.subscription.endpoint !== endpoint,
    );
    if (subscriptions.length === store.subscriptions.length) return false;
    store.subscriptions = subscriptions;
    await this.persist();
    return true;
  }

  async processState(state: unknown): Promise<void> {
    const store = this.requireStore();
    const agents = projectAgents(state);
    const agentIds = new Set(agents.map(({ id }) => id));
    const now = this.now();
    const staleEndpoints = new Set<string>();
    for (const entry of store.subscriptions) {
      entry.lastNotifiedAt = retainAgentHistory(entry.lastNotifiedAt, agentIds);
      entry.lastStatuses = retainAgentHistory(entry.lastStatuses, agentIds);
      for (const agent of agents) {
        const previous = entry.lastStatuses[agent.id];
        if (
          !previous ||
          previous === agent.status ||
          !isAttentionStatus(agent.status) ||
          entry.preferences.mutedAgentIds.includes(agent.id) ||
          now - (entry.lastNotifiedAt[agent.id] ?? 0) <
            entry.preferences.cooldownMs
        ) {
          entry.lastStatuses[agent.id] = agent.status;
          continue;
        }
        try {
          await this.send(
            entry.subscription,
            pushPayload(agent, entry.preferences),
          );
          entry.lastStatuses[agent.id] = agent.status;
          entry.lastNotifiedAt[agent.id] = now;
        } catch (error) {
          const statusCode = (error as { statusCode?: number }).statusCode;
          if (statusCode === 404 || statusCode === 410) {
            staleEndpoints.add(entry.subscription.endpoint);
            entry.lastStatuses[agent.id] = agent.status;
          }
        }
      }
    }
    if (staleEndpoints.size > 0) {
      store.subscriptions = store.subscriptions.filter(
        (entry) => !staleEndpoints.has(entry.subscription.endpoint),
      );
    }
    await this.persist();
  }
}
