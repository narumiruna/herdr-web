import { mkdtemp, rm } from "node:fs/promises";
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

function state(status: string) {
  return {
    snapshot: {
      agents: [
        {
          agent: "pi",
          agent_status: status,
          pane_id: "w1:p1",
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
