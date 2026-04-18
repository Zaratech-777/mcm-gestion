/* ═══════════════════════════════════════════════════════
   MCM SGMCM — Service Worker v3.0
   Estrategia: Cache-first para assets, Network-first para Firebase
═══════════════════════════════════════════════════════ */

const CACHE_NAME = 'mcm-sgmcm-v3.0';
const STATIC_ASSETS = [
  './',
  './index.html',
  './app.js',
  './styles.css',
  './manifest.json',
  './assets/firebase/firebase-app-compat.js',
  './assets/firebase/firebase-database-compat.js',
];

// Fuentes externas que cacheamos
const FONT_URLS = [
  'https://fonts.googleapis.com/css2?family=Bebas+Neue&family=DM+Sans:wght@300;400;500;600&family=Share+Tech+Mono&display=swap',
];

// ── INSTALL: Cachear assets estáticos ──
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {

      return cache.addAll(STATIC_ASSETS);
    }).then(() => {
      // Skip waiting para activar inmediatamente
      self.skipWaiting();
    })
  );
});

// ── ACTIVATE: Limpiar caches viejos ──
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => name !== CACHE_NAME)
          .map((name) => {

            return caches.delete(name);
          })
      );
    }).then(() => {
      // Tomar control de todas las pestañas abiertas
      self.clients.claim();
    })
  );
});

// ── FETCH: Estrategia mixta ──
self.addEventListener('fetch', (event) => {
  const url = new URL(event.request.url);

  // Firebase Realtime DB y APIs → siempre network (no cachear datos)
  if (url.hostname.includes('firebaseio.com') ||
      url.hostname.includes('googleapis.com') && url.pathname.includes('/v1') ||
      url.hostname.includes('firebaseinstallations')) {
    return; // Dejar que el navegador maneje normalmente
  }

  // ExcelJS CDN → network-first con cache fallback
  if (url.hostname.includes('cdn.jsdelivr.net')) {
    event.respondWith(
      fetch(event.request)
        .then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        })
        .catch(() => caches.match(event.request))
    );
    return;
  }

  // Google Fonts → stale-while-revalidate
  if (url.hostname.includes('fonts.googleapis.com') ||
      url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(
      caches.match(event.request).then((cached) => {
        const fetchPromise = fetch(event.request).then((response) => {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
          return response;
        }).catch(() => cached);
        return cached || fetchPromise;
      })
    );
    return;
  }

  // Archivos locales → cache-first con network fallback
  event.respondWith(
    caches.match(event.request).then((cached) => {
      if (cached) {
        // En background, actualizar el cache para la próxima vez
        fetch(event.request).then((response) => {
          if (response && response.status === 200) {
            caches.open(CACHE_NAME).then((cache) => cache.put(event.request, response));
          }
        }).catch(() => {});
        return cached;
      }
      // No está en cache → ir a la red
      return fetch(event.request).then((response) => {
        if (response && response.status === 200) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(event.request, clone));
        }
        return response;
      });
    })
  );
});
