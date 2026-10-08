/* ============================================================
   sw.js  -  service worker: caches the game's own files so it
   works offline and qualifies as an installable PWA. Bump
   CACHE_NAME whenever shipped files change to force a refresh.
   ============================================================ */
const CACHE_NAME = 'mapache-cinema-v3.1.0-soundtrack';
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

// Tracks are downloaded only when selected by the music player. Request the
// full stream once (a 200 response is also valid for a Range request), then let
// playback and Cache Storage consume their own clones in parallel.
async function serveAudio(event) {
  const headers = new Headers(event.request.headers);
  headers.delete('Range');
  const fullRequest = new Request(event.request, { headers });
  const cached = await caches.open(CACHE_NAME)
    .then(cache => cache.match(fullRequest)).catch(() => null);
  if (cached && cached.status === 200) {
    const range = event.request.headers.get('Range');
    return range ? audioRange(cached, range) : cached;
  }
  try {
    const response = await fetch(fullRequest);
    if (response.status === 200 && response.type !== 'opaque') {
      const copy = response.clone();
      // A full cache, an interrupted download or private browsing must not
      // prevent the already available network stream from playing.
      event.waitUntil(caches.open(CACHE_NAME)
        .then(cache => cache.put(fullRequest, copy)).catch(() => {}));
    }
    return response;
  } catch {
    // The music player switches to its generated soundtrack on a media error.
    return Response.error();
  }
}

async function audioRange(response, range) {
  // Ignore unsupported/malformed/multipart ranges, as allowed by HTTP.
  const match = /^bytes=(\d*)-(\d*)$/i.exec(range.trim());
  if (!match || (!match[1] && !match[2])) return response;
  const bytes = await response.arrayBuffer();
  const length = bytes.byteLength;
  let start;
  let end;
  if (!match[1]) {
    const suffix = Number(match[2]);
    start = Math.max(0, length - suffix);
    end = length - 1;
  } else {
    start = Number(match[1]);
    end = match[2] ? Math.min(Number(match[2]), length - 1) : length - 1;
  }
  const headers = new Headers(response.headers);
  headers.set('Accept-Ranges', 'bytes');
  headers.delete('Content-Encoding');
  if (!length || !Number.isSafeInteger(start) || start < 0 || start >= length || end < start) {
    headers.set('Content-Range', `bytes */${length}`);
    headers.set('Content-Length', '0');
    return new Response(null, { status: 416, statusText: 'Range Not Satisfiable', headers });
  }
  const body = bytes.slice(start, end + 1);
  headers.set('Content-Range', `bytes ${start}-${end}/${length}`);
  headers.set('Content-Length', String(body.byteLength));
  return new Response(body, { status: 206, statusText: 'Partial Content', headers });
}

self.addEventListener('fetch', (e) => {
  if (e.request.method !== 'GET') return;
  const url = new URL(e.request.url);
  // Shared times always come from the server. Never turn cached JSON into a live ranking.
  if (url.origin !== self.location.origin || url.pathname.includes('/api/') || e.request.headers.has('X-Player-Token')) return;
  const audioRoot = new URL('./assets/audio/', self.registration.scope).pathname;
  if (url.pathname.startsWith(audioRoot) && /\.(mp3|ogg|wav)$/i.test(url.pathname)) {
    e.respondWith(serveAudio(e));
    return;
  }
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
