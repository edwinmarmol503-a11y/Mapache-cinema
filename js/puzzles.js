/* ============================================================
   puzzles.js  -  modular, data-driven puzzle elements.
   All elements share a base class; a level defines them as
   plain objects (see levels.js). Signals connect them.
   Supported: button, lever, door, platform, crate, magnet,
   rope, lightnode, sequence.
   ============================================================ */
import { rectsOverlap } from './collision.js';
import { moveActor } from './physics.js';
import { ITEM_DEFS } from './inventory.js';
import { px, drawLantern } from './sprites.js';
import { Input } from './input.js';

class PuzzleEl {
  constructor(o, ts) {
    this.def = o;
    this.ts = ts;
    this.id = o.id || null;
    this.x = (o.tx || 0) * ts;
    this.y = (o.ty || 0) * ts;
    this.w = ts; this.h = ts;
    this.isPlatform = false;
    this.tag = o.tag || null;
  }
  update() {}
  render() {}
  canInteract() { return false; }
  interact() {}
  get solidRect() { return null; }         // dynamic solid contributed to world.solids
  get extraSolids() { return null; }       // array of solids (rope bridge)
}

/* ---------------- BUTTON (pressure plate) ---------------- */
export class Button extends PuzzleEl {
  constructor(o, ts) {
    super(o, ts);
    this.x = o.tx * ts + 2;
    this.y = o.ty * ts + ts - 4;
    this.w = ts - 4; this.h = 4;
    this.pressed = false;
    this.momentary = o.momentary !== false;
  }
  update(dt, world) {
    const r = { x: this.x, y: this.y - 5, w: this.w, h: 8 };
    let p = false;
    const pl = world.player;
    if (rectsOverlap(r.x, r.y, r.w, r.h, pl.x, pl.y, pl.w, pl.h) && pl.vy >= -5) p = true;
    for (const c of world.crates) if (rectsOverlap(r.x, r.y, r.w, r.h, c.x, c.y, c.w, c.h)) p = true;
    for (const pr of world.projectiles) if (rectsOverlap(r.x, r.y, r.w, r.h, pr.x, pr.y, pr.w, pr.h)) p = true;

    if (!this.momentary && p) this.pressed = true;
    else this.pressed = p;

    if (p && !this._was) world.audio.sfx('interact');
    this._was = p;
    if (this.id) world.signals[this.id] = this.pressed;
  }
  render(ctx, cam) {
    const sx = this.x - cam.renderX, sy = this.y - cam.renderY;
    px(ctx, sx - 1, sy + (this.pressed ? 2 : 0), this.w + 2, this.pressed ? 3 : 5, '#2b3c63');
    px(ctx, sx, sy + (this.pressed ? 3 : 1), this.w, 2, this.pressed ? '#6fbf73' : '#d64b3a');
  }
}

/* ---------------- LEVER ---------------- */
export class Lever extends PuzzleEl {
  constructor(o, ts) {
    super(o, ts);
    this.x = o.tx * ts + 3; this.y = o.ty * ts + 2;
    this.w = 10; this.h = 14;
    this.on = !!o.on;
  }
  update(dt, world) { if (this.id) world.signals[this.id] = this.on; }
  canInteract() { return true; }
  interact(world) {
    this.on = !this.on;
    if (this.id) world.markProgress('lever:' + this.id, this.on);
    world.audio.sfx('interact');
    world.particles.burst(this.x + 5, this.y + 2, 6, { color: '#f4c542', speed: 40, life: 0.3 });
  }
  render(ctx, cam) {
    const sx = this.x - cam.renderX, sy = this.y - cam.renderY;
    px(ctx, sx + 3, sy + 8, 4, 6, '#33383f');            // base
    ctx.save();
    ctx.translate(sx + 5, sy + 10);
    ctx.rotate(this.on ? -0.6 : 0.6);
    px(ctx, -1, -10, 2, 10, '#8b93a3');
    px(ctx, -2, -12, 4, 3, this.on ? '#6fbf73' : '#d64b3a');
    ctx.restore();
  }
}

