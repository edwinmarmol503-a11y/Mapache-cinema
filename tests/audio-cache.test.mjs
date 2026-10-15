import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../sw.js', import.meta.url), 'utf8');
const scope = 'https://game.example/Mapache-cinema/';
const track = new URL('assets/audio/pista-01.mp3', scope).href;

function fixture({ network, failRead = false, failWrite = false } = {}) {
  const listeners = new Map();
  const stored = new Map();
  const requested = [];
  const installed = [];
  const installRequests = [];
  const writes = [];
  const opened = [];
  const key = request => new URL(typeof request === 'string' ? request : request.url, scope).href;
  const cache = {
    async addAll(assets) {
      installRequests.push(...assets);
      installed.push(...assets.map(request => './' + new URL(request.url).pathname.slice(new URL(scope).pathname.length)));
    },
    async match(request) {
      if (failRead) throw new Error('storage unavailable');
      return stored.get(key(request))?.clone();
    },
    async put(request, response) {
      writes.push(request);
      if (failWrite) throw new Error('storage full');
      const body = await response.arrayBuffer();
      stored.set(key(request), new Response(body, { status: response.status, headers: response.headers }));
    },
  };
  vm.runInNewContext(source, {
    self: { location: { origin: new URL(scope).origin }, registration: { scope },
      addEventListener: (name, listener) => listeners.set(name, listener),
      skipWaiting: async () => {}, clients: { claim: async () => {} } },
    caches: { open: async name => { opened.push(name); return cache; }, match: request => cache.match(request),
      keys: async () => [], delete: async () => true },
    fetch: async request => { requested.push(request); return network ? network(request) : new Response('0123456789', {
      headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': '10', 'Accept-Ranges': 'bytes' },
    }); },
    URL, Headers, Request, Response,
  });
  return { requested, stored, installed, installRequests, writes, opened,
    message(data) {
      let response;
      listeners.get('message')({ data, ports: [{ postMessage: value => { response = value; } }] });
      return response;
    },
    install() {
      const waits = [];
      listeners.get('install')({ waitUntil: promise => waits.push(promise) });
      return Promise.all(waits);
    },
    dispatch(url = track, headers = {}, method = 'GET') {
      const event = { request: new Request(url, { headers, method }), waits: [],
        waitUntil(promise) { this.waits.push(promise); },
        respondWith(promise) { this.response = Promise.resolve(promise); } };
      listeners.get('fetch')(event);
      return event;
    },
  };
}

test('installation caches the small manifest and game files, never all music tracks', async () => {
  const f = fixture();
  await f.install();
  assert.ok(f.installed.includes('./assets/audio/tracks.json'));
  assert.ok(f.opened.includes('mapache-cinema-v8.0.0-console-controls'));
  assert.ok(f.installRequests.every(request => request.cache === 'reload'), 'a new build cannot inherit HTTP-cached modules');
  for (const module of ['gamepad', 'control-mode', 'developer-controls', 'controller-bindings', 'controller-settings', 'display', 'endings', 'emotes', 'ranking-session']) {
    assert.ok(f.installed.includes('./js/' + module + '.js'), module + ' is available offline');
  }
  for (const style of ['style', 'menu', 'game', 'ui', 'touch', 'controller-settings', 'death', 'typography', 'endings']) {
    assert.ok(f.installed.includes('./css/' + style + '.css'), style + ' is available offline');
  }
  assert.equal(f.installed.some(path => /\.(mp3|ogg|wav)$/i.test(path)), false);
  assert.equal(f.requested.length, 0);
});

test('the bootstrap can identify the controlling build before importing game modules', () => {
  const f = fixture();
  assert.equal(f.message({ type: 'GET_BUILD_VERSION' }).version, '8.0.0');
  assert.equal(f.message({ type: 'unknown' }), undefined);
});

test('versioned bootstrap and styles reuse their canonical offline entries', async () => {
  const f = fixture({ network: () => { throw new Error('offline'); } });
  for (const asset of ['js/bootstrap.js', 'css/style.css', 'css/menu.css']) {
    const canonical = new URL(asset, scope).href;
    f.stored.set(canonical, new Response('installed-current-build'));
    assert.equal(await (await f.dispatch(canonical + '?v=8.0.0').response).text(), 'installed-current-build');
  }
  assert.equal(f.requested.length, 0);
});

test('a future document bypasses the older canonical loader without rewriting its cache', async () => {
  const f = fixture({ network: () => new Response('future-build') });
  for (const asset of ['js/bootstrap.js', 'css/menu.css']) {
    const canonical = new URL(asset, scope).href;
    f.stored.set(canonical, new Response('installed-current-build'));
    assert.equal(await (await f.dispatch(canonical + '?v=5.0.1').response).text(), 'future-build');
    assert.equal(await f.stored.get(canonical).clone().text(), 'installed-current-build');
  }
  assert.equal(f.requested.length, 2);
  assert.ok(f.requested.every(request => request.cache === 'reload'));
  assert.equal(f.writes.length, 0);
});

