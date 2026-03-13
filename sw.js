const CACHE = 'famcar-v1';
const SHELL = [
  '/Resa-voiture/',
  '/Resa-voiture/index.html',
  '/Resa-voiture/manifest.json',
  '/Resa-voiture/icon-192.png',
  '/Resa-voiture/icon-512.png',
];

self.addEventListener('install', e => {
  e.waitUntil(caches.open(CACHE).then(c => c.addAll(SHELL)));
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil(
    caches.keys().then(keys =>
      Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k)))
    )
  );
  self.clients.claim();
});

self.addEventListener('fetch', e => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Pass through Firebase, Google APIs, and all cross-origin requests
  if (url.hostname !== location.hostname) return;
  e.respondWith(
    caches.match(e.request).then(cached => cached || fetch(e.request))
  );
});
