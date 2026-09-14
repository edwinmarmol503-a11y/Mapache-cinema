/* ============================================================
   enemies.js  -  reusable Enemy base + 4 behaviours:
   SOMBRA  (fast ground stalker, lunges)
   CUERVO  (aerial, hovers + swoops, throws feathers)
   DEVORADOR (heavy ground, charges / short hops)
   GUARDIAN (slow, ranged orbs + ground slam)
   ============================================================ */
import { moveActor, wallAhead, ledgeAhead } from './physics.js';
import { rectsOverlap } from './collision.js';
import { dist, clamp } from './utils.js';
import { drawSombra, drawCuervo, drawDevorador, drawGuardian } from './sprites.js';
import { Projectile } from './items.js';

class Enemy {
  constructor(o) {
    this.type = o.type;
    this.x = o.x; this.y = o.y;
    this.w = o.w || 12; this.h = o.h || 12;
    this.vx = 0; this.vy = 0;
    this.hp = o.hp || 2;
    this.maxHp = this.hp;
    this.dmg = o.dmg || 1;
    this.facing = o.dir || -1;
    this.gravity = o.gravity == null ? 720 : o.gravity;
    this.flying = !!o.flying;
    this.dead = false;
    this.deadT = 0;
    this.hitFlash = 0;
    this.invuln = 0;
    this.aggro = false;
    this.homeX = this.x; this.homeY = this.y;
    this.attackCd = 0;
    this.stunT = 0;             // set by a successful player parry
    this.speedMul = 1;         // difficulty scaling
    this.state = 'idle';
    this.animT = 0;
    this.frame = 0;
    this.detectRange = o.detectRange || 90;
    this.riding = null;
    this.deathColor = '#a78bfa';
  }

  rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  hurt(dmg, fromX, world) {
    if (this.dead || this.invuln > 0) return;
    this.hp -= dmg;
    this.hitFlash = 0.22;
    this.invuln = 0.14;
    this.aggro = true;
    const dir = Math.sign(this.x + this.w / 2 - fromX) || 1;
    this.vx = dir * 165;
    if (!this.flying) this.vy = -130;
    world.particles.burst(this.x + this.w / 2, this.y + this.h / 2, 12, { color: '#ffe08a', speed: 110, life: 0.35, glow: true });
    world.particles.burst(this.x + this.w / 2, this.y + this.h / 2, 6, { color: '#fff', speed: 60, life: 0.2 });
    world.audio.sfx('hit');
    if (this.hp <= 0) this.die(world);
  }

  die(world) {
    this.dead = true;
    this.deadT = 0;
    this.state = 'death';
    world.particles.burst(this.x + this.w / 2, this.y + this.h / 2, 16, { color: this.deathColor, speed: 90, life: 0.55, glow: true });
    world.audio.sfx('hit');
    world.onEnemyKilled(this);
  }

