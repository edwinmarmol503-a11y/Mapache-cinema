import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { Audio } from '../js/audio.js';
import { endingMusicTheme } from '../js/endings.js';

function fixture(ids = ['a', 'b', 'c', 'd'], playlists, alternateSrcs = {}, extra = {}) {
  const previousWindow = globalThis.window;
  const previousFetch = globalThis.fetch;
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
  const stored = new Map();
  const storage = extra.storage || { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) };
  globalThis.window = { Audio: Media, localStorage: storage };
  globalThis.fetch = async () => new Response(new Uint8Array([1, 2]));
  const audio = { ...Audio, opts: { music: 0.6, sfx: 0.7 }, _playlistOrders: new Map(), _playlistCursors: new Map(),
    _tracks: new Map(), _playlists: {}, _lastExternalTrack: null, _media: null,
    _externalTrack: null, currentTrack: null, _pausedTrack: null, _musicTimer: null,
    _playGeneration: 0, _mediaPlayRequest: 0, _mediaAttempt: 0, _activeSource: null,
    _trackEndListeners: new Set(), _endedAttempt: -1,
    _cues: {}, _cuePlayers: new Map(), _cueState: null, _deathCueIndex: 0,
    _musicReservations: new WeakSet(),
    musicGain: gain(), sfxGain: gain(),
    ctx: { state: 'running', currentTime: 0, createGain: gain,
      decodeAudioData: async () => ({ duration: 4, numberOfChannels: 2 }),
      createBufferSource() {
        if (this.failSource) throw new Error('unsupported');
        return { loop: false, connect() {}, disconnect() {}, start(at, offset) { this.offset = offset; },
          stop() { this.stopped = true; }, finish() { this.onended?.(); } };
      },
      createMediaElementSource: () => ({ connect() {} }), resume: () => Promise.resolve() },
    _tone(...args) { tones.push(args); },
  };
  const manifest = { tracks: ids.map((id) => ({ id, title: id, src: `https://game.example/audio/${id}.mp3`,
    gain: 0.5, alternateSrcs: alternateSrcs[id] || [], ...extra.entries?.[id] })),
    playlists: playlists || { roofs: ids, forest: [...ids].reverse(), sewers: ids, district: ids, tower: ids, boss: ids }, cues: extra.cues };
  audio.configureTracks(manifest);
  return { audio, instances, tones, manifest, close() { audio.stopMusic(); globalThis.window = previousWindow; globalThis.fetch = previousFetch; } };
}

test('level music follows one manifest-ordered sequence across themes and wraps after the last song', () => {
  const f = fixture();
  try {
    const sequence = [];
    const themes = ['roofs', 'forest', 'sewers', 'district', 'tower', 'boss'];
    for (let i = 0; i < 12; i++) {
      f.audio.playMusic(themes[i % themes.length], { restart: true });
      sequence.push(f.audio._externalTrack.id);
    }
    assert.deepEqual(sequence, ['a', 'b', 'c', 'd', 'a', 'b', 'c', 'd', 'a', 'b', 'c', 'd']);
    assert.equal(f.instances.length, 1, 'all tracks stream through one media element');
  } finally { f.close(); }
});

test('fixed scene songs do not consume the ordered level cursor', () => {
  const f = fixture(['a', 'b'], { roofs: ['a', 'b'], forest: ['a'] });
  try {
    f.audio.playMusic('roofs');
    assert.equal(f.audio._externalTrack.id, 'a');
    f.audio.playMusic('forest');
    assert.equal(f.audio._externalTrack.id, 'a');
    f.audio.playMusic('roofs');
    assert.equal(f.audio._externalTrack.id, 'b');
    f.audio.playMusic('roofs', { restart: true });
    assert.equal(f.audio._externalTrack.id, 'a', 'the ordered pool wraps after b');
  } finally { f.close(); }
});

