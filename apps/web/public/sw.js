const VERSION = "herdr-web-supervision-v1";

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("message", (event) => {
  if (event.data?.type === "SKIP_WAITING") self.skipWaiting();
});

self.addEventListener("push", (event) => {
  let payload;
  try {
    payload = event.data?.json();
  } catch {
    payload = undefined;
  }
  if (!payload || typeof payload.title !== "string") return;
  const target = new URL(payload.data?.url || "/", self.location.origin);
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.registration.showNotification(payload.title.slice(0, 160), {
      body: typeof payload.body === "string" ? payload.body.slice(0, 600) : "",
      data: { url: `${target.pathname}${target.search}${target.hash}` },
      icon: "/icons/herdr-web-192.png",
      silent: payload.silent === true,
      tag:
        typeof payload.tag === "string"
          ? payload.tag.slice(0, 240)
          : "herdr-web-attention",
    }),
  );
});

function canNavigateNotification(client, url) {
  return new Promise((resolve) => {
    const channel = new MessageChannel();
    let settled = false;
    const finish = (canNavigate) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      channel.port1.close();
      resolve(canNavigate);
    };
    const timer = setTimeout(() => finish(false), 500);
    channel.port1.onmessage = (event) => {
      finish(event.data?.canNavigate === true);
    };
    try {
      client.postMessage({ type: "notification.can-navigate", url }, [
        channel.port2,
      ]);
    } catch {
      finish(false);
    }
  });
}

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  );
  if (target.origin !== self.location.origin) return;
  event.waitUntil(
    self.clients
      .matchAll({ includeUncontrolled: true, type: "window" })
      .then(async (clients) => {
        const sameOriginClients = clients.filter(
          (client) => new URL(client.url).origin === target.origin,
        );
        const support = await Promise.all(
          sameOriginClients.map((client) =>
            canNavigateNotification(client, target.toString()),
          ),
        );
        const client = sameOriginClients[support.indexOf(true)];
        if (client) {
          await client.focus();
          client.postMessage({
            type: "notification.navigate",
            url: target.toString(),
          });
          return;
        }
        await self.clients.openWindow(target.toString());
      }),
  );
});

// Authenticated HTML, APIs, event streams, tickets, and terminal traffic are
// intentionally never cached. The service worker exists for install lifecycle
// and notification clicks, not offline execution.
self.addEventListener("fetch", () => undefined);

self.__HERDR_WEB_SERVICE_WORKER_VERSION__ = VERSION;
