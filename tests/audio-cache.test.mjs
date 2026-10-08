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
  const writes = [];
  const key = request => new URL(typeof request === 'string' ? request : request.url, scope).href;
  const cache = {
    async addAll(assets) { installed.push(...assets); },
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
    caches: { open: async () => cache, match: request => cache.match(request),
      keys: async () => [], delete: async () => true },
    fetch: async request => { requested.push(request); return network ? network(request) : new Response('0123456789', {
      headers: { 'Content-Type': 'audio/mpeg', 'Content-Length': '10', 'Accept-Ranges': 'bytes' },
    }); },
    URL, Headers, Request, Response,
  });
  return { requested, stored, installed, writes,
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
  assert.equal(f.installed.some(path => /\.(mp3|ogg|wav)$/i.test(path)), false);
  assert.equal(f.requested.length, 0);
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

test('music caching is scoped to this game and cannot intercept ranking, authenticated or foreign requests', () => {
  const f = fixture();
  for (const [url, headers, method] of [
    ['https://game.example/api/assets/audio/result.mp3', {}, 'GET'],
    [new URL('assets/audio/api/result.mp3', scope).href, {}, 'GET'],
    ['https://game.example/other/assets/audio/song.mp3', {}, 'GET'],
    ['https://elsewhere.example/Mapache-cinema/assets/audio/song.mp3', {}, 'GET'],
    [track, { 'X-Player-Token': 'guest' }, 'GET'],
    [track, {}, 'POST'],
  ]) assert.equal(f.dispatch(url, headers, method).response, undefined);
  for (const filename of ['song.mp3', 'song.ogg', 'song.wav']) {
    assert.ok(f.dispatch(new URL(`assets/audio/${filename}`, scope).href).response);
  }
});
