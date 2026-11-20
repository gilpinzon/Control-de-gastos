/**
 * ==============================================================================
 * DUOCONTROL PWA SERVICE WORKER (sw.js)
 * Optimizado para PWA en iOS Safari, Android Chrome y Vercel Serverless.
 * 
 * Corrección de Error Crítico:
 * "Response served by service worker has redirections"
 * 
 * Causa: Cuando una petición de navegación (mode: 'navigate') recibe una
 * respuesta con flag 'redirected: true' (por cleanUrls de Vercel o redirecciones HTTP),
 * los navegadores móviles rechazan la respuesta con TypeError en respondWith().
 * 
 * Solución:
 * 1. Peticiones de navegación usan 'redirect: follow' explícito.
 * 2. Si la respuesta recibida tiene redirected === true, se reconstruye un Response
 *    limpio a partir del Blob del cuerpo y los headers para remover el flag 'redirected'.
 * 3. En caso de estar offline o error de red, se sirve la shell '/index.html'
 *    usando 'ignoreSearch: true' para soportar shortcuts como '/?action=new_expense'.
 * 4. Peticiones a '/api/' se delegan siempre a la red (Network-Only) para evitar
 *    datos financieros o listas de mercado obsoletos en caché estático.
 * ==============================================================================
 */

const CACHE_NAME = 'duocontrol-pwa-v3.0.0';

const STATIC_ASSETS = [
  '/',
  '/index.html',
  '/app.js',
  '/app.css',
  '/manifest.json',
  '/icons/icon.svg',
  '/icons/icon-192.png',
  '/icons/icon-512.png',
  '/icons/icon-maskable.png',
  '/icons/apple-touch-icon.png'
];

// 1. Install event - Cache static assets
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[ServiceWorker] Precaching app shell assets');
      for (const asset of STATIC_ASSETS) {
        try {
          const res = await fetch(asset, { cache: 'no-cache' });
          if (res.ok) {
            await cache.put(asset, res);
          }
        } catch (e) {
          console.warn('[ServiceWorker] Could not precache:', asset, e);
        }
      }
    }).then(() => self.skipWaiting())
  );
});

// 2. Activate event - Clean old caches & take immediate control
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((name) => {
          if (name !== CACHE_NAME) {
            console.log('[ServiceWorker] Deleting obsolete cache:', name);
            return caches.delete(name);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// Helper: Limpiar response con redirected === true para evitar el error en Safari/Chrome
async function cleanRedirectedResponse(response) {
  if (!response || !response.redirected) {
    return response;
  }
  const body = await response.blob();
  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers
  });
}

// 3. Fetch event
self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // APIs y métodos no GET: siempre directo a la red (sin caché estático)
  if (url.pathname.startsWith('/api/') || request.method !== 'GET') {
    return;
  }

  // Manejo especial de navegación (PWA App Shell & Shortcuts en iOS/Android)
  if (request.mode === 'navigate') {
    event.respondWith(
      (async () => {
        try {
          // Intentar red con redirect follow
          const networkResponse = await fetch(request.url, {
            redirect: 'follow',
            headers: request.headers
          });

          if (networkResponse && networkResponse.ok) {
            // Reconstruir si fue redirigida para evitar "Response served by service worker has redirections"
            const cleanResponse = await cleanRedirectedResponse(networkResponse);
            
            // Actualizar caché de shell en segundo plano
            const cache = await caches.open(CACHE_NAME);
            cache.put('/index.html', cleanResponse.clone());
            return cleanResponse;
          }
        } catch (err) {
          console.warn('[ServiceWorker] Red no disponible para navegación, usando caché offline:', err);
        }

        // Fallback offline: buscar en caché ignorando query strings de shortcuts (?action=new_expense, etc.)
        const cached = await caches.match('/index.html', { ignoreSearch: true }) ||
                       await caches.match('/', { ignoreSearch: true });
        if (cached) {
          return cached;
        }

        return new Response('DuoControl Offline - Por favor verifica tu conexión a internet.', {
          status: 503,
          statusText: 'Service Unavailable',
          headers: { 'Content-Type': 'text/plain; charset=utf-8' }
        });
      })()
    );
    return;
  }

  // Recursos estáticos (CSS, JS, iconos, imágenes): Stale-While-Revalidate
  event.respondWith(
    caches.match(request, { ignoreSearch: true }).then((cachedResponse) => {
      const fetchPromise = fetch(request, { redirect: 'follow' })
        .then(async (networkResponse) => {
          if (networkResponse && networkResponse.status === 200 && networkResponse.type === 'basic') {
            const cleanResponse = await cleanRedirectedResponse(networkResponse);
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, cleanResponse.clone());
            return cleanResponse;
          }
          return networkResponse;
        })
        .catch(() => cachedResponse);

      return cachedResponse || fetchPromise;
    })
  );
});
