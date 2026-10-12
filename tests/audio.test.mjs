import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Audio } from '../js/audio.js';

function fixture(ids = ['a', 'b', 'c', 'd'], playlists, alternateSrcs = {}) {
  const previousWindow = globalThis.window;
  const instances = [];
  const tones = [];
  const gain = () => ({ gain: { value: 0, setValueAtTime(v) { this.value = v; },
    linearRampToValueAtTime(v) { this.value = v; } }, connect() {} });
  class Media {
    constructor() {
      instances.push(this);
      this.paused = true;
      this.ended = false;
      this.error = null;
      this.currentSrc = '';
      this.currentTime = 0;
      this.playCalls = 0;
    }
    set src(value) {
      this._src = value;
      this.currentSrc = value;
      this.currentTime = 0;
      this.ended = false;
      this.error = null;
    }
    get src() { return this._src || ''; }
    play() {
      this.playCalls++;
      this.paused = false;
      return this.nextPlay?.() ?? Promise.resolve();
    }
    pause() { this.paused = true; }
    removeAttribute() { this._src = ''; }
    load() { this.currentSrc = this.src; this.currentTime = 0; this.ended = false; this.error = null; }
    finish() { this.ended = true; this.paused = true; this.onended?.(); }
  }
  globalThis.window = { Audio: Media };
  const audio = { ...Audio, opts: { music: 0.6, sfx: 0.7 }, _shuffleBags: new Map(),
    _tracks: new Map(), _playlists: {}, _lastExternalTrack: null, _media: null,
    _externalTrack: null, currentTrack: null, _pausedTrack: null, _musicTimer: null,
    _playGeneration: 0, _mediaPlayRequest: 0, _mediaAttempt: 0, _activeSource: null,
    _trackEndListeners: new Set(), _endedAttempt: -1,
    musicGain: gain(), sfxGain: gain(),
    ctx: { state: 'running', currentTime: 0, createGain: gain,
      createMediaElementSource: () => ({ connect() {} }), resume: () => Promise.resolve() },
    _tone(...args) { tones.push(args); },
  };
  const manifest = { tracks: ids.map((id) => ({ id, title: id, src: `https://game.example/audio/${id}.mp3`,
    gain: 0.5, alternateSrcs: alternateSrcs[id] || [] })),
    playlists: playlists || { roofs: ids, forest: [...ids].reverse(), sewers: ids, district: ids, tower: ids, boss: ids } };
  audio.configureTracks(manifest);
  return { audio, instances, tones, manifest, close() { audio.stopMusic(); globalThis.window = previousWindow; } };
}

test('random music shares a shuffle bag across levels and plays every track before reshuffling', () => {
  const f = fixture();
  const originalRandom = Math.random;
  // The resulting order differs from the manifest: this verifies a shuffle,
  // while a second cycle also exercises avoiding its boundary repeat.
  let randomCalls = 0;
  Math.random = () => randomCalls++ < 3 ? 0 : 0.999999;
  try {
    const sequence = [];
    const themes = ['roofs', 'forest', 'sewers', 'district', 'tower', 'boss'];
    for (let i = 0; i < 12; i++) {
      f.audio.playMusic(themes[i % themes.length], { restart: true });
      sequence.push(f.audio._externalTrack.id);
    }
    assert.notDeepEqual(sequence.slice(0, 4), ['a', 'b', 'c', 'd']);
    assert.equal(sequence[3], 'a');
    assert.notEqual(sequence[4], 'a', 'the next shuffled bag initially starts with a, so its boundary must be repaired');
    for (let i = 0; i < sequence.length; i += 4) assert.equal(new Set(sequence.slice(i, i + 4)).size, 4);
    for (let i = 1; i < sequence.length; i++) assert.notEqual(sequence[i], sequence[i - 1]);
    assert.equal(f.instances.length, 1, 'all tracks stream through one media element');
  } finally { Math.random = originalRandom; f.close(); }
});

