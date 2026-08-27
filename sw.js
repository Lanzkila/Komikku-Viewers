const CACHE = 'kirin-komikku-v130';
const SHELL = [
  './', './index.html', './assets/css/app.css', './assets/js/app.js', './assets/vendor/pako.min.js',
  './schemas/schema-komikku.proto', './manifest.webmanifest', './assets/icons/app-icon.svg',
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
  event.respondWith(caches.match(event.request).then(hit => hit || fetch(event.request).then(response => {
    const copy = response.clone();
    caches.open(CACHE).then(cache => cache.put(event.request, copy)).catch(() => {});
    return response;
  }).catch(() => event.request.mode === 'navigate' ? caches.match('./index.html') : Response.error())));
});
