// Existing installations may still start at /nek/ when opened offline.
const CACHE = 'waydean-nek-v8';
const REDIRECT_PAGE = new URL('./index.html', self.location.href).href;
const ENTRY_PATH = new URL('./', self.location.href).pathname;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.add(new Request(REDIRECT_PAGE, { cache: 'reload' }));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys
      .filter(key => key.startsWith('waydean-nek-') && key !== CACHE)
      .map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', event => {
  const { request } = event;
  if (request.method !== 'GET' || request.mode !== 'navigate') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin ||
      (url.pathname !== ENTRY_PATH && url.pathname !== ENTRY_PATH + 'index.html')) return;
  event.respondWith((async () => {
    try {
      return await fetch(request);
    } catch {
      const cache = await caches.open(CACHE);
      return await cache.match(REDIRECT_PAGE) || Response.error();
    }
  })());
});
