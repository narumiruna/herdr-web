import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { readProductStorage, writeProductStorage } from "./product-storage";
import type { Agent, AgentStatus, HerdrState } from "./state";

const STORAGE_KEY = "attention-preferences";
const DEFAULT_COOLDOWN_MS = 60_000;
const MAX_SNOOZE_MS = 7 * 24 * 60 * 60 * 1_000;

export interface AttentionPreferences {
  cooldownMs: number;
  firstSeenAt: Record<string, number>;
  mutedAgentIds: string[];
  notificationEnabled: boolean;
  notificationPrivacy: "full" | "private";
  notifiedAt: Record<string, number>;
  reviewedKeys: Record<string, string>;
  snoozedUntil: Record<string, number>;
  soundEnabled: boolean;
  version: 1;
}

export interface AttentionItem {
  agent: Agent;
  firstSeenAt: number;
  key: string;
}

export interface AttentionGroups {
  done: AttentionItem[];
  failed: AttentionItem[];
  needsInput: AttentionItem[];
}

const DEFAULT_PREFERENCES: AttentionPreferences = {
  cooldownMs: DEFAULT_COOLDOWN_MS,
  firstSeenAt: {},
  mutedAgentIds: [],
  notificationEnabled: false,
  notificationPrivacy: "full",
  notifiedAt: {},
  reviewedKeys: {},
  snoozedUntil: {},
  soundEnabled: false,
  version: 1,
};

function defaultAttentionPreferences(): AttentionPreferences {
  return {
    ...DEFAULT_PREFERENCES,
    firstSeenAt: {},
    mutedAgentIds: [],
    notifiedAt: {},
    reviewedKeys: {},
    snoozedUntil: {},
  };
}

function stringRecord(value: unknown): Record<string, string> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, string] => typeof entry[1] === "string",
    ),
  );
}

function numberRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(
    Object.entries(value).filter(
      (entry): entry is [string, number] =>
        typeof entry[1] === "number" && Number.isFinite(entry[1]),
    ),
  );
}

export function parseAttentionPreferences(
  value: string | null,
): AttentionPreferences {
  if (!value) return defaultAttentionPreferences();
  try {
    const parsed = JSON.parse(value) as Partial<AttentionPreferences>;
    const cooldown = Number(parsed.cooldownMs);
    return {
      cooldownMs:
        Number.isFinite(cooldown) && cooldown >= 5_000 && cooldown <= 600_000
          ? cooldown
          : DEFAULT_COOLDOWN_MS,
      firstSeenAt: numberRecord(parsed.firstSeenAt),
      mutedAgentIds: Array.isArray(parsed.mutedAgentIds)
        ? [
            ...new Set(
              parsed.mutedAgentIds.filter((id) => typeof id === "string"),
            ),
          ]
        : [],
      notificationEnabled: parsed.notificationEnabled === true,
      notificationPrivacy:
        parsed.notificationPrivacy === "private" ? "private" : "full",
      notifiedAt: numberRecord(parsed.notifiedAt),
      reviewedKeys: stringRecord(parsed.reviewedKeys),
      snoozedUntil: numberRecord(parsed.snoozedUntil),
      soundEnabled: parsed.soundEnabled === true,
      version: 1,
    };
  } catch {
    return defaultAttentionPreferences();
  }
}

export function attentionKey(agent: Agent, transitionAt = 0): string {
  return `${agent.status}:${transitionAt}`;
}

function attentionStatus(status: AgentStatus): boolean {
  return status === "blocked" || status === "done" || status === "failed";
}

export function deriveAttentionGroups(
  state: HerdrState,
  preferences: AttentionPreferences,
  now = Date.now(),
): AttentionGroups {
  const result: AttentionGroups = { done: [], failed: [], needsInput: [] };
  for (const agent of state.agents) {
    if (agent.kind !== "agent" || !attentionStatus(agent.status)) continue;
    const firstSeenAt = preferences.firstSeenAt[agent.id] ?? now;
    const key = attentionKey(agent, firstSeenAt);
    if (preferences.reviewedKeys[agent.id] === key) continue;
    if ((preferences.snoozedUntil[agent.id] ?? 0) > now) continue;
    const item = {
      agent,
      firstSeenAt,
      key,
    };
    if (agent.status === "blocked") result.needsInput.push(item);
    else if (agent.status === "failed") result.failed.push(item);
    else result.done.push(item);
  }
  return result;
}

function notificationTitle(
  agent: Agent,
  privacy: AttentionPreferences["notificationPrivacy"],
): string {
  if (privacy === "private") {
    return agent.status === "done"
      ? "A Herdr Agent completed"
      : "A Herdr Agent needs attention";
  }
  if (agent.status === "blocked") return `${agent.label} needs input`;
  if (agent.status === "failed") return `${agent.label} failed`;
  return `${agent.label} completed`;
}

