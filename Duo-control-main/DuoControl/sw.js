const CACHE_NAME = 'duocontrol-pwa-v2.0.0';

// Genera URLs relativas al ámbito del Service Worker (compatible con GitHub Pages /repo-name/ y raíz)
const SCOPE_URL = self.registration.scope;

const getRelativeUrl = (path) => new URL(path, SCOPE_URL).pathname;

const STATIC_ASSETS = [
  './',
  './index.html',
  './app.js',
  './app.css',
  './manifest.json',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/apple-touch-icon.png'
];

// Install event - Cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      console.log('[ServiceWorker] Caching static assets for GitHub Pages scope:', SCOPE_URL);
      return cache.addAll(STATIC_ASSETS);
    }).then(() => self.skipWaiting())
  );
});

// Activate event - Clean old caches
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[ServiceWorker] Deleting old cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Fetch event - Stale-while-revalidate for local assets, Network-first for APIs
self.addEventListener('fetch', (event) => {
  const requestUrl = new URL(event.request.url);

  // APIs externas (Supabase, GitHub API) no se interceptan con caché estático
  if (
    requestUrl.hostname.includes('supabase.co') ||
    requestUrl.hostname.includes('api.github.com') ||
    event.request.method !== 'GET'
  ) {
    return;
  }

  event.respondWith(
    caches.match(event.request).then((cachedResponse) => {
      const fetchPromise = fetch(event.request)
        .then((networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const responseToCache = networkResponse.clone();
            caches.open(CACHE_NAME).then((cache) => {
              cache.put(event.request, responseToCache);
            });
          }
          return networkResponse;
        })
        .catch(() => {
          // Si está offline y es navegación HTML, servir index.html
          if (event.request.headers.get('accept')?.includes('text/html')) {
            return caches.match('./index.html') || caches.match(SCOPE_URL);
          }
        });

      return cachedResponse || fetchPromise;
    })
  );
});
