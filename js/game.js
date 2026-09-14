/* ============================================================
   game.js  -  the World / gameplay hub. Owns the level, the
   player, enemies, boss, puzzles, particles, camera, lighting,
   dialogue, transitions, checkpoints and endings.
   ============================================================ */
import { Input } from './input.js';
import { Camera } from './camera.js';
import { Particles } from './particles.js';
import { Player } from './player.js';
import { Inventory } from './inventory.js';
import { Pickup } from './items.js';
import { makeEnemy } from './enemies.js';
import { makePuzzle, Crate, LightNode, Door, Rope, Sequence, Magnet, Lever } from './puzzles.js';
import { Farolero } from './boss.js';
import { LEVELS, TS, buildTileMap } from './levels.js';
import { getDiff, NIGHTMARE_MERCY_DEATHS, nightmareMercyDiff } from './difficulty.js';
import { resolveSolids } from './physics.js';
import { rectsOverlap } from './collision.js';
import { drawHUD, drawBackground, currentLightning, outText } from './ui.js';
import { drawLantern, drawTrashcan } from './sprites.js';
import { clamp, choice } from './utils.js';

const STEP_FADE = 0.4;

/* per-theme tile palette (foreground terrain) */
const TILE_PAL = {
  roofs:    { body: '#243a5c', body2: '#1c2e48', line: 'rgba(10,16,30,0.55)', top: '#37527e', topHi: '#4f6f9e', plat: '#5a6b8c', platHi: '#7c90b4', spike: '#c94b4b', spikeHi: '#ff9c9c' },
  forest:   { body: '#1a3140', body2: '#122735', line: 'rgba(70,110,90,0.35)', top: '#2f5a4a', topHi: '#3f7a5f', plat: '#3f5a4a', platHi: '#5f8a6f', spike: '#8fae5a', spikeHi: '#d8f0a0' },
  sewers:   { body: '#243634', body2: '#1a2a28', line: 'rgba(90,130,125,0.30)', top: '#356b62', topHi: '#4f8f84', plat: '#37524f', platHi: '#5f8f88', spike: '#c9a04b', spikeHi: '#ffe0a0' },
  district: { body: '#2b2733', body2: '#211d29', line: 'rgba(90,80,100,0.35)', top: '#3a3446', topHi: '#524a63', plat: '#4a4252', platHi: '#6c6076', spike: '#c95a5a', spikeHi: '#ff9c9c' },
  tower:    { body: '#241f3c', body2: '#1a162e', line: 'rgba(120,90,200,0.22)', top: '#372f57', topHi: '#4f4577', plat: '#443a63', platHi: '#6a5f93', spike: '#b06adc', spikeHi: '#e8c0ff' },
};

/* playful floating call-outs ("en el cielo") -- purely cosmetic, no gameplay effect */
const KILL_PHRASES = [
  '¡BUEN TRABAJO!', '¡BIEN HECHO!', 'SUGAR CRUSH!!', '¡ASÍ SE HACE!', '¡COMBO!',
  'GG', '¡TASTY!', '¡PERFECTO!', '¡ESO ES, RIKO!', '¡BOOM!',
];
const LANTERN_PHRASES = [
  '¡MÁS LUZ!', '¡ASÍ SE ILUMINA!', '¡BRILLANTE!', '¡BUEN OJO!', 'let there be light!',
];
const DEATH_PHRASES = [
  'jijiji ¿NO PUDISTE?', '¡JAJAJA GAME OVER!', 'F', 'uy... eso dolió (a ti, no a mí)',
  '¿en serio? JAJAJA', 'Riko: 0 — Farolero: 1', 'otra vez será, quizás...',
];
const CLEAR_PHRASES = [
  '¡LO LOGRASTE!', '¡ZONA DESPEJADA!', '¡ERES UNA LEYENDA!', '¡IMPECABLE!', 'FLAWLESS!',
];

export class Game {
  constructor(ctx, canvas, hooks) {
    this.ctx = ctx;
    this.canvas = canvas;
    this.W = canvas.width;
    this.H = canvas.height;
    this.hooks = hooks || {};
    this.audio = hooks.audio;
    this.save = hooks.save;

    this.camera = new Camera(this.W, this.H);
    this.particles = new Particles(900);
    this.inventory = new Inventory();
    this.dialogue = hooks.dialogue;

    this.toastLayer = document.getElementById('toast-layer');

    this.state = 'idle';
    this.levelIndex = 0;
    this.fadeAlpha = 0;
    this.transition = null;
    this.brightMode = !!(this.save.loadOpts && this.save.loadOpts().bright);
    this.weather = 'clear';

    this.reset();
  }

  setBright(v) { this.brightMode = !!v; }

  reset() {
    this.map = null;
    this.player = null;
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.puzzleEls = [];
    this.triggers = [];
    this.checkpointRects = [];
    this.lights = [];
    this.signals = {};
    this.boss = null;
    this.bossActive = false;
    this.bossArena = null;
    this._farolWas = {};
    this.interactTarget = null;
    this.exitRect = null;
    this.introT = 0;
    this.dyingT = 0;
    this.postT = 0;
    this.hitstopT = 0;
    this._swingId = -1;
    this._swingHits = new Set();
    this._swingHitBoss = false;
    this.enemiesTotal = 0;
    this.enemiesKilled = 0;
    this.lanternsTotal = 0;
    this._exitToastT = 0;
    this._cpText = null;
    this.skyMsgs = [];
  }

  /** a short, playful line that floats up near the top of the screen */
  skyMessage(text, color) {
    if (!this.skyMsgs) this.skyMsgs = [];
    this.skyMsgs.push({ text, color: color || '#ffe07a', t: 1.5, life: 1.5 });
    if (this.skyMsgs.length > 3) this.skyMsgs.shift();
  }
  announceKill()    { this.skyMessage(choice(KILL_PHRASES), '#f4c542'); }
  announceLantern() { this.skyMessage(choice(LANTERN_PHRASES), '#8fe0ff'); }
  announceDeath()   { this.skyMessage(choice(DEATH_PHRASES), '#ff6a6a'); }
  announceClear()   { this.skyMessage(choice(CLEAR_PHRASES), '#6fbf73'); }

  /* level is "cleared" -> the exit gate opens */
  get cleared() {
    return this.enemiesKilled >= this.enemiesTotal && this.lanternsLit >= this.lanternsTotal;
  }
  get lanternsLit() {
    let n = 0;
    for (const el of this.puzzleEls) if (el instanceof LightNode && el.lit) n++;
    return n;
  }
  get enemiesLeft() { return Math.max(0, this.enemiesTotal - this.enemiesKilled); }

  /** remember a pickup as taken so a death can't respawn it (no farming) */
  markCollected(id) {
    if (!this.save.data) return;
    if (!this.save.data.collected) this.save.data.collected = [];
    if (!this.save.data.collected.includes(id)) {
      this.save.data.collected.push(id);
      this.save.persist();
    }
  }