  _base(dt, world) {
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.attackCd > 0) this.attackCd -= dt;
    this.animT += dt;
    if (this.dead) {
      this.deadT += dt;
      if (!this.flying) { this.vy += this.gravity * dt; }
      this.vx *= 0.9;
      moveActor(this, world.map, dt);
      return true;
    }
    if (this.stunT > 0) {
      this.stunT -= dt;
      if (!this.flying) this.vy += this.gravity * dt;
      this.vx *= 0.86;
      if (this.flying) this.vy *= 0.86;
      moveActor(this, world.map, dt);
      return true;                 // skip AI + no contact damage while stunned
    }
    return false;
  }

  _touch(world, dt) {
    if (this.dead || this.stunT > 0) return;
    const p = world.player;
    if (p.dead) return;
    if (!rectsOverlap(this.x, this.y, this.w, this.h, p.x, p.y, p.w, p.h)) return;

    // parry beats everything
    if (p.isParrying && p.isParrying()) { p.parrySuccess(this, world); return; }

    // STOMP: Riko was above the enemy last frame and is dropping onto it.
    // -> enemy loses 1 life, Riko takes 0 damage and bounces.
    const prevFeet = p.y + p.h - p.vy * (dt || 1 / 60);
    const wasAbove = prevFeet <= this.y + this.h * 0.7;
    const centreAbove = (p.y + p.h * 0.5) < (this.y + this.h * 0.5);
    if (p.vy > 12 && (wasAbove || centreAbove)) {
      if (!world.meleeDisabled) this.hurt(1, this.x + this.w / 2, world);  // Pesadilla: bounce only
      p.vy = -190;
      p.usedDouble = false;            // allow an air-jump off the bounce
      p.coyote = 0;
      p.invuln = Math.max(p.invuln, 0.12);
      world.camera.shake(2, 0.12);
      world.particles.burst(p.cx, p.y + p.h, 7, { color: '#cbd5e1', speed: 55, life: 0.25, gravity: 40 });
      world.audio.sfx('land');
      return;
    }

    // otherwise it's a hit on Riko
    if (p.hurt(this.dmg, this.x + this.w / 2)) world.camera.shake(3, 0.2);
  }

  render(ctx, cam) {
    const sx = Math.round(this.x - cam.renderX);
    const sy = Math.round(this.y - cam.renderY);
    ctx.save();
    if (this.dead) ctx.globalAlpha = Math.max(0, 1 - this.deadT / 0.55);
    const flash = this.hitFlash > 0;
    this.draw(ctx, sx, sy, flash);
    ctx.restore();
    if (this.aggro && !this.dead && this.maxHp > 1) {
      for (let i = 0; i < this.maxHp; i++) {
        ctx.fillStyle = i < this.hp ? '#ff5a5a' : '#3a2030';
        ctx.fillRect(sx + i * 3, sy - 4, 2, 2);
      }
    }
    if (this.stunT > 0 && !this.dead) {
      ctx.fillStyle = '#9fe8ff';
      const t = performance.now() / 90;
      for (let i = 0; i < 3; i++) {
        const a = t + i * 2.1;
        ctx.fillRect(sx + this.w / 2 + Math.cos(a) * 6 - 1, sy - 7 + Math.sin(a) * 2, 2, 2);
      }
    }
  }
}

/* ------------------------------------------------ SOMBRA ---- */
export class Sombra extends Enemy {
  constructor(o) {
    super({ ...o, w: 12, h: 12, hp: o.hp || 2, dmg: 1, detectRange: 110 });
    this.speed = 46;
    this.lungeT = 0;
    this.deathColor = '#7c5cbf';
  }
  update(dt, world) {
    if (this._base(dt, world)) return;
    const p = world.player;
    const d = dist(this.x, this.y, p.x, p.y);
    if (d < this.detectRange) this.aggro = true;

    if (this.lungeT > 0) {
      this.lungeT -= dt;
      // keep momentum
    } else if (this.aggro && !p.dead) {
      const dir = Math.sign(p.x - this.x) || this.facing;
      this.facing = dir;
      this.vx = dir * this.speed;
      if (wallAhead(this, world.map) || ledgeAhead(this, world.map)) this.vx = 0;
      if (this.attackCd <= 0 && d < 46 && Math.abs(p.y - this.y) < 20) {
        this.lungeT = 0.32;
        this.attackCd = 1.4;
        this.vx = dir * 190;
        if (this.onGround) this.vy = -90;
        world.particles.burst(this.x + 6, this.y + 6, 6, { color: '#4b2f7a', speed: 50, life: 0.3 });
      }
    } else {
      // idle drift / patrol
      this.vx = this.facing * this.speed * 0.4;
      if (wallAhead(this, world.map) || ledgeAhead(this, world.map)) this.facing *= -1;
    }

    this.vy = Math.min(this.vy + this.gravity * dt, 340);
    this.vx *= this.lungeT > 0 ? 0.99 : 0.8;
    moveActor(this, world.map, dt);
    this._touch(world, dt);
    this.frame = Math.floor(this.animT * 8);
  }
  draw(ctx, sx, sy, flash) { drawSombra(ctx, sx, sy, this.w, this.h, this.facing, this.frame, flash); }
}

