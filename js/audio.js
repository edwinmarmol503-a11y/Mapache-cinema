/* ============================================================
   audio.js  -  Web Audio API. Fully procedural (no asset files
   required). Separate music / sfx buses with saved volumes.
   ============================================================ */
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

  init(opts) {
    if (opts) {
      if (typeof opts.music === 'number') this.opts.music = opts.music;
      if (typeof opts.sfx === 'number') this.opts.sfx = opts.sfx;
    }
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
    } catch (e) {
      console.warn('[audio] Web Audio unavailable', e);
    }
  },

  resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },

  applyVolumes() {
    if (!this.ctx) return;
    this.musicGain.gain.value = this._muted ? 0 : this.opts.music;
    this.sfxGain.gain.value = this._muted ? 0 : this.opts.sfx;
  },
  setMusicVol(v) { this.opts.music = v; this.applyVolumes(); },
  setSfxVol(v)   { this.opts.sfx = v; this.applyVolumes(); },

  _tone(freq, dur, type, vol, bus, glideTo) {
    if (!this.ctx) return;
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

  playMusic(track) {
    if (this.currentTrack === track) return;
    this.currentTrack = track;
    this._stopLoop();
    if (!this.ctx) return;

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
  stopMusic() { this.currentTrack = null; this._stopLoop(); },

  pauseMusic() { this._pausedTrack = this.currentTrack; this.stopMusic(); },
  resumeMusic() {
    this.resume();
    if (this._pausedTrack) { const t = this._pausedTrack; this._pausedTrack = null; this.playMusic(t); }
  },
};
