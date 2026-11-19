/* PWA-оболочка кэшируется; приватные данные остаются в IndexedDB приложения. */
const CACHE = "rassrochki-shell-v18";
const PRECACHE = [
  "/manifest.webmanifest",
  "/offline.html",
  "/offline.js",
  "/icons/icon-192.png",
  "/icons/icon-512.png",
  "/icons/apple-touch-icon.png",
  "/icons/favicon-32.png",
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith("rassrochki-shell-") && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // API, в том числе снимок и синхронизация, всегда идут напрямую в сеть.
  if (url.pathname.startsWith("/api")) return;

  // HTML приложения не кэшируем. При потере сети показываем локальную оболочку.
  if (req.mode === "navigate" || req.destination === "document") {
    event.respondWith(
      fetch(req).catch(async () => {
        const offlinePage = await caches.match("/offline.html", { cacheName: CACHE });
        return offlinePage || new Response("Нет подключения к интернету", {
          status: 503,
          headers: { "Content-Type": "text/plain; charset=utf-8" },
        });
      })
    );
    return;
  }

  // Only cache the public shell and immutable Next.js build assets.
  // Never cache arbitrary images, documents, receipts or authenticated endpoints.
  const isStatic =
    PRECACHE.includes(url.pathname) ||
    (url.pathname.startsWith("/_next/static/") &&
      ["script", "style", "font", "image"].includes(req.destination));

  if (!isStatic) return;

  event.respondWith(
    fetch(req)
      .then((res) => {
        const cacheControl = res.headers.get("Cache-Control") || "";
        if (res.ok && !res.redirected && !/\b(private|no-store|no-cache)\b/i.test(cacheControl)) {
          const copy = res.clone();
          caches.open(CACHE).then((cache) => cache.put(req, copy));
        }
        return res;
      })
      .catch(() => caches.match(req, { cacheName: CACHE }).then((cached) => cached || Response.error()))
  );
});