/* ---------------- DOOR / GATE ---------------- */
export class Door extends PuzzleEl {
  constructor(o, ts) {
    super(o, ts);
    this.tall = o.tall || 2;
    this.w = ts; this.h = this.tall * ts;
    this.y = o.ty * ts;
    this.locked = !!o.locked;
    this.needs = o.needs || 'llave';
    this.requires = o.requires || null;    // signals list
    this.open = !!o.open;
    this.anim = this.open ? 1 : 0;
  }
  update(dt, world) {
    if (this.requires) this.open = world.evalReq(this.requires);
    this.anim += ((this.open ? 1 : 0) - this.anim) * Math.min(1, dt * 6);
    if (this.open && this.id) world.signals[this.id] = true;
  }
  get solidRect() {
    if (this.anim > 0.85) return null;
    return { x: this.x, y: this.y, w: this.w, h: this.h, ref: this };
  }
  canInteract(world) { return this.locked && !this.open; }
  interact(world) {
    if (world.inventory.has(this.needs)) {
      world.inventory.use(this.needs);
      this.open = true; this.locked = false;
      if (this.id) world.markProgress('open:' + this.id, true);
      world.audio.sfx('door');
      world.toast('Abres la puerta con la ' + (ITEM_DEFS[this.needs]?.name || this.needs).toLowerCase());
      if (this.id) world.signals[this.id] = true;
    } else {
      world.toast('Cerrado. Necesitas: ' + (ITEM_DEFS[this.needs]?.name || this.needs));
      world.audio.sfx('cancel');
    }
  }
  render(ctx, cam) {
    const sx = Math.round(this.x - cam.renderX);
    const sy = Math.round(this.y - cam.renderY);
    const openH = this.h * this.anim;
    const top = sy + openH;
    const hh = this.h - openH;
    if (hh <= 0) return;

    if (this.tall >= 5) {
      // tall gate: iron portcullis in a stone frame (floor -> sky)
      px(ctx, sx - 2, sy - 2, this.w + 4, this.h + 2, '#20242e');       // frame
      px(ctx, sx, top, this.w, hh, '#2a3038');                          // shadow gap
      for (let bx = 2; bx < this.w - 1; bx += 4) {                      // vertical bars
        px(ctx, sx + bx, top, 2, hh, '#565f70');
        px(ctx, sx + bx, top, 1, hh, '#727d92');
      }
      for (let y = top + 2; y < sy + this.h - 2; y += this.ts) {        // cross braces
        px(ctx, sx, y, this.w, 2, '#3d4552');
      }
      if (this.locked && this.anim < 0.5) {
        px(ctx, sx + this.w / 2 - 2, sy + this.h - 14, 5, 5, '#d99a3c');  // big lock
        px(ctx, sx + this.w / 2 - 1, sy + this.h - 12, 3, 3, '#5b4326');
      }
    } else {
      px(ctx, sx, top, this.w, hh, '#3a2a18');
      for (let i = 0; i < this.tall; i++) px(ctx, sx + 2, top + i * this.ts + 4, this.w - 4, 2, '#5b4326');
      if (this.locked && this.anim < 0.5) px(ctx, sx + this.w / 2 - 1, sy + this.h - 8, 3, 3, '#d99a3c');
    }
  }
}

/* ---------------- MOVING PLATFORM ---------------- */
export class Platform extends PuzzleEl {
  constructor(o, ts) {
    super(o, ts);
    this.isPlatform = true;
    this.w = (o.len || 3) * ts;
    this.h = 6;
    this.ax = o.tx * ts; this.ay = o.ty * ts;
    this.bx = (o.toTx != null ? o.toTx : o.tx) * ts;
    this.by = (o.toTy != null ? o.toTy : o.ty) * ts;
    this.speed = o.speed || 32;
    this.dir = 1;
    this.requires = o.requires || null;
    this.auto = o.auto != null ? o.auto : !this.requires;
    this.oneWay = o.oneWay !== false;
    this.ferry = !!o.ferry;      // riders are kept on-board (can't walk off over a pit)
    this.dx = 0; this.dy = 0;
    this.x = this.ax; this.y = this.ay;
  }
  update(dt, world) {
    const active = this.auto || (this.requires && world.evalReq(this.requires));
    const px0 = this.x, py0 = this.y;
    if (active) {
      const tx = this.dir > 0 ? this.bx : this.ax;
      const ty = this.dir > 0 ? this.by : this.ay;
      const dxv = tx - this.x, dyv = ty - this.y;
      const d = Math.hypot(dxv, dyv);
      if (d < 1) { this.dir *= -1; }
      else {
        const s = Math.min(this.speed * dt, d);
        this.x += (dxv / d) * s;
        this.y += (dyv / d) * s;
      }
    }
    this.dx = this.x - px0;
    this.dy = this.y - py0;
  }
  get solidRect() { return { x: this.x, y: this.y, w: this.w, h: this.h, oneWay: this.oneWay, ref: this }; }
  render(ctx, cam) {
    const sx = Math.round(this.x - cam.renderX), sy = Math.round(this.y - cam.renderY);
    px(ctx, sx, sy, this.w, this.h, '#4a5872');
    px(ctx, sx, sy, this.w, 2, '#6b7ea0');
    for (let i = 4; i < this.w - 2; i += 8) px(ctx, sx + i, sy + 3, 2, 2, '#33383f');
  }
}

