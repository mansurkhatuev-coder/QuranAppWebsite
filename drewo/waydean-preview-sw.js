/* Local-only PWA worker. Its scope is the preview HTML, not legacy /drewo/. */
const CACHE_NAME = 'waydean-preview-shell-v37';
const PAGE_URL = new URL('./waydean-preview.html', self.location.href);
const PAGE_PATH = PAGE_URL.pathname;
const PRECACHE = [
  './waydean-preview.html?state=all-tree',
  './waydean-preview.webmanifest',
  './family-tree.json',
  './icon-192.png',
  './icon-512.png',
  './apple-touch-icon.png',
  './waydean-preview-loading.css?v=1',
  './waydean-preview.css?v=account-history-1',
  './waydean-preview.css',
  './waydean-preview-camera.css?v=ios-pinch-stable-1',
  './waydean-preview-master.css?v=person-card-width-1',
  './waydean-preview-lod.css?v=overview-lines-20261028-1',
  './waydean-preview-edit.css',
  './waydean-preview-readiness.css',
  './waydean-preview-main-polish.css?v=6',
  './waydean-preview-desktop-controls.css',
  './waydean-preview-mobile-controls.css?v=ios-safe-area-1',
  './waydean-preview-layout.css?v=pwa-fixed-app-shell-3',
  './waydean-preview-minimap.css?v=4',
  './waydean-preview-editorial.css?v=cards-dock-5-person-card-width-1',
  './waydean-preview-history.css?v=local-history-1',
  './waydean-preview-pwa.css?v=account-push-20261028-1',
  './waydean-preview-video.css?v=video-local-1',
  './waydean-preview-self.css?v=self-person-20261028-1',
  './waydean-preview-glass-cards.css?v=thin-glass-1',
  './waydean-preview-auth.css?v=family-auth-1',
  './waydean-preview-appearance.css?v=weather-parity-20261028-1',
  './waydean-preview.js?v=family-lock-4',
  './waydean-preview-appearance.mjs?v=weather-parity-20261028-1',
  './waydean-preview-family-auth.mjs?v=family-auth-1',
  './waydean-preview-family-api.mjs?v=family-lock-2',
  './waydean-preview-publish.mjs?v=admin-save-1',
  './waydean-preview-admin-api.mjs?v=admin-push-20261028-1',
  './waydean-preview-admin-controls.mjs?v=account-admin-controls-1',
  './waydean-admin-identity.mjs?v=1',
  './waydean-preview-whoami.mjs?v=identity-storage-20261028-1',
  './waydean-preview-account-history.mjs?v=1',
  './waydean-preview-pwa.mjs?v=family-push-20261028-3-cache',
  './waydean-preview-video-handoff.mjs?v=browser-export-1',
  './waydean-preview-model.mjs?v=person-card-width-2',
  './waydean-preview-camera.mjs?v=20261027-pinch-rAF-1',
  './waydean-preview-access.mjs?v=admin-auth-2',
  './waydean-preview-lines.mjs',
  './waydean-preview-fixture.mjs',
  './waydean-preview-selection.mjs',
  './waydean-preview-lod.mjs?v=lod-12-overview-lines',
  './waydean-preview-dates.mjs?v=calendar-parity-1',
  './waydean-preview-route.mjs?v=family-route-5',
  './waydean-preview-edit.mjs?v=child-id-1',
  './waydean-preview-storage.mjs?v=3',
  '../docs/design/waydean/assets/references/waydean-mobile-tree-background.png',
  '../docs/design/waydean/assets/demo/waydean-demo-elder-portrait.jpg',
  '../docs/design/waydean/assets/demo/waydean-demo-middle-aged-portrait.jpg',
  '../docs/design/waydean/fixtures/master-tree.json'
];

