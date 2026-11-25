// Only the public catalog shell is available offline. Invitations retain their query in the page.
const cacheName = 'drewo-atlas-shell-v2';
const shell = [
 './', '/nek/manifest.webmanifest', '/nek/icon-192.png', '/nek/icon-512.png', './style.css?v=f3463c6', './opening.css?v=f3463c6',
 './interface.css', './vendor/maplibre-gl.css',
 './assets/cormorant.css', './assets/source-sans.css', './assets/relief-overview.webp',
 './access.js', './app.mjs?v=20261124-2', './atlas-state.mjs?v=f3463c6',
 './viewport.mjs?v=f3463c6', './catalog.mjs', './media.mjs', './rivers.mjs',
 './settlements.mjs', './sheet.mjs', './entry-motion.mjs', './ambient-audio.mjs',
 '/nek/nek.js?v=10', '/assets/drewo-motion.css?v=20261124-2', '/trees/supabase-config.js'
];
const allowed = new Set(shell.map(path => new URL(path,self.location.href).href));
self.addEventListener('install', event => event.waitUntil((async () => {
 const cache = await caches.open(cacheName);
 await cache.addAll(shell);
 await self.skipWaiting();
})()));
self.addEventListener('activate', event => event.waitUntil((async () => {
 const keys = await caches.keys();
 await Promise.all(keys.filter(key => key.startsWith('drewo-atlas-shell-') && key !== cacheName).map(key => caches.delete(key)));
 await self.clients.claim();
})()));
self.addEventListener('fetch', event => {
 const req = event.request;
 if (req.method !== 'GET') return;
 const nav = req.mode === 'navigate' && ['/atlas/', '/atlas/index.html'].includes(new URL(req.url).pathname);
 if (!nav && !allowed.has(req.url)) return;
 event.respondWith((async () => {
  const key = nav ? new URL('./',self.location.href).href : req.url;
  const cache = await caches.open(cacheName);
  try {
   const response = await fetch(req);
   if (response.ok && !response.redirected) await cache.put(key,response.clone());
   return response;
  } catch {
   return await cache.match(key) || Response.error();
  }
 })());
});
