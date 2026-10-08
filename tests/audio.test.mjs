import test from 'node:test';
import assert from 'node:assert/strict';
import { Audio } from '../js/audio.js';

function fixture(ids = ['a', 'b', 'c', 'd'], playlists) {
  const previousWindow = globalThis.window;
  const instances = [];
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
    _playGeneration: 0, _mediaPlayRequest: 0, musicGain: gain(), sfxGain: gain(),
    ctx: { state: 'running', currentTime: 0, createGain: gain,
      createMediaElementSource: () => ({ connect() {} }), resume: () => Promise.resolve() },
    _startProcedural(theme) { this._musicMode = 'procedural'; this.fallbackTheme = theme; },
  };
  audio.configureTracks({ tracks: ids.map((id) => ({ id, title: id, src: `https://game.example/audio/${id}.mp3`, gain: 0.5 })),
    playlists: playlists || { roofs: ids, forest: [...ids].reverse(), sewers: ids, district: ids, tower: ids, boss: ids } });
  return { audio, instances, close() { audio.stopMusic(); globalThis.window = previousWindow; } };
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
      f.audio.playMusic(themes[i % themes.length]);
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

test('ending a track selects a new song while a single-track playlist loops', () => {
  const f = fixture(['a', 'b'], { roofs: ['a', 'b'], menu: ['a'] });
  try {
    f.audio.playMusic('roofs');
    const before = f.audio._externalTrack.id;
    assert.equal(f.audio._media.loop, false);
    f.audio._media.finish();
    assert.notEqual(f.audio._externalTrack.id, before);
    assert.equal(f.audio.currentTrack, 'roofs');
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
    f.audio.playMusic('forest');
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
    assert.equal(f.audio.fallbackTheme, undefined);
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
    assert.equal(f.audio.fallbackTheme, undefined);
  } finally { f.close(); }
});

test('blocked autoplay waits for a gesture; missing media falls back without stopping gameplay', async () => {
  const f = fixture();
  try {
    f.audio._ensureMedia();
    const media = f.audio._media;
    media.nextPlay = () => Promise.reject({ name: 'NotAllowedError' });
    f.audio.playMusic('roofs');
    await Promise.resolve();
    assert.equal(f.audio.getMusicStatus().mode, 'loading');
    assert.equal(f.audio.fallbackTheme, undefined);
    media.nextPlay = null;
    media.paused = true;
    f.audio.resume();
    media.onplaying();
    assert.equal(f.audio.getMusicStatus().mode, 'external');
    media.error = { code: 4 };
    media.onerror();
    assert.equal(f.audio.getMusicStatus().mode, 'procedural');
    assert.equal(f.audio.currentTrack, 'roofs');
    assert.equal(f.audio._externalTrack, null);
    assert.equal(media.paused, true);
  } finally { f.close(); }
});

test('manifest deduplicates playlist entries and empty pools retain procedural music', () => {
  const f = fixture(['a', 'b'], { roofs: ['a', 'a', 'unknown'], forest: [] });
  try {
    assert.deepEqual(f.audio._playlists.roofs, ['a']);
    f.audio.playMusic('roofs');
    assert.equal(f.audio._media.loop, true);
    f.audio.playMusic('forest');
    assert.equal(f.audio.getMusicStatus().mode, 'procedural');
    assert.equal(f.audio.currentTrack, 'forest');
    assert.equal(f.audio._externalTrack, null);
  } finally { f.close(); }
});
