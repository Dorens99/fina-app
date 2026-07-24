self.addEventListener('install', e => { self.skipWaiting(); });
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.map(k => caches.delete(k)))));
  self.clients.claim();
});
self.addEventListener('fetch', e => {
  if (e.request.url.includes('firebase') || e.request.url.includes('google') ||
      e.request.url.includes('anthropic') || e.request.url.includes('fonts') ||
      e.request.url.includes('netlify/functions')) return;
  e.respondWith(fetch(e.request).catch(() => caches.match(e.request)));
});
