/* ============================================================
   audio.js  -  Web Audio API, optional streamed soundtrack.
   Separate music / sfx buses. Procedural fallback works offline.
   ============================================================ */
export const MUSIC_MANIFEST_URL = new URL('../assets/audio/tracks.json', import.meta.url).href;
const MUSIC_THEMES = ['menu', 'roofs', 'forest', 'sewers', 'district', 'tower', 'boss', 'ending'];
const volume = (v, fallback) => Number.isFinite(v) ? Math.min(1, Math.max(0, v)) : fallback;

export const Audio = {
  ctx: null,
  master: null,
  musicGain: null,
  sfxGain: null,
  opts: { music: 0.6, sfx: 0.7 },
  currentTrack: null,
  _musicTimer: null,
  _pausedTrack: null,
  _muted: false,
  _tracks: new Map(),
  _playlists: {},
  _shuffleBags: new Map(),
  _lastExternalTrack: null,
  _manifestPromise: null,
  _media: null,
  _mediaSource: null,
  _mediaGain: null,
  _externalTrack: null,
  _musicMode: 'stopped',
  _playGeneration: 0,
  _mediaPlayRequest: 0,

  init(opts) {
    if (opts) {
      this.opts.music = volume(opts.music, this.opts.music);
      this.opts.sfx = volume(opts.sfx, this.opts.sfx);
    }
    if (this.ctx) { this.applyVolumes(); return; }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.connect(this.ctx.destination);
      this.musicGain = this.ctx.createGain();
      this.sfxGain = this.ctx.createGain();
      this.musicGain.connect(this.master);
      this.sfxGain.connect(this.master);
      this.applyVolumes();
      // Soundtrack files are streamed; an empty or unavailable manifest uses synth.
      this.loadTrackManifest();
    } catch (e) {
      console.warn('[audio] Web Audio unavailable', e);
    }
  },

  resume() {
    if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    if (this._media && this.currentTrack && this._externalTrack && this._media.paused) {
      this._playMedia(this.currentTrack, this._playGeneration);
    }
  },

  applyVolumes() {
    if (!this.ctx) return;
    this.musicGain.gain.value = this._muted ? 0 : this.opts.music;
    this.sfxGain.gain.value = this._muted ? 0 : this.opts.sfx;
  },
  setMusicVol(v) { this.opts.music = volume(v, this.opts.music); this.applyVolumes(); },
  setSfxVol(v)   { this.opts.sfx = volume(v, this.opts.sfx); this.applyVolumes(); },

  /** Supply soundtrack metadata without changing any existing gameplay call. */
  configureTracks(manifest) {
    const entries = Array.isArray(manifest?.tracks) ? manifest.tracks : [];
    this._tracks = new Map();
    for (const entry of entries.slice(0, 20)) {
      if (!entry || typeof entry.id !== 'string' || !entry.id.trim() || typeof entry.src !== 'string' || !entry.src.trim()) continue;
      let url;
      try {
        url = new URL(entry.src, MUSIC_MANIFEST_URL);
        if (!['http:', 'https:'].includes(url.protocol)) continue;
      } catch { continue; }
      this._tracks.set(entry.id, { ...entry, src: url.href, gain: volume(entry.gain, 0.7) });
    }
    this._playlists = {};
    for (const theme of MUSIC_THEMES) {
      const ids = manifest?.playlists?.[theme];
      this._playlists[theme] = Array.isArray(ids) ? [...new Set(ids.filter((id) => this._tracks.has(id)))] : [];
    }
    this._shuffleBags = new Map();
    if (!this._tracks.has(this._lastExternalTrack)) this._lastExternalTrack = null;
    if (this.currentTrack) this.playMusic(this.currentTrack, { restart: true });
    return this._tracks.size;
  },

  loadTrackManifest() {
    if (!this._manifestPromise) {
      this._manifestPromise = fetch(MUSIC_MANIFEST_URL, { cache: 'no-cache' })
        .then((response) => { if (!response.ok) throw new Error('Music manifest unavailable'); return response.json(); })
        .then((manifest) => this.configureTracks(manifest))
        .catch(() => 0); // Missing file/network never prevents the game from running.
    }
    return this._manifestPromise;
  },

  getMusicStatus() {
    return { mode: this._musicMode, theme: this.currentTrack, title: this._externalTrack?.title || '', configuredTracks: this._tracks.size };
  },

  _nextTrack(theme) {
    const ids = this._playlists[theme] || [];
    if (!ids.length) return null;
    // Themes using the same collection share a bag, so changing levels cannot
    // keep choosing the first song or discard tracks that have not played yet.
    const key = JSON.stringify([...ids].sort());
    let bag = this._shuffleBags.get(key);
    if (!bag?.length) {
      bag = [...ids];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      this._shuffleBags.set(key, bag);
    }
    // Also avoid the last song after reshuffling or switching to another pool.
    if (bag[0] === this._lastExternalTrack) {
      if (bag.length > 1) {
        const alternative = bag.findIndex((id) => id !== this._lastExternalTrack);
        [bag[0], bag[alternative]] = [bag[alternative], bag[0]];
      } else if (ids.length > 1) {
        // Another, overlapping pool may have just played the final bag entry.
        // Defer it until the next draw instead of repeating it immediately.
        const alternatives = ids.filter((id) => id !== this._lastExternalTrack);
        const id = alternatives[Math.floor(Math.random() * alternatives.length)];
        this._lastExternalTrack = id;
        return this._tracks.get(id);
      }
    }
    const id = bag.shift();
    this._lastExternalTrack = id;
    return this._tracks.get(id);
  },

  _ensureMedia() {
    if (this._media) return;
    const media = new window.Audio();
    media.preload = 'metadata';
    media.crossOrigin = 'anonymous';
    const source = this.ctx.createMediaElementSource(media);
    const gain = this.ctx.createGain();
    source.connect(gain);
    gain.connect(this.musicGain);
    this._media = media;
    this._mediaSource = source;
    this._mediaGain = gain;
  },

  _playMedia(theme, generation) {
    if (!this._media || !this._externalTrack) return;
    const media = this._media;
    const entry = this._externalTrack;
    const request = ++this._mediaPlayRequest;
    let result;
    try { result = media.play(); }
    catch { this._fallbackMusic(theme, generation, entry); return; }
    if (result?.catch) result.catch((error) => {
      if (request !== this._mediaPlayRequest || !this._isCurrentMedia(theme, generation, entry, media)) return;
      // Autoplay waits for the next user gesture. Unsupported/missing files use synth.
      if (error?.name !== 'NotAllowedError' && error?.name !== 'AbortError') this._fallbackMusic(theme, generation, entry);
    });
  },

  _isCurrentMedia(theme, generation, entry, media) {
    return generation === this._playGeneration && this.currentTrack === theme &&
      this._externalTrack === entry && this._media === media &&
      (!media.currentSrc || media.currentSrc === entry.src);
  },

  _fallbackMusic(theme, generation, entry = this._externalTrack) {
    if (generation !== this._playGeneration || this.currentTrack !== theme || this._externalTrack !== entry) return;
    this._stopMedia();
    this._startProcedural(theme);
  },

  _stopMedia() {
    this._mediaPlayRequest++;
    this._externalTrack = null;
    if (!this._media) return;
    this._media.onerror = null;
    this._media.onended = null;
    this._media.onplaying = null;
    this._media.pause();
    this._media.removeAttribute('src');
    this._media.load();
  },

  _tone(freq, dur, type, vol, bus, glideTo) {
    if (!this.ctx || this.ctx.state !== 'running' || vol <= 0) return;
    const t = this.ctx.currentTime;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g);
    g.connect(bus || this.sfxGain);
    o.onended = () => { o.disconnect(); g.disconnect(); };
    o.start(t);
    o.stop(t + dur + 0.02);
  },

  blip(freq = 440, dur = 0.08, type = 'square', vol = 0.4) {
    this._tone(freq, dur, type, vol, this.sfxGain);
  },

  sfx(name) {
    const S = {
      jump:       () => this._tone(360, 0.14, 'square', 0.28, this.sfxGain, 640),
      jump2:      () => { this._tone(520, 0.10, 'triangle', 0.26, this.sfxGain, 900); setTimeout(() => this._tone(760, 0.10, 'sine', 0.22, this.sfxGain, 1200), 40); },
      land:       () => this._tone(200, 0.06, 'square', 0.2),
      attack:     () => this._tone(420, 0.08, 'sawtooth', 0.25, this.sfxGain, 180),
      hit:        () => this._tone(150, 0.14, 'sawtooth', 0.35, this.sfxGain, 70),
      hurt:       () => this._tone(200, 0.28, 'triangle', 0.4, this.sfxGain, 90),
      pickup:     () => { this.blip(660, 0.07, 'square', 0.28); setTimeout(() => this.blip(990, 0.1, 'square', 0.26), 70); },
      interact:   () => this.blip(500, 0.06, 'square', 0.25),
      door:       () => this._tone(160, 0.24, 'square', 0.3, this.sfxGain, 90),
      checkpoint: () => { this.blip(523, 0.09); setTimeout(() => this.blip(784, 0.14), 90); setTimeout(() => this.blip(1046, 0.16), 180); },
      menu:       () => this.blip(600, 0.04, 'square', 0.2),
      confirm:    () => { this.blip(523, 0.07); setTimeout(() => this.blip(659, 0.07), 55); setTimeout(() => this.blip(880, 0.12), 110); },
      cancel:     () => this._tone(300, 0.1, 'square', 0.22, this.sfxGain, 160),
      death:      () => { this._tone(320, 0.2, 'sawtooth', 0.4, this.sfxGain, 120); setTimeout(() => this._tone(140, 0.5, 'sawtooth', 0.4, this.sfxGain, 60), 160); },
      light:      () => { this._tone(700, 0.12, 'sine', 0.3, this.sfxGain, 1400); setTimeout(() => this.blip(1760, 0.16, 'sine', 0.22), 90); },
      parryReady: () => this._tone(880, 0.05, 'sine', 0.18, this.sfxGain, 1200),
      parry:      () => { this._tone(1400, 0.05, 'square', 0.32); setTimeout(() => this._tone(2200, 0.09, 'sine', 0.3, this.sfxGain, 900), 35); setTimeout(() => this.blip(660, 0.12, 'sawtooth', 0.25), 60); },
      boss:       () => this._tone(80, 0.4, 'sawtooth', 0.5, this.sfxGain, 40),
      bossHit:    () => { this._tone(90, 0.18, 'square', 0.45, this.sfxGain, 200); },
      explode:    () => { this._tone(120, 0.3, 'sawtooth', 0.45, this.sfxGain, 40); },
      win:        () => { [523, 659, 784, 1046].forEach((f, i) => setTimeout(() => this.blip(f, 0.16, 'square', 0.3), i * 120)); },
    };
    (S[name] || (() => {}))();
  },

  playMusic(track, { restart = false } = {}) {
    if (this.currentTrack === track && !restart) return;
    this._playGeneration++;
    const generation = this._playGeneration;
    this.currentTrack = track;
    this._pausedTrack = null;
    this._stopLoop();
    this._stopMedia();
    if (!this.ctx) return;

    const entry = this._nextTrack(track);
    if (entry) {
      try {
        this._ensureMedia();
        const media = this._media;
        this._externalTrack = entry;
        this._musicMode = 'loading';
        media.loop = entry.loop === true || this._playlists[track].length === 1;
        media.src = entry.src;
        media.onerror = () => {
          if (media.error && this._isCurrentMedia(track, generation, entry, media)) this._fallbackMusic(track, generation, entry);
        };
        media.onplaying = () => {
          if (!media.paused && !media.ended && this._isCurrentMedia(track, generation, entry, media)) this._musicMode = 'external';
        };
        media.onended = () => {
          if (media.ended && this._isCurrentMedia(track, generation, entry, media)) this.playMusic(track, { restart: true });
        };
        this._mediaGain.gain.setValueAtTime(0, this.ctx.currentTime);
        this._mediaGain.gain.linearRampToValueAtTime(entry.gain, this.ctx.currentTime + 0.35);
        this._playMedia(track, generation);
        return;
      } catch { this._stopMedia(); }
    }
    this._startProcedural(track);
  },

  _startProcedural(track) {
    this._stopLoop();
    this._musicMode = 'procedural';
    const SCALES = {
      menu:     [262, 330, 392, 494, 587, 494, 392, 330],
      roofs:    [220, 277, 330, 415, 494, 415, 330, 277],
      forest:   [196, 233, 294, 349, 392, 349, 294, 233],
      sewers:   [147, 175, 220, 262, 294, 262, 220, 175],
      district: [165, 196, 247, 294, 330, 294, 247, 196],
      tower:    [131, 165, 196, 262, 294, 262, 196, 165],
      boss:     [110, 138, 165, 220, 165, 138, 110, 98],
      ending:   [262, 330, 392, 523, 659, 523, 392, 330],
    };
    const scale = SCALES[track] || SCALES.menu;
    const interval = track === 'boss' ? 210 : 300;
    let i = 0;
    const step = () => {
      if (!this.ctx || this.currentTrack !== track) return;
      if (this.ctx.state !== 'running') { this._musicTimer = setTimeout(step, 250); return; }
      const f = scale[i % scale.length];
      // melody
      this._tone(f, 0.42, 'triangle', 0.10, this.musicGain);
      // bass every 4th
      if (i % 4 === 0) this._tone(f / 2, 0.7, 'sine', 0.08, this.musicGain);
      i++;
      this._musicTimer = setTimeout(step, interval);
    };
    step();
  },

  _stopLoop() { if (this._musicTimer) { clearTimeout(this._musicTimer); this._musicTimer = null; } },
  stopMusic() {
    this._playGeneration++;
    this.currentTrack = null;
    this._pausedTrack = null;
    this._musicMode = 'stopped';
    this._stopLoop();
    this._stopMedia();
  },

  pauseMusic() {
    if (!this.currentTrack) return;
    this._pausedTrack = this.currentTrack;
    this.currentTrack = null;
    this._musicMode = 'paused';
    this._mediaPlayRequest++;
    this._stopLoop();
    if (this._media) this._media.pause();
  },
  resumeMusic() {
    this.resume();
    if (!this._pausedTrack) return;
    const track = this._pausedTrack;
    this._pausedTrack = null;
    if (this._externalTrack && this._media) {
      this.currentTrack = track;
      this._musicMode = 'loading';
      this._playMedia(track, this._playGeneration);
    } else this.playMusic(track);
  },
};