  /* ---------------- one-time level progress (survives a death) ----------------
     Doors opened with a key, lanterns lit, ropes built, magnets fired, sequences
     solved, levers thrown, enemies killed -- ANY of these consumes a limited
     item or is otherwise a one-way action. Without remembering them across a
     respawn, reloading the level put them all back to locked/unlit/alive while
     the item that unlocked them stayed spent -> a permanent softlock. */
  _prog() {
    if (!this.save.data.levelProgress) this.save.data.levelProgress = {};
    return this.save.data.levelProgress;
  }
  progress(id) { return this._prog()[id]; }
  markProgress(id, value = true) {
    if (!id) return;
    this._prog()[id] = value;
    this.save.persist();
  }

  /** brief freeze-frame (parry / heavy hit). Rendering keeps going. */
  hitstop(t) { this.hitstopT = Math.max(this.hitstopT, t); }

  /* ---------------- level loading ---------------- */
  startNewGame(nick) {
    this.save.newGame('normal', 0, nick);
    this.inventory.load({});
    this.levelIndex = 0;
    this._enter(0, false, true);
  }

  continueGame() {
    const s = this.save.load() || this.save.newGame();
    this.inventory.load(s.items || {});
    this.levelIndex = clamp(s.level || 0, 0, LEVELS.length - 1);
    this._enter(this.levelIndex, true, true);
  }

  /** start a specific level at a chosen difficulty (from the level-select menu) */
  startAt(diffKey, index) {
    this.save.newGame(diffKey, index);
    this.inventory.load({});
    this.levelIndex = index;
    this._enter(index, false, true);
  }

  _enter(index, useCheckpoint, withTitle) {
    this.loadLevel(index, useCheckpoint);
    this.state = withTitle ? 'intro' : 'playing';
    this.introT = withTitle ? 2.0 : 0;
    this.fadeAlpha = 0;
  }

  loadLevel(index, useCheckpoint) {
    this.reset();
    this.levelIndex = index;
    const L = LEVELS[index];
    this.levelDef = L;
    this.map = buildTileMap(L);
    this.camera.setBounds(this.map.pixelW, this.map.pixelH);

    // difficulty for this run -- Pesadilla gets a small mercy nerf after
    // NIGHTMARE_MERCY_DEATHS real deaths on this save (still instant-kill on
    // touch, still melee-off, just a bit less relentless)
    let D = getDiff((this.save.data && this.save.data.difficulty) || 'normal');
    if (D.key === 'nightmare' && this.save.nightmareDeaths && this.save.nightmareDeaths() >= NIGHTMARE_MERCY_DEATHS) {
      D = nightmareMercyDiff(D);
    }
    this.diff = D;
    this.meleeDisabled = !!D.meleeOff;
    this.brightMode = !!(this.save.loadOpts && this.save.loadOpts().bright);

    // random weather for this visit (besides the periodic lightning)
    const wpool = L.key === 'sewers' ? ['clear', 'clear', 'rain']
      : L.key === 'tower' ? ['clear', 'clear', 'snow', 'rain']
        : L.key === 'district' ? ['rain', 'rain', 'clear', 'leaves']
          : ['clear', 'clear', 'rain', 'snow', 'leaves'];
    this.weather = choice(wpool);

    // spawn
    let sx, sy;
    const s = this.save.data;
    if (useCheckpoint && s && s.checkpoint && s.level === index) {
      sx = s.checkpoint.x; sy = s.checkpoint.y;
    } else {
      sx = L.spawn.tx * TS; sy = L.spawn.ty * TS - 2;
    }
    this.player = new Player(sx, sy);
    this.player.maxHp = D.playerHp;
    this.player.hp = this.player.maxHp;   // forgiving respawn
    this.player.unlimitedParry = !!D.meleeOff;   // Pesadilla: parry is your only offense

    // lights  (level lanterns get a sprite; dynamic ones from lit nodes do not)
    for (const l of L.lights || []) {
      this.lights.push({ x: (l.tx + 0.5) * TS, y: (l.ty + 0.5) * TS, r: l.r || 40, c: l.c || '#ffcf8a', spr: true });
    }
    // no re-farming / no re-locking: progress made this level survives a death.
    // Both reset only when a fresh level actually begins (not on respawn).
    if (!useCheckpoint) { this.save.data.collected = []; this.save.data.levelProgress = {}; }
    const collected = new Set(this.save.data.collected || []);
    const prog = this._prog();

    // enemies (scaled + filtered by difficulty). Ones already recorded dead
    // from a previous life this level are simply not respawned.
    let elist = (L.enemies || []).slice();
    if (D.halfEnemies) elist = elist.filter((_, i) => i % 2 === 0);
    if (D.extraEnemies) {
      const extra = elist.slice(0, D.extraEnemies).map((e) => ({ ...e, tx: e.tx + 4 }));
      elist = elist.concat(extra);
    }
    let alreadyDead = 0;
    elist.forEach((e, idx) => {
      const pid = 'enemy:' + idx;
      if (prog[pid]) { alreadyDead++; return; }
      const inst = makeEnemy(e, TS, D);
      if (inst) { inst._placed = true; inst._progId = pid; this.enemies.push(inst); }
    });
    this.enemiesTotal = elist.length;
    this.enemiesKilled = alreadyDead;

    // pickups. bombillas are NEVER added/removed by difficulty (they must exactly
    // match the level's light nodes -- see levels.js -- or the level can't be cleared).
    const items = (L.items || []).slice();
    for (let i = 0; i < D.extraItems; i++) items.push({ type: 'lata', tx: L.spawn.tx + 5 + i * 6, ty: L.spawn.ty });
    for (let i = 0, guard = 0; i < -D.extraItems && guard < items.length; guard++) {
      const idx = items.findIndex((it) => it.type === 'lata');
      if (idx < 0) break;
      items.splice(idx, 1); i++;
    }
    for (const it of items) {
      const id = it.type + '@' + it.tx + ',' + it.ty;
      if (collected.has(id)) continue;
      this.pickups.push(new Pickup(it.type, it.tx * TS + 3, it.ty * TS + 3, id));
    }
    for (const m of L.memories || []) {
      const id = 'mem@' + m.tx + ',' + m.ty;
      if (collected.has(id)) continue;
      this.pickups.push(new Pickup('memory', m.tx * TS + 3, m.ty * TS + 3, id));
    }
    // puzzles -- restore any one-time state a previous life already resolved
    for (const p of L.puzzles || []) {
      const inst = makePuzzle(p, TS);
      if (!inst) continue;
      if (inst.id) {
        if (inst instanceof LightNode && prog['lit:' + inst.id]) { inst.lit = true; inst.said = true; }
        else if (inst instanceof Door && prog['open:' + inst.id]) { inst.open = true; inst.locked = false; inst.anim = 1; }
        else if (inst instanceof Rope && prog['rope:' + inst.id]) { inst.done = true; inst._build(); }
        else if (inst instanceof Sequence && prog['seq:' + inst.id]) { inst.solved = true; inst.progress = inst.order.length; }
        else if (inst instanceof Magnet && prog['magnet:' + inst.id]) { inst.used = true; }
        else if (inst instanceof Lever && prog['lever:' + inst.id] !== undefined) { inst.on = !!prog['lever:' + inst.id]; }
      }
      this.puzzleEls.push(inst);
    }
    // a magnet already fired means its crate must reappear already snapped in place
    for (const el of this.puzzleEls) {
      if (el instanceof Magnet && el.used) {
        const c = this.puzzleEls.find((k) => k instanceof Crate && k.tag === el.crateTag);
        if (c) { c.x = el.snapTx * TS; c.y = el.snapTy * TS; c.vx = 0; c.vy = 0; }
      }
    }
    this.lanternsTotal = this.puzzleEls.filter((e) => e instanceof LightNode).length;
    // triggers
    for (const t of L.triggers || []) {
      this.triggers.push({
        rect: { x: t.tx * TS, y: t.ty * TS, w: t.w * TS, h: t.h * TS },
        dialogue: t.dialogue, event: t.event, fired: false,
      });
    }
    // checkpoints
    for (const c of L.checkpoints || []) {
      this.checkpointRects.push({ x: c.tx * TS, y: c.ty * TS - 6, w: TS, h: TS + 6, active: false });
    }
    // exit  (generous trigger zone so you can't slip past it)
    if (L.exit) this.exitRect = { x: L.exit.tx * TS - 2, y: (L.exit.ty - 3) * TS, w: TS + 4, h: TS * 6 };

    this.camera.snapTo(this.player);
    if (this.audio) this.audio.playMusic(L.music || 'roofs');
  }

