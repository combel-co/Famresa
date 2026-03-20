const CACHE_VERSION = 'v3';
const CACHE_NAME = 'famresa-' + CACHE_VERSION;

// On install: cache the app shell
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll([
        '/Resa-voiture/',
        '/Resa-voiture/index.html'
      ]);
    })
  );
  // Activate immediately (don't wait for old SW to finish)
  self.skipWaiting();
});

// On activate: delete old caches
self.addEventListener('activate', event => {
  event.waitUntil(
    caches.keys().then(keys =>
      Promise.all(
        keys
          .filter(key => (key.startsWith('famcar-') || key.startsWith('famresa-')) && key !== CACHE_NAME)
          .map(key => caches.delete(key))
      )
    ).then(() => self.clients.claim())
  );
});

// On fetch: network-first for HTML, cache-first for everything else
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isHTML = event.request.destination === 'document' ||
                 url.pathname.endsWith('/') ||
                 url.pathname.endsWith('.html');

  if (isHTML) {
    // Network first: always try fresh HTML, fallback to cache if offline
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        })
        .catch(() => caches.match(event.request))
    );
  } else {
    // Cache first for fonts and other static assets (GET only)
    if (event.request.method !== 'GET') return;
    event.respondWith(
      caches.match(event.request).then(cached => {
        return cached || fetch(event.request).then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
          }
          return response;
        });
      })
    );
  }
});

// Listen for skip-waiting message from the page
self.addEventListener('message', event => {
  if (event.data === 'skipWaiting') {
    self.skipWaiting();
  }
});
