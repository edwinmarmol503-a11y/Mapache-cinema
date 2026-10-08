/* ============================================================
   audio.js  -  Web Audio API, optional streamed soundtrack.
   Separate music / sfx buses. Missing music never interrupts SFX.
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
  _failedTracks: new Set(),
  _attemptedTracks: new Set(),
  _manifestPromise: null,
  _media: null,
  _mediaSource: null,
  _mediaGain: null,
  _externalTrack: null,
  _musicMode: 'stopped',
  _playGeneration: 0,
  _mediaPlayRequest: 0,
  _mediaAttempt: 0,
  _activeSource: null,
  _sourceIndex: 0,

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
      // Soundtrack files stream through one element. Missing files stay silent.
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
      const sources = [];
      for (const source of [entry.src, ...(Array.isArray(entry.alternateSrcs) ? entry.alternateSrcs : [])]) {
        if (typeof source !== 'string' || !source.trim()) continue;
        try {
          const url = new URL(source, MUSIC_MANIFEST_URL);
          if (['http:', 'https:'].includes(url.protocol) && !sources.includes(url.href)) sources.push(url.href);
        } catch { /* Invalid alternate URLs cannot prevent valid music loading. */ }
      }
      if (!sources.length) continue;
      this._tracks.set(entry.id, { ...entry, src: sources[0], sources, gain: volume(entry.gain, 0.7) });
    }
    this._playlists = {};
    for (const theme of MUSIC_THEMES) {
      const ids = manifest?.playlists?.[theme];
      this._playlists[theme] = Array.isArray(ids) ? [...new Set(ids.filter((id) => this._tracks.has(id)))] : [];
    }
    this._shuffleBags = new Map();
    this._failedTracks = new Set();
    this._attemptedTracks = new Set();
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
    return { mode: this._musicMode, theme: this.currentTrack, title: this._externalTrack?.title || '',
      src: this._activeSource || '', configuredTracks: this._tracks.size, unavailableTracks: this._failedTracks.size };
  },

  _nextTrack(theme, excluded = new Set()) {
    const playlist = this._playlists[theme] || [];
    const ids = playlist.filter((id) => !this._failedTracks.has(id) && !excluded.has(id));
    if (!ids.length) return null;
    // Themes using the same collection share a bag, so changing levels cannot
    // keep choosing the first song or discard tracks that have not played yet.
    const key = JSON.stringify([...playlist].sort());
    let bag = (this._shuffleBags.get(key) || []).filter((id) => ids.includes(id));
    if (!bag?.length) {
      bag = [...ids];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
    }
    this._shuffleBags.set(key, bag);
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
    const source = this._activeSource;
    const attempt = this._mediaAttempt;
    const request = ++this._mediaPlayRequest;
    let result;
    try { result = media.play(); }
    catch (error) {
      if (error?.name !== 'NotAllowedError' && error?.name !== 'AbortError') this._tryNextSource(theme, generation, entry, media, source, attempt);
      return;
    }
    if (result?.catch) result.catch((error) => {
      if (request !== this._mediaPlayRequest || !this._isCurrentMedia(theme, generation, entry, media, source, attempt, false)) return;
      // Autoplay waits for a gesture. Missing files try that song's other URLs.
      if (error?.name !== 'NotAllowedError' && error?.name !== 'AbortError') this._tryNextSource(theme, generation, entry, media, source, attempt);
    });
  },

  _isCurrentMedia(theme, generation, entry, media, source, attempt, checkCurrentSrc = true) {
    return generation === this._playGeneration && this.currentTrack === theme &&
      this._externalTrack === entry && this._media === media &&
      attempt === this._mediaAttempt && source === this._activeSource && media.src === source &&
      (!checkCurrentSrc || !media.currentSrc || media.currentSrc === source);
  },

  _tryNextSource(theme, generation, entry, media, source, attempt) {
    if (!this._isCurrentMedia(theme, generation, entry, media, source, attempt, false)) return;
    const nextIndex = this._sourceIndex + 1;
    if (nextIndex < entry.sources.length) {
      this._startMediaSource(theme, generation, entry, nextIndex);
    } else {
      this._failedTracks.add(entry.id);
      this._playNextAvailable(theme, generation);
    }
  },

  _stopMedia() {
    this._mediaPlayRequest++;
    this._mediaAttempt++;
    this._externalTrack = null;
    this._activeSource = null;
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
    this._stopMedia();
    this._attemptedTracks = new Set();
    if (!this.ctx) { this._musicMode = 'unavailable'; return; }
    this._playNextAvailable(track, generation);
  },

  _playNextAvailable(theme, generation) {
    if (generation !== this._playGeneration || this.currentTrack !== theme) return;
    const entry = this._nextTrack(theme, this._attemptedTracks);
    if (!entry) {
      this._stopMedia();
      this._musicMode = 'unavailable';
      return;
    }
    // Each song gets one bounded attempt per selection, including its URLs.
    this._attemptedTracks.add(entry.id);
    this._startMediaSource(theme, generation, entry, 0);
  },

  _startMediaSource(theme, generation, entry, sourceIndex) {
    if (generation !== this._playGeneration || this.currentTrack !== theme) return;
    this._stopMedia();
    try {
      this._ensureMedia();
      const media = this._media;
      const source = entry.sources[sourceIndex];
      const attempt = this._mediaAttempt;
      this._externalTrack = entry;
      this._activeSource = source;
      this._sourceIndex = sourceIndex;
      this._musicMode = 'loading';
      media.loop = entry.loop === true || this._playlists[theme].filter((id) => !this._failedTracks.has(id)).length === 1;
      media.src = source;
      media.onerror = () => {
        if (media.error && this._isCurrentMedia(theme, generation, entry, media, source, attempt)) {
          this._tryNextSource(theme, generation, entry, media, source, attempt);
        }
      };
      media.onplaying = () => {
        if (!media.paused && !media.ended && this._isCurrentMedia(theme, generation, entry, media, source, attempt)) this._musicMode = 'external';
      };
      media.onended = () => {
        if (media.ended && this._isCurrentMedia(theme, generation, entry, media, source, attempt)) this.playMusic(theme, { restart: true });
      };
      this._mediaGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this._mediaGain.gain.linearRampToValueAtTime(entry.gain, this.ctx.currentTime + 0.35);
      this._playMedia(theme, generation);
    } catch {
      this._failedTracks.add(entry.id);
      this._playNextAvailable(theme, generation);
    }
  },

  // Used after reconnecting or replacing files; there is no automatic retry loop.
  retryUnavailableMusic() {
    this._failedTracks.clear();
    if (this.currentTrack && this._musicMode === 'unavailable') this.playMusic(this.currentTrack, { restart: true });
  },

  stopMusic() {
    this._playGeneration++;
    this.currentTrack = null;
    this._pausedTrack = null;
    this._musicMode = 'stopped';
    this._stopMedia();
  },

  pauseMusic() {
    if (!this.currentTrack) return;
    this._pausedTrack = this.currentTrack;
    this.currentTrack = null;
    this._musicMode = 'paused';
    this._mediaPlayRequest++;
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
