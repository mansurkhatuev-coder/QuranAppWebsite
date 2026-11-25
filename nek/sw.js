/* Некъ PWA — network-first shell for offline reopen. */
const CACHE = 'waydean-nek-v7';
const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './nek.css?v=8',
  './nek.js?v=9',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.addAll(PRECACHE))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key.startsWith('waydean-nek-') && key !== CACHE).map((key) => caches.delete(key)))
      )
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.includes('/rest/v1/') || url.pathname.includes('/auth/v1/')) return;
  if (url.pathname.includes('/functions/v1/')) return;

  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok && url.pathname.includes('/nek/')) {
          const copy = response.clone();
          void caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.open(CACHE).then(async cache => await cache.match(request) || (request.mode === 'navigate' && await cache.match('./index.html')) || Response.error()))
  );
});
