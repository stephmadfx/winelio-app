/* Service Worker Winelio — Notifications Push uniquement (aucun cache HTML intrusif) */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let data = {};
  try {
    data = event.data.json();
  } catch {
    data = { title: "Winelio", body: event.data.text() };
  }

  const title = typeof data.title === "string" && data.title.trim() ? data.title : "Winelio";
  const body = typeof data.body === "string" ? data.body : "";
  const rawUrl = typeof data.url === "string" && data.url.startsWith("/") ? data.url : "/dashboard";
  const tag = typeof data.tag === "string" && data.tag ? data.tag : "winelio-notification";

  event.waitUntil(
    self.registration.showNotification(title, {
      body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      tag,
      data: { url: rawUrl },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetPath =
    event.notification.data && typeof event.notification.data.url === "string"
      ? event.notification.data.url
      : "/dashboard";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      const targetUrl = new URL(targetPath, self.location.origin).href;
      for (const client of windowClients) {
        if (new URL(client.url).origin === self.location.origin && "focus" in client) {
          return client.navigate(targetUrl).then(() => client.focus());
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
