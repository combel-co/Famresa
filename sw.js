const CACHE_VERSION = 'v7';
const CACHE_NAME = 'famresa-' + CACHE_VERSION;

// On install: cache the app shell + critical assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll([
        '/Resa-voiture/',
        '/Resa-voiture/index.html',
        '/Resa-voiture/manifest.json',
        '/Resa-voiture/css/style.css',
        '/Resa-voiture/icons/icon-192.png',
        '/Resa-voiture/icons/icon-512.png'
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

// On fetch: network-first for HTML/JS/CSS, cache-first for static assets
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  const isHTML = event.request.destination === 'document' ||
                 url.pathname.endsWith('/') ||
                 url.pathname.endsWith('.html');
  const isAppCode = url.pathname.endsWith('.js') || url.pathname.endsWith('.css');

  if (isHTML) {
    // Network first for documents
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            return response;
          }
          // Serveur répond 404/5xx (ex: GitHub Pages) → servir l'app shell depuis le cache
          return caches.match('/Resa-voiture/index.html')
            .then(cached => cached || response);
        })
        .catch(() =>
          caches.match(event.request)
            .then(cached => cached || caches.match('/Resa-voiture/index.html'))
        )
    );
  } else if (isAppCode) {
    // Network first for JS/CSS, but never fallback to HTML to avoid mixed/stale runtime
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
    // Cache first for fonts, images and other static assets (GET only)
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