function isPreviewResource(url) {
  return url.origin === self.location.origin && (
    url.pathname === PAGE_PATH
    || url.pathname.startsWith('/drewo/waydean-preview-')
    || url.pathname === '/drewo/family-tree.json'
    || url.pathname === '/drewo/waydean-preview.webmanifest'
    || url.pathname === '/drewo/icon-192.png'
    || url.pathname === '/drewo/icon-512.png'
    || url.pathname === '/drewo/apple-touch-icon.png'
    || url.pathname.startsWith('/drewo/photos/')
    || url.pathname.startsWith('/docs/design/waydean/assets/')
    || url.pathname.startsWith('/docs/design/waydean/fixtures/')
  );
}

async function cacheResponse(request, response) {
  if (!response || !response.ok || response.type === 'opaque') return response;
  const cache = await caches.open(CACHE_NAME);
  await cache.put(request, response.clone());
  return response;
}

async function precacheOne(path) {
  const request = new Request(new URL(path, self.location.href).href, { cache: 'reload' });
  const response = await fetch(request);
  if (!response.ok) throw new Error(`Waydean asset unavailable: ${path} (${response.status})`);
  await cacheResponse(request, response);
}

async function notifyClients() {
  const clients = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  for (const client of clients) client.postMessage({ type: 'WAYDEAN_PWA_CACHE_READY' });
}

self.addEventListener('install', event => {
  event.waitUntil((async () => {
    const required = ['./waydean-preview.html?state=all-tree', './family-tree.json'];
    for (const resource of required) await precacheOne(resource);
    await Promise.allSettled(PRECACHE.filter(resource => !required.includes(resource)).map(precacheOne));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const cacheNames = await caches.keys();
    await Promise.all(cacheNames
      .filter(name => name.startsWith('waydean-preview-shell-') && name !== CACHE_NAME)
      .map(name => caches.delete(name)));
    await self.clients.claim();
    await notifyClients();
  })());
});

self.addEventListener('fetch', event => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (!isPreviewResource(url)) return;

  event.respondWith((async () => {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (request.mode === 'navigate' && url.pathname === PAGE_PATH) {
      try {
        return await cacheResponse(request, await fetch(request));
      } catch {
        return cached || new Response('Waydean сохранён для офлайн-просмотра после первого открытия.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    }
    if (url.pathname === '/drewo/family-tree.json') {
      try {
        return await cacheResponse(request, await fetch(request));
      } catch {
        return cached || new Response('Снимок древа ещё не сохранён для офлайн-просмотра.', {
          status: 503,
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      }
    }
    if (cached) {
      return cached;
    }
    try {
      return await cacheResponse(request, await fetch(request));
    } catch {
      return new Response('Этот файл ещё не сохранён для офлайн-просмотра.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      });
    }
  })());
});

self.addEventListener('push', event => {
  let data = { title: 'Waydean', body: 'В семейном древе появилось обновление.' };
  try {
    if (event.data) data = { ...data, ...event.data.json() };
  } catch {
    if (event.data?.text()) data.body = event.data.text();
  }
  event.waitUntil(self.registration.showNotification(String(data.title || 'Waydean'), {
    body: String(data.body || 'В семейном древе появилось обновление.'),
    icon: new URL('./icon-192.png', self.location.href).href,
    badge: new URL('./icon-192.png', self.location.href).href,
    data: { url: data.url || PAGE_URL.href },
    lang: 'ru'
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const target = new URL('./waydean-preview.html?state=all-tree', self.location.href);
  try {
    const requested = new URL(event.notification.data?.url || target.href, self.location.href);
    if (requested.origin === self.location.origin && requested.pathname === PAGE_PATH) target.href = requested.href;
  } catch {
    // Keep the safe local Waydean destination.
  }
  event.waitUntil(self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(async clients => {
    const existing = clients.find(client => {
      try { return new URL(client.url).pathname === PAGE_PATH; } catch { return false; }
    });
    if (existing) {
      if ('navigate' in existing) await existing.navigate(target.href);
      return existing.focus();
    }
    return self.clients.openWindow(target.href);
  }));
});
