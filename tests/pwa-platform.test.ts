import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { act, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createStaticHandler } from "../server/static-files";
import { useBackgroundPush } from "../src/use-background-push";
import { usePlatform } from "../src/use-platform";

const servers: Server[] = [];
const directories: string[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  Reflect.deleteProperty(navigator, "serviceWorker");
  Reflect.deleteProperty(navigator, "wakeLock");
  await Promise.all(
    servers
      .splice(0)
      .map(
        (server) =>
          new Promise<void>((resolve) => server.close(() => resolve())),
      ),
  );
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { force: true, recursive: true })),
  );
});

async function staticServer() {
  const root = await mkdtemp(join(tmpdir(), "herdr-static-"));
  directories.push(root);
  await writeFile(
    join(root, "index.html"),
    "<!doctype html><title>app</title>",
  );
  await writeFile(join(root, "manifest.webmanifest"), "{}");
  await writeFile(
    join(root, "sw.js"),
    "self.addEventListener('fetch',()=>{});",
  );
  await writeFile(join(root, "theme-init.js"), "export {};");
  await writeFile(join(root, "asset.js"), "export {};");
  const server = createServer(createStaticHandler(root));
  servers.push(server);
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("Missing port");
  return `http://127.0.0.1:${address.port}`;
}

describe("PWA platform shell", () => {
  test("ships an installable manifest and notification-click service worker without offline caches", async () => {
    const manifest = JSON.parse(
      await readFile("public/manifest.webmanifest", "utf8"),
    ) as { display: string; icons: Array<{ sizes: string }> };
    const worker = await readFile("public/sw.js", "utf8");

    expect(manifest.display).toBe("standalone");
    expect(manifest.icons.map(({ sizes }) => sizes)).toEqual([
      "192x192",
      "512x512",
    ]);
    expect(worker).toContain('addEventListener("push"');
    expect(worker).toContain('addEventListener("notificationclick"');
    expect(worker).toContain("never cached");
    expect(worker).not.toContain("caches.open");
  });

  test("acquires and releases only a foreground connected screen wake lock", async () => {
    const sentinel = new EventTarget() as EventTarget & {
      release: ReturnType<typeof vi.fn>;
      released: boolean;
    };
    sentinel.released = false;
    sentinel.release = vi.fn(async () => {
      sentinel.released = true;
      sentinel.dispatchEvent(new Event("release"));
    });
    const request = vi.fn().mockResolvedValue(sentinel);
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request },
    });

    const hook = renderHook(() => usePlatform(true, "connected"));
    await waitFor(() => expect(request).toHaveBeenCalledWith("screen"));
    await waitFor(() => expect(hook.result.current.wakeLockActive).toBe(true));
    hook.unmount();
    await waitFor(() => expect(sentinel.release).toHaveBeenCalledOnce());
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: undefined,
    });
  });

  test("releases a wake lock that resolves after effect cleanup", async () => {
    let resolveRequest: ((sentinel: unknown) => void) | undefined;
    const release = vi.fn().mockResolvedValue(undefined);
    const request = vi.fn(
      () =>
        new Promise((resolve) => {
          resolveRequest = resolve;
        }),
    );
    Object.defineProperty(navigator, "wakeLock", {
      configurable: true,
      value: { request },
    });
    const hook = renderHook(() => usePlatform(true, "connected"));
    await waitFor(() => expect(request).toHaveBeenCalledOnce());
    hook.unmount();
    resolveRequest?.({
      addEventListener: vi.fn(),
      release,
      released: false,
    });
    await waitFor(() => expect(release).toHaveBeenCalledOnce());
  });

  test("captures and completes the browser install prompt without fabricating support", async () => {
    const prompt = vi.fn().mockResolvedValue(undefined);
    const event = new Event("beforeinstallprompt", { cancelable: true });
    Object.assign(event, {
      prompt,
      userChoice: Promise.resolve({ outcome: "accepted" }),
    });
    const hook = renderHook(() => usePlatform(false, "connected"));

    act(() => window.dispatchEvent(event));
    await waitFor(() =>
      expect(hook.result.current.installAvailable).toBe(true),
    );
    await act(async () => {
      expect(await hook.result.current.install()).toBe(true);
    });
    expect(prompt).toHaveBeenCalledOnce();
  });

  test("registers and removes an authenticated browser Push subscription", async () => {
    const subscription = {
      endpoint: "https://push.example.test/subscription",
      toJSON: () => ({
        endpoint: "https://push.example.test/subscription",
        keys: { auth: "auth", p256dh: "key" },
      }),
      unsubscribe: vi.fn().mockResolvedValue(true),
    };
    const pushManager = {
      getSubscription: vi.fn().mockResolvedValue(subscription),
      subscribe: vi.fn(),
    };
    Object.defineProperty(navigator, "serviceWorker", {
      configurable: true,
      value: { ready: Promise.resolve({ pushManager }) },
    });
    vi.stubGlobal("PushManager", class {});
    vi.stubGlobal("Notification", { permission: "granted" });
    const save = vi.fn().mockResolvedValue(undefined);
    const remove = vi.fn().mockResolvedValue(undefined);
    const input = {
      accessRole: "controller" as const,
      enabled: true,
      preferences: {
        cooldownMs: 60_000,
        mutedAgentIds: [],
        privacy: "full" as const,
        soundEnabled: false,
      },
      pushConfig: vi.fn(),
      remove,
      save,
    };
    const hook = renderHook((props) => useBackgroundPush(props), {
      initialProps: input,
    });
    await waitFor(() => expect(save).toHaveBeenCalledOnce());
    expect(hook.result.current.active).toBe(true);

    hook.rerender({ ...input, enabled: false });
    await waitFor(() =>
      expect(remove).toHaveBeenCalledWith(subscription.endpoint),
    );
    expect(subscription.unsubscribe).toHaveBeenCalledOnce();
  });

  test("revalidates the manifest and worker while hardening every static response", async () => {
    const base = await staticServer();
    const worker = await fetch(`${base}/sw.js`);
    const manifest = await fetch(`${base}/manifest.webmanifest`);
    const themeInit = await fetch(`${base}/theme-init.js`);
    const asset = await fetch(`${base}/asset.js`);

    expect(worker.headers.get("cache-control")).toBe("no-cache");
    expect(themeInit.headers.get("cache-control")).toBe("no-cache");
    expect(manifest.headers.get("cache-control")).toBe("no-cache");
    expect(manifest.headers.get("content-type")).toContain("manifest+json");
    expect(asset.headers.get("cache-control")).toContain("immutable");
    expect(asset.headers.get("content-security-policy")).toContain(
      "connect-src 'self';",
    );
    expect(asset.headers.get("referrer-policy")).toBe("no-referrer");
    expect(asset.headers.get("permissions-policy")).toContain(
      "screen-wake-lock",
    );
  });
});
