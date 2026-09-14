/* ============================================================
   save.js  -  localStorage persistence
   - SAVE_KEY : the current run (level, checkpoint, items, ...)
   - OPT_KEY  : options (volume, scale, key bindings)
   - META_KEY : permanent meta (per-difficulty level completion,
                endings seen) -- NOT wiped by "Nueva partida"
   ============================================================ */
const SAVE_KEY  = 'mapache_cinema_save_v1';
const OPT_KEY   = 'mapache_cinema_opts_v1';
const META_KEY  = 'mapache_cinema_meta_v1';
const SCORE_KEY = 'mapache_cinema_scores_v1';

const DIFF_KEYS = ['easy', 'normal', 'hard', 'nightmare'];
const emptyProgress = () => {
  const p = {};
  for (const k of DIFF_KEYS) p[k] = [0, 0, 0, 0, 0];
  return p;
};

export const Save = {
  data: null,

  load() {
    try { this.data = JSON.parse(localStorage.getItem(SAVE_KEY)) || null; }
    catch (e) { this.data = null; }
    if (this.data && !this.data.difficulty) this.data.difficulty = 'normal';
    return this.data;
  },

  hasSave() {
    if (this.data === null) this.load();
    return !!this.data;
  },

  newGame(difficulty = 'normal', startLevel = 0, nick = '') {
    this.data = {
      level: startLevel,
      checkpoint: null,
      items: {},
      collected: [],        // pickup ids already taken this level (no re-farming on death)
      levelProgress: {},    // one-time puzzle state (doors opened, lanterns lit, enemies
                             // killed...) that must survive a death -- see game.js markProgress()
      hp: 3,
      maxHp: 3,
      memories: 0,
      flags: {},
      ending: null,
      completed: false,
      playtime: 0,
      created: Date.now(),
      difficulty,
      nick: nick || this.loadOpts().nick || 'RIKO',
    };
    this.persist();
    return this.data;
  },

  persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); } catch (e) {}
  },

  update(patch) {
    if (!this.data) this.newGame();
    Object.assign(this.data, patch);
    this.persist();
  },

  setFlag(name, val = true) {
    if (!this.data) this.newGame();
    this.data.flags[name] = val;
    this.persist();
  },

  clear() {
    try { localStorage.removeItem(SAVE_KEY); } catch (e) {}
    this.data = null;
  },

  /* ---- permanent meta (level completion per difficulty) ---- */
  loadMeta() {
    let m;
    try { m = JSON.parse(localStorage.getItem(META_KEY)) || {}; } catch (e) { m = {}; }
    if (!m.progress) m.progress = emptyProgress();
    for (const k of DIFF_KEYS) if (!m.progress[k]) m.progress[k] = [0, 0, 0, 0, 0];
    return m;
  },
  saveMeta(m) { try { localStorage.setItem(META_KEY, JSON.stringify(m)); } catch (e) {} },

  markLevelBeaten(diff, idx) {
    const m = this.loadMeta();
    m.progress[diff][idx] = 1;
    this.saveMeta(m);
  },
  levelBeaten(diff, idx) {
    return !!this.loadMeta().progress[diff][idx];
  },
  /** a level is unlocked if the previous one (same difficulty) is beaten */
  levelUnlocked(diff, idx) {
    if (idx <= 0) return true;
    return !!this.loadMeta().progress[diff][idx - 1];
  },
  clearMeta() { try { localStorage.removeItem(META_KEY); } catch (e) {} },

  /* ---- leaderboard (best times) ---- */
  loadScores() {
    try { return (JSON.parse(localStorage.getItem(SCORE_KEY)) || []).slice(); }
    catch (e) { return []; }
  },
  addScore(entry) {
    const list = this.loadScores();
    list.push({
      nick: (entry.nick || 'RIKO').toString().slice(0, 12),
      time: Math.max(0, Math.round(entry.time || 0)),
      diff: entry.diff || 'normal',
      ending: entry.ending || '-',
      date: Date.now(),
    });
    list.sort((a, b) => a.time - b.time);
    const top = list.slice(0, 25);
    try { localStorage.setItem(SCORE_KEY, JSON.stringify(top)); } catch (e) {}
    return top;
  },
  clearScores() { try { localStorage.removeItem(SCORE_KEY); } catch (e) {} },

  /* ---- options ---- */
  loadOpts() {
    const def = { music: 60, sfx: 70, scale: 'auto', bindings: null, bright: false, nick: '' };
    try { return Object.assign(def, JSON.parse(localStorage.getItem(OPT_KEY)) || {}); }
    catch (e) { return def; }
  },
  saveOpts(o) {
    try { localStorage.setItem(OPT_KEY, JSON.stringify(o)); } catch (e) {}
  },
};
