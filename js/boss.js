/* ============================================================
   boss.js  -  EL FAROLERO  (final boss, Bowser-style)

   He FLIES high, out of reach, spitting life-draining light
   orbs and spawning random adds (Sombra / Cuervo / Devorador /
   Guardian). Every few seconds he SWOOPS DOWN and sweeps across
   the arena floor -- that low pass is the ONLY window to hit
   him (melee, or land on his head).  Getting hit knocks him
   straight back up.  3 phases (by HP): each one swoops sooner,
   throws denser orb patterns and keeps more adds alive.
   ============================================================ */
import { rectsOverlap } from './collision.js';
import { clamp, choice } from './utils.js';
import { drawFarolero } from './sprites.js';
import { Projectile, Pickup } from './items.js';
import { Sombra, Cuervo, Devorador, Guardian } from './enemies.js';

export class Farolero {
  constructor(x, y, world) {
    this.x = x; this.y = y;
    this.w = 34; this.h = 40;
    this.vx = 0; this.vy = 0;
    this.world = world;

    const mul = (world && world.diff && world.diff.bossHpMul) || 1;
    this.spdMul = (world && world.diff && world.diff.enemySpeed) || 1;
    this.maxHp = Math.max(6, Math.round(9 * mul));
    this.hp = this.maxHp;
    this.dead = false;
    this.deadT = 0;

    this.hitFlash = 0;
    this.invuln = 0;
    this.vulnerable = false;

    this.t = 0;
    this.animT = 0;
    this.frame = 0;
    this.facing = -1;

    this.arena = world.bossArena || { x: x - 150, y: y - 40, w: 320, h: 200 };
    this.hoverY = this.arena.y + 12;
    this.lowY = this.arena.y + this.arena.h - this.h - 6;

    this.state = 'intro';
    this.stateT = 1.4;
    this.swoopCd = 3.0;
    this.orbCd = 2.0;
    this.addCd = 3.0;
    this.telegraph = 0;
    this.sweepDir = 1;
    this.lataCd = 10;   // Pesadilla only: a rare lata so you're never out of ammo vs the boss
  }

  get phase() { return this.hp > this.maxHp * 0.66 ? 1 : this.hp > this.maxHp * 0.33 ? 2 : 3; }
  rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  /* legacy hook (old lantern-shield design) -- now a no-op */
  onLanternLit() {}

  hurt(dmg, fromX, world) {
    if (this.dead || this.invuln > 0) return;
    if (!this.vulnerable) {
      world.particles.burst(this.x + this.w / 2, this.y + this.h / 2, 5, { color: '#8fb8ff', speed: 45, life: 0.25 });
      world.audio.sfx('cancel');
      return;
    }
    const prevPhase = this.phase;
    this.hp -= dmg;
    this.hitFlash = 0.16;
    this.invuln = 0.5;
    world.audio.sfx('bossHit');
    world.camera.shake(4, 0.25);
    world.particles.burst(this.x + this.w / 2, this.y + this.h / 2, 12, { color: '#f4c542', speed: 100, life: 0.45, glow: true });

    // knocked straight back up
    this.vulnerable = false;
    this.state = 'rise';
    this.stateT = 0;
    this.vy = -140;

    if (this.hp <= 0) { this.die(world); return; }
    if (this.phase !== prevPhase) {
      world.toast('El Farolero  ·  Fase ' + this.phase);
      world.audio.sfx('boss');
      world.camera.shake(6, 0.5);
      this.telegraph = 0;
      this.swoopCd = 1.5;
      // Pesadilla: the phase you just reached becomes a checkpoint -- dying
      // now resumes the fight here instead of a full reset back to phase 1.
      if (world.diff && world.diff.key === 'nightmare' && world.markProgress) {
        world.markProgress('bossHpCheckpoint', this.hp);
      }
    }
  }

  die(world) {
    this.dead = true;
    this.deadT = 0;
    this.vulnerable = false;
    world.audio.sfx('explode');
    world.camera.shake(8, 1.2);
    world.particles.burst(this.x + this.w / 2, this.y + this.h / 2, 60, { color: '#f4c542', speed: 150, life: 1.2, glow: true, gravity: 20 });
    world.onBossDefeated();
  }

