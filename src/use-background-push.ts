import { useEffect, useRef, useState } from "react";
import type { BrowserPushPreferences, PushConfig } from "./herdr-api";
import type { AccessRole } from "./use-herdr-runtime";

function applicationServerKey(value: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const binary = window.atob(
    `${value}${padding}`.replaceAll("-", "+").replaceAll("_", "/"),
  );
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function readyServiceWorker(): Promise<ServiceWorkerRegistration> {
  let timer = 0;
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_resolve, reject) => {
        timer = window.setTimeout(
          () =>
            reject(new Error("The notification service worker is not ready.")),
          5_000,
        );
      }),
    ]);
  } finally {
    window.clearTimeout(timer);
  }
}

interface BackgroundPushInput {
  accessRole: AccessRole;
  enabled: boolean;
  preferences: BrowserPushPreferences;
  pushConfig: () => Promise<PushConfig>;
  remove: (endpoint: string) => Promise<void>;
  save: (
    subscription: PushSubscriptionJSON,
    preferences: BrowserPushPreferences,
  ) => Promise<void>;
}

export function useBackgroundPush({
  accessRole,
  enabled,
  preferences,
  pushConfig,
  remove,
  save,
}: BackgroundPushInput) {
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");
  const methods = useRef({ pushConfig, remove, save });
  methods.current = { pushConfig, remove, save };
  const preferenceSignature = JSON.stringify(preferences);

  useEffect(() => {
    if (
      !("serviceWorker" in navigator) ||
      !("PushManager" in window) ||
      accessRole !== "controller"
    ) {
      setActive(false);
      return;
    }
    let cancelled = false;
    const currentPreferences = JSON.parse(
      preferenceSignature,
    ) as BrowserPushPreferences;
    const synchronize = async () => {
      try {
        const registration = await readyServiceWorker();
        let subscription = await registration.pushManager.getSubscription();
        if (!enabled || Notification.permission !== "granted") {
          if (subscription) {
            // The expired browser endpoint will be pruned when Push next
            // reports it as gone; local opt-out must not depend on the bridge.
            void methods.current
              .remove(subscription.endpoint)
              .catch(() => undefined);
            await subscription.unsubscribe();
          }
          if (!cancelled) {
            setActive(false);
            setError("");
          }
          return;
        }
        if (!subscription) {
          const config = await methods.current.pushConfig();
          subscription = await registration.pushManager.subscribe({
            applicationServerKey: applicationServerKey(config.publicKey),
            userVisibleOnly: true,
          });
        }
        await methods.current.save(subscription.toJSON(), currentPreferences);
        if (!cancelled) {
          setActive(true);
          setError("");
        }
      } catch (pushError) {
        if (!cancelled) {
          setActive(false);
          setError(
            pushError instanceof Error
              ? pushError.message
              : "Background notifications could not be configured.",
          );
        }
      }
    };
    void synchronize();
    return () => {
      cancelled = true;
    };
  }, [accessRole, enabled, preferenceSignature]);

  return {
    active,
    error,
    supported:
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      window.isSecureContext,
  };
}
