// PolarLink Service Worker: Explicit Cache Allowlist for Offline Operations
const CACHE_NAME = 'polarlink-shell-v1';

// Static resources to precache upon service worker installation.
// Cached individually (not with cache.addAll) so one missing file
// does not silently cancel precaching for all the others.
const PRECACHE_ALLOWLIST = [
  '/',
  '/manifest.json',
  '/offline.html',
  '/favicon.ico',
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      console.log('[SW] Precaching app shell assets...');
      await Promise.all(
        PRECACHE_ALLOWLIST.map((url) =>
          fetch(url)
            .then((response) => {
              if (response.ok) {
                return cache.put(url, response);
              }
              console.warn('[SW] Skipped precaching (not ok):', url, response.status);
            })
            .catch((err) => {
              console.warn('[SW] Skipped precaching (fetch failed):', url, err);
            })
        )
      );
      return self.skipWaiting();
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((keys) => {
      return Promise.all(
        keys.map((key) => {
          if (key !== CACHE_NAME) {
            console.log('[SW] Purging stale cache:', key);
            return caches.delete(key);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  const url = new URL(request.url);

  // CRITICAL RULE: Never cache mutation requests (POST, PUT, DELETE, PATCH)
  if (request.method !== 'GET') {
    return;
  }

  // CRITICAL RULE: Never cache credential-bearing or authentication endpoints
  if (url.pathname.startsWith('/api/auth/')) {
    return;
  }

  // For API read requests (/api/supplies, /api/shortages, /api/shipments):
  // Attempt network first, fall back to cached copy if offline
  if (url.pathname.startsWith('/api/')) {
    event.respondWith(
      fetch(request)
        .then((response) => {
          if (response.status === 200) {
            const copy = response.clone();
            caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => {
          return caches.match(request).then((cachedResponse) => {
            if (cachedResponse) {
              return cachedResponse;
            }
            return new Response(
              JSON.stringify({ error: 'Device is offline and no cached data is available.' }),
              { status: 503, headers: { 'Content-Type': 'application/json' } }
            );
          });
        })
    );
    return;
  }

  // For navigational shell requests and static chunks:
  // Stale-while-revalidate or Network-first with cache fallback
  event.respondWith(
    fetch(request)
      .then((networkResponse) => {
        if (networkResponse.status === 200) {
          const responseToCache = networkResponse.clone();
          caches.open(CACHE_NAME).then((cache) => {
            cache.put(request, responseToCache);
          });
        }
        return networkResponse;
      })
      .catch(() => {
        return caches.match(request).then((cachedResponse) => {
          if (cachedResponse) {
            return cachedResponse;
          }
          // If page navigation and not in cache, serve offline fallback
          if (request.mode === 'navigate') {
            return caches.match('/offline.html');
          }
          return new Response('Network error and asset not cached', { status: 408 });
        });
      })
  );
});