  /* ---------------- helpers used by sub-systems ---------------- */
  get crates() { return this.puzzleEls.filter((e) => e instanceof Crate); }

  addProjectile(p) { this.projectiles.push(p); }

  addLight(x, y, r, c, soft) { this.lights.push({ x, y, r, c: c || '#ffcf8a', soft: !!soft }); }

  evalReq(req) {
    return (req || []).every((t) => (t[0] === '!' ? !this.signals[t.slice(1)] : !!this.signals[t]));
  }

  toast(msg) {
    if (!this.toastLayer) return;
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = msg;
    this.toastLayer.appendChild(d);
    setTimeout(() => d.remove(), 2600);
  }

  startDialogue(lines, onDone) {
    this.dialogue.start(lines, onDone);
  }

  doPlayerAttack(swingId) {
    // one swing = one hit per target, but the hitbox is checked every frame it is live
    if (swingId !== this._swingId) {
      this._swingId = swingId;
      this._swingHits = new Set();
      this._swingHitBoss = false;
      this.camera.shake(1.2, 0.08);
    }
    const box = this.player.attackBox();
    const canDmg = !this.meleeDisabled;   // Pesadilla: J does no damage
    for (const e of this.enemies) {
      if (e.dead || this._swingHits.has(e)) continue;
      if (rectsOverlap(box.x, box.y, box.w, box.h, e.x, e.y, e.w, e.h)) {
        this._swingHits.add(e);
        if (canDmg) {
          e.hurt(1, this.player.cx, this);
          this.hitstop(0.05);
          this.camera.shake(2.5, 0.14);
        } else {
          this.particles.burst(e.x + e.w / 2, e.y + e.h / 2, 4, { color: '#8fb8ff', speed: 40, life: 0.2 });
        }
      }
    }
    if (this.boss && !this.boss.dead && !this._swingHitBoss &&
        rectsOverlap(box.x, box.y, box.w, box.h, this.boss.x, this.boss.y, this.boss.w, this.boss.h)) {
      this._swingHitBoss = true;
      // the FINAL BOSS is always meleeable -- even in Pesadilla
      this.boss.hurt(1, this.player.cx, this);
      this.hitstop(0.06);
    }
    for (const pr of this.projectiles) {
      if (pr.friendly || this._swingHits.has(pr)) continue;
      if (rectsOverlap(box.x, box.y, box.w, box.h, pr.x, pr.y, pr.w, pr.h)) {
        pr.dead = true;
        this._swingHits.add(pr);
        this.particles.burst(pr.x, pr.y, 6, { color: '#eaf3ff', speed: 50, life: 0.2 });
      }
    }
  }

  onEnemyKilled(e) {
    this.particles.burst(e.x + e.w / 2, e.y + e.h / 2, 6, { color: '#fff', speed: 40, life: 0.3 });
    if (e._placed && !e._counted) {
      e._counted = true;
      this.enemiesKilled++;
      this.announceKill();
      if (e._progId) this.markProgress(e._progId, true);
      if (this.exitRect && this.cleared) {
        this.audio.sfx('checkpoint');
        this.toast('Zona despejada — la salida se abre');
        this.announceClear();
      }
    }
  }

  killPlayer(reason) {
    if (this.player.dead || this.state === 'dying') return;
    // grace: dying from a hazard right on a fresh checkpoint -> survive with i-frames
    if (reason !== 'fall' && this._reviveOnCheckpoint()) return;
    this.player.hp = 0;
    this.player.dead = true;
    this.player.state = 'death';
    this.player.animT = 0;
    this.player.vy = -120;
    this.audio.sfx('death');
    this.camera.shake(5, 0.5);
    this.particles.burst(this.player.cx, this.player.cy, 22, { color: '#8b93a3', speed: 80, life: 0.6 });
    this.state = 'dying';
    this.dyingT = 1.5;
    this._onRealDeath();
  }

  /** called exactly once per real (non-revived) death -- mocking call-out +
      counts toward the Pesadilla mercy nerf (see NIGHTMARE_MERCY_DEATHS) */
  _onRealDeath() {
    this.announceDeath();
    if (this.diff && this.diff.key === 'nightmare' && this.save.addNightmareDeath) {
      this.save.addNightmareDeath();
    }
  }

  _activateCheckpoint(cp) {
    cp.active = true;
    cp.activatedAt = performance.now();
    this.player.invuln = Math.max(this.player.invuln, 0.6);   // safe on pickup
    this.save.update({
      level: this.levelIndex,
      checkpoint: { x: this.player.x, y: this.player.y },
      items: this.inventory.serialize(),
      collected: (this.save.data.collected || []).slice(),
      levelProgress: Object.assign({}, this.save.data.levelProgress || {}),
      hp: this.player.maxHp,
      maxHp: this.player.maxHp,
      memories: this.save.data.memories,
    });
    // Riko dives into the trash can... and pops back out, saved.
    this._cpText = { t: 1.3, x: cp.x + cp.w / 2, y: cp.y - 6 };
    this.audio.sfx('checkpoint');
    this.particles.burst(cp.x + cp.w / 2, cp.y + 4, 5, { color: '#8a9a44', speed: 40, life: 0.4 });
    this.particles.burst(cp.x + cp.w / 2, cp.y + cp.h, 16, { color: '#f4c542', speed: 60, life: 0.6, glow: true });
  }

  /** if Riko would die while touching an un-taken checkpoint, revive him there */
  _reviveOnCheckpoint() {
    const p = this.player;
    for (const cp of this.checkpointRects) {
      if (cp.active) continue;
      if (rectsOverlap(p.x, p.y, p.w, p.h, cp.x, cp.y, cp.w, cp.h)) {
        this._activateCheckpoint(cp);
        p.dead = false;
        p.hp = Math.max(1, p.hp);
        p.state = 'idle';
        p.animT = 0;
        p.invuln = 0.9;
        p.vy = -80;
        this.toast('Salvado por el checkpoint');
        return true;
      }
    }
    return false;
  }