/* ------------------------------------------------ CUERVO ---- */
export class Cuervo extends Enemy {
  constructor(o) {
    super({ ...o, w: 14, h: 12, hp: o.hp || 2, dmg: 1, flying: true, gravity: 0, detectRange: 140 });
    this.baseY = this.y;
    this.t = Math.random() * 6;
    this.swoopT = 0;
    this.deathColor = '#3c4a6b';
  }
  update(dt, world) {
    if (this._base(dt, world)) return;
    this.t += dt;
    const p = world.player;
    const d = dist(this.x, this.y, p.x, p.y);
    if (d < this.detectRange) this.aggro = true;

    if (this.swoopT > 0) {
      this.swoopT -= dt;
      // dive toward remembered point
      this.vx += (this._tx - this.x) * dt * 3;
      this.vy += (this._ty - this.y) * dt * 3;
      this.vx = clamp(this.vx, -180, 180);
      this.vy = clamp(this.vy, -180, 180);
      if (this.swoopT <= 0) { this.vy = -60; }
    } else if (this.aggro && !p.dead) {
      const dir = Math.sign(p.x - this.x) || this.facing;
      this.facing = dir;
      this.vx += dir * 60 * dt;
      this.vx = clamp(this.vx, -70, 70);
      // hover above player
      const targetY = p.y - 46 + Math.sin(this.t * 2) * 8;
      this.vy += Math.sign(targetY - this.y) * 90 * dt;
      this.vy = clamp(this.vy, -70, 70);
      if (this.attackCd <= 0) {
        this.attackCd = 2.0 + Math.random();
        if (d < 120 && Math.random() < 0.55) {
          this.swoopT = 0.55;
          this._tx = p.x; this._ty = p.y;
        } else {
          world.addProjectile(new Projectile({
            x: this.x + 4, y: this.y + 6,
            vx: dir * 150, vy: 20, gravity: 60,
            friendly: false, dmg: 1, type: 'feather', color: '#2c3550', life: 3, hitTiles: true,
          }));
        }
      }
    } else {
      this.vx = Math.sin(this.t) * 30;
      this.vy = Math.sin(this.t * 1.7) * 20 + Math.sign(this.baseY - this.y) * 40 * dt;
    }

    // integrate (no tile collide except stop at solids)
    const m = world.map;
    const sm = this.speedMul || 1;
    let nx = this.x + this.vx * sm * dt;
    let ny = this.y + this.vy * sm * dt;
    if (m.isSolidTile(Math.floor((nx + this.w / 2) / m.ts), Math.floor((this.y + this.h / 2) / m.ts))) { this.vx = -this.vx * 0.5; nx = this.x; }
    if (m.isSolidTile(Math.floor((this.x + this.w / 2) / m.ts), Math.floor((ny + this.h / 2) / m.ts))) { this.vy = -this.vy * 0.5; ny = this.y; }
    this.x = nx; this.y = ny;
    this.vx *= 0.98;

    this._touch(world, dt);
    this.frame = Math.floor(this.animT * 12);
  }
  draw(ctx, sx, sy, flash) { drawCuervo(ctx, sx, sy, this.w, this.h, this.facing, this.frame, flash); }
}

/* ---------------------------------------------- DEVORADOR ---- */
export class Devorador extends Enemy {
  constructor(o) {
    super({ ...o, w: 20, h: 14, hp: o.hp || 3, dmg: 2, detectRange: 120 });
    this.speed = 34;
    this.chargeT = 0;
    this.deathColor = '#5a4070';
  }
  update(dt, world) {
    if (this._base(dt, world)) return;
    const p = world.player;
    const d = dist(this.x, this.y, p.x, p.y);
    if (d < this.detectRange) this.aggro = true;

    if (this.chargeT > 0) {
      this.chargeT -= dt;
      this.vx = this.facing * 150 * (this.speedMul || 1);
      if (wallAhead(this, world.map)) { this.chargeT = 0; world.camera.shake(4, 0.25); this.vx = 0; }
    } else if (this.aggro && !p.dead) {
      const dir = Math.sign(p.x - this.x) || this.facing;
      this.facing = dir;
      this.vx = dir * this.speed;
      if (ledgeAhead(this, world.map) && this.onGround) { this.vx = 0; }
      if (this.attackCd <= 0 && Math.abs(p.y - this.y) < 24) {
        if (d < 90 && d > 24) { this.chargeT = 0.7; this.attackCd = 2.2; }
        else if (d <= 40 && this.onGround) { this.vy = -220; this.vx = dir * 90; this.attackCd = 1.8; }
      }
    } else {
      this.vx = this.facing * this.speed * 0.5;
      if (wallAhead(this, world.map) || ledgeAhead(this, world.map)) this.facing *= -1;
    }

    this.vy = Math.min(this.vy + this.gravity * dt, 360);
    moveActor(this, world.map, dt);
    if (this.onGround && Math.abs(this.vx) > 100) world.particles.burst(this.x + (this.facing > 0 ? 0 : this.w), this.y + this.h, 3, { color: '#3b2b4a', speed: 30, life: 0.3 });
    this._touch(world, dt);
    this.frame = Math.floor(this.animT * 8);
  }
  draw(ctx, sx, sy, flash) { drawDevorador(ctx, sx, sy, this.w, this.h, this.facing, this.frame, flash); }
}

