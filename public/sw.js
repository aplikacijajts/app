self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data.json(); }
  catch { data = { title: "Notification", body: event.data?.text() || "" }; }

  const title = data.title || "Notification";
  const options = {
    body: data.body || "",
    data: { url: data.url || "/" }
  };

  event.waitUntil(self.registration.showNotification(title, options));
});
const CACHE_NAME = "jts-cache-v1";
const ASSETS = [
  "/",
  "/home.html",
  "/index.html",
  "/register.html",
  "/assets/theme.css",
  "/assets/friendly.css",
  "/assets/loader.js",
  "/assets/install.js",
  "/assets/api.js",
  "/assets/ui.js",
  "/assets/push.js",
  "/assets/jts-logo.png",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((c) => c.addAll(ASSETS)).then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE_NAME).map(k => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);

  // Never cache API requests
  if (url.pathname.startsWith("/api/")) return;

  // Cache-first for static assets
  event.respondWith(
    caches.match(event.request).then((cached) => cached || fetch(event.request))
  );
});

/* Existing push handlers (keep) */
self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data.json(); }
  catch { data = { title: "Notification", body: event.data?.text() || "" }; }

  const title = data.title || "Notification";
  const options = { body: data.body || "", data: { url: data.url || "/" } };
  event.waitUntil(self.registration.showNotification(title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(url) : null;
    })
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/";

  event.waitUntil(
    clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) {
          client.navigate(url);
          return client.focus();
        }
      }
      return clients.openWindow ? clients.openWindow(url) : null;
    })
  );
});