test('changing to an overlapping pool defers its final entry when it was just played', () => {
  const f = fixture(['a', 'b'], { roofs: ['a', 'b'], forest: ['a'] });
  const originalRandom = Math.random;
  Math.random = () => 0;
  try {
    f.audio.playMusic('roofs');
    assert.equal(f.audio._externalTrack.id, 'b');
    f.audio.playMusic('forest');
    assert.equal(f.audio._externalTrack.id, 'a');
    f.audio.playMusic('roofs');
    assert.equal(f.audio._externalTrack.id, 'b');
    f.audio.playMusic('roofs', { restart: true });
    assert.equal(f.audio._externalTrack.id, 'a', 'deferred track remains available');
  } finally { Math.random = originalRandom; f.close(); }
});

test('natural song endings keep the same song until an explicit level or death transition', () => {
  const f = fixture(['a', 'b'], { roofs: ['a', 'b'], menu: ['a'] });
  try {
    f.audio.playMusic('roofs');
    const before = f.audio._externalTrack.id;
    const media = f.audio._media;
    const bag = [...f.audio._shuffleBags.values()][0].slice();
    const source = media.src;
    assert.equal(media.loop, true);
    f.audio._media.finish();
    assert.equal(f.audio._externalTrack.id, before);
    assert.equal(media.src, source);
    assert.equal(media.currentTime, 0);
    assert.deepEqual([...f.audio._shuffleBags.values()][0], bag);
    assert.equal(f.audio.currentTrack, 'roofs');
    f.audio.playMusic('roofs', { restart: true });
    assert.notEqual(f.audio._externalTrack.id, before, 'death and level advance explicitly draw another song');
    f.audio.playMusic('menu');
    assert.equal(f.audio._media.loop, true);
    assert.equal(f.audio._externalTrack.id, 'a');
  } finally { f.close(); }
});

test('pausing, gestures and volume changes keep the same song and playback position', async () => {
  const f = fixture();
  try {
    f.audio.playMusic('roofs');
    const media = f.audio._media;
    const song = f.audio._externalTrack;
    const bag = [...f.audio._shuffleBags.values()][0].slice();
    media.currentTime = 42;
    f.audio.pauseMusic();
    f.audio.resume();
    assert.equal(media.paused, true, 'a gesture does not unpause an explicitly paused game');
    assert.equal(f.audio.getMusicStatus().mode, 'paused');
    f.audio.resumeMusic();
    media.onplaying();
    assert.equal(f.audio.getMusicStatus().mode, 'external');
    assert.equal(media.currentTime, 42);
    assert.equal(f.audio._externalTrack, song);
    assert.deepEqual([...f.audio._shuffleBags.values()][0], bag);
    f.audio.playMusic('roofs');
    assert.equal(f.audio._externalTrack, song, 'repeated non-restart calls preserve playback');
    f.audio.setMusicVol(0.25);
    f.audio.setSfxVol(0.8);
    assert.equal(f.audio.musicGain.gain.value, 0.25);
    assert.equal(f.audio.sfxGain.gain.value, 0.8);
    assert.equal(f.audio._mediaGain.gain.value, 0.5);
    f.audio.setMusicVol(0);
    assert.equal(f.audio.musicGain.gain.value, 0);
    assert.equal(media.currentTime, 42, 'muting does not restart the song');
  } finally { f.close(); }
});

test('old media events and rejected play promises cannot overwrite a newer song', async () => {
  const f = fixture();
  try {
    f.audio.playMusic('roofs');
    const media = f.audio._media;
    const oldEvents = { error: media.onerror, ended: media.onended, playing: media.onplaying };
    let rejectOld;
    media.nextPlay = () => new Promise((_, reject) => { rejectOld = reject; });
    f.audio._playMedia('roofs', f.audio._playGeneration);
    media.nextPlay = null;
    f.audio.playMusic('forest', { restart: true });
    const newer = f.audio._externalTrack;
    media.error = { code: 4 };
    media.ended = true;
    oldEvents.error();
    oldEvents.ended();
    oldEvents.playing();
    rejectOld({ name: 'NotSupportedError' });
    await Promise.resolve();
    assert.equal(f.audio._externalTrack, newer);
    assert.equal(f.audio.currentTrack, 'forest');
    assert.equal(f.audio.getMusicStatus().mode, 'loading');
    assert.equal(f.audio.getMusicStatus().unavailableTracks, 0);
    media.ended = false;
    media.error = null;
    media.onplaying();
    assert.equal(f.audio.getMusicStatus().mode, 'external');
  } finally { f.close(); }
});

