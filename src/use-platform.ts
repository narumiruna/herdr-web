import { useCallback, useEffect, useRef, useState } from "react";
import type { RuntimeConnection } from "./use-herdr-runtime";

interface InstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

interface WakeLockSentinelLike extends EventTarget {
  release(): Promise<void>;
  released: boolean;
}

interface WakeLockLike {
  request(type: "screen"): Promise<WakeLockSentinelLike>;
}

export function usePlatform(keepAwake: boolean, connection: RuntimeConnection) {
  const [installPrompt, setInstallPrompt] = useState<
    InstallPromptEvent | undefined
  >(undefined);
  const [installed, setInstalled] = useState(
    () => window.matchMedia?.("(display-mode: standalone)").matches === true,
  );
  const [online, setOnline] = useState(() => navigator.onLine !== false);
  const [prefersReducedMotion, setPrefersReducedMotion] = useState(
    () =>
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches === true,
  );
  const [wakeLockActive, setWakeLockActive] = useState(false);
  const wakeLock = useRef<WakeLockSentinelLike | undefined>(undefined);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const secure =
      window.isSecureContext ||
      ["localhost", "127.0.0.1", "::1"].includes(window.location.hostname);
    if (!secure) return;
    void navigator.serviceWorker
      .register("/sw.js", { scope: "/" })
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    const media = window.matchMedia?.("(prefers-reduced-motion: reduce)");
    if (!media) return;
    const change = () => setPrefersReducedMotion(media.matches);
    media.addEventListener?.("change", change);
    return () => media.removeEventListener?.("change", change);
  }, []);

  useEffect(() => {
    const beforeInstall = (event: Event) => {
      event.preventDefault();
      setInstallPrompt(event as InstallPromptEvent);
    };
    const appInstalled = () => {
      setInstalled(true);
      setInstallPrompt(undefined);
    };
    const wentOnline = () => setOnline(true);
    const wentOffline = () => setOnline(false);
    window.addEventListener("beforeinstallprompt", beforeInstall);
    window.addEventListener("appinstalled", appInstalled);
    window.addEventListener("online", wentOnline);
    window.addEventListener("offline", wentOffline);
    return () => {
      window.removeEventListener("beforeinstallprompt", beforeInstall);
      window.removeEventListener("appinstalled", appInstalled);
      window.removeEventListener("online", wentOnline);
      window.removeEventListener("offline", wentOffline);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    let requestPending = false;
    const lockApi = (navigator as Navigator & { wakeLock?: WakeLockLike })
      .wakeLock;
    const release = async () => {
      const current = wakeLock.current;
      wakeLock.current = undefined;
      if (current && !current.released)
        await current.release().catch(() => undefined);
      setWakeLockActive(false);
    };
    const request = async () => {
      if (
        !keepAwake ||
        connection !== "connected" ||
        document.visibilityState !== "visible" ||
        !lockApi ||
        wakeLock.current ||
        requestPending
      ) {
        return;
      }
      requestPending = true;
      try {
        const sentinel = await lockApi.request("screen");
        if (
          cancelled ||
          !keepAwake ||
          connection !== "connected" ||
          document.visibilityState !== "visible"
        ) {
          await sentinel.release().catch(() => undefined);
          return;
        }
        wakeLock.current = sentinel;
        setWakeLockActive(true);
        sentinel.addEventListener(
          "release",
          () => {
            if (wakeLock.current === sentinel) wakeLock.current = undefined;
            setWakeLockActive(false);
          },
          { once: true },
        );
      } catch {
        setWakeLockActive(false);
      } finally {
        requestPending = false;
      }
    };
    const visibility = () => {
      if (document.visibilityState === "visible") void request();
      else void release();
    };
    document.addEventListener("visibilitychange", visibility);
    void request();
    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", visibility);
      void release();
    };
  }, [connection, keepAwake]);

  const install = useCallback(async () => {
    if (!installPrompt) return false;
    await installPrompt.prompt();
    const choice = await installPrompt.userChoice;
    if (choice.outcome === "accepted") setInstallPrompt(undefined);
    return choice.outcome === "accepted";
  }, [installPrompt]);

  return {
    install,
    installAvailable: Boolean(installPrompt) && !installed,
    installed,
    online,
    prefersReducedMotion,
    wakeLockActive,
    wakeLockSupported: "wakeLock" in navigator,
  };
}
