const CACHE_NAME = "jts-cache-v3-apex-production-ui";
const ASSETS = [
  "/",
  "/home.html",
  "/index.html",
  "/register.html",
  "/assets/jts-apex-production-ui.css",
  "/assets/jts-apex-production-ui.js",
  "/assets/loader.js",
  "/assets/install.js",
  "/assets/api.js",
  "/assets/role-ui.js",
  "/assets/auth-guard-final.js",
  "/assets/jts-logo.png",
  "/manifest.webmanifest",
  "/icons/icon-192.png",
  "/icons/icon-512.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS).catch(() => null))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const url = new URL(event.request.url);
  if (url.pathname.startsWith("/api/")) return;
  event.respondWith(caches.match(event.request).then((cached) => cached || fetch(event.request)));
});

self.addEventListener("push", (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: "Notification", body: event.data?.text() || "" }; }
  const title = data.title || "JTS Logistics";
  const body = data.body || "";
  const url = data.url || "/";
  const tag = data.tag || data.notificationId || `${title}:${body}:${url}`;
  event.waitUntil(self.registration.showNotification(title, { body, tag, renotify:false, data:{ url, tag }, icon:"/icons/icon-192.png", badge:"/icons/icon-192.png" }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = event.notification?.data?.url || "/";
  event.waitUntil(
    clients.matchAll({ type:"window", includeUncontrolled:true }).then((clientList) => {
      for (const client of clientList) {
        if ("focus" in client) { client.navigate(url); return client.focus(); }
      }
      return clients.openWindow ? clients.openWindow(url) : null;
    })
  );
});