  /* ---------------- boss plumbing ---------------- */
  startBoss() {
    const L = this.levelDef;
    const a = L.bossArena;
    this.bossArena = { x: a.tx * TS, y: a.ty * TS, w: a.w * TS, h: a.h * TS };
    const bs = L.bossSpawn;
    this.boss = new Farolero(bs.tx * TS, bs.ty * TS, this);
    this.boss.arena = this.bossArena;
    this.bossActive = true;
    this._farolWas = {};
    this.audio.playMusic('boss');
    this.toast('EL FAROLERO');
  }

  resetBossLanterns(phase) {
    for (const el of this.puzzleEls) {
      if (el instanceof LightNode && /^farol/.test(el.id || '')) {
        el.lit = false;
        el.said = false;
        this.signals[el.id] = false;
      }
    }
    this._farolWas = {};
    if (this.bossArena) {
      this.pickups.push(new Pickup('bombilla', this.bossArena.x + this.bossArena.w / 2, this.bossArena.y + 20));
    }
  }

  onBossDefeated() {
    this.bossActive = false;
    this.audio.stopMusic();
    this.state = 'postboss';
    this.postT = 3.2;
  }

  _startEndingChoice() {
    this.state = 'choice';
    this.dialogue.startChoice(
      'La esfera del Farolero late en tus manos. ¿Qué haces con la luz?',
      [
        { label: 'Devolverla a Lumera', value: 'A' },
        { label: 'Conservarla, como el', value: 'B' },
        { label: 'Compartirla con todos', value: 'C' },
      ],
      (val) => this._playEnding(val),
    );
  }

  _playEnding(val) {
    const E = {
      A: [
        { speaker: 'Riko', text: 'Riko abrio la esfera. La luz se derramo y volvio a cada farol de Lumera.' },
        { text: 'La ciudad recordo lo justo para seguir. Y por fin, algunas cosas pudieron olvidarse.' },
        { text: 'FINAL A  -  DEVOLVER LA LUZ' },
      ],
      B: [
        { speaker: 'Riko', text: 'Riko sostuvo la esfera. Tanta memoria, tan brillante, tan quieta.' },
        { text: 'Lumera quedo perfecta e inmovil: un cuadro hermoso que nadie volveria a pintar.' },
        { text: 'FINAL B  -  CONSERVAR LA LUZ' },
      ],
      C: [
        { speaker: 'Riko', text: 'Riko partio la esfera en mil chispas y las repartio por los tejados.' },
        { text: 'Cada quien guardaria un poco. Lumera recordaria junta, y junta podria cambiar.' },
        { text: 'FINAL C  -  COMPARTIR LA LUZ   (el final verdadero)' },
      ],
    };
    this.save.update({ ending: val, completed: true, items: this.inventory.serialize() });
    this.save.markLevelBeaten((this.diff && this.diff.key) || 'normal', this.levelIndex);   // beat the tower
    this.save.addScore({
      nick: this.save.data.nick,
      time: this.save.data.playtime,
      diff: (this.diff && this.diff.key) || 'normal',
      ending: val,
    });
    this.state = 'ending';
    this.audio.playMusic('ending');
    this.dialogue.start(E[val], () => this.hooks.onShowCredits && this.hooks.onShowCredits(val));
  }

  /* ---------------- transitions ---------------- */
  startTransition(cb) { this.transition = { phase: 'out', t: 0, cb, done: false }; }

  nextLevel() {
    if (this.levelIndex >= LEVELS.length - 1) return;
    this.audio.sfx('confirm');
    this.save.markLevelBeaten((this.diff && this.diff.key) || 'normal', this.levelIndex);
    this.save.update({
      level: this.levelIndex + 1, checkpoint: null,
      items: this.inventory.serialize(), hp: this.player.maxHp,
      collected: [],                          // fresh level -> pickups reappear
      levelProgress: {},                      // fresh level -> puzzles reset
      memories: this.save.data.memories,
    });
    this.startTransition(() => {
      this.loadLevel(this.levelIndex + 1, false);
      this.state = 'intro';
      this.introT = 2.0;
    });
  }