/* ---------------- PUSHABLE CRATE ---------------- */
export class Crate extends PuzzleEl {
  constructor(o, ts) {
    super(o, ts);
    this.w = ts; this.h = ts;
    this.vx = 0; this.vy = 0;
    this.metal = !!o.metal;
    this.gravity = 720;
  }
  update(dt, world) {
    // METAL crates cannot be pushed -- only the magnet moves them (keeps the iman useful)
    if (this.metal) { this.vx = 0; this.vy = 0; return; }
    const p = world.player;
    // push based on INPUT intent (collision zeroes player vx, so vx can't be used)
    if (p.onGround && !p.dead) {
      const touchR = rectsOverlap(p.x, p.y + 2, p.w + 3, p.h - 5, this.x, this.y, this.w, this.h) && (p.x + p.w / 2) < (this.x + this.w / 2);
      const touchL = rectsOverlap(p.x - 3, p.y + 2, p.w + 3, p.h - 5, this.x, this.y, this.w, this.h) && (p.x + p.w / 2) > (this.x + this.w / 2);
      if (touchR && Input.down('right')) this.vx = 46;
      else if (touchL && Input.down('left')) this.vx = -46;
    }
    this.vy = Math.min(this.vy + this.gravity * dt, 420);
    moveActor(this, world.map, dt);
    this.vx *= 0.55;
    if (Math.abs(this.vx) < 3) this.vx = 0;
  }
  get solidRect() { return { x: this.x, y: this.y, w: this.w, h: this.h, ref: this }; }
  render(ctx, cam) {
    const sx = Math.round(this.x - cam.renderX), sy = Math.round(this.y - cam.renderY);
    px(ctx, sx, sy, this.w, this.h, this.metal ? '#5b6270' : '#7a5a36');
    px(ctx, sx, sy, this.w, 2, this.metal ? '#7a828f' : '#96703f');
    px(ctx, sx + 2, sy + 2, this.w - 4, this.h - 4, this.metal ? '#464c58' : '#654a2c');
    if (this.metal) { px(ctx, sx + 2, sy + 2, 2, 2, '#9aa'); px(ctx, sx + this.w - 4, sy + this.h - 4, 2, 2, '#9aa'); }
  }
}

/* ---------------- MAGNET NODE (uses "iman") ---------------- */
export class Magnet extends PuzzleEl {
  constructor(o, ts) {
    super(o, ts);
    this.w = ts; this.h = ts;
    this.crateTag = o.crate;
    this.snapTx = o.snapTx; this.snapTy = o.snapTy;
    this.used = false;
    this.pulse = 0;
  }
  update(dt) { this.pulse += dt; }
  canInteract(world) { return !this.used && world.inventory.has('iman'); }
  interact(world) {
    const c = world.crates.find((k) => k.tag === this.crateTag);
    if (!c) { world.toast('No hay nada metálico que atraer'); return; }
    c.x = this.snapTx * this.ts;
    c.y = this.snapTy * this.ts;
    c.vx = 0; c.vy = 0;
    this.used = true;
    if (this.id) { world.signals[this.id] = true; world.markProgress('magnet:' + this.id, true); }
    world.audio.sfx('light');
    world.particles.burst(c.x + 8, c.y + 8, 16, { color: '#4a90d9', speed: 90, life: 0.5, glow: true });
    world.toast('El imán arrastra el objeto metálico');
  }
  render(ctx, cam) {
    const sx = this.x - cam.renderX, sy = this.y - cam.renderY;
    px(ctx, sx + 3, sy + 2, 4, 8, '#d64b3a');
    px(ctx, sx + 9, sy + 2, 4, 8, '#4a90d9');
    px(ctx, sx + 3, sy + 9, 10, 4, '#888');
    if (!this.used) {
      ctx.globalAlpha = 0.3 + Math.sin(this.pulse * 5) * 0.2;
      ctx.strokeStyle = '#8fb8ff';
      ctx.strokeRect(sx + 1.5, sy + 1.5, this.w - 3, this.h - 3);
      ctx.globalAlpha = 1;
    }
  }
}