test('natural song endings keep the same song until an explicit level or death transition', () => {
  const f = fixture(['a', 'b'], { roofs: ['a', 'b'], menu: ['a'] });
  try {
    f.audio.playMusic('roofs');
    const before = f.audio._externalTrack.id;
    const media = f.audio._media;
    const bag = [...f.audio._playlistCursors.entries()];
    const source = media.src;
    assert.equal(media.loop, true);
    f.audio._media.finish();
    assert.equal(f.audio._externalTrack.id, before);
    assert.equal(media.src, source);
    assert.equal(media.currentTime, 0);
    assert.deepEqual([...f.audio._playlistCursors.entries()], bag);
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
    const bag = [...f.audio._playlistCursors.entries()];
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
    assert.deepEqual([...f.audio._playlistCursors.entries()], bag);
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

test('missing primary URL retries the same song at its valid alternate without advancing the sequence', () => {
  const f = fixture(['a', 'b'], undefined, { a: ['https://game.example/batch/audio/a.mp3'] });
  const originalRandom = Math.random;
  Math.random = () => 0.999999;
  try {
    f.audio.playMusic('roofs');
    const entry = f.audio._externalTrack;
    assert.equal(entry.id, 'a');
    const bag = [...f.audio._playlistCursors.entries()];
    const media = f.audio._media;
    const generation = f.audio._playGeneration;
    media.error = { code: 4 };
    media.onerror();
    assert.equal(f.audio._externalTrack, entry);
    assert.equal(media.src, 'https://game.example/batch/audio/a.mp3');
    assert.equal(f.audio._playGeneration, generation);
    assert.deepEqual([...f.audio._playlistCursors.entries()], bag);
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

test('equivalent level requests and dialogue resume preserve the source, playhead and sequence cursor', () => {
  const f = fixture();
  try {
    f.audio.playMusic('roofs');
    const media = f.audio._media;
    const entry = f.audio._externalTrack;
    const source = media.src;
    const bag = [...f.audio._playlistCursors.entries()];
    const oldError = media.onerror;
    media.currentTime = 47;
    f.audio.playMusic('forest');
    assert.equal(f.audio.currentTrack, 'forest');
    assert.equal(f.audio._externalTrack, entry);
    assert.equal(media.currentTime, 47);
    assert.equal(media.src, source);
    assert.deepEqual([...f.audio._playlistCursors.entries()], bag);
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

test('the supplied manifest loads 39 songs and 4 cues with a deterministic 34-song level sequence', async () => {
  const manifest = JSON.parse(await readFile(new URL('../assets/audio/tracks.json', import.meta.url), 'utf8'));
  const ids = manifest.tracks.map(track => track.id);
  assert.equal(ids.length, 43);
  assert.equal(new Set(ids).size, 43);
  assert.deepEqual(manifest.playlists.menu, ['pista-37']);
  assert.deepEqual(manifest.playlists.ending, ['pista-34']);
  assert.deepEqual(manifest.playlists['ending-bad'], ['final-malo']);
  assert.deepEqual(manifest.playlists['ending-bad-nightmare'], ['final-malo-pesadilla']);
  assert.deepEqual(manifest.playlists.boss, ['pista-03']);
  assert.match(manifest.tracks.find(track => track.id === 'pista-37').title, /Arcade/i);
  assert.match(manifest.tracks.find(track => track.id === 'pista-34').title, /^Lo Que Soy$/i);
  assert.match(manifest.tracks.find(track => track.id === 'pista-03').title, /CHUTY VS ACZINO/i);
  const reserved = new Set(['pista-37', 'pista-34', 'pista-03', 'final-malo', 'final-malo-pesadilla']);
  const random = manifest.playlists.roofs;
  assert.equal(random.length, 34);
  for (const theme of ['roofs', 'forest', 'sewers', 'district', 'tower']) {
    assert.deepEqual(manifest.playlists[theme], random);
    assert.equal(manifest.playlists[theme].some(id => reserved.has(id)), false);
  }
  // The real browser resolves relative URLs from an HTTPS manifest. Supplying
  // its resolved URLs here exercises the limit without file:// test paths.
  const f = fixture(ids, manifest.playlists, {}, { cues: manifest.cues });
  try {
    assert.equal(f.audio._tracks.size, 43, 'tracks after number 20 cannot be silently discarded');
    for (const [theme, id] of [['menu', 'pista-37'], ['boss', 'pista-03'], ['ending', 'pista-34'], ['ending-bad', 'final-malo'], ['ending-bad-nightmare', 'final-malo-pesadilla']]) {
      f.audio.playMusic(theme);
      assert.equal(f.audio._externalTrack.id, id);
    }
    const sequence = [];
    for (let i = 0; i < 34; i++) {
      f.audio.playMusic('roofs', { restart: true });
      sequence.push(f.audio._externalTrack.id);
    }
    assert.equal(new Set(sequence).size, 34);
    assert.deepEqual(sequence, manifest.playlists.roofs, 'every level song is heard in the supplied order');
    assert.equal(sequence.some(id => reserved.has(id)), false);
    assert.deepEqual(manifest.cues, { death: ['burla-01', 'burla-02', 'burla-03'], respawn: ['reaparicion'] });
    assert.equal(sequence.some(id => manifest.tracks.find(track => track.id === id)?.role === 'cue'), false);
  } finally { f.close(); }
});

test('the next ordered song persists across reloads without fixed songs or manifest refresh consuming it', () => {
  const stored = new Map();
  const storage = { getItem: key => stored.get(key) || null, setItem: (key, value) => stored.set(key, value) };
  const playlists = { roofs: ['a', 'b', 'c'], forest: ['a', 'b', 'c'], menu: ['arcade'], boss: ['battle'], ending: ['victory'] };
  const ids = ['a', 'b', 'c', 'arcade', 'battle', 'victory'];
  const first = fixture(ids, playlists, {}, { storage });
  try {
    first.audio.playMusic('roofs');
    assert.equal(first.audio._externalTrack.id, 'a');
    const media = first.audio._media;
    media.currentTime = 22;
    first.audio.configureTracks(first.manifest);
    assert.equal(first.audio._externalTrack.id, 'a');
    assert.equal(media.currentTime, 22, 'refreshing metadata preserves the active song');
    for (const theme of ['menu', 'boss', 'ending']) first.audio.playMusic(theme);
  } finally { first.close(); }
  const second = fixture(ids, playlists, {}, { storage });
  try {
    second.audio.playMusic('forest');
    assert.equal(second.audio._externalTrack.id, 'b', 'next session resumes the next unplayed level song');
    second.audio.playMusic('forest', { restart: true });
    assert.equal(second.audio._externalTrack.id, 'c');
    second.audio.playMusic('forest', { restart: true });
    assert.equal(second.audio._externalTrack.id, 'a');
  } finally { second.close(); }
});

test('blocked localStorage still follows the full ordered queue in memory', () => {
  const storage = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('denied'); } };
  const f = fixture(['a', 'b', 'c'], undefined, {}, { storage });
  try {
    const sequence = [];
    for (let i = 0; i < 6; i++) { f.audio.playMusic('roofs', { restart: true }); sequence.push(f.audio._externalTrack.id); }
    assert.deepEqual(sequence, ['a', 'b', 'c', 'a', 'b', 'c']);
  } finally { f.close(); }
});

function cueFixture() {
  return fixture(['a', 'b', 'c', 'burla-01', 'burla-02', 'burla-03', 'reaparicion'],
    { roofs: ['a', 'b', 'c'] }, {}, { cues: { death: ['burla-01', 'burla-02', 'burla-03'], respawn: ['reaparicion'] } });
}

test('all twelve ending/difficulty combinations keep their selected song through narration and credits and end once', async () => {
  const manifest = JSON.parse(await readFile(new URL('../assets/audio/tracks.json', import.meta.url), 'utf8'));
  const f = fixture(manifest.tracks.map(track => track.id), manifest.playlists);
  try {
    const events = [];
    f.audio.subscribeTrackEnd(event => events.push(event));
    f.audio.playMusic('roofs');
    const cursor = [...f.audio._playlistCursors];
    for (const difficulty of ['easy', 'normal', 'hard', 'nightmare']) {
      for (const ending of ['A', 'B', 'C']) {
        const theme = endingMusicTheme(ending, difficulty);
        const id = ending === 'B' ? (difficulty === 'nightmare' ? 'final-malo-pesadilla' : 'final-malo') : 'pista-34';
        f.audio.playMusic(theme, { restart: true });
        assert.equal(f.audio.getMusicStatus().id, id, `${ending}/${difficulty}`);
        const media = f.audio._media;
        media.currentTime = 18;
        f.audio.playMusic(theme);
        assert.equal(media.currentTime, 18, 'narrative-to-credits transition must retain position');
        assert.equal(media.loop, false);
        assert.deepEqual([...f.audio._playlistCursors], cursor);
        media.finish(); media.finish();
        assert.deepEqual(events.splice(0), [{ theme, id, title: id }]);
      }
    }
  } finally { f.close(); }
});

test('long replacement cues are streamed lazily, continue past 45 seconds and cancel immediately for respawn', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const f = fixture(['a', 'b', 'long', 'respawn'], { roofs: ['a', 'b'] }, {}, {
    cues: { death: ['long'], respawn: ['respawn'] }, entries: { long: { durationSeconds: 167.328, playback: 'stream' } },
  });
  try {
    assert.equal(f.audio._cuePlayers.get('long').mode, 'stream');
    assert.equal(f.audio._cuePlayers.get('long').buffer, null);
    assert.equal(f.instances.length, 0, 'manifest load does not preload a long media element');
    await Promise.all([...f.audio._cuePlayers.values()].map(player => player.promise));
    f.audio.playMusic('roofs');
    const cursor = [...f.audio._playlistCursors];
    f.audio.stopMusic();
    let settled = false;
    const long = f.audio.playTransitionCue('death').then(result => { settled = true; return result; });
    const state = f.audio._cueState, media = state.media;
    assert.equal(state.source, null, 'no decoded buffer source is allocated for long audio');
    assert.equal(media.preload, 'metadata');
    assert.equal(media.loop, false);
    media.onplaying();
    t.mock.timers.tick(65000); media.currentTime = 65;
    await Promise.resolve();
    assert.equal(settled, false, 'there is no old 45-second cap');
    assert.equal(f.audio.getCueStatus().position, 65);
    const oldEnded = media.onended;
    const respawn = f.audio.playTransitionCue('respawn');
    assert.equal((await long).status, 'cancelled');
    assert.equal(media.paused, true);
    assert.equal(media.src, '', 'cancelling releases network and decoder resources');
    oldEnded();
    assert.equal(f.audio.getCueStatus().id, 'respawn');
    f.audio._cueState.source.finish();
    assert.equal((await respawn).status, 'ended');
    assert.deepEqual([...f.audio._playlistCursors], cursor, 'neither recording advances the level pool');
  } finally { f.close(); }
});

test('streaming cue pause preserves playback, ignores stale play rejection and resumes to natural end', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const f = fixture(['long'], {}, {}, { cues: { death: ['long'] }, entries: { long: { durationSeconds: 167.328 } } });
  try {
    const playing = f.audio.playTransitionCue('death');
    const media = f.audio._cueState.media;
    media.onplaying(); media.currentTime = 8;
    let rejectOld;
    media.nextPlay = () => new Promise((_, reject) => { rejectOld = reject; });
    f.audio._playCueMedia(f.audio._cueState);
    f.audio.pauseMusic();
    const playCalls = media.playCalls;
    f.audio.resume();
    assert.equal(media.playCalls, playCalls, 'gesture cannot unpause a paused cue');
    t.mock.timers.tick(200000);
    assert.equal(f.audio.getCueStatus().mode, 'paused');
    assert.equal(f.audio.getCueStatus().position, 8);
    media.nextPlay = null;
    f.audio.resumeMusic(); media.onplaying();
    rejectOld({ name: 'NotSupportedError' }); await Promise.resolve();
    assert.equal(f.audio.getCueStatus().mode, 'playing');
    assert.equal(media.currentTime, 8);
    media.finish();
    assert.equal((await playing).status, 'ended');
  } finally { f.close(); }
});

test('a failed streaming cue resolves without substituting a song or generic music', async () => {
  const f = fixture(['long', 'a'], { roofs: ['a'] }, {}, { cues: { death: ['long'] }, entries: { long: { durationSeconds: 167 } } });
  try {
    const playing = f.audio.playTransitionCue('death');
    const media = f.audio._cueState.media;
    media.error = { code: 4 }; media.onerror();
    assert.equal((await playing).status, 'unavailable');
    assert.equal(f.audio.currentTrack, null);
    assert.equal(f.tones.length, 0);
    assert.equal(f.audio.getCueStatus().mode, 'stopped');
  } finally { f.close(); }
});

test('complete death recordings rotate in order, then stay silent until a full respawn recording finishes', async () => {
  const f = cueFixture();
  try {
    await Promise.all([...f.audio._cuePlayers.values()].map(player => player.promise));
    f.audio.playMusic('roofs');
    f.audio.stopMusic();
    for (const id of ['burla-01', 'burla-02', 'burla-03', 'burla-01']) {
      const playing = f.audio.playTransitionCue('death');
      const source = f.audio._cueState.source;
      assert.equal(f.audio.getCueStatus().id, id);
      assert.equal(source.loop, false);
      assert.equal(f.audio.currentTrack, null, 'the death screen has no background song');
      source.finish();
      assert.equal((await playing).status, 'ended');
      assert.equal(f.audio.getCueStatus().mode, 'stopped', 'the quote waits in silence');
    }
    const respawn = f.audio.playTransitionCue('respawn');
    assert.equal(f.audio.getCueStatus().id, 'reaparicion');
    f.audio._cueState.source.finish();
    assert.equal((await respawn).status, 'ended');
    assert.equal(f.audio.currentTrack, null, 'the caller controls when gameplay resumes');
    f.audio.playMusic('roofs', { restart: true });
    assert.equal(f.audio._externalTrack.id, 'b', 'death cues do not skip any level songs');
  } finally { f.close(); }
});

test('cue pause, visibility resume and muting preserve recording position and its completion promise', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const f = cueFixture();
  try {
    await Promise.all([...f.audio._cuePlayers.values()].map(player => player.promise));
    let settled = false;
    const playing = f.audio.playTransitionCue('respawn').then(result => { settled = true; return result; });
    const source = f.audio._cueState.source;
    t.mock.timers.tick(1000);
    f.audio.ctx.currentTime = 1;
    f.audio.pauseMusic();
    assert.equal(f.audio.getCueStatus().mode, 'paused');
    f.audio.resume();
    assert.equal(f.audio._cueState.source, null, 'a new gesture never undoes an explicit pause');
    t.mock.timers.tick(10000);
    await Promise.resolve();
    assert.equal(settled, false, 'background time does not finish a paused recording');
    f.audio.setSfxVol(0);
    f.audio.resumeMusic();
    assert.equal(f.audio.getCueStatus().position, 1);
    assert.equal(f.audio._cueState.source.offset, 1);
    assert.equal(f.audio.sfxGain.gain.value, 0);
    f.audio._cueState.source.finish();
    assert.equal((await playing).status, 'ended', 'muted clips still complete their visual transition');
  } finally { f.close(); }
});

test('unsupported and stalled decoding / playback have bounded completion and never hang the death screen', async t => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  const f = cueFixture();
  try {
    await Promise.all([...f.audio._cuePlayers.values()].map(player => player.promise));
    assert.equal((await f.audio.playTransitionCue('unknown')).status, 'unavailable');
    f.audio.ctx.failSource = true;
    assert.equal((await f.audio.playTransitionCue('death')).status, 'unavailable');
    f.audio.ctx.failSource = false;
    const player = f.audio._cuePlayers.get('burla-02');
    player.buffer = null;
    player.promise = new Promise(() => {});
    const stalledDecode = f.audio.playTransitionCue('death');
    t.mock.timers.tick(4000);
    assert.equal((await stalledDecode).status, 'timed-out');
    const stalledPlayback = f.audio.playTransitionCue('death');
    t.mock.timers.tick(5500);
    assert.equal((await stalledPlayback).status, 'timed-out');
    assert.equal(f.audio.getCueStatus().mode, 'stopped');
    f.audio.ctx = null;
    assert.equal((await f.audio.playTransitionCue('respawn')).status, 'unavailable');
  } finally { f.close(); }
});

test('starting another scene cancels its cue and obsolete recording events cannot interrupt the new song', async () => {
  const f = cueFixture();
  try {
    await Promise.all([...f.audio._cuePlayers.values()].map(player => player.promise));
    const playing = f.audio.playTransitionCue('respawn');
    const source = f.audio._cueState.source;
    const oldEnded = source.onended;
    f.audio.playMusic('roofs');
    assert.equal((await playing).status, 'cancelled');
    const song = f.audio._externalTrack;
    oldEnded();
    assert.equal(f.audio._externalTrack, song);
    assert.equal(f.audio.getCueStatus().mode, 'stopped');
  } finally { f.close(); }
});

test('an obsolete buffer ended event from before pause cannot finish the resumed recording', async () => {
  const f = cueFixture();
  try {
    await Promise.all([...f.audio._cuePlayers.values()].map(player => player.promise));
    const playing = f.audio.playTransitionCue('respawn');
    const oldEnded = f.audio._cueState.source.onended;
    f.audio.ctx.currentTime = 2;
    f.audio.pauseMusic();
    f.audio.resumeMusic();
    oldEnded();
    assert.equal(f.audio.getCueStatus().id, 'reaparicion');
    assert.equal(f.audio.getCueStatus().position, 2);
    f.audio._cueState.source.finish();
    assert.equal((await playing).status, 'ended');
  } finally { f.close(); }
});

test('respawn reservations consume exactly one ordered song and later start it without consuming another', async () => {
  const f = cueFixture();
  try {
    await Promise.all([...f.audio._cuePlayers.values()].map(player => player.promise));
    f.audio.playMusic('roofs');
    assert.equal(f.audio._externalTrack.id, 'a');
    f.audio.stopMusic();
    const reserved = f.audio.reserveMusic('roofs');
    assert.equal(reserved.id, 'b');
    assert.equal(f.audio.currentTrack, null);
    const cue = f.audio.playTransitionCue('respawn');
    f.audio._cueState.source.finish();
    await cue;
    assert.equal(f.audio.playReservedMusic(reserved), true);
    assert.equal(f.audio._externalTrack.id, 'b');
    assert.equal(f.audio.playReservedMusic(reserved), false, 'a reservation is single use');
    f.audio.playMusic('roofs', { restart: true });
    assert.equal(f.audio._externalTrack.id, 'c');
  } finally { f.close(); }
});

test('another death or level invalidates stale respawn reservations while preserving their one-song advance', async () => {
  const f = cueFixture();
  try {
    await Promise.all([...f.audio._cuePlayers.values()].map(player => player.promise));
    f.audio.playMusic('roofs');
    f.audio.stopMusic();
    const first = f.audio.reserveMusic('roofs');
    const interruptedCue = f.audio.playTransitionCue('respawn');
    f.audio.stopMusic();
    assert.equal((await interruptedCue).status, 'cancelled');
    const second = f.audio.reserveMusic('roofs');
    assert.equal(first.id, 'b');
    assert.equal(second.id, 'c', 'the second death advances once even if b never began sounding');
    assert.equal(f.audio.playReservedMusic(first), false);
    assert.equal(f.audio.playReservedMusic(second), true);
    assert.equal(f.audio._externalTrack.id, 'c');
    assert.equal(f.audio.playReservedMusic({ theme: 'roofs', id: 'a', generation: f.audio._playGeneration }), false,
      'foreign objects cannot start or advance music');
  } finally { f.close(); }
});

test('all 43 supplied audio files match recorded fingerprints and any retained source originals', async () => {
  const inventory = await readFile(new URL('../assets/audio/INVENTARIO.md', import.meta.url), 'utf8');
  const rows = inventory.split('\n').filter(line => /^\| (pista-|burla-|reaparicion|final-malo)/.test(line));
  assert.equal(rows.length, 43);
  const sha = bytes => createHash('sha256').update(bytes).digest('hex');
  for (const row of rows) {
    const [, id, , original, size, digest] = row.split('|').map(cell => cell.trim());
    const expected = digest.replaceAll('`', '');
    const copy = await readFile(new URL(`../assets/audio/${id}.mp3`, import.meta.url));
    assert.equal(copy.length, Number(size), id + ': complete canonical file');
    assert.equal(sha(copy), expected, id + ': verified byte fingerprint');
    // Received source files may be removed after publication. Their recorded
    // fingerprint still verifies every byte of the distributed copy above.
    let received;
    try { received = await readFile(new URL('../AUDIOS/' + encodeURIComponent(original), import.meta.url)); }
    catch (error) { if (error.code === 'ENOENT') continue; throw error; }
    assert.equal(sha(received), expected, id + ': same bytes as original WhatsApp file');
  }
});