test('a rejected attempt from before pause cannot interrupt resumed playback', async () => {
  const f = fixture();
  try {
    f.audio.playMusic('roofs');
    const media = f.audio._media;
    let rejectOld;
    media.nextPlay = () => new Promise((_, reject) => { rejectOld = reject; });
    f.audio._playMedia('roofs', f.audio._playGeneration);
    f.audio.pauseMusic();
    media.nextPlay = null;
    f.audio.resumeMusic();
    media.onplaying();
    rejectOld({ name: 'NotSupportedError' });
    await Promise.resolve();
    assert.equal(f.audio.getMusicStatus().mode, 'external');
    assert.equal(f.audio.getMusicStatus().unavailableTracks, 0);
  } finally { f.close(); }
});

test('blocked autoplay waits for a gesture; missing media stays silent without stopping gameplay', async () => {
  const f = fixture(['a']);
  try {
    f.audio._ensureMedia();
    const media = f.audio._media;
    media.nextPlay = () => Promise.reject({ name: 'NotAllowedError' });
    f.audio.playMusic('roofs');
    await Promise.resolve();
    assert.equal(f.audio.getMusicStatus().mode, 'loading');
    assert.equal(f.audio.getMusicStatus().unavailableTracks, 0);
    media.nextPlay = null;
    media.paused = true;
    f.audio.resume();
    media.onplaying();
    assert.equal(f.audio.getMusicStatus().mode, 'external');
    media.error = { code: 4 };
    media.onerror();
    assert.equal(f.audio.getMusicStatus().mode, 'unavailable');
    assert.equal(f.audio.currentTrack, 'roofs');
    assert.equal(f.audio._externalTrack, null);
    assert.equal(media.paused, true);
    assert.equal(f.tones.length, 0);
  } finally { f.close(); }
});

test('manifest deduplicates playlist entries and empty pools stay silent', () => {
  const f = fixture(['a', 'b'], { roofs: ['a', 'a', 'unknown'], forest: [] });
  try {
    assert.deepEqual(f.audio._playlists.roofs, ['a']);
    f.audio.playMusic('roofs');
    assert.equal(f.audio._media.loop, true);
    f.audio.playMusic('forest');
    assert.equal(f.audio.getMusicStatus().mode, 'unavailable');
    assert.equal(f.audio.currentTrack, 'forest');
    assert.equal(f.audio._externalTrack, null);
    assert.equal(f.audio._musicTimer, null);
    assert.equal(f.tones.length, 0);
  } finally { f.close(); }
});

test('missing primary URL retries the same song at its valid alternate without consuming the bag', () => {
  const f = fixture(['a', 'b'], undefined, { a: ['https://game.example/batch/audio/a.mp3'] });
  const originalRandom = Math.random;
  Math.random = () => 0.999999;
  try {
    f.audio.playMusic('roofs');
    const entry = f.audio._externalTrack;
    assert.equal(entry.id, 'a');
    const bag = [...f.audio._shuffleBags.values()][0].slice();
    const media = f.audio._media;
    const generation = f.audio._playGeneration;
    media.error = { code: 4 };
    media.onerror();
    assert.equal(f.audio._externalTrack, entry);
    assert.equal(media.src, 'https://game.example/batch/audio/a.mp3');
    assert.equal(f.audio._playGeneration, generation);
    assert.deepEqual([...f.audio._shuffleBags.values()][0], bag);
    media.onplaying();
    assert.equal(f.audio.getMusicStatus().mode, 'external');
    assert.equal(f.audio.getMusicStatus().src, media.src);
    assert.equal(f.audio.getMusicStatus().unavailableTracks, 0);
    assert.equal(f.instances.length, 1);
  } finally { Math.random = originalRandom; f.close(); }
});