  update(dt, world) {
    this.t += dt; this.animT += dt;
    this.frame = Math.floor(this.animT * 10);
    if (this.hitFlash > 0) this.hitFlash -= dt;
    if (this.invuln > 0) this.invuln -= dt;
    if (this.telegraph > 0) this.telegraph -= dt;

    if (this.dead) { this.deadT += dt; this.y += 10 * dt; return; }

    const p = world.player;
    this.facing = Math.sign((p.x + p.w / 2) - (this.x + this.w / 2)) || this.facing;

    // contact
    if (!p.dead && rectsOverlap(this.x, this.y + 4, this.w, this.h - 4, p.x, p.y, p.w, p.h)) {
      const prevFeet = p.y + p.h - p.vy * dt;
      if (p.isParrying && p.isParrying()) {
        p.parrySuccess(null, world);
      } else if (this.vulnerable && p.vy > 12 && prevFeet <= this.y + 12) {
        // land on the Farolero's head while he's down -> a hit + bounce
        // (the boss is meleeable even in Pesadilla)
        this.hurt(1, p.x + p.w / 2, world);
        p.vy = -210;
        p.usedDouble = false;
        p.coyote = 0;
        p.invuln = Math.max(p.invuln, 0.2);
        world.audio.sfx('land');
      } else if (p.hurt((world.diff && world.diff.instaKillTouch) ? p.maxHp : 2, this.x + this.w / 2)) {
        world.camera.shake(3, 0.2);
      }
    }

    const axL = this.arena.x + 12;
    const axR = this.arena.x + this.arena.w - this.w - 12;

    switch (this.state) {
      case 'intro':
        this.stateT -= dt;
        this.y = this.hoverY + Math.sin(this.t * 2) * 3;
        this.x = clamp(this.x, axL, axR);
        if (this.stateT <= 0) { this.state = 'hover'; this.swoopCd = 2.4; }
        break;

      case 'hover': {
        const tx = clamp(p.x + p.w / 2 - this.w / 2, axL + 6, axR - 6);
        this.x += (tx - this.x) * Math.min(1, dt * 1.2);
        this.y = this.hoverY + Math.sin(this.t * 1.8) * 6;

        this.orbCd -= dt;
        if (this.orbCd <= 0) { this._orbs(world, p); this.orbCd = [2.5, 1.9, 1.4][this.phase - 1] / this.spdMul; }

        this.addCd -= dt;
        const alive = world.enemies.filter((e) => !e.dead).length;
        if (this.addCd <= 0 && alive < this.phase + 1) {
          this._spawnAdd(world);
          this.addCd = [6, 4.5, 3.4][this.phase - 1];
        }

        // Pesadilla: J does no damage to regular enemies, so throwing latas at
        // the boss is Riko's main ranged option -- keep a trickle available
        // without flooding the arena with pickups.
        if (world.diff && world.diff.bossLataAssist) {
          this.lataCd -= dt;
          if (this.lataCd <= 0 && !world.pickups.some((pk) => pk.type === 'lata' && !pk.taken)) {
            this.lataCd = 20;
            const fx = clamp(p.x + (Math.random() < 0.5 ? -36 : 36), this.arena.x + 14, this.arena.x + this.arena.w - 14);
            world.pickups.push(new Pickup('lata', fx, this.arena.y + 18));
          }
        }

        this.swoopCd -= dt;
        if (this.swoopCd <= 0.6 && this.telegraph <= 0) { this.telegraph = 0.6; world.audio.sfx('boss'); }
        if (this.swoopCd <= 0) {
          this.state = 'swoop';
          this.sweepDir = (p.x + p.w / 2) < (this.x + this.w / 2) ? 1 : -1;
          this.x = this.sweepDir > 0 ? axL : axR;
        }
        break;
      }

      case 'swoop': {
        this.vulnerable = true;
        this.y += (this.lowY - this.y) * Math.min(1, dt * 3.2);
        const speed = [72, 90, 110][this.phase - 1] * this.spdMul;
        this.x += this.sweepDir * speed * dt;
        if (Math.random() < 0.4) {
          world.particles.burst(this.x + this.w / 2, this.y + this.h - 4, 2, { color: '#ffcf6e', speed: 30, life: 0.4, glow: true });
        }
        if ((this.sweepDir > 0 && this.x >= axR) || (this.sweepDir < 0 && this.x <= axL)) {
          this.x = clamp(this.x, axL, axR);
          this.state = 'rise';
          this.stateT = 0;
        }
        break;
      }

      case 'rise': {
        this.stateT += dt;
        this.vulnerable = this.stateT < 0.35;   // small grace: you can still punish on the way up
        this.y += (this.hoverY - this.y) * Math.min(1, dt * 4);
        const tx = clamp(p.x, axL, axR);
        this.x += (tx - this.x) * Math.min(1, dt * 0.8);
        if (Math.abs(this.y - this.hoverY) < 3) {
          this.state = 'hover';
          this.vulnerable = false;
          this.swoopCd = [4.4, 3.3, 2.5][this.phase - 1] / this.spdMul;
          this.orbCd = Math.min(this.orbCd, 0.8);
        }
        break;
      }
    }
  }