  /* ============================================================
     UPDATE
     ============================================================ */
  update(dt) {
    // transition freezes the world
    if (this.transition) {
      const tr = this.transition;
      tr.t += dt;
      if (tr.phase === 'out') {
        this.fadeAlpha = Math.min(1, tr.t / STEP_FADE);
        if (tr.t >= STEP_FADE && !tr.done) { tr.done = true; tr.cb(); tr.phase = 'in'; tr.t = 0; }
      } else {
        this.fadeAlpha = Math.max(0, 1 - tr.t / STEP_FADE);
        if (tr.t >= STEP_FADE) { this.transition = null; this.fadeAlpha = 0; }
      }
      this.particles.update(dt);
      return;
    }

    if (this.state === 'intro') {
      this.introT -= dt;
      this.particles.update(dt);
      this.camera.follow(this.player, dt);
      if (this.introT <= 0) this.state = 'playing';
      return;
    }

    if (this.state === 'dying') {
      this.dyingT -= dt;
      this.player.update(dt, this);
      this.particles.update(dt);
      this.camera.follow(this.player, dt);
      if (this.dyingT <= 0) {
        this.startTransition(() => {
          this.loadLevel(this.levelIndex, true);
          this.state = 'playing';
        });
      }
      return;
    }

    if (this.state === 'postboss') {
      this.postT -= dt;
      this.particles.update(dt);
      if (Math.random() < 0.4) {
        this.particles.burst(
          this.camera.x + Math.random() * this.W,
          this.camera.y + Math.random() * this.H,
          2, { color: '#f4c542', speed: 30, life: 0.8, glow: true, gravity: -10 },
        );
      }
      this.camera.follow(this.player, dt);
      if (this.postT <= 0) this._startEndingChoice();
      return;
    }

    if (this.state === 'choice' || this.state === 'ending') {
      this.dialogue.update(dt);
      if (this.dialogue.isChoice) {
        if (Input.justPressed('up') || Input.justPressed('left')) { this.dialogue.move(-1); this.audio.sfx('menu'); }
        if (Input.justPressed('down') || Input.justPressed('right')) { this.dialogue.move(1); this.audio.sfx('menu'); }
      }
      if (Input.justPressed('interact') || Input.justPressed('confirm')) this.dialogue.advance();
      this.particles.update(dt);
      return;
    }

    /* ----- state === 'playing' ----- */

    // dialogue blocks the world
    if (this.dialogue.active) {
      this.dialogue.update(dt);
      if (Input.justPressed('interact') || Input.justPressed('confirm')) this.dialogue.advance();
      this.particles.update(dt);
      return;
    }

    // detect death from enemy damage (grace-save if touching a fresh checkpoint)
    if (this.player.dead && this.state === 'playing') {
      if (!this._reviveOnCheckpoint()) {
        this.state = 'dying';
        this.dyingT = 1.5;
        this.audio.sfx('death');
        this._onRealDeath();
        return;
      }
    }

    // freeze-frame (parry / heavy hit)
    if (this.hitstopT > 0) {
      this.hitstopT -= dt;
      this.particles.update(dt);
      return;
    }

    // item cycle
    if (Input.justPressed('cycleL')) { this.inventory.cycle(-1); this.audio.sfx('menu'); }
    if (Input.justPressed('cycleR')) { this.inventory.cycle(1); this.audio.sfx('menu'); }

    // carry platform riders (previous frame delta)
    const riders = [this.player, ...this.enemies];
    for (const a of riders) {
      if (a.riding && a.riding.isPlatform) { a.x += a.riding.dx; a.y += a.riding.dy; }
      a.riding = null;
    }

    // "clear the zone" gate: doors can require the '_clear' signal
    const cleared = this.cleared;
    this.signals._clear = cleared;
    // once every lantern is lit, drag any lingering enemies to Riko so you're
    // never stuck hunting one crow you can't find
    if (!cleared && this.lanternsLit >= this.lanternsTotal) {
      for (const e of this.enemies) if (!e.dead) { e.aggro = true; e.detectRange = 99999; }
    }

    // puzzle elements
    for (const el of this.puzzleEls) el.update(dt, this);

    // player
    this.player.update(dt, this);

    // enemies
    for (const e of this.enemies) e.update(dt, this);

    // parry "reach": any enemy closing in during the window gets deflected
    // (parrySuccess then sweeps the rest -- two bats at once = both go down)
    if (this.player.isParrying()) {
      for (const e of this.enemies) {
        if (e.dead || e.stunT > 0) continue;
        if (Math.hypot((e.x + e.w / 2) - this.player.cx, (e.y + e.h / 2) - this.player.cy) < 22) {
          this.player.parrySuccess(e, this);
          break;
        }
      }
    }

    // boss
    if (this.boss) this.boss.update(dt, this);

    // projectiles
    for (const pr of this.projectiles) pr.update(dt, this);
    this.projectiles = this.projectiles.filter((p) => !p.dead);

    // pickups
    for (const pk of this.pickups) pk.update(dt, this);
    this.pickups = this.pickups.filter((p) => !p.taken);

    // dynamic solids
    this.solids = [];
    for (const el of this.puzzleEls) {
      const s = el.solidRect;
      if (s) this.solids.push(s);
      const ex = el.extraSolids;
      if (ex) for (const r of ex) this.solids.push({ x: r.x, y: r.y, w: r.w, h: r.h });
    }
    resolveSolids(this.player, this.solids, dt);
    for (const e of this.enemies) if (!e.flying && !e.dead) resolveSolids(e, this.solids, dt);
    for (const c of this.crates) resolveSolids(c, this.solids.filter((s) => s.ref !== c), dt);

    // "ferry" platforms keep their rider on-board WHILE OVER THE PIT so you
    // can't mash off the front edge -- but release them once the platform has
    // carried them over solid ground.
    for (const a of [this.player, ...this.enemies]) {
      const r = a.riding;
      if (r && r.isPlatform && r.ferry) {
        const ts = this.map.ts;
        const overGround =
          this.map.isSolidTile(Math.floor((a.x + 1) / ts), Math.floor((a.y + a.h + 3) / ts)) ||
          this.map.isSolidTile(Math.floor((a.x + a.w - 1) / ts), Math.floor((a.y + a.h + 3) / ts));
        if (!overGround) a.x = clamp(a.x, r.x + 1, r.x + r.w - a.w - 1);
      }
    }

    // reap enemies
    this.enemies = this.enemies.filter((e) => !(e.dead && e.deadT > 0.6));

    // interaction target -- distance to the NEAREST point of the element
    // (so you can open a floor-to-ceiling gate by standing next to its base)
    this.interactTarget = null;
    let best = 22;
    for (const el of this.puzzleEls) {
      if (el.canInteract && el.canInteract(this)) {
        const nx = clamp(this.player.cx, el.x, el.x + el.w);
        const ny = clamp(this.player.cy, el.y, el.y + el.h);
        const d = Math.hypot(nx - this.player.cx, ny - this.player.cy);
        if (d < best) { best = d; this.interactTarget = el; }
      }
    }
    if (this.interactTarget && Input.justPressed('interact')) {
      this.interactTarget.interact(this);
    }

    // triggers
    for (const tr of this.triggers) {
      if (tr.fired) continue;
      if (rectsOverlap(this.player.x, this.player.y, this.player.w, this.player.h, tr.rect.x, tr.rect.y, tr.rect.w, tr.rect.h)) {
        tr.fired = true;
        if (tr.dialogue) this.startDialogue(tr.dialogue, () => { if (tr.event) this._handleEvent(tr.event); });
        else if (tr.event) this._handleEvent(tr.event);
      }
    }

    // checkpoints
    for (const cp of this.checkpointRects) {
      if (cp.active) continue;
      if (rectsOverlap(this.player.x, this.player.y, this.player.w, this.player.h, cp.x, cp.y, cp.w, cp.h)) {
        this._activateCheckpoint(cp);
      }
    }

    // exit  (only when the zone is cleared)
    if (this._exitToastT > 0) this._exitToastT -= dt;
    if (this._cpText) { this._cpText.t -= dt; if (this._cpText.t <= 0) this._cpText = null; }
    if (this.skyMsgs && this.skyMsgs.length) {
      for (const m of this.skyMsgs) m.t -= dt;
      this.skyMsgs = this.skyMsgs.filter((m) => m.t > 0);
    }
    if (this.exitRect && rectsOverlap(this.player.x, this.player.y, this.player.w, this.player.h, this.exitRect.x, this.exitRect.y, this.exitRect.w, this.exitRect.h)) {
      if (cleared) this.nextLevel();
      else if (this._exitToastT <= 0) {
        this._exitToastT = 3;
        this.audio.sfx('cancel');
        this.toast('Faltan  ' + this.enemiesLeft + ' enemigos  ·  ' + (this.lanternsTotal - this.lanternsLit) + ' faroles');
      }
    }

    this.camera.follow(this.player, dt);
    this.particles.update(dt);
    if (this.save.data) this.save.data.playtime += dt;
  }

  _handleEvent(ev) {
    if (ev === 'bossIntro') this.startBoss();
  }

  /* ============================================================
     RENDER
     ============================================================ */
  render() {
    const ctx = this.ctx;
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, this.W, this.H);

    drawBackground(ctx, this);

    // tiles
    this._renderTiles(ctx);

    // ambient lanterns (the things the level lights come from)
    {
      const now = performance.now() / 1000;
      for (const l of this.lights) {
        if (!l.spr) continue;
        if (l.x - this.camera.x < -12 || l.x - this.camera.x > this.W + 12) continue;
        drawLantern(ctx, l.x - this.camera.renderX, l.y - this.camera.renderY, true, now + l.x * 0.01);
      }
    }