test('an obsolete primary error or rejected promise cannot interrupt the alternate of the same song', async () => {
  const f = fixture(['a'], undefined, { a: ['https://game.example/batch/a.mp3'] });
  try {
    f.audio.playMusic('roofs');
    const media = f.audio._media;
    const oldEvents = { error: media.onerror, ended: media.onended, playing: media.onplaying };
    let rejectPrimary;
    media.nextPlay = () => new Promise((_, reject) => { rejectPrimary = reject; });
    f.audio._playMedia('roofs', f.audio._playGeneration);
    media.nextPlay = null;
    media.error = { code: 4 };
    media.onerror();
    const alternate = media.src;
    media.error = { code: 4 };
    media.ended = true;
    oldEvents.error();
    oldEvents.ended();
    oldEvents.playing();
    rejectPrimary({ name: 'NotSupportedError' });
    await Promise.resolve();
    assert.equal(media.src, alternate);
    assert.equal(f.audio._externalTrack.id, 'a');
    assert.equal(f.audio.getMusicStatus().unavailableTracks, 0);
    assert.equal(f.audio.getMusicStatus().mode, 'loading');
    media.error = null;
    media.ended = false;
    media.onplaying();
    assert.equal(f.audio.getMusicStatus().mode, 'external');
  } finally { f.close(); }
});

test('a fully missing song advances to an available song rather than producing generic music', () => {
  const f = fixture(['a', 'b'], undefined, { a: ['https://game.example/batch/a.mp3'] });
  const originalRandom = Math.random;
  Math.random = () => 0.999999;
  try {
    f.audio.playMusic('roofs');
    const media = f.audio._media;
    assert.equal(f.audio._externalTrack.id, 'a');
    media.error = { code: 4 };
    media.onerror();
    assert.equal(f.audio._externalTrack.id, 'a');
    media.error = { code: 4 };
    media.onerror();
    assert.equal(f.audio._externalTrack.id, 'b');
    assert.equal(f.audio.getMusicStatus().unavailableTracks, 1);
    media.onplaying();
    assert.equal(f.audio.getMusicStatus().mode, 'external');
    assert.equal(f.tones.length, 0);
    assert.equal(media.loop, true, 'the sole available song can continue looping');
  } finally { Math.random = originalRandom; f.close(); }
});

test('all missing songs have bounded attempts and leave silence with working effects', async () => {
  const f = fixture(['a', 'b', 'c'], undefined, {
    a: ['https://game.example/batch/a.mp3'], b: ['https://game.example/batch/b.mp3'], c: ['https://game.example/batch/c.mp3'],
  });
  try {
    f.audio._ensureMedia();
    const media = f.audio._media;
    const attempted = [];
    media.nextPlay = () => { attempted.push(media.src); return Promise.reject({ name: 'NotSupportedError' }); };
    f.audio.playMusic('roofs');
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(attempted.length, 6, 'each of three songs gets two URL attempts');
    assert.equal(new Set(attempted).size, 6);
    assert.equal(f.audio.getMusicStatus().mode, 'unavailable');
    assert.equal(f.audio.getMusicStatus().unavailableTracks, 3);
    assert.equal(f.audio._externalTrack, null);
    assert.equal(media.src, '');
    assert.equal(media.paused, true);
    assert.equal(f.audio.currentTrack, 'roofs');
    assert.equal(f.audio._musicTimer, null);
    assert.equal('_startProcedural' in f.audio, false, 'generic music synthesis has been removed');
    assert.equal(f.tones.length, 0);
    f.audio.sfx('jump');
    assert.equal(f.tones.length, 1);
    assert.equal(f.tones[0][4], f.audio.sfxGain, 'gameplay effects keep their own bus');
    f.audio.playMusic('forest');
    for (let i = 0; i < 20; i++) await Promise.resolve();
    assert.equal(attempted.length, 6, 'failed tracks do not cause retries at every level change');
  } finally { f.close(); }
});

