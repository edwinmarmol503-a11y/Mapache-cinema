/* ============================================================
   sw.js  -  service worker: caches the game's own files so it
   works offline and qualifies as an installable PWA. Bump
   CACHE_NAME whenever shipped files change to force a refresh.
   ============================================================ */
const CACHE_NAME = 'mapache-cinema-v2.1-visual';
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
      Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k)))
    ).then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  e.respondWith(
    caches.match(e.request).then((cached) => {
      const fetchPromise = fetch(e.request).then((res) => {
        if (res && res.ok) {
          const copy = res.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(e.request, copy));
        }
        return res;
      }).catch(() => cached);
      return cached || fetchPromise;
    })
  );
});