test('cached runtime modules stay in one build until the service worker is upgraded', async () => {
  const f = fixture({ network: () => new Response('next-build-on-server') });
  const module = new URL('js/menu.js', scope).href;
  f.stored.set(module, new Response('installed-current-build'));
  assert.equal(await (await f.dispatch(module).response).text(), 'installed-current-build');
  assert.equal(f.requested.length, 0, 'a background revalidation cannot replace half a module graph');
});

test('restricted Cache Storage does not block a fresh online runtime module', async () => {
  const f = fixture({ failRead: true, failWrite: true, network: () => new Response('current-network-module') });
  const event = f.dispatch(new URL('js/menu.js', scope).href);
  assert.equal(await (await event.response).text(), 'current-network-module');
  await Promise.all(event.waits);
  assert.equal(f.requested[0].cache, 'reload');
});

test('the first ranged track request fetches one full stream and caches it for offline seeks', async () => {
  const f = fixture();
  const first = f.dispatch(track, { Range: 'bytes=0-' });
  const response = await first.response;
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '0123456789');
  await Promise.all(first.waits);
  assert.equal(f.requested.length, 1, 'no second fetch for a cache copy');
  assert.equal(f.requested[0].headers.has('Range'), false);
  assert.equal(f.writes[0].headers.has('Range'), false);
  const seek = await f.dispatch(track, { Range: 'bytes=3-5' }).response;
  assert.equal(seek.status, 206);
  assert.equal(seek.headers.get('Content-Range'), 'bytes 3-5/10');
  assert.equal(seek.headers.get('Content-Length'), '3');
  assert.equal(seek.headers.get('Accept-Ranges'), 'bytes');
  assert.equal(seek.headers.get('Content-Type'), 'audio/mpeg');
  assert.equal(await seek.text(), '345');
  assert.equal(f.requested.length, 1, 'a seek uses the completed local cache');
});

test('network audio becomes playable while its download and cache write are still unfinished', async () => {
  let controller;
  const stream = new ReadableStream({ start(value) { controller = value; } });
  const f = fixture({ network: () => new Response(stream, { headers: { 'Content-Type': 'audio/mpeg' } }) });
  const event = f.dispatch(track, { Range: 'bytes=0-' });
  const response = await event.response;
  const reader = response.body.getReader();
  controller.enqueue(new TextEncoder().encode('first chunk'));
  const chunk = await reader.read();
  assert.equal(new TextDecoder().decode(chunk.value), 'first chunk');
  assert.equal(f.stored.has(track), false, 'cache storage has not received the rest of the track');
  assert.equal(f.requested.length, 1);
  controller.enqueue(new TextEncoder().encode(' and the end'));
  controller.close();
  while (!(await reader.read()).done) { /* Drain the playback clone. */ }
  await Promise.all(event.waits);
  assert.equal(await f.stored.get(track).clone().text(), 'first chunk and the end');
});

test('cached media supports open-ended, suffix and oversized ranges without network access', async () => {
  const f = fixture({ network: () => { throw new Error('offline'); } });
  f.stored.set(track, new Response('0123456789', { headers: { 'Content-Type': 'audio/mpeg' } }));
  for (const [range, expected, contentRange] of [
    ['bytes=6-', '6789', 'bytes 6-9/10'],
    ['bytes=-3', '789', 'bytes 7-9/10'],
    ['bytes=-99', '0123456789', 'bytes 0-9/10'],
    ['bytes=7-99999999999999999999', '789', 'bytes 7-9/10'],
  ]) {
    const response = await f.dispatch(track, { Range: range }).response;
    assert.equal(response.status, 206);
    assert.equal(response.headers.get('Content-Range'), contentRange);
    assert.equal(await response.text(), expected);
  }
  assert.equal(f.requested.length, 0);
});

test('unsatisfiable cached ranges return 416; malformed or multipart ranges return full media', async () => {
  const f = fixture();
  f.stored.set(track, new Response('0123456789'));
  for (const range of ['bytes=10-', 'bytes=6-2', 'bytes=-0', 'bytes=999999999999999999999-']) {
    const response = await f.dispatch(track, { Range: range }).response;
    assert.equal(response.status, 416);
    assert.equal(response.headers.get('Content-Range'), 'bytes */10');
    assert.equal(response.headers.get('Content-Length'), '0');
    assert.equal(await response.text(), '');
  }
  for (const range of ['bad range', 'bytes=-', 'bytes=1-2,4-5']) {
    const response = await f.dispatch(track, { Range: range }).response;
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '0123456789');
  }
  assert.equal(f.requested.length, 0);
});