test('manifest reload and explicit connectivity retry clear failures and retry real files', () => {
  const f = fixture(['a']);
  try {
    f.audio.playMusic('roofs');
    const media = f.audio._media;
    media.error = { code: 4 };
    media.onerror();
    assert.equal(f.audio.getMusicStatus().mode, 'unavailable');
    f.audio.configureTracks(f.manifest);
    assert.equal(f.audio.getMusicStatus().mode, 'loading');
    assert.equal(f.audio.getMusicStatus().unavailableTracks, 0);
    media.error = { code: 4 };
    media.onerror();
    assert.equal(f.audio.getMusicStatus().mode, 'unavailable');
    f.audio.retryUnavailableMusic();
    assert.equal(f.audio.getMusicStatus().mode, 'loading');
    media.onplaying();
    assert.equal(f.audio.getMusicStatus().mode, 'external');
  } finally { f.close(); }
});

test('source normalization drops unsafe schemes, malformed entries and duplicate alternate URLs', () => {
  const f = fixture(['a']);
  try {
    f.audio.configureTracks({ tracks: [{ id: 'a', src: 'https://game.example/audio/a.mp3',
      alternateSrcs: ['javascript:alert(1)', 'file:///music.mp3', '', null, 'https://game.example/audio/a.mp3',
        'https://game.example/batch/a.mp3', 'https://game.example/batch/a.mp3'] }], playlists: { roofs: ['a'] } });
    assert.deepEqual(f.audio._tracks.get('a').sources, ['https://game.example/audio/a.mp3', 'https://game.example/batch/a.mp3']);
    f.audio.playMusic('roofs');
    f.audio._media.error = { code: 4 };
    f.audio._media.onerror();
    assert.equal(f.audio._media.src, 'https://game.example/batch/a.mp3');
  } finally { f.close(); }
});

test('equivalent level requests and dialogue resume preserve the source, playhead and shuffle bag', () => {
  const f = fixture();
  try {
    f.audio.playMusic('roofs');
    const media = f.audio._media;
    const entry = f.audio._externalTrack;
    const source = media.src;
    const bag = [...f.audio._shuffleBags.values()][0].slice();
    const oldError = media.onerror;
    media.currentTime = 47;
    f.audio.playMusic('forest');
    assert.equal(f.audio.currentTrack, 'forest');
    assert.equal(f.audio._externalTrack, entry);
    assert.equal(media.currentTime, 47);
    assert.equal(media.src, source);
    assert.deepEqual([...f.audio._shuffleBags.values()][0], bag);
    media.error = { code: 4 };
    oldError();
    assert.equal(f.audio._failedTracks.size, 0, 'obsolete theme callback cannot mark the retained song as failed');
    media.error = null;
    f.audio.pauseMusic();
    f.audio.playMusic('forest');
    assert.equal(media.paused, false);
    assert.equal(media.currentTime, 47);
    assert.equal(f.audio._externalTrack, entry);
  } finally { f.close(); }
});

test('fixed menu and boss songs repeat while victory ends once and supports unsubscribing', () => {
  const f = fixture(['arcade', 'battle', 'victory', 'random'], {
    menu: ['arcade'], boss: ['battle'], ending: ['victory'], roofs: ['random'],
  });
  try {
    const events = [];
    const removed = [];
    const unsubscribe = f.audio.subscribeTrackEnd(event => events.push(event));
    const unsubscribeRemoved = f.audio.subscribeTrackEnd(event => removed.push(event));
    unsubscribeRemoved();
    for (const [theme, id] of [['menu', 'arcade'], ['boss', 'battle']]) {
      f.audio.playMusic(theme);
      assert.equal(f.audio._externalTrack.id, id);
      assert.equal(f.audio._media.loop, true);
      f.audio._media.finish();
      assert.equal(f.audio._externalTrack.id, id);
      assert.deepEqual(events, []);
    }
    f.audio.playMusic('ending');
    const media = f.audio._media;
    assert.equal(media.loop, false, 'the congratulations song never loops');
    assert.equal(f.audio._externalTrack.id, 'victory');
    media.finish();
    const playCalls = media.playCalls;
    media.finish();
    f.audio.resume();
    assert.equal(media.playCalls, playCalls, 'later gestures never replay a completed victory song');
    assert.deepEqual(events, [{ theme: 'ending', id: 'victory', title: 'victory' }]);
    assert.deepEqual(removed, []);
    assert.equal(f.audio.getMusicStatus().mode, 'ended');
    unsubscribe();
    f.audio.playMusic('ending', { restart: true });
    media.finish();
    assert.equal(events.length, 1);
  } finally { f.close(); }
});

