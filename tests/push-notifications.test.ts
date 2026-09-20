import { mkdir, mkdtemp, readFile, rename, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, test, vi } from "vitest";
import {
  type BrowserPushSubscription,
  PushNotificationService,
} from "../server/push-notifications";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

function state(status: string, paneId = "w1:p1") {
  return {
    snapshot: {
      agents: [
        {
          agent: "pi",
          agent_status: status,
          pane_id: paneId,
          terminal_title_stripped: "security-review",
          tokens: { summary: "Waiting for approval" },
          workspace_id: "w1",
        },
      ],
      workspaces: [{ label: "private-project", workspace_id: "w1" }],
    },
  };
}

const subscription: BrowserPushSubscription = {
  endpoint: "https://push.example.test/subscription/one",
  keys: { auth: "auth_key", p256dh: "p256dh_key" },
};

describe("background Web Push notifications", () => {
  for (const privacy of ["full", "private"] as const) {
    test.each([
      ["blocked", "needs input"],
      ["failed", "failed"],
      ["done", "completed"],
    ] as const)(
      `preserves ${privacy} background %s content and Agent-pane links`,
      async (status, label) => {
        const directory = await mkdtemp(join(tmpdir(), "herdr-push-content-"));
        directories.push(directory);
        const send = vi.fn().mockResolvedValue(undefined);
        const service = new PushNotificationService(
          join(directory, "push.json"),
          { send },
        );
        await service.load();
        await service.upsert(
          subscription,
          { cooldownMs: 5_000, mutedAgentIds: [], privacy, soundEnabled: true },
          state("idle"),
        );
        const next = state(status);
        next.snapshot.agents[0].tokens.summary = "";
        await service.processState(next);
        expect(send).toHaveBeenCalledOnce();
        expect(JSON.parse(send.mock.calls[0][1])).toEqual({
          body:
            privacy === "private"
              ? "Open herdr-web to review this Agent."
              : `private-project · ${status}`,
          data: { url: "/?pane=w1%3Ap1&session=w1%3Ap1&workspace=w1" },
          icon: "/icons/herdr-web-192.png",
          silent: false,
          tag: `herdr-web-w1:p1-${status}`,
          title:
            privacy === "private"
              ? status === "done"
                ? "A Herdr Agent completed"
                : "A Herdr Agent needs attention"
              : `security-review ${label}`,
        });
      },
    );
  }

  test("persists concurrent subscriptions and recovers its write queue after failure", async () => {
    const directory = await mkdtemp(join(tmpdir(), "herdr-push-queue-"));
    directories.push(directory);
    const path = join(directory, "push.json");
    const service = new PushNotificationService(path, { send: vi.fn() });
    await service.load();
    const publicKey = service.publicKey();
    const preferences = {
      cooldownMs: 5_000,
      mutedAgentIds: [],
      privacy: "private" as const,
      soundEnabled: false,
    };
    const second = {
      ...subscription,
      endpoint: "https://push.example.test/subscription/two",
    };
    await Promise.all([
      service.upsert(subscription, preferences, state("idle")),
      service.upsert(second, preferences, state("idle")),
    ]);
    expect(
      JSON.parse(await readFile(path, "utf8")).subscriptions.map(
        (entry: { subscription: BrowserPushSubscription }) =>
          entry.subscription.endpoint,
      ),
    ).toEqual([subscription.endpoint, second.endpoint]);

    const backup = join(directory, "backup.json");
    await rename(path, backup);
    // A directory at the target makes the atomic rename fail, not the mutation itself.
    await mkdir(path);
    await expect(service.remove(subscription.endpoint)).rejects.toThrow();
    expect(service.hasSubscriptions()).toBe(true);
    await rm(path, { recursive: true });
    await rename(backup, path);
    await service.upsert(second, preferences, state("done"));
    const reloaded = new PushNotificationService(path, { send: vi.fn() });
    await reloaded.load();
    expect(reloaded.publicKey()).toBe(publicKey);
    const stored = JSON.parse(await readFile(path, "utf8"));
    expect(stored.subscriptions).toHaveLength(1);
    expect(stored.subscriptions[0]).toMatchObject({
      subscription: second,
      lastStatuses: { "w1:p1": "done" },
    });
  });

  test("baselines subscriptions and sends deduplicated private transition pushes", async () => {
    const directory = await mkdtemp(join(tmpdir(), "herdr-push-"));
    directories.push(directory);
    let now = 10_000;
    const send = vi.fn().mockResolvedValue(undefined);
    const service = new PushNotificationService(join(directory, "push.json"), {
      now: () => now,
      send,
    });
    await service.load();
    expect(service.publicKey()).toMatch(/^[A-Za-z0-9_-]+$/);
    await service.upsert(
      subscription,
      {
        cooldownMs: 5_000,
        mutedAgentIds: [],
        privacy: "private",
        soundEnabled: false,
      },
      state("idle"),
    );

    await service.processState(state("blocked"));
    expect(send).toHaveBeenCalledOnce();
    const payload = JSON.parse(send.mock.calls[0]?.[1] as string) as {
      body: string;
      data: { url: string };
      silent: boolean;
      title: string;
    };
    expect(payload).toMatchObject({
      data: { url: expect.stringContaining("pane=w1%3Ap1") },
      silent: true,
      title: "A Herdr Agent needs attention",
    });
    expect(JSON.stringify(payload)).not.toContain("security-review");
    expect(JSON.stringify(payload)).not.toContain("private-project");

    await service.processState(state("blocked"));
    expect(send).toHaveBeenCalledOnce();
    now += 6_000;
    await service.processState(state("done"));
    expect(send).toHaveBeenCalledTimes(2);
  });

  test("prunes status and cooldown history for Agents that no longer exist", async () => {
    const directory = await mkdtemp(join(tmpdir(), "herdr-push-prune-"));
    directories.push(directory);
    const path = join(directory, "push.json");
    const service = new PushNotificationService(path, {
      send: vi.fn().mockResolvedValue(undefined),
    });
    await service.load();
    await service.upsert(
      subscription,
      {
        cooldownMs: 5_000,
        mutedAgentIds: [],
        privacy: "full",
        soundEnabled: false,
      },
      state("idle"),
    );
    await service.processState(state("blocked"));
    await service.processState(state("idle", "w1:p2"));

    const persisted = JSON.parse(await readFile(path, "utf8")) as {
      subscriptions: Array<{
        lastNotifiedAt: Record<string, number>;
        lastStatuses: Record<string, string>;
      }>;
    };
    expect(persisted.subscriptions[0]?.lastStatuses).toEqual({
      "w1:p2": "idle",
    });
    expect(persisted.subscriptions[0]?.lastNotifiedAt).toEqual({});
  });

  test("honors per-Agent mute and removes stale push-service endpoints", async () => {
    const directory = await mkdtemp(join(tmpdir(), "herdr-push-stale-"));
    directories.push(directory);
    const stale = Object.assign(new Error("Gone"), { statusCode: 410 });
    const send = vi.fn().mockRejectedValue(stale);
    const service = new PushNotificationService(join(directory, "push.json"), {
      send,
    });
    await service.load();
    await service.upsert(
      subscription,
      {
        cooldownMs: 5_000,
        mutedAgentIds: ["w1:p1"],
        privacy: "full",
        soundEnabled: true,
      },
      state("idle"),
    );
    await service.processState(state("blocked"));
    expect(send).not.toHaveBeenCalled();

    await service.upsert(
      subscription,
      {
        cooldownMs: 5_000,
        mutedAgentIds: [],
        privacy: "full",
        soundEnabled: true,
      },
      state("idle"),
    );
    await service.processState(state("done"));
    expect(send).toHaveBeenCalledOnce();
    expect(service.hasSubscriptions()).toBe(false);
  });
});
