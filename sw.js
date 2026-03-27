const CACHE_VERSION = 'v15';
const CACHE_NAME = 'famresa-' + CACHE_VERSION;

function getBasePath() {
  // SW scope ends with '/<repo>/' on GitHub Pages project sites.
  // Using it avoids hardcoding repo name.
  try {
    const scopeUrl = self.registration?.scope || self.location?.href;
    return new URL('./', scopeUrl).pathname;
  } catch (_) {
    return '/';
  }
}

function withBase(path) {
  const base = getBasePath();
  // 'path' should be relative, without leading slash
  return base + path.replace(/^\/+/, '');
}

function canCacheRequest(request) {
  try {
    const protocol = new URL(request.url).protocol;
    return protocol === 'http:' || protocol === 'https:';
  } catch (_) {
    return false;
  }
}

// On install: cache the app shell + critical assets
self.addEventListener('install', event => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll([
        withBase(''),
        withBase('index.html'),
        withBase('manifest.json'),
        withBase('css/style.css'),
        withBase('icons/apple-touch-icon.png'),
        withBase('icons/favicon-32.png'),
        withBase('icons/favicon-16.png'),
        withBase('icons/icon-192.png'),
        withBase('icons/icon-512.png')
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
          if (response.ok && canCacheRequest(event.request)) {
            const clone = response.clone();
            caches.open(CACHE_NAME).then(cache => cache.put(event.request, clone));
            return response;
          }
          // Serveur répond 404/5xx (ex: GitHub Pages) → servir l'app shell depuis le cache
          return caches.match(withBase('index.html'))
            .then(cached => cached || response);
        })
        .catch(() =>
          caches.match(event.request)
            .then(cached => cached || caches.match(withBase('index.html')))
        )
    );
  } else if (isAppCode) {
    // Network first for JS/CSS, but never fallback to HTML to avoid mixed/stale runtime
    event.respondWith(
      fetch(event.request)
        .then(response => {
          if (response.ok && canCacheRequest(event.request)) {
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
          if (response.ok && canCacheRequest(event.request)) {
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
