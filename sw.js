const CACHE = 'kirin-backup-v154';
const SHELL = [
  './', './index.html', './assets/css/app.css?v=154', './assets/js/app.js?v=154', './assets/vendor/pako.min.js',
  './schemas/schema-komikku.proto', './schemas/schema-mihon.proto', './manifest.webmanifest?v=154', './CHANGELOG.md', './README.md', './assets/icons/app-icon.svg',
  'https://cdn.jsdelivr.net/npm/long@5.2.3/umd/index.min.js',
  'https://cdn.jsdelivr.net/npm/protobufjs@7.5.4/dist/protobuf.min.js',
];
self.addEventListener('install', event => {
  event.waitUntil(caches.open(CACHE).then(async cache => {
    for (const url of SHELL) {
      try { await cache.add(url); } catch (_) {}
    }
  }).then(() => self.skipWaiting()));
});
self.addEventListener('activate', event => {
  event.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener('fetch', event => {
  if (event.request.method !== 'GET') return;
  const url = new URL(event.request.url);
  const sameOrigin = url.origin === self.location.origin;

  if (sameOrigin) {
    event.respondWith(
      fetch(event.request)
        .then(response => {
          const copy = response.clone();
          caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
          return response;
        })
        .catch(() =>
          caches.match(event.request).then(hit =>
            hit || (event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())
          )
        )
    );
    return;
  }

  event.respondWith(
    caches.match(event.request).then(hit =>
      hit || fetch(event.request).then(response => {
        const copy = response.clone();
        caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
        return response;
      })
    )
  );
});