/* ---------------- ROPE ANCHOR (uses "cuerda") ---------------- */
export class Rope extends PuzzleEl {
  constructor(o, ts) {
    super(o, ts);
    this.w = ts; this.h = ts;
    this.len = o.len || 3;
    this.horizontal = !!o.horizontal;
    this.done = !!o.done;
    this._solids = [];
    if (this.done) this._build();
  }
  _build() {
    this._solids = [];
    for (let i = 0; i < this.len; i++) {
      if (this.horizontal) {
        // plank flush with the ground surface (anchor sits at ground row)
        this._solids.push({ x: this.x + i * this.ts, y: this.y + this.ts - 2, w: this.ts, h: 6 });
      } else {
        this._solids.push({ x: this.x + this.ts / 2 - 3, y: this.y + (i + 1) * this.ts, w: 6, h: this.ts });
      }
    }
  }
  update(dt, world) { if (this.done && this.id) world.signals[this.id] = true; }
  get extraSolids() { return this.done ? this._solids : null; }
  canInteract(world) { return !this.done && world.inventory.has('cuerda'); }
  interact(world) {
    world.inventory.use('cuerda');
    this.done = true;
    this._build();
    world.audio.sfx('interact');
    if (this.id) { world.signals[this.id] = true; world.markProgress('rope:' + this.id, true); }
    world.toast('Tiendes la cuerda');
  }
  render(ctx, cam) {
    const sx = this.x - cam.renderX, sy = this.y - cam.renderY;
    px(ctx, sx + this.ts / 2 - 2, sy + 2, 4, 4, '#33383f'); // anchor ring
    if (this.done) {
      ctx.strokeStyle = '#c9a06a';
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (this.horizontal) { ctx.moveTo(sx + this.ts / 2, sy + this.ts - 2); ctx.lineTo(sx + this.ts / 2 + this.len * this.ts, sy + this.ts - 2); }
      else { ctx.moveTo(sx + this.ts / 2, sy + 4); ctx.lineTo(sx + this.ts / 2, sy + 4 + this.len * this.ts); }
      ctx.stroke();
    }
  }
}

/* ---------------- LIGHT NODE (memory light, uses "bombilla") ---------------- */
export class LightNode extends PuzzleEl {
  constructor(o, ts) {
    super(o, ts);
    this.w = ts; this.h = ts;
    this.lit = !!o.lit;
    this.memory = !!o.memory;
    this.dialogue = o.dialogue || null;
    this.said = false;
    this.pulse = Math.random() * 6;
  }
  update(dt, world) {
    this.pulse += dt;
    if (this.lit && this.id) world.signals[this.id] = true;
  }
  canInteract(world) { return !this.lit && world.inventory.has('bombilla'); }
  interact(world) {
    world.inventory.use('bombilla');
    this.lit = true;
    if (this.id) world.markProgress('lit:' + this.id, true);
    world.audio.sfx('light');
    if (world.announceLantern) world.announceLantern();
    // a SOFT, see-through pool of light -- shapes stay visible through it
    world.addLight(this.x + this.ts / 2, this.y + this.ts / 2 - 4, 58, 'rgba(255,223,154,0.9)', true);
    world.particles.burst(this.x + 8, this.y + 6, 18, { color: '#ffdf9a', speed: 70, life: 0.7, glow: true, gravity: -18 });
    if (this.memory) {
      world.save.data.memories = (world.save.data.memories || 0) + 1;
      world.toast('Un recuerdo vuelve a brillar  (' + world.save.data.memories + ')');
    }
    if (this.dialogue && !this.said) { this.said = true; world.startDialogue(this.dialogue); }
    if (this.id) world.signals[this.id] = true;
  }
  render(ctx, cam) {
    // a proper little pedestal lantern instead of a smear
    const sx = this.x - cam.renderX + this.ts / 2;
    const sy = this.y - cam.renderY + this.ts / 2;
    px(ctx, sx - 3, sy + 5, 6, 3, '#2b2f39');   // pedestal base
    px(ctx, sx - 1, sy + 3, 2, 3, '#3a3f4b');   // stem
    drawLantern(ctx, sx, sy - 1, this.lit, this.pulse);
  }
}

/* ---------------- SEQUENCE (press buttons in order) ---------------- */
export class Sequence extends PuzzleEl {
  constructor(o, ts) {
    super(o, ts);
    this.order = o.order || [];       // list of button signal ids
    this.progress = 0;
    this.solved = false;
    this._prev = {};
  }
  update(dt, world) {
    if (this.solved) { if (this.id) world.signals[this.id] = true; return; }
    for (const bid of this.order) {
      const now = !!world.signals[bid];
      if (now && !this._prev[bid]) {
        // a button was just pressed
        if (bid === this.order[this.progress]) {
          this.progress++;
          world.audio.sfx('confirm');
          if (this.progress >= this.order.length) {
            this.solved = true;
            if (this.id) world.markProgress('seq:' + this.id, true);
            world.toast('Secuencia correcta');
            world.audio.sfx('checkpoint');
          }
        } else if (this.progress > 0) {
          this.progress = 0;
          world.audio.sfx('cancel');
          world.toast('Secuencia reiniciada');
        }
      }
      this._prev[bid] = now;
    }
    if (this.id) world.signals[this.id] = this.solved;
  }
  render() {}
}

/* ---------------- factory ---------------- */
const REGISTRY = { button: Button, lever: Lever, door: Door, platform: Platform, crate: Crate, magnet: Magnet, rope: Rope, lightnode: LightNode, sequence: Sequence };

export function makePuzzle(def, ts) {
  const C = REGISTRY[def.type];
  if (!C) { console.warn('unknown puzzle type', def.type); return null; }
  return new C(def, ts);
}
