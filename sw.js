/**
 * DGLOPA PLATFORM — SERVICE WORKER v2
 * Cache-first strategy for app shell.
 */

const CACHE_NAME    = 'dglopa-v2';

const PRECACHE = [
  './',
  './index.html',
  './css/tokens.css',
  './css/global.css',
  './css/components.css',
  './app.js',
  './js/router.js',
  './db/database.js',
  './db/migrations/001_initial.js',
  './db/migrations/002_product_master.js',
  './components/toast.js',
  './components/modal.js',
  './components/loadingOverlay.js',
  './screens/home.js',
  './screens/settings.js',
  './screens/placeholder.js',
  './screens/products/productsScreen.js',
  './screens/products/productForm.js',
  './screens/products/productProfile.js',
  './services/errorHandler.js',
  './services/productService.js',
  './utils/helpers.js',
  './utils/idGenerator.js',
  './utils/normalizer.js',
  './manifest.json',
  'https://cdn.jsdelivr.net/npm/dexie@3.2.7/dist/dexie.mjs',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.allSettled(PRECACHE.map((url) => cache.add(url).catch(() => {})))
    ).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  if (event.request.url.startsWith('chrome-extension://')) return;

  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) return cached;
      return fetch(event.request)
        .then((response) => {
          if (!response || response.status !== 200 || response.type === 'error') return response;
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => {
          if (event.request.mode === 'navigate') return caches.match('./index.html');
        });
    })
  );
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
