/* ============================================================
   audio.js  -  Web Audio API, optional streamed soundtrack.
   Separate music / sfx buses. Missing music never interrupts SFX.
   ============================================================ */
export const MUSIC_MANIFEST_URL = new URL('../assets/audio/tracks.json', import.meta.url).href;
const MUSIC_THEMES = ['menu', 'roofs', 'forest', 'sewers', 'district', 'tower', 'boss', 'ending', 'ending-bad'];
const isEndingTheme = (theme) => theme === 'ending' || theme === 'ending-bad';
const ORDER_STORAGE_KEY = 'mapache_cinema_music_order_v1';
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
  _playlistOrders: new Map(),
  _playlistCursors: new Map(),
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
  _trackEndListeners: new Set(),
  _endedAttempt: -1,
  _cues: {},
  _cuePlayers: new Map(),
  _cueState: null,
  _deathCueIndex: 0,
  _musicReservations: new WeakSet(),

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
    const cue = this._cueState;
    if (cue?.media && !cue.paused && cue.media.paused) this._playCueMedia(cue);
    if (this._media && this.currentTrack && this._externalTrack && this._media.paused && this._musicMode !== 'ended') {
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
    for (const entry of entries.slice(0, 500)) {
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
    this._playlistOrders = new Map();
    let saved = {};
    try { saved = JSON.parse(window.localStorage?.getItem(ORDER_STORAGE_KEY) || '{}') || {}; } catch { /* Private browsing still has an in-memory sequence. */ }
    this._playlistCursors = new Map();
    for (const theme of MUSIC_THEMES) {
      const ids = this._playlists[theme];
      if (ids.length < 2) continue; // Fixed scene songs never advance the level sequence.
      const key = JSON.stringify([...ids].sort());
      if (this._playlistOrders.has(key)) continue;
      this._playlistOrders.set(key, [...ids]);
      const index = ids.indexOf(saved[key]);
      this._playlistCursors.set(key, index < 0 ? 0 : index);
    }
    this._cues = {};
    for (const name of ['death', 'respawn']) {
      const ids = manifest?.cues?.[name];
      this._cues[name] = Array.isArray(ids) ? [...new Set(ids.filter(id => this._tracks.has(id)))] : [];
    }
    this._deathCueIndex = 0;
    this._primeCues();
    this._failedTracks = new Set();
    this._attemptedTracks = new Set();
    if (!this._tracks.has(this._lastExternalTrack)) this._lastExternalTrack = null;
    if (this.currentTrack) {
      const retained = this._tracks.get(this._externalTrack?.id);
      if (retained && this._media && retained.sources.includes(this._activeSource)) {
        this._externalTrack = retained;
        this._bindMediaEvents(this.currentTrack, this._playGeneration);
      } else this.playMusic(this.currentTrack, { restart: true });
    }
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
    const duration = this._media?.duration;
    return { mode: this._musicMode, theme: this.currentTrack, id: this._externalTrack?.id || '', title: this._externalTrack?.title || '',
      position: this._media?.currentTime || 0,
      duration: Number.isFinite(duration) && duration > 0 ? duration : this._externalTrack?.durationSeconds || 0,
      src: this._activeSource || '', configuredTracks: this._tracks.size, unavailableTracks: this._failedTracks.size,
      cue: this._cueState?.name || '', cueId: this._cueState?.entry.id || '', cuePosition: this.getCueStatus().position };
  },

  /** The victory screen subscribes once and closes when its own song finishes. */
  subscribeTrackEnd(listener) {
    if (typeof listener !== 'function') return () => {};
    this._trackEndListeners.add(listener);
    return () => this._trackEndListeners.delete(listener);
  },

  _samePlaylist(first, second) {
    const a = this._playlists[first] || [];
    const b = this._playlists[second] || [];
    return a.length > 0 && a.length === b.length && a.every((id) => b.includes(id));
  },

  _nextTrack(theme, excluded = new Set()) {
    const playlist = this._playlists[theme] || [];
    if (!playlist.length) return null;
    if (playlist.length === 1) {
      const id = playlist[0];
      return this._failedTracks.has(id) || excluded.has(id) ? null : this._tracks.get(id);
    }
    // All level themes share one manifest-ordered cursor. Death and level
    // transitions consume exactly one selection; overlays and looping do not.
    const key = JSON.stringify([...playlist].sort());
    const order = this._playlistOrders.get(key) || playlist;
    let index = this._playlistCursors.get(key) || 0;
    for (let attempts = 0; attempts < order.length; attempts++) {
      const id = order[index];
      index = (index + 1) % order.length;
      this._playlistCursors.set(key, index);
      this._savePlaylistCursor(key, order[index]);
      if (this._failedTracks.has(id) || excluded.has(id)) continue;
      this._lastExternalTrack = id;
      return this._tracks.get(id);
    }
    return null;
  },

  _savePlaylistCursor(key, nextId) {
    try {
      const storage = window.localStorage;
      if (!storage) return;
      const saved = JSON.parse(storage.getItem(ORDER_STORAGE_KEY) || '{}') || {};
      saved[key] = nextId;
      storage.setItem(ORDER_STORAGE_KEY, JSON.stringify(saved));
    } catch { /* Storage restrictions never interrupt playback. */ }
  },

  _primeCues() {
    if (!this.ctx) return;
    const ids = new Set(Object.values(this._cues).flat());
    for (const [id, player] of this._cuePlayers) {
      if (!ids.has(id) || player.src !== this._tracks.get(id)?.src) this._cuePlayers.delete(id);
    }
    // Short recordings are decoded once. Replaying a fresh buffer source
    // avoids the inaccurate MP3 duration / seek behavior of television media.
    // Long replacements are lazy streams; they must never allocate huge PCM buffers.
    for (const id of ids) this._getCuePlayer(this._tracks.get(id));
  },

  _getCuePlayer(entry) {
    const existing = this._cuePlayers.get(entry.id);
    if (existing && !existing.failed) return existing;
    const streaming = entry.playback === 'stream' || entry.durationSeconds > 15;
    const player = { src: entry.src, mode: streaming ? 'stream' : 'buffer', buffer: null, failed: false, promise: null };
    this._cuePlayers.set(entry.id, player);
    if (streaming) { player.promise = Promise.resolve(null); return player; }
    const fetchAudio = fetch.bind(globalThis);
    player.promise = Promise.resolve().then(() => fetchAudio(entry.src, { cache: 'force-cache' }))
      .then(response => { if (!response.ok) throw new Error('Cue unavailable'); return response.arrayBuffer(); })
      .then(bytes => this.ctx.decodeAudioData(bytes))
      .then(buffer => { player.buffer = buffer; return buffer; })
      .catch(() => { player.failed = true; return null; });
    return player;
  },

  /** Death / respawn recordings use the effects volume, never the level queue. */
  playTransitionCue(name, { maxDuration } = {}) {
    this.cancelTransientCue();
    const ids = this._cues[name] || [];
    let id = ids[0];
    if (name === 'death' && ids.length) {
      id = ids[this._deathCueIndex % ids.length];
      this._deathCueIndex = (this._deathCueIndex + 1) % ids.length;
    }
    const entry = this._tracks.get(id);
    if (!entry || !this.ctx) return Promise.resolve({ name, id: id || '', status: 'unavailable' });
    const player = this._getCuePlayer(entry);
    return new Promise(resolve => {
      const cap = Number.isFinite(maxDuration) && maxDuration > 0 ? maxDuration : null;
      const state = { name, entry, player, resolve, paused: false, phase: 'loading', cap,
        remainingMs: cap ? cap * 1000 : 4000, timer: null, timerStartedAt: 0,
        source: null, gain: null, offset: 0, startedAt: 0, media: null, mediaNode: null, playRequest: 0 };
      this._cueState = state;
      this._scheduleCueTimer(state);
      if (player.mode === 'stream') this._startCueStream(state);
      else if (player.buffer) this._startCueBuffer(state);
      else player.promise.then(buffer => {
        if (this._cueState !== state || state.paused) return;
        if (buffer) this._startCueBuffer(state);
        else this._finishCue(state, 'unavailable');
      });
    });
  },

  _startCueStream(state) {
    if (this._cueState !== state || state.paused) return;
    try {
      if (!state.media) {
        const media = new window.Audio();
        media.preload = 'metadata'; media.crossOrigin = 'anonymous'; media.loop = false;
        state.media = media;
        state.mediaNode = this.ctx.createMediaElementSource(media);
        state.gain = this.ctx.createGain();
        state.mediaNode.connect(state.gain); state.gain.gain.value = state.entry.gain;
        state.gain.connect(this.sfxGain);
        media.onended = () => {
          if (this._cueState === state && !state.paused && media.ended) this._finishCue(state, 'ended');
        };
        media.onerror = () => {
          if (this._cueState === state && media.error) this._finishCue(state, 'unavailable');
        };
        media.onplaying = () => {
          if (this._cueState !== state || state.paused || media.paused) return;
          state.phase = 'playing';
          // The source may run for minutes. The watchdog follows its duration,
          // rather than cutting the user's new recording at an arbitrary 45 s.
          if (!state.cap) {
            const duration = Math.max(Number.isFinite(media.duration) ? media.duration : 0, state.entry.durationSeconds || 0);
            state.remainingMs = (Math.max(0, duration - media.currentTime) + 4) * 1000 || 10000;
          }
          this._scheduleCueTimer(state);
        };
        media.src = state.entry.src;
      }
      this._playCueMedia(state);
    } catch { this._finishCue(state, 'unavailable'); }
  },

  _playCueMedia(state) {
    if (this._cueState !== state || state.paused || !state.media) return;
    const request = ++state.playRequest;
    const failed = (error) => {
      if (this._cueState !== state || state.paused || request !== state.playRequest) return;
      if (error?.name === 'NotAllowedError' || error?.name === 'AbortError') return;
      this._finishCue(state, 'unavailable');
    };
    try { state.media.play()?.catch?.(failed); } catch (error) { failed(error); }
  },

  _startCueBuffer(state) {
    if (this._cueState !== state || state.paused || state.source) return;
    const buffer = state.player.buffer;
    if (!buffer) { if (state.player.failed) this._finishCue(state, 'unavailable'); return; }
    if (state.offset >= buffer.duration) { this._finishCue(state, 'ended'); return; }
    try {
      const source = this.ctx.createBufferSource();
      const gain = this.ctx.createGain();
      source.buffer = buffer;
      source.loop = false;
      source.connect(gain);
      gain.gain.value = state.entry.gain;
      gain.connect(this.sfxGain);
      state.source = source;
      state.gain = gain;
      state.startedAt = this.ctx.currentTime;
      state.phase = 'playing';
      source.onended = () => {
        if (this._cueState === state && state.source === source && !state.paused) this._finishCue(state, 'ended');
      };
      if (!state.cap) state.remainingMs = Math.min(45000, Math.max(500, (buffer.duration - state.offset) * 1000 + 1500));
      this._scheduleCueTimer(state);
      source.start(0, state.offset);
    } catch { this._finishCue(state, 'unavailable'); }
  },

  _scheduleCueTimer(state) {
    clearTimeout(state.timer);
    if (this._cueState !== state || state.paused) return;
    state.timerStartedAt = Date.now();
    state.timer = setTimeout(() => this._finishCue(state, 'timed-out'), state.remainingMs);
  },

  _stopCueSource(state) {
    if (state.media) { state.playRequest++; state.media.pause(); }
    if (state.source) {
      state.source.onended = null;
      try { state.source.stop(); } catch { /* A naturally finished node may already be stopped. */ }
      state.source.disconnect?.();
      state.source = null;
    }
    if (!state.media) {
      state.gain?.disconnect?.();
      state.gain = null;
    }
  },

  _finishCue(state, status) {
    if (this._cueState !== state) return;
    this._cueState = null;
    clearTimeout(state.timer);
    this._stopCueSource(state);
    if (state.media) {
      state.media.onended = null; state.media.onerror = null; state.media.onplaying = null;
      state.media.removeAttribute('src'); state.media.load();
      state.mediaNode?.disconnect?.(); state.gain?.disconnect?.();
      state.media = null; state.mediaNode = null; state.gain = null;
    }
    state.resolve({ name: state.name, id: state.entry.id, title: state.entry.title || '', status });
  },

  cancelTransientCue() {
    if (this._cueState) this._finishCue(this._cueState, 'cancelled');
  },

  pauseTransientCue() {
    const state = this._cueState;
    if (!state || state.paused) return;
    if (state.media) state.offset = state.media.currentTime || 0;
    if (state.source) state.offset = Math.min(state.player.buffer.duration, state.offset + Math.max(0, this.ctx.currentTime - state.startedAt));
    state.paused = true;
    state.remainingMs = Math.max(1, state.remainingMs - (Date.now() - state.timerStartedAt));
    clearTimeout(state.timer);
    this._stopCueSource(state);
  },

  resumeTransientCue() {
    const state = this._cueState;
    if (!state || !state.paused) return;
    state.paused = false;
    if (state.player.mode === 'stream') { this._scheduleCueTimer(state); this._startCueStream(state); }
    else if (state.player.buffer || state.player.failed) this._startCueBuffer(state);
    else this._scheduleCueTimer(state);
  },

  getCueStatus() {
    const state = this._cueState;
    if (!state) return { name: '', id: '', title: '', mode: 'stopped', position: 0, duration: 0 };
    const duration = state.player.buffer?.duration || state.entry.durationSeconds || (Number.isFinite(state.media?.duration) ? state.media.duration : 0);
    const position = state.media ? state.media.currentTime || 0 : state.offset + (state.source ? Math.max(0, this.ctx.currentTime - state.startedAt) : 0);
    return { name: state.name, id: state.entry.id, title: state.entry.title || '',
      mode: state.paused ? 'paused' : state.phase, position: Math.min(duration, position), duration };
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
    this.cancelTransientCue();
    const previous = this.currentTrack || this._pausedTrack;
    // Dialogue and overlays can request a theme again. Even an equivalent
    // level playlist keeps its song until an explicit death/level transition.
    if (!restart && previous && this._externalTrack && this._media && this._samePlaylist(previous, track)) {
      this.currentTrack = track;
      this._pausedTrack = null;
      this._bindMediaEvents(track, this._playGeneration);
      if (this._media.paused && this._musicMode !== 'ended') {
        this._musicMode = 'loading';
        this._playMedia(track, this._playGeneration);
      }
      return;
    }
    this._playGeneration++;
    const generation = this._playGeneration;
    this.currentTrack = track;
    this._pausedTrack = null;
    this._stopMedia();
    this._attemptedTracks = new Set();
    if (!this.ctx) { this._musicMode = 'unavailable'; return; }
    this._playNextAvailable(track, generation);
  },

  /** Consume the next song once while REAPARICION plays over resumed gameplay. */
  reserveMusic(theme) {
    if (!MUSIC_THEMES.includes(theme)) return null;
    const entry = this._nextTrack(theme);
    if (!entry) return null;
    const reservation = Object.freeze({ theme, id: entry.id, generation: this._playGeneration });
    this._musicReservations.add(reservation);
    return reservation;
  },

  playReservedMusic(reservation) {
    if (!reservation || !this._musicReservations.has(reservation)) return false;
    this._musicReservations.delete(reservation);
    if (reservation.generation !== this._playGeneration) return false;
    const entry = this._tracks.get(reservation.id);
    if (!entry || !this._playlists[reservation.theme]?.includes(entry.id)) return false;
    this.cancelTransientCue();
    const generation = ++this._playGeneration;
    this.currentTrack = reservation.theme;
    this._pausedTrack = null;
    this._stopMedia();
    this._attemptedTracks = new Set([entry.id]);
    if (!this.ctx) { this._musicMode = 'unavailable'; return true; }
    this._startMediaSource(reservation.theme, generation, entry, 0);
    return true;
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
      this._externalTrack = entry;
      this._activeSource = source;
      this._sourceIndex = sourceIndex;
      this._musicMode = 'loading';
      // Level songs repeat until death or passing a level. Only the victory
      // credits have a natural end; their caller returns to the main menu.
      media.loop = !isEndingTheme(theme);
      media.src = source;
      this._endedAttempt = -1;
      this._bindMediaEvents(theme, generation);
      this._mediaGain.gain.setValueAtTime(0, this.ctx.currentTime);
      this._mediaGain.gain.linearRampToValueAtTime(entry.gain, this.ctx.currentTime + 0.35);
      this._playMedia(theme, generation);
    } catch {
      this._failedTracks.add(entry.id);
      this._playNextAvailable(theme, generation);
    }
  },

  _bindMediaEvents(theme, generation) {
    const media = this._media;
    const entry = this._externalTrack;
    const source = this._activeSource;
    const attempt = this._mediaAttempt;
    media.onerror = () => {
      if (media.error && this._isCurrentMedia(theme, generation, entry, media, source, attempt)) {
        this._tryNextSource(theme, generation, entry, media, source, attempt);
      }
    };
    media.onplaying = () => {
      if (!media.paused && !media.ended && this._isCurrentMedia(theme, generation, entry, media, source, attempt)) this._musicMode = 'external';
    };
    media.onended = () => {
      if (!media.ended || !this._isCurrentMedia(theme, generation, entry, media, source, attempt)) return;
      if (!isEndingTheme(theme)) {
        // Some television browsers emit ended even with loop enabled.
        // Restart this same source rather than advancing the ordered queue.
        media.currentTime = 0;
        this._playMedia(theme, generation);
        return;
      }
      if (this._endedAttempt === attempt) return;
      this._endedAttempt = attempt;
      this._musicMode = 'ended';
      const event = { theme, id: entry.id, title: entry.title || '' };
      for (const listener of [...this._trackEndListeners]) listener(event);
    };
  },

  // Used after reconnecting or replacing files; there is no automatic retry loop.
  retryUnavailableMusic() {
    this._failedTracks.clear();
    if (this.currentTrack && this._musicMode === 'unavailable') this.playMusic(this.currentTrack, { restart: true });
  },

  stopMusic() {
    this.cancelTransientCue();
    this._playGeneration++;
    this.currentTrack = null;
    this._pausedTrack = null;
    this._musicMode = 'stopped';
    this._stopMedia();
  },

  pauseMusic() {
    this.pauseTransientCue();
    if (!this.currentTrack) return;
    this._pausedTrack = this.currentTrack;
    this.currentTrack = null;
    this._musicMode = 'paused';
    this._mediaPlayRequest++;
    if (this._media) this._media.pause();
  },
  resumeMusic() {
    this.resumeTransientCue();
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
