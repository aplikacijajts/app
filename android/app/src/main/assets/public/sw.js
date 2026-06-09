const CACHE_NAME = "jts-cache-v4-final-mobile-notifications";
const ASSETS = [
  "/",
  "/index.html",
  "/home.html",
  "/register.html",
  "/manifest.webmanifest",
  "/assets/jts-apex-production-ui.css",
  "/assets/jts-apex-production-ui.js",
  "/assets/api.js",
  "/assets/role-ui.js",
  "/assets/auth-guard-final.js",
  "/assets/push.js",
  "/assets/jts-logo.png",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(ASSETS).catch(() => null)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin || url.pathname.startsWith("/api/") || req.method !== "GET") return;
  const isNavigation = req.mode === "navigate" || (req.headers.get("accept") || "").includes("text/html");
  const isFreshAsset = /\.(css|js|html|webmanifest)$/i.test(url.pathname);
  if (isNavigation || isFreshAsset) {
    event.respondWith(fetch(req).then((res) => {
      const copy = res.clone();
      caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => null);
      return res;
    }).catch(() => caches.match(req)));
    return;
  }
  event.respondWith(caches.match(req).then((cached) => cached || fetch(req).then((res) => {
    const copy = res.clone();
    caches.open(CACHE_NAME).then((cache) => cache.put(req, copy)).catch(() => null);
    return res;
  })));
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Notification", body: event.data?.text() || "" }; }
  const title = data.title || "JTS Logistics";
  const body = data.body || "";
  const url = data.url || "/notifications.html";
  const tag = data.tag || data.notificationId || `${title}:${body}:${url}`;
  event.waitUntil(self.registration.showNotification(title, {
    body,
    tag,
    renotify: false,
    data: { url, tag },
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png"
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/notifications.html";
  event.waitUntil(clients.matchAll({ type: "window", includeUncontrolled: true }).then((clientList) => {
    for (const client of clientList) {
      if ("focus" in client) { client.navigate(url); return client.focus(); }
    }
    return clients.openWindow ? clients.openWindow(url) : null;
  }));
});