    // checkpoints -- visible trash cans (Riko is a raccoon)
    for (const cp of this.checkpointRects) {
      const sx = cp.x - this.camera.renderX + cp.w / 2;
      const sy = cp.y - this.camera.renderY + cp.h - 2;
      const since = cp.activatedAt ? (performance.now() - cp.activatedAt) / 1000 : 999;
      drawTrashcan(ctx, sx, sy, cp.active, since < 0.45 ? since / 0.45 : 0);
    }

    // pickups
    for (const pk of this.pickups) if (this.camera.visible(pk)) pk.render(ctx, this.camera);

    // puzzle elements
    for (const el of this.puzzleEls) el.render(ctx, this.camera);

    // enemies
    for (const e of this.enemies) if (this.camera.visible(e)) e.render(ctx, this.camera);

    // boss
    if (this.boss) this.boss.render(ctx, this.camera);

    // player
    if (this.player) this.player.render(ctx, this.camera);

    // projectiles
    for (const pr of this.projectiles) pr.render(ctx, this.camera);

    // particles
    this.particles.render(ctx, this.camera);

    // lighting
    this._renderLighting(ctx);

    // atmosphere: drifting motes / embers in FRONT of the scene (depth)
    this._renderForegroundAtmo(ctx);

    // keep Riko readable even in the dark: warm glow + redraw on top of the shadow.
    // Holding the BOMBILLA widens the halo noticeably (it's a real light now).
    if (this.player && !this.player.dead && this.levelDef.darkness > 0.01) {
      const psx = this.player.cx - this.camera.renderX;
      const psy = this.player.cy - this.camera.renderY;
      const bulb = !!this.player.holdingBulb;
      const rr = bulb ? 60 : 34;
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const gg = ctx.createRadialGradient(psx, psy, 0, psx, psy, rr);
      gg.addColorStop(0, bulb ? 'rgba(255,232,170,0.42)' : 'rgba(255,226,170,0.30)');
      gg.addColorStop(0.5, bulb ? 'rgba(255,214,140,0.14)' : 'rgba(255,214,150,0.05)');
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(psx, psy, rr, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
      this.player.render(ctx, this.camera);
    }

    // exit marker
    if (this.exitRect && this.state === 'playing') {
      const sx = this.exitRect.x - this.camera.renderX;
      const sy = this.exitRect.y - this.camera.renderY;
      const ok = this.cleared;
      ctx.save();
      ctx.globalAlpha = 0.45 + Math.sin(performance.now() / 300) * 0.3;
      ctx.strokeStyle = ok ? '#6fbf73' : '#d64b3a';
      ctx.lineWidth = 1;
      ctx.strokeRect(sx - 1, sy - 1, this.exitRect.w + 2, this.exitRect.h + 2);
      ctx.fillStyle = ok ? '#6fbf73' : '#d64b3a';
      ctx.textAlign = 'center';
      ctx.font = '9px "Courier New", monospace';
      ctx.fillText(ok ? '>' : 'X', sx + this.exitRect.w / 2, sy + this.exitRect.h / 2);
      ctx.restore();
    }

    // HUD
    if (['playing', 'dying', 'postboss'].includes(this.state)) drawHUD(ctx, this);

    // playful call-outs, floating in the "sky" (fixed screen space, top of the canvas)
    if (this.skyMsgs && this.skyMsgs.length) {
      ctx.save();
      ctx.textAlign = 'center';
      this.skyMsgs.forEach((m, i) => {
        const k = clamp(m.t / m.life, 0, 1);
        const rise = (1 - k) * 10;
        ctx.globalAlpha = Math.min(1, k * 3);
        ctx.font = 'bold 11px "Courier New", monospace';
        outText(ctx, m.text, this.W / 2, 24 + i * 13 - rise, m.color);
      });
      ctx.restore();
    }

    // "¡GUARDADO!" -- floats up off the trash can right after a checkpoint
    if (this._cpText) {
      const k = clamp(this._cpText.t / 1.3, 0, 1);
      const sx = this._cpText.x - this.camera.renderX;
      const sy = this._cpText.y - this.camera.renderY - (1.3 - this._cpText.t) * 16;
      ctx.save();
      ctx.textAlign = 'center';
      ctx.globalAlpha = Math.min(1, k * 3);
      ctx.font = 'bold 10px "Courier New", monospace';
      outText(ctx, '¡GUARDADO!', sx, sy, '#ffe07a');
      ctx.restore();
    }

    // interaction prompt
    if (this.interactTarget && this.state === 'playing' && !this.dialogue.active) {
      const t = this.interactTarget;
      const anchorX = clamp(this.player.cx, t.x, t.x + t.w);
      const anchorY = clamp(this.player.cy - 14, t.y, t.y + t.h);
      const sx = Math.round(anchorX - this.camera.renderX);
      const sy = Math.round(anchorY - this.camera.renderY - 12);
      ctx.save();
      ctx.textAlign = 'center';
      ctx.font = 'bold 8px "Courier New", monospace';
      ctx.fillStyle = 'rgba(4,7,16,0.92)';
      ctx.fillRect(sx - 26, sy - 8, 52, 13);
      ctx.strokeStyle = '#f4c542';
      ctx.strokeRect(sx - 26.5, sy - 8.5, 52, 13);
      outText(ctx, 'E  interactuar', sx, sy + 1, '#ffe07a');
      ctx.restore();
    }

    // boss health bar
    if (this.bossActive && this.boss && !this.boss.dead) this._renderBossBar(ctx);

    // dialogue / choice
    this.dialogue.render(ctx, this.W, this.H);

    // intro title card
    if (this.state === 'intro') {
      const a = clamp(this.introT / 2, 0, 1);
      ctx.save();
      ctx.globalAlpha = Math.min(1, a * 2) * Math.min(1, this.introT * 2);
      ctx.fillStyle = 'rgba(3,5,14,0.78)';
      ctx.fillRect(0, this.H / 2 - 26, this.W, 52);
      ctx.textAlign = 'center';
      ctx.font = 'bold 18px "Courier New", monospace';
      outText(ctx, (this.levelDef.intro && this.levelDef.intro[0] && this.levelDef.intro[0].text) || this.levelDef.name.toUpperCase(), this.W / 2, this.H / 2 + 4, '#ffd357');
      ctx.font = 'bold 8px "Courier New", monospace';
      const dl = this.diff && this.diff.key !== 'normal' ? '   ·   ' + this.diff.label.toUpperCase() : '';
      outText(ctx, 'Nivel ' + (this.levelIndex + 1) + ' de ' + LEVELS.length + dl, this.W / 2, this.H / 2 + 18, '#c3d0e4');
      ctx.restore();
    }

    // dying vignette
    if (this.state === 'dying') {
      ctx.save();
      ctx.globalAlpha = clamp(1 - this.dyingT / 1.5, 0, 0.85);
      ctx.fillStyle = '#02030a';
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#9fb2cc';
      ctx.font = '10px "Courier New", monospace';
      ctx.fillText('...', this.W / 2, this.H / 2);
      ctx.restore();
    }

    // colour grade + vignette (cinematic finish)
    this._renderGrade(ctx);

    // transition fade
    if (this.fadeAlpha > 0) {
      ctx.save();
      ctx.globalAlpha = this.fadeAlpha;
      ctx.fillStyle = '#02030a';
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.restore();
    }
  }