test('a missing fixed theme remains silent instead of borrowing a random level song', () => {
  const f = fixture(['arcade', 'battle', 'victory', 'random'], {
    menu: ['arcade'], boss: ['battle'], ending: ['victory'], roofs: ['random'],
  });
  try {
    for (const theme of ['menu', 'boss', 'ending']) {
      f.audio.playMusic(theme);
      f.audio._media.error = { code: 4 };
      f.audio._media.onerror();
      assert.equal(f.audio.getMusicStatus().mode, 'unavailable');
      assert.equal(f.audio._externalTrack, null);
    }
    f.audio.playMusic('roofs');
    assert.equal(f.audio._externalTrack.id, 'random');
    assert.equal(f.tones.length, 0);
  } finally { f.close(); }
});

test('the supplied manifest loads all 37 songs and reserves the requested three for their scenes', async () => {
  const manifest = JSON.parse(await readFile(new URL('../assets/audio/tracks.json', import.meta.url), 'utf8'));
  const ids = manifest.tracks.map(track => track.id);
  assert.equal(ids.length, 37);
  assert.equal(new Set(ids).size, 37);
  assert.deepEqual(manifest.playlists.menu, ['pista-37']);
  assert.deepEqual(manifest.playlists.ending, ['pista-34']);
  assert.deepEqual(manifest.playlists.boss, ['pista-03']);
  assert.match(manifest.tracks.find(track => track.id === 'pista-37').title, /Arcade/i);
  assert.match(manifest.tracks.find(track => track.id === 'pista-34').title, /^Lo Que Soy$/i);
  assert.match(manifest.tracks.find(track => track.id === 'pista-03').title, /CHUTY VS ACZINO/i);
  const reserved = new Set(['pista-37', 'pista-34', 'pista-03']);
  const random = manifest.playlists.roofs;
  assert.equal(random.length, 34);
  for (const theme of ['roofs', 'forest', 'sewers', 'district', 'tower']) {
    assert.deepEqual(manifest.playlists[theme], random);
    assert.equal(manifest.playlists[theme].some(id => reserved.has(id)), false);
  }
  // The real browser resolves relative URLs from an HTTPS manifest. Supplying
  // its resolved URLs here exercises the limit without file:// test paths.
  const f = fixture(ids, manifest.playlists);
  try {
    assert.equal(f.audio._tracks.size, 37, 'tracks after number 20 cannot be silently discarded');
    for (const [theme, id] of [['menu', 'pista-37'], ['boss', 'pista-03'], ['ending', 'pista-34']]) {
      f.audio.playMusic(theme);
      assert.equal(f.audio._externalTrack.id, id);
    }
    const sequence = [];
    for (let i = 0; i < 34; i++) {
      f.audio.playMusic('roofs', { restart: true });
      sequence.push(f.audio._externalTrack.id);
    }
    assert.equal(new Set(sequence).size, 34);
    assert.equal(sequence.some(id => reserved.has(id)), false);
  } finally { f.close(); }
});

test('all 26 new canonical MP3s match the received originals without losing or modifying audio', async () => {
  const inventory = await readFile(new URL('../assets/audio/INVENTARIO.md', import.meta.url), 'utf8');
  const rows = inventory.split('\n').filter(line => /^\| pista-/.test(line));
  assert.equal(rows.length, 37);
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  for (const row of rows) {
    const [, id, , original, size, digest] = row.split('|').map(cell => cell.trim());
    const expected = digest.replaceAll('`', '');
    const copy = await readFile(new URL(`../assets/audio/${id}.mp3`, import.meta.url));
    assert.equal(copy.length, Number(size), id + ': complete canonical file');
    assert.equal(sha(copy), expected, id + ': verified byte fingerprint');
    const received = await readFile(new URL('../AUDIOS/' + encodeURIComponent(original), import.meta.url));
    assert.equal(sha(received), expected, id + ': same bytes as original WhatsApp file');
  }
});
