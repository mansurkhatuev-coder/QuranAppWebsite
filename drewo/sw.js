/* Drewo PWA service worker — Web Push */
self.addEventListener('install', function (event) {
  self.skipWaiting();
});

self.addEventListener('activate', function (event) {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', function (event) {
  var data = { title: 'Древо', body: 'Обновление древа', url: './' };
  try {
    if (event.data) {
      var parsed = event.data.json();
      if (parsed && typeof parsed === 'object') {
        if (parsed.title) data.title = String(parsed.title);
        if (parsed.body) data.body = String(parsed.body);
        if (parsed.url) data.url = String(parsed.url);
      }
    }
  } catch (e) {}
  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      data: { url: data.url },
      lang: 'ru',
    })
  );
});

self.addEventListener('notificationclick', function (event) {
  event.notification.close();
  var url = (event.notification.data && event.notification.data.url) || './';
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then(function (clientList) {
      for (var i = 0; i < clientList.length; i++) {
        var c = clientList[i];
        if (c.url && 'focus' in c) return c.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow(url);
    })
  );
});
