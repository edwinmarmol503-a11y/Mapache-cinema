/* ============================================================
   sw.js  -  service worker: caches the game's own files so it
   works offline and qualifies as an installable PWA. Bump
   CACHE_NAME whenever shipped files change to force a refresh.
   ============================================================ */
const CACHE_NAME = 'mapache-cinema-v3.0.1-lumera';
const ASSETS = [
  './',
  './index.html',
  './manifest.webmanifest',
  './css/style.css',
  './css/menu.css',
  './css/game.css',
  './css/ui.css',
  './css/touch.css',
  './js/main.js',
  './js/bootstrap.js',
  './js/config.js',
  './js/ranking.js',
  './js/input.js',
  './js/touch.js',
  './js/audio.js',
  './js/save.js',
  './js/dialogue.js',
  './js/game.js',
  './js/menu.js',
  './js/pause.js',
  './js/ui.js',
  './js/utils.js',
  './js/collision.js',
  './js/particles.js',
  './js/camera.js',
  './js/inventory.js',
  './js/enemies.js',
  './js/items.js',
  './js/physics.js',
  './js/player.js',
  './js/puzzles.js',
  './js/levels.js',
  './js/sprites.js',
  './js/boss.js',
  './js/difficulty.js',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png',
  './assets/audio/tracks.json',
];

self.addEventListener('install', (e) => {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then((cache) => cache.addAll(ASSETS))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    caches.keys().then((keys) =>
      Promise.all(keys.filter((k) => k.startsWith('mapache-cinema-') && k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Shared times always come from the server. Never turn cached JSON into a live ranking.
  if (url.origin !== self.location.origin || url.pathname.includes('/api/') || e.request.headers.has('X-Player-Token')) return;
  const known = ASSETS.some(p => new URL(p, self.registration.scope).pathname === url.pathname);
  if (!known) return;
  if (e.request.mode === 'navigate' || url.pathname.endsWith('/tracks.json')) {
    e.respondWith(fetch(e.request).then(async res => {
      if (res.ok && res.type !== 'opaque') { const cache = await caches.open(CACHE_NAME); await cache.put(e.request, res.clone()); }
      return res;
    }).catch(async () => (await caches.match(e.request)) || (await caches.match('./index.html')) || Response.error()));
    return;
  }
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
        }
        return res;
      }).catch(() => cached || Response.error());
      return cached || fetchPromise;
    })
  );
});