function notificationUrl(agent: Agent): string {
  const url = new URL(window.location.href);
  url.searchParams.set("workspace", agent.workspaceId);
  url.searchParams.set("session", agent.id);
  url.searchParams.set("pane", agent.activePaneId);
  return `${url.pathname}${url.search}${url.hash}`;
}

async function playAttentionTone(): Promise<void> {
  const AudioContextClass = window.AudioContext;
  if (typeof AudioContextClass !== "function") return;
  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gain = context.createGain();
  oscillator.frequency.value = 660;
  gain.gain.setValueAtTime(0.0001, context.currentTime);
  gain.gain.exponentialRampToValueAtTime(0.08, context.currentTime + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, context.currentTime + 0.16);
  oscillator.connect(gain);
  gain.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.17);
  oscillator.addEventListener("ended", () => void context.close(), {
    once: true,
  });
}

async function showAgentNotification(
  agent: Agent,
  workspaceName: string,
  privacy: AttentionPreferences["notificationPrivacy"],
  backgroundPushActive: boolean,
  onOpen: (agentId: string, paneId: string) => void,
): Promise<"delivered" | "push-active"> {
  if (backgroundPushActive) return "push-active";
  const title = notificationTitle(agent, privacy);
  const url = notificationUrl(agent);
  const options: NotificationOptions = {
    body:
      privacy === "private"
        ? "Open herdr-web to review this Agent."
        : `${workspaceName} · ${agent.currentStep || agent.summary}`,
    data: { url },
    icon: "/icons/herdr-web-192.png",
    tag: `herdr-web-${agent.id}-${agent.status}`,
  };
  try {
    const ready = navigator.serviceWorker?.ready;
    const registration = ready
      ? await Promise.race([
          ready,
          new Promise<undefined>((resolve) =>
            window.setTimeout(() => resolve(undefined), 750),
          ),
        ])
      : undefined;
    if (registration) {
      await registration.showNotification(title, options);
      return "delivered";
    }
  } catch {
    // Fall back to a page-owned Notification when service workers are absent.
  }
  const notification = new Notification(title, options);
  notification.onclick = () => {
    window.focus();
    window.history.pushState({}, "", url);
    onOpen(agent.id, agent.activePaneId);
    notification.close();
  };
  return "delivered";
}

const backgroundPushInactive = () => false;

interface UseAttentionCenterInput {
  isBackgroundPushActive?: () => boolean;
  onOpenAgent: (agentId: string, paneId: string) => void;
  state: HerdrState;
}