  _orbs(world, p) {
    const ph = this.phase;
    const cx = this.x + this.w / 2, cy = this.y + this.h / 2;
    const om = (world.diff && world.diff.orbMul) || 1;
    const N = (n) => Math.max(3, Math.round(n * om));
    const O = (o) => world.addProjectile(new Projectile(Object.assign({ friendly: false, dmg: 1, type: 'orb', life: 2.6, gravity: 0 }, o)));
    if (ph === 1) {
      const n = N(6);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + this.t;
        O({ x: cx, y: cy, vx: Math.cos(a) * 85, vy: Math.sin(a) * 85, color: '#ffe08a' });
      }
    } else if (ph === 2) {
      const ang = Math.atan2(p.y - cy, p.x - cx);
      const spread = om > 1.4 ? [-0.4, -0.22, 0, 0.22, 0.4] : [-0.22, 0, 0.22];
      for (const off of spread) {
        O({ x: cx, y: cy, vx: Math.cos(ang + off) * 150, vy: Math.sin(ang + off) * 150, gravity: 18, color: '#8fb8ff', life: 3 });
      }
      const n = N(8);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + this.t * 0.7;
        O({ x: cx, y: cy, vx: Math.cos(a) * 70, vy: Math.sin(a) * 70, color: '#ffe08a', life: 2.4 });
      }
    } else {
      const ang = Math.atan2(p.y - cy, p.x - cx);
      const k1 = N(5);
      for (let k = 0; k < k1; k++) {
        O({ x: cx, y: cy, vx: Math.cos(ang) * (120 + k * 14), vy: Math.sin(ang) * (120 + k * 14) - 15, gravity: 30, color: '#ff9a5c' });
      }
      const n = N(10);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2;
        O({ x: cx, y: cy, vx: Math.cos(a) * 100, vy: Math.sin(a) * 100, color: '#ffe08a', life: 2 });
      }
    }
    world.audio.sfx('light');
  }

  _spawnAdd(world) {
    const k = choice(['sombra', 'cuervo', 'devorador', 'guardian']);
    // keep reinforcements away from Riko -- never drop one on top of / right
    // in front of the player. Retry a few random spots, then fall back to
    // whichever arena edge is currently farthest from him.
    const minX = this.arena.x + 20;
    const maxX = this.arena.x + this.arena.w - 20;
    const p = world.player;
    const minDist = 60;
    let fx = minX + Math.random() * (maxX - minX);
    for (let tries = 0; tries < 8 && Math.abs(fx - p.cx) < minDist; tries++) {
      fx = minX + Math.random() * (maxX - minX);
    }
    if (Math.abs(fx - p.cx) < minDist) {
      fx = (p.cx - minX < maxX - p.cx) ? maxX : minX;
    }
    const floorY = this.arena.y + this.arena.h;
    let e;
    if (k === 'sombra') e = new Sombra({ type: 'sombra', x: fx, y: floorY - 30, hp: 2 });
    else if (k === 'cuervo') e = new Cuervo({ type: 'cuervo', x: fx, y: this.arena.y + 22, hp: 2 });
    else if (k === 'devorador') e = new Devorador({ type: 'devorador', x: fx, y: floorY - 30, hp: 3 });
    else e = new Guardian({ type: 'guardian', x: fx, y: floorY - 34, hp: 3 });
    e.aggro = true;
    world.enemies.push(e);
    world.particles.burst(fx + 6, floorY - 20, 12, { color: '#6b4a8a', speed: 60, life: 0.5, glow: true });
  }

  render(ctx, cam) {
    const sx = Math.round(this.x - cam.renderX);
    const sy = Math.round(this.y - cam.renderY);

    if (this.telegraph > 0 && Math.floor(this.telegraph * 12) % 2 === 0) {
      ctx.save();
      ctx.globalAlpha = 0.5;
      ctx.strokeStyle = '#ff9a5c';
      ctx.lineWidth = 2;
      ctx.strokeRect(sx - 3, sy - 3, this.w + 6, this.h + 6);
      ctx.restore();
    }

    if (this.vulnerable && !this.dead) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.globalAlpha = 0.22 + Math.sin(this.t * 20) * 0.1;
      ctx.fillStyle = '#f4c542';
      ctx.beginPath(); ctx.arc(sx + this.w / 2, sy + this.h / 2, this.w * 0.7, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    } else if (!this.dead && this.state !== 'intro') {
      ctx.save();
      ctx.globalAlpha = 0.16 + Math.sin(this.t * 4) * 0.06;
      ctx.strokeStyle = '#8fb8ff';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(sx + this.w / 2, sy + this.h / 2, this.w * 0.78, 0, Math.PI * 2); ctx.stroke();
      ctx.restore();
    }

    drawFarolero(ctx, sx, sy, this.w, this.h, this.facing, this.frame, this.phase, this.hitFlash > 0, this.vulnerable);
  }
}