  _renderForegroundAtmo(ctx) {
    const theme = this.levelDef.key;
    const t = performance.now() / 1000;
    const cam = this.camera;
    const cfg = {
      roofs:    { n: 16, c: 'rgba(255,225,180,', sp: 5, dy: -3, sz: 1 },
      forest:   { n: 22, c: 'rgba(150,255,200,', sp: 7, dy: -2, sz: 1 },
      sewers:   { n: 14, c: 'rgba(150,220,210,', sp: 9, dy: 14, sz: 1 },
      district: { n: 26, c: 'rgba(180,200,235,', sp: 3, dy: 34, sz: 1 },
      tower:    { n: 20, c: 'rgba(210,180,255,', sp: 4, dy: -4, sz: 1 },
    }[theme] || { n: 14, c: 'rgba(255,225,180,', sp: 5, dy: -2, sz: 1 };
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < cfg.n; i++) {
      const seed = i * 53.13;
      const px2 = ((seed * 7 + cam.x * 0.7 + t * cfg.sp * (theme === 'district' ? 20 : 6)) % (this.W + 20)) - 10;
      const py2 = ((seed * 11 + t * (cfg.dy + i)) % (this.H + 20) + this.H) % (this.H + 20) - 10;
      const a = 0.10 + 0.18 * (0.5 + 0.5 * Math.sin(t * 2 + i * 3));
      ctx.fillStyle = cfg.c + a.toFixed(2) + ')';
      if (theme === 'district') { // rain streaks in front
        ctx.fillRect(px2 | 0, py2 | 0, 1, 5);
      } else {
        ctx.fillRect(px2 | 0, py2 | 0, cfg.sz, cfg.sz);
      }
    }
    ctx.restore();
  }

  _renderGrade(ctx) {
    const theme = this.levelDef.key;
    const b = this.brightMode;
    const tint = {
      roofs: 'rgba(30,40,80,', forest: 'rgba(20,50,60,',
      sewers: 'rgba(20,45,45,', district: 'rgba(45,25,35,', tower: 'rgba(35,25,60,',
    }[theme] || 'rgba(20,30,60,';
    ctx.save();
    ctx.fillStyle = tint + (b ? 0.03 : 0.11) + ')';
    ctx.fillRect(0, 0, this.W, this.H);
    // vignette (softer in bright mode)
    const g = ctx.createRadialGradient(this.W / 2, this.H / 2, this.H * 0.35, this.W / 2, this.H / 2, this.H * 0.8);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,' + (b ? 0.14 : 0.42) + ')');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, this.W, this.H);
    ctx.fillStyle = 'rgba(255,255,255,0.014)';
    for (let y = 0; y < this.H; y += 3) ctx.fillRect(0, y, this.W, 1);
    ctx.restore();
  }

  _renderTiles(ctx) {
    const m = this.map;
    const cam = this.camera;
    const ts = m.ts;
    const x0 = Math.max(0, Math.floor(cam.x / ts));
    const x1 = Math.min(m.w - 1, Math.ceil((cam.x + this.W) / ts));
    const y0 = Math.max(0, Math.floor(cam.y / ts));
    const y1 = Math.min(m.h - 1, Math.ceil((cam.y + this.H) / ts));
    const theme = this.levelDef.key;

    const P = TILE_PAL[theme] || TILE_PAL.roofs;
    const rnd = (a, b) => { const s = Math.sin(a * 91.3 + b * 47.7) * 4375.55; return s - Math.floor(s); };

    for (let ty = y0; ty <= y1; ty++) {
      const row = m.rows[ty];
      for (let tx = x0; tx <= x1; tx++) {
        const c = row[tx];
        if (c === '.') continue;
        const sx = Math.round(tx * ts - cam.renderX);
        const sy = Math.round(ty * ts - cam.renderY);
        const openUp = !m.isSolidTile(tx, ty - 1);
        const openL = !m.isSolidTile(tx - 1, ty);
        const openR = !m.isSolidTile(tx + 1, ty);

        if (c === '#') {
          ctx.fillStyle = P.body;
          ctx.fillRect(sx, sy, ts, ts);
          ctx.fillStyle = P.body2;
          ctx.fillRect(sx, sy + (ts >> 1), ts, ts >> 1);

          if (theme === 'roofs') {
            // shingle courses
            ctx.fillStyle = P.line;
            for (let k = 4; k < ts; k += 5) ctx.fillRect(sx, sy + k, ts, 1);
            for (let k = 4; k < ts; k += 5) {
              const o = ((ty + (k / 5 | 0)) % 2) * 4;
              ctx.fillRect(sx + o, sy + k - 3, 1, 3);
            }
          } else if (theme === 'forest') {
            // stone speckle + moss
            ctx.fillStyle = P.line;
            for (let s = 0; s < 3; s++) ctx.fillRect(sx + 2 + (rnd(tx, ty + s) * 12 | 0), sy + 3 + (rnd(ty, tx + s) * 11 | 0), 2, 2);
          } else if (theme === 'sewers') {
            // brick mortar grid (staggered)
            ctx.strokeStyle = P.line;
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(sx, sy + 5.5); ctx.lineTo(sx + ts, sy + 5.5);
            ctx.moveTo(sx, sy + 11.5); ctx.lineTo(sx + ts, sy + 11.5);
            const st = (ty % 2) * 8;
            ctx.moveTo(sx + st + 3.5, sy); ctx.lineTo(sx + st + 3.5, sy + 5.5);
            ctx.moveTo(sx + st + 11.5, sy); ctx.lineTo(sx + st + 11.5, sy + 5.5);
            ctx.moveTo(sx + (st ? 0 : 8) + 3.5, sy + 5.5); ctx.lineTo(sx + (st ? 0 : 8) + 3.5, sy + 11.5);
            ctx.stroke();
          } else if (theme === 'district') {
            // cracked concrete
            ctx.strokeStyle = P.line;
            ctx.lineWidth = 1;
            ctx.beginPath();
            const cxk = sx + 3 + (rnd(tx, ty) * 8 | 0);
            ctx.moveTo(cxk, sy); ctx.lineTo(cxk + 2, sy + 6); ctx.lineTo(cxk - 1, sy + 12); ctx.lineTo(cxk + 3, sy + ts);
            ctx.stroke();
            if (rnd(tx + 3, ty) > 0.8) { ctx.fillStyle = '#5a4a2a'; ctx.fillRect(sx + 10, sy + 8, 3, 1); }
          } else {
            // tower cut stone
            ctx.fillStyle = P.line;
            ctx.fillRect(sx, sy + 7, ts, 1);
            ctx.fillRect(sx + ((tx % 2) ? 8 : 0), sy, 1, 8);
            ctx.fillRect(sx + ((tx % 2) ? 0 : 8), sy + 8, 1, 8);
            if (rnd(tx, ty) > 0.88) { ctx.fillStyle = 'rgba(150,110,220,0.18)'; ctx.fillRect(sx + 6, sy + 6, 4, 4); }
          }

          // lit top surface + edge shading
          if (openUp) {
            ctx.fillStyle = P.top;
            ctx.fillRect(sx, sy, ts, 3);
            ctx.fillStyle = P.topHi;
            ctx.fillRect(sx, sy, ts, 1);
            if (theme === 'forest') { // grass tufts
              ctx.fillStyle = '#2f5a3a';
              for (let k = 1; k < ts; k += 5) ctx.fillRect(sx + k, sy - 2, 1, 3);
            }
          }
          if (openL) { ctx.fillStyle = 'rgba(255,255,255,0.05)'; ctx.fillRect(sx, sy, 1, ts); }
          if (openR) { ctx.fillStyle = 'rgba(0,0,0,0.28)'; ctx.fillRect(sx + ts - 1, sy, 1, ts); }

        } else if (c === '=') {
          // one-way platform (themed plank / grate)
          if (theme === 'sewers' || theme === 'tower') {
            ctx.fillStyle = P.plat;
            for (let k = 0; k < ts; k += 4) ctx.fillRect(sx + k, sy, 2, 5);
            ctx.fillStyle = P.platHi;
            ctx.fillRect(sx, sy, ts, 1);
          } else {
            ctx.fillStyle = P.plat;
            ctx.fillRect(sx, sy, ts, 4);
            ctx.fillStyle = P.platHi;
            ctx.fillRect(sx, sy, ts, 1);
            ctx.fillStyle = P.body2;
            ctx.fillRect(sx, sy + 4, ts, 2);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(sx + 3, sy + 3, 1, 3);
            ctx.fillRect(sx + ts - 4, sy + 3, 1, 3);
          }
        } else if (c === '^') {
          ctx.fillStyle = P.body;
          ctx.fillRect(sx, sy + ts - 4, ts, 4);
          ctx.fillStyle = P.spike;
          for (let i = 0; i < 4; i++) {
            ctx.beginPath();
            ctx.moveTo(sx + i * 4, sy + ts);
            ctx.lineTo(sx + i * 4 + 2, sy + ts - 8);
            ctx.lineTo(sx + i * 4 + 4, sy + ts);
            ctx.fill();
            ctx.fillStyle = P.spikeHi;
            ctx.fillRect(sx + i * 4 + 1, sy + ts - 6, 1, 3);
            ctx.fillStyle = P.spike;
          }
        }
      }
    }
  }

  _renderLighting(ctx) {
    const base = clamp(this.levelDef.darkness || 0.5, 0.44, 0.6);
    // "Modo claro": far less darkness (bright, not day). Lightning briefly lifts it.
    const lf = currentLightning ? currentLightning() : 0;
    let dark = this.brightMode ? Math.min(base, 0.09) : base;
    dark *= 1 - lf * 0.9;
    if (dark <= 0.02) {
      // still add the warm glows even with no shadow layer
      this._lightGlowOnly(ctx);
      return;
    }
    const cam = this.camera;
    ctx.save();
    ctx.fillStyle = 'rgba(3,5,14,' + dark.toFixed(3) + ')';
    ctx.fillRect(0, 0, this.W, this.H);

    ctx.globalCompositeOperation = 'destination-out';
    const hole = (x, y, r, core) => {
      const sx = x - cam.renderX, sy = y - cam.renderY;
      if (sx < -r || sx > this.W + r || sy < -r || sy > this.H + r) return;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, 'rgba(0,0,0,1)');
      g.addColorStop(core || 0.55, 'rgba(0,0,0,0.7)');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
    };
    // soft lights (lit bombilla pedestals) barely clear the shadow -> you can
    // still make out shapes THROUGH the glow
    for (const l of this.lights) hole(l.x, l.y, l.soft ? l.r * 0.62 : l.r, l.soft ? 0.28 : 0.55);
    if (this.player) {
      const bulb = !!this.player.holdingBulb;
      hole(this.player.cx, this.player.cy, bulb ? 60 : 40, bulb ? 0.4 : 0.42);
    }
    if (this.boss && !this.boss.dead) hole(this.boss.x + this.boss.w / 2, this.boss.y + this.boss.h / 2, 78);

    ctx.globalCompositeOperation = 'lighter';
    this._lightGlows(ctx, cam);

    // lightning briefly floods the scene with cold light
    if (lf > 0.02) {
      ctx.globalAlpha = clamp(lf * 0.5, 0, 0.6);
      ctx.fillStyle = 'rgba(170,200,255,1)';
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  _lightGlows(ctx, cam) {
    const glow = (x, y, r, c, a) => {
      const sx = x - cam.renderX, sy = y - cam.renderY;
      if (sx < -r || sx > this.W + r || sy < -r || sy > this.H + r) return;
      const g = ctx.createRadialGradient(sx, sy, 0, sx, sy, r);
      g.addColorStop(0, c);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.globalAlpha = a == null ? 0.26 : a;
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.arc(sx, sy, r, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
    };
    for (const l of this.lights) glow(l.x, l.y, l.r * (l.soft ? 0.7 : 0.95), l.c, l.soft ? 0.13 : 0.26);
    if (this.player && !this.player.dead) {
      const bulb = !!this.player.holdingBulb;
      glow(this.player.cx, this.player.cy, bulb ? 58 : 36, bulb ? 'rgba(255,232,175,1)' : 'rgba(255,226,175,0.9)', bulb ? 0.24 : 0.24);
    }
  }

  _lightGlowOnly(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    this._lightGlows(ctx, this.camera);
    const lf = currentLightning ? currentLightning() : 0;
    if (lf > 0.02) {
      ctx.globalAlpha = clamp(lf * 0.4, 0, 0.5);
      ctx.fillStyle = 'rgba(170,200,255,1)';
      ctx.fillRect(0, 0, this.W, this.H);
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  _renderBossBar(ctx) {
    const w = 168, x = (this.W - w) / 2, y = 12;
    ctx.save();
    ctx.fillStyle = 'rgba(4,7,16,0.9)';
    ctx.fillRect(x - 3, y - 3, w + 6, 13);
    ctx.strokeStyle = '#5aa0e8';
    ctx.strokeRect(x - 3.5, y - 3.5, w + 6, 13);
    const frac = this.boss.hp / this.boss.maxHp;
    ctx.fillStyle = 'rgba(0,0,0,0.4)';
    ctx.fillRect(x, y, w, 8);
    ctx.fillStyle = this.boss.vulnerable ? '#f4c542' : '#8fb8ff';
    ctx.fillRect(x, y, w * clamp(frac, 0, 1), 8);
    ctx.textAlign = 'center';
    ctx.font = 'bold 7px "Courier New", monospace';
    outText(ctx,
      'EL FAROLERO   ·   Fase ' + this.boss.phase +
      (this.boss.vulnerable ? '  ·  ¡AHORA! golpealo o cae sobre el' : '  ·  espera a que baje'),
      this.W / 2, y + 22, this.boss.vulnerable ? '#ffe07a' : '#c3d0e4');
    ctx.restore();
  }
}