export function useAttentionCenter({
  isBackgroundPushActive = backgroundPushInactive,
  onOpenAgent,
  state,
}: UseAttentionCenterInput) {
  const [preferences, setPreferences] = useState<AttentionPreferences>(() => {
    if (typeof window.localStorage?.getItem !== "function") {
      return defaultAttentionPreferences();
    }
    return parseAttentionPreferences(
      readProductStorage(window.localStorage, STORAGE_KEY),
    );
  });
  const [now, setNow] = useState(() => Date.now());
  const previousStatus = useRef<Record<string, AgentStatus>>({});
  const initialized = useRef(false);
  const pendingNotifications = useRef(new Set<string>());

  useEffect(() => {
    if (typeof window.localStorage?.setItem === "function") {
      writeProductStorage(
        window.localStorage,
        STORAGE_KEY,
        JSON.stringify(preferences),
      );
    }
  }, [preferences]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const onServiceWorkerMessage = (event: MessageEvent) => {
      const data = event.data as { type?: string; url?: string } | undefined;
      if (!data?.url) return;
      const url = new URL(data.url, window.location.href);
      const agentId = url.searchParams.get("session") ?? "";
      const paneId = url.searchParams.get("pane") ?? "";
      const canNavigate = state.agents.some(({ id }) => id === agentId);
      if (data.type === "notification.can-navigate") {
        event.ports[0]?.postMessage({ canNavigate });
        return;
      }
      if (data.type === "notification.navigate" && canNavigate) {
        onOpenAgent(agentId, paneId);
      }
    };
    navigator.serviceWorker?.addEventListener(
      "message",
      onServiceWorkerMessage,
    );
    return () =>
      navigator.serviceWorker?.removeEventListener(
        "message",
        onServiceWorkerMessage,
      );
  }, [onOpenAgent, state.agents]);

  useEffect(() => {
    const timestamp = Date.now();
    const nextStatuses: Record<string, AgentStatus> = {};
    const firstSeen = { ...preferences.firstSeenAt };
    const reviewedKeys = { ...preferences.reviewedKeys };
    const snoozedUntil = { ...preferences.snoozedUntil };
    let transitionStateChanged = false;
    for (const agent of state.agents) {
      if (agent.kind !== "agent") continue;
      nextStatuses[agent.id] = agent.status;
      const previous = previousStatus.current[agent.id];
      const attentionTransition =
        initialized.current &&
        previous !== undefined &&
        previous !== agent.status &&
        attentionStatus(agent.status);
      if (
        attentionStatus(agent.status) &&
        (!firstSeen[agent.id] || attentionTransition)
      ) {
        firstSeen[agent.id] = timestamp;
        delete reviewedKeys[agent.id];
        delete snoozedUntil[agent.id];
        transitionStateChanged = true;
      } else if (!attentionStatus(agent.status) && firstSeen[agent.id]) {
        delete firstSeen[agent.id];
        delete reviewedKeys[agent.id];
        delete snoozedUntil[agent.id];
        transitionStateChanged = true;
      }
    }
    if (transitionStateChanged) {
      setPreferences((current) => ({
        ...current,
        firstSeenAt: firstSeen,
        reviewedKeys,
        snoozedUntil,
      }));
    }
    if (!initialized.current) {
      previousStatus.current = nextStatuses;
      initialized.current = true;
      return;
    }
    for (const agent of state.agents) {
      if (agent.kind !== "agent" || !attentionStatus(agent.status)) continue;
      const previous = previousStatus.current[agent.id];
      if (!previous || previous === agent.status) continue;
      if (!preferences.notificationEnabled) continue;
      if (preferences.mutedAgentIds.includes(agent.id)) continue;
      if ((preferences.snoozedUntil[agent.id] ?? 0) > timestamp) continue;
      if (
        typeof window.Notification !== "function" ||
        Notification.permission !== "granted"
      ) {
        continue;
      }
      const transitionAt =
        previous !== agent.status
          ? timestamp
          : (firstSeen[agent.id] ?? timestamp);
      const key = `${agent.id}:${attentionKey(agent, transitionAt)}`;
      if (
        preferences.notifiedAt[key] ||
        pendingNotifications.current.has(key)
      ) {
        continue;
      }
      const lastAgentNotification = Math.max(
        0,
        ...Object.entries(preferences.notifiedAt)
          .filter(([entry]) => entry.startsWith(`${agent.id}:`))
          .map(([, sentAt]) => sentAt),
      );
      if (timestamp - lastAgentNotification < preferences.cooldownMs) continue;
      const workspace = state.workspaces.find(
        ({ id }) => id === agent.workspaceId,
      );
      pendingNotifications.current.add(key);
      void showAgentNotification(
        agent,
        workspace?.name ?? "Herdr",
        preferences.notificationPrivacy,
        isBackgroundPushActive(),
        onOpenAgent,
      )
        .then((delivery) => {
          setPreferences((current) => {
            const entries = Object.entries({
              ...current.notifiedAt,
              [key]: timestamp,
            })
              .sort((left, right) => right[1] - left[1])
              .slice(0, 512);
            return { ...current, notifiedAt: Object.fromEntries(entries) };
          });
          if (delivery === "delivered" && preferences.soundEnabled) {
            void playAttentionTone().catch(() => undefined);
          }
        })
        .catch(() => undefined)
        .finally(() => pendingNotifications.current.delete(key));
    }
    previousStatus.current = nextStatuses;
  }, [
    isBackgroundPushActive,
    onOpenAgent,
    preferences,
    state.agents,
    state.workspaces,
  ]);

  const patch = useCallback((update: Partial<AttentionPreferences>) => {
    setPreferences((current) => ({ ...current, ...update }));
  }, []);
  const setMuted = useCallback((agentId: string, muted: boolean) => {
    setPreferences((current) => ({
      ...current,
      mutedAgentIds: muted
        ? [...new Set([...current.mutedAgentIds, agentId])]
        : current.mutedAgentIds.filter((id) => id !== agentId),
    }));
  }, []);
  const snooze = useCallback((agentId: string, durationMs: number) => {
    const bounded = Math.max(60_000, Math.min(MAX_SNOOZE_MS, durationMs));
    setPreferences((current) => ({
      ...current,
      snoozedUntil: {
        ...current.snoozedUntil,
        [agentId]: Date.now() + bounded,
      },
    }));
  }, []);
  const markReviewed = useCallback((agent: Agent) => {
    setPreferences((current) => {
      const transitionAt = current.firstSeenAt[agent.id] ?? Date.now();
      return {
        ...current,
        firstSeenAt: {
          ...current.firstSeenAt,
          [agent.id]: transitionAt,
        },
        reviewedKeys: {
          ...current.reviewedKeys,
          [agent.id]: attentionKey(agent, transitionAt),
        },
      };
    });
  }, []);
  const requestPermission = useCallback(async () => {
    if (typeof window.Notification !== "function") {
      patch({ notificationEnabled: false });
      return "unsupported" as const;
    }
    try {
      const permission = await Notification.requestPermission();
      patch({ notificationEnabled: permission === "granted" });
      return permission;
    } catch {
      return "denied" as const;
    }
  }, [patch]);

  return {
    groups: useMemo(
      () => deriveAttentionGroups(state, preferences, now),
      [now, preferences, state],
    ),
    markReviewed,
    patch,
    preferences,
    requestPermission,
    setMuted,
    snooze,
  };
}