test('cache failures preserve network playback, and an offline cache miss signals the audio fallback', async () => {
  for (const options of [{ failRead: true }, { failWrite: true }]) {
    const f = fixture(options);
    const event = f.dispatch();
    const response = await event.response;
    assert.equal(await response.text(), '0123456789');
    await Promise.all(event.waits);
    assert.equal(f.requested.length, 1);
  }
  const offline = fixture({ network: () => { throw new Error('offline'); } });
  const error = await offline.dispatch().response;
  assert.equal(error.type, 'error');
  assert.equal(error.status, 0);
});

test('partial or failed network responses are never saved as complete offline tracks', async () => {
  for (const status of [206, 404]) {
    const f = fixture({ network: () => new Response('partial', { status }) });
    const event = f.dispatch(track, { Range: 'bytes=3-' });
    const response = await event.response;
    assert.equal(response.status, status);
    assert.equal(await response.text(), 'partial');
    await Promise.all(event.waits);
    assert.equal(f.writes.length, 0);
    assert.equal(f.stored.has(track), false);
  }
});

for (const [directory, filename] of [
  ['01-AUDIOS-1-A-4', 'pista-01.mp3'],
  ['02-AUDIOS-5-A-8', 'pista-05.ogg'],
  ['03-AUDIOS-9-A-11', 'pista-09.wav'],
]) {
  test(`the ${directory} upload layout streams once and serves cached ranges offline`, async () => {
    let online = true;
    const f = fixture({ network: () => {
      if (!online) throw new Error('offline');
      return new Response('0123456789abcdef', { headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': '16' } });
    } });
    const url = new URL(`${directory}/assets/audio/${filename}`, scope).href;
    const event = f.dispatch(url, { Range: 'bytes=0-15' });
    const response = await event.response;
    assert.equal(response.status, 200);
    assert.equal(await response.text(), '0123456789abcdef');
    await Promise.all(event.waits);
    assert.equal(f.requested.length, 1);
    assert.equal(f.requested[0].headers.has('Range'), false);
    assert.ok(f.stored.has(url));
    online = false;
    const cached = await f.dispatch(url, { Range: 'bytes=0-15' }).response;
    assert.equal(cached.status, 206);
    assert.equal(cached.headers.get('Content-Range'), 'bytes 0-15/16');
    assert.equal(cached.headers.get('Content-Length'), '16');
    assert.equal(await cached.text(), '0123456789abcdef');
    const suffix = await f.dispatch(url, { Range: 'bytes=-4' }).response;
    assert.equal(suffix.status, 206);
    assert.equal(await suffix.text(), 'cdef');
    const invalid = await f.dispatch(url, { Range: 'bytes=16-' }).response;
    assert.equal(invalid.status, 416);
    assert.equal(f.requested.length, 1, 'all later seeks remain offline');
  });
}

test('music caching is scoped to this game and cannot intercept ranking, authenticated or foreign requests', () => {
  const f = fixture();
  for (const [url, headers, method] of [
    ['https://game.example/api/assets/audio/result.mp3', {}, 'GET'],
    [new URL('assets/audio/api/result.mp3', scope).href, {}, 'GET'],
    ['https://game.example/other/assets/audio/song.mp3', {}, 'GET'],
    ['https://elsewhere.example/Mapache-cinema/assets/audio/song.mp3', {}, 'GET'],
    [new URL('01-AUDIOS-1-A-4-extra/assets/audio/song.mp3', scope).href, {}, 'GET'],
    [new URL('00-AUDIOS/assets/audio/song.mp3', scope).href, {}, 'GET'],
    [new URL('04-AUDIOS-9-A-11/assets/audio/song.mp3', scope).href, {}, 'GET'],
    ['https://game.example/other/01-AUDIOS-1-A-4/assets/audio/song.mp3', {}, 'GET'],
    ['https://elsewhere.example/Mapache-cinema/01-AUDIOS-1-A-4/assets/audio/song.mp3', {}, 'GET'],
    [new URL('02-AUDIOS-5-A-8/assets/audio/api/result.mp3', scope).href, {}, 'GET'],
    [new URL('01-AUDIOS-1-A-4/assets/audio/pista-01.mp3', scope).href, { 'X-Player-Token': 'guest' }, 'GET'],
    [new URL('01-AUDIOS-1-A-4/assets/audio/pista-01.mp3', scope).href, {}, 'POST'],
    [track, { 'X-Player-Token': 'guest' }, 'GET'],
    [track, {}, 'POST'],
  ]) assert.equal(f.dispatch(url, headers, method).response, undefined);
  for (const filename of ['song.mp3', 'song.ogg', 'song.wav']) {
    assert.ok(f.dispatch(new URL(`assets/audio/${filename}`, scope).href).response);
  }
});
