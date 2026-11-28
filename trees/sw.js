/* Trees PWA — cache only the public application shell. */
const CACHE = 'waydean-trees-v14';
const PRECACHE = [
  './', './index.html', './manifest.webmanifest',
  './trees.css?v=11', './trees.js?v=18',
  './icon-192.png', './icon-512.png',
  '../assets/drewo-motion.css?v=20261126-3', '../assets/drewo-auth-preferences.mjs', '../assets/drewo-manager-auth.mjs?v=1', '../assets/drewo-family-password.mjs?v=1',
  '../assets/auth-lock.js?v=1', './billing-config.js?v=1',
  '../assets/drewo-billing.js?v=1', './supabase-config.js?v=2', '../admin/admin-supabase.js?v=16',
];
const shellUrls = new Set(PRECACHE.map(path => new URL(path, self.location.href).href));
const entry = new URL('./index.html', self.location.href).href;
const entryPath = new URL(entry).pathname;
const directoryPath = new URL('./', self.location.href).pathname;

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    await cache.addAll(PRECACHE);
    await self.skipWaiting();
  })());
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('waydean-trees-') && key !== CACHE).map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const navigation = request.mode === 'navigate' && (url.pathname === entryPath || url.pathname === directoryPath);
  if (!navigation && !shellUrls.has(url.href)) return;
  const key = navigation ? entry : url.href;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    try {
      const response = await fetch(request);
      if (response.ok && !response.redirected && !/no-store|private/i.test(response.headers.get('Cache-Control') || '')) {
        await cache.put(key, response.clone());
      }
      return response;
    } catch {
      return await cache.match(key) || Response.error();
    }
  })());
});