/* ---------------------------------------------- GUARDIAN ---- */
export class Guardian extends Enemy {
  constructor(o) {
    super({ ...o, w: 16, h: 20, hp: o.hp || 3, dmg: 2, detectRange: 150 });
    this.speed = 18;
    this.slamT = 0;
    this.charging = 0;
    this.deathColor = '#6b7280';
  }
  update(dt, world) {
    if (this._base(dt, world)) return;
    const p = world.player;
    const d = dist(this.x, this.y, p.x, p.y);
    if (d < this.detectRange) this.aggro = true;
    if (this.charging > 0) this.charging -= dt;

    if (this.slamT > 0) {
      this.slamT -= dt;
      this.vx = 0;
      if (this.slamT <= 0) {
        // shockwave
        world.camera.shake(6, 0.35);
        world.audio.sfx('explode');
        for (const sgn of [-1, 1]) {
          world.addProjectile(new Projectile({
            x: this.x + this.w / 2, y: this.y + this.h - 4,
            vx: sgn * 120, vy: 0, gravity: 0,
            friendly: false, dmg: 2, type: 'orb', color: '#ff9a5c', life: 0.7, hitTiles: true,
          }));
        }
        world.particles.burst(this.x + this.w / 2, this.y + this.h, 20, { color: '#8a6a3a', speed: 90, life: 0.5 });
      }
    } else if (this.aggro && !p.dead) {
      const dir = Math.sign(p.x - this.x) || this.facing;
      this.facing = dir;
      if (d > 60) { this.vx = dir * this.speed; if (wallAhead(this, world.map) || ledgeAhead(this, world.map)) this.vx = 0; }
      else this.vx = 0;
      if (this.attackCd <= 0) {
        if (d < 40) { this.slamT = 0.55; this.charging = 0.55; this.attackCd = 2.6; }
        else {
          this.attackCd = 1.9;
          this.charging = 0.3;
          world.addProjectile(new Projectile({
            x: this.x + this.w / 2, y: this.y + 6,
            vx: dir * 120, vy: -30, gravity: 120,
            friendly: false, dmg: 2, type: 'orb', color: '#f4c542', life: 3,
          }));
        }
      }
    } else {
      this.vx = 0;
    }

    this.vy = Math.min(this.vy + this.gravity * dt, 340);
    moveActor(this, world.map, dt);
    this._touch(world, dt);
    this.frame = Math.floor(this.animT * 6);
  }
  draw(ctx, sx, sy, flash) { drawGuardian(ctx, sx, sy, this.w, this.h, this.facing, this.frame, flash, this.charging > 0 || this.slamT > 0); }
}

/* ---------------- factory ---------------- */
const REG = { sombra: Sombra, cuervo: Cuervo, devorador: Devorador, guardian: Guardian };

export function makeEnemy(def, ts, D) {
  const C = REG[def.type];
  if (!C) { console.warn('unknown enemy', def.type); return null; }
  const inst = new C({
    type: def.type,
    x: def.tx * ts,
    y: (def.ty + 1) * ts - (def.type === 'guardian' ? 20 : def.type === 'devorador' ? 14 : 12),
    hp: def.hp,
    dir: def.dir || -1,
  });
  if (def.type === 'cuervo') { inst.y = def.ty * ts; inst.baseY = inst.y; }
  if (D) {
    inst.hp = Math.max(1, inst.hp + (D.enemyHp || 0));
    inst.maxHp = inst.hp;
    inst.dmg = Math.max(1, inst.dmg + (D.enemyDmg || 0));
    inst.speedMul = D.enemySpeed || 1;
    if (typeof inst.speed === 'number') inst.speed *= inst.speedMul;
  }
  return inst;
}
