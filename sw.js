/**
 * DGLOPA PLATFORM — SERVICE WORKER
 * Cache-first strategy for app shell.
 * Network-first for API calls (future tickets).
 */

const CACHE_NAME    = 'dglopa-v1';
const CACHE_VERSION = 1;

const PRECACHE = [
  './',
  './index.html',
  './css/tokens.css',
  './css/global.css',
  './css/components.css',
  './js/app.js',
  './js/router.js',
  './db/database.js',
  './components/toast.js',
  './components/modal.js',
  './components/loadingOverlay.js',
  './screens/home.js',
  './screens/settings.js',
  './screens/placeholder.js',
  './services/errorHandler.js',
  './utils/helpers.js',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/dexie@3.2.7/dist/dexie.mjs',
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@400;500;700&family=JetBrains+Mono:wght@400;500&display=swap',
];

// ---- Install ----
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      // Cache what we can; don't fail on individual misses
      return Promise.allSettled(
        PRECACHE.map((url) => cache.add(url).catch(() => {}))
      );
    }).then(() => {
      console.info('[SW] Install complete');
      return self.skipWaiting();
    })
  );
});

// ---- Activate ----
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(
        keys
          .filter((k) => k !== CACHE_NAME)
          .map((k) => caches.delete(k))
      )
    ).then(() => {
      console.info('[SW] Activate complete');
      return self.clients.claim();
    })
  );
});

// ---- Fetch ----
self.addEventListener('fetch', (event) => {
  // Skip non-GET and chrome-extension requests
  if (event.request.method !== 'GET') return;
  if (event.request.url.startsWith('chrome-extension://')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;

      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'error') {
            return response;
          }
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          // Offline fallback for navigation requests
          if (event.request.mode === 'navigate') {
            return caches.match('./index.html');
          }
        });
    })
  );
});

// ---- Message handling ----
self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    self.skipWaiting();
  }
});
