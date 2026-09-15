/* ============================================================
   player.js  -  Riko: movement, jump, dodge, attack, damage,
   death. Simple platformer physics (gravity / accel / friction
   / coyote time / jump buffer / variable jump height).
   ============================================================ */
import { Input } from './input.js';
import { moveActor } from './physics.js';
import { clamp, dist } from './utils.js';
import { drawRiko } from './sprites.js';
import { Projectile } from './items.js';

export class Player {
  constructor(x, y) {
    this.x = x; this.y = y;
    this.w = 10; this.h = 14;
    this.vx = 0; this.vy = 0;

    this.walkSpeed = 98;
    this.accel = 760;
    this.airAccel = 480;
    this.friction = 800;
    this.jumpForce = 236;   // peak ~2.4 tiles -> 2-tile hops are comfortable
    this.gravity = 720;
    this.maxFall = 340;

    this.facing = 1;
    this.onGround = false;
    this.coyote = 0;
    this.jumpBuffer = 0;
    this.dropThrough = false;
    this.riding = null;
    this.canDoubleJump = true;
    this.usedDouble = false;
    this.airJumpFlash = 0;
    this._airPeakY = y;        // highest point reached since last on ground (fall dmg)
    this.landHard = 0;         // visual: hard-landing squash timer

    this.maxHp = 3;
    this.hp = 3;
    this.invuln = 0;
    this.hurtFlash = 0;
    this.dead = false;
    this.deathT = 0;

    this.attackT = 0;
    this.attackCd = 0;
    this.attackHitT = 0;      // window where the swing hitbox is live
    this._swingId = 0;
    this._canCut = false;     // variable-jump-height cut applies to this jump
    this.dodgeT = 0;
    this.dodgeCd = 0;
    this.throwCd = 0;

    /* perfect parry -- limited resource (3 per level / respawn);
       UNLIMITED in Pesadilla, where the attack button is useless */
    this.maxParry = 3;
    this.parryCharges = 3;
    this.unlimitedParry = false;
    this.parryT = 0;        // active parry window
    this.parryCd = 0;
    this.parryFlash = 0;    // success visual
    this._parryUp = false;  // parry aimed upward (held W / Up)
    this._parryDown = false;// parry aimed downward (held S / Down)

    this.state = 'idle';
    this.animT = 0;
    this.frame = 0;
  }

  get cx() { return this.x + this.w / 2; }
  get cy() { return this.y + this.h / 2; }
  rect() { return { x: this.x, y: this.y, w: this.w, h: this.h }; }

  applySave(s) {
    this.maxHp = s.maxHp || 3;
    this.hp = s.hp || this.maxHp;
  }

  isParrying() { return this.parryT > 0 && (this.unlimitedParry || this.parryCharges > 0) && !this.dead; }

  /** counter one enemy (shared by the direct parry + the AoE sweep) */
  _counter(e, world, up, down, fx) {
    if (!e || e.dead || typeof e.hurt !== 'function') return;
    e.hurt(2, this.cx, world);
    e.stunT = 0.9;
    if (up) { e.vy = -190; e.vx *= 0.3; }
    else if (down) { e.vy = 190; e.vx *= 0.3; }
    else { e.vx = -fx * 175; }
  }

  /** called by an attacker (enemy) / projectile / boss when Riko parries it */
  parrySuccess(attacker, world) {
    if (!this.unlimitedParry) this.parryCharges = Math.max(0, this.parryCharges - 1);
    const up = this._parryUp, down = this._parryDown;
    this.parryT = 0;
    this.parryCd = 0.35;
    this.invuln = Math.max(this.invuln, 0.55);
    this.parryFlash = 0.32;
    world.hitstop(0.09);
    world.camera.shake(4, 0.28);
    world.audio.sfx('parry');
    const fx = attacker
      ? (Math.sign(this.cx - (attacker.x + (attacker.w || 0) / 2)) || -this.facing)
      : -this.facing;
    const bx = up || down ? this.cx : this.cx - fx * 4;
    const by = up ? this.y - 2 : down ? this.y + this.h + 2 : this.cy;
    world.particles.burst(bx, by, 20, { color: '#eaf8ff', speed: 140, life: 0.4, glow: true });
    world.particles.burst(bx, by, 12, { color: '#9fe8ff', speed: 70, life: 0.5 });
    if (up) this.vy = -160;                 // up parry pops Riko up
    else if (down) this.vy = -140;          // down parry -> bounce off whatever is below
    else this.vx = fx * 70;

    // the deflected attacker
    this._counter(attacker, world, up, down, fx);
    // AoE: everything else that was closing in to hit Riko goes down with it
    if (world.enemies) {
      for (const e of world.enemies) {
        if (e === attacker || e.dead || e.stunT > 0) continue;
        if (dist(this.cx, this.cy, e.x + e.w / 2, e.y + e.h / 2) < 26) {
          this._counter(e, world, up, down, Math.sign(this.cx - (e.x + e.w / 2)) || 1);
        }
      }
    }
  }

  hurt(dmg, fromX) {
    if (this.invuln > 0 || this.dead) return false;
    this.hp -= dmg;
    this.hurtFlash = 0.3;
    if (fromX === 'fall') {
      this.invuln = 0.7;
      this.vx *= 0.2;
      this.landHard = 0.25;
    } else {
      this.invuln = 1.2;
      const dir = fromX !== undefined ? (Math.sign(this.x + this.w / 2 - fromX) || 1) : -this.facing;
      this.vx = dir * 140;
      this.vy = -140;
    }
    if (this.hp <= 0) {
      this.hp = 0;
      this.dead = true;
      this.deathT = 0;
      this.state = 'death';
      this.animT = 0;
    }
    return true;
  }

  heal(n) { this.hp = clamp(this.hp + n, 0, this.maxHp); }

  update(dt, world) {
    if (this.dead) {
      this.deathT += dt;
      this.vy = Math.min(this.vy + this.gravity * dt, this.maxFall);
      moveActor(this, world.map, dt);
      this.animT += dt;
      return;
    }

    const wasAir = !this.onGround;

    const left = Input.down('left');
    const right = Input.down('right');
    let move = (right ? 1 : 0) - (left ? 1 : 0);
    if (move !== 0 && this.dodgeT <= 0) this.facing = move;

    /* ---- dodge ---- */
    if (this.dodgeCd > 0) this.dodgeCd -= dt;
    if (this.dodgeT > 0) {
      this.dodgeT -= dt;
      this.invuln = Math.max(this.invuln, 0.06);
      this.vx = this.facing * 210;
    }
    if (Input.justPressed('dodge') && this.dodgeCd <= 0 && this.dodgeT <= 0) {
      this.dodgeT = 0.22; this.dodgeCd = 0.65;
      this.vx = this.facing * 210;
      this.invuln = Math.max(this.invuln, 0.28);
      world.audio.sfx('attack');
      world.particles.burst(this.cx, this.y + this.h, 8, { color: '#9fd3ff', speed: 60, life: 0.3, gravity: 30 });
      if (world.announceDodge) world.announceDodge();
    }

    /* ---- horizontal accel / friction ---- */
    if (this.dodgeT <= 0) {
      const a = this.onGround ? this.accel : this.airAccel;
      if (move !== 0) {
        const target = move * this.walkSpeed;
        if (Math.sign(this.vx) !== move || Math.abs(this.vx) < this.walkSpeed) {
          this.vx += move * a * dt;
          this.vx = clamp(this.vx, -Math.max(this.walkSpeed, Math.abs(this.vx)), Math.max(this.walkSpeed, Math.abs(this.vx)));
          if (Math.sign(this.vx) === move && Math.abs(this.vx) > this.walkSpeed && this._noBoost) this.vx = target;
        }
        if (Math.abs(this.vx) > this.walkSpeed && Math.sign(this.vx) === move && this.onGround) {
          this.vx += (target - this.vx) * Math.min(1, dt * 8);
        }
      } else {
        const f = (this.onGround ? this.friction : this.friction * 0.35) * dt;
        if (Math.abs(this.vx) <= f) this.vx = 0;
        else this.vx -= f * Math.sign(this.vx);
      }
    }

    /* ---- gravity ---- */
    this.vy = Math.min(this.vy + this.gravity * dt, this.maxFall);

    /* ---- jump (coyote + buffer + variable height + double jump) ---- */
    if (this.onGround) { this.coyote = 0.1; this.usedDouble = false; }
    else this.coyote -= dt;
    if (this.airJumpFlash > 0) this.airJumpFlash -= dt;
    if (Input.justPressed('jump')) this.jumpBuffer = 0.12;
    else this.jumpBuffer -= dt;
    this.dropThrough = Input.down('down');

    if (this.jumpBuffer > 0) {
      if (this.coyote > 0) {
        // ground / coyote jump
        this.vy = -this.jumpForce;
        this.jumpBuffer = 0; this.coyote = 0;
        this._canCut = true;
        world.audio.sfx('jump');
        world.particles.burst(this.cx, this.y + this.h, 6, { color: '#cbd5e1', speed: 40, life: 0.25, gravity: 60 });
      } else if (this.canDoubleJump && !this.usedDouble && this.dodgeT <= 0) {
        // second jump -- ~half the peak height of the first (rise ~ force^2)
        this.vy = -this.jumpForce * 0.78;
        this.usedDouble = true;
        this.jumpBuffer = 0;
        this._canCut = false;              // never cut the (already short) air jump
        this.airJumpFlash = 0.26;
        world.audio.sfx('jump2');
        world.particles.burst(this.cx, this.y + this.h - 1, 14, { color: '#9fe8ff', speed: 80, life: 0.35, glow: true });
        world.particles.burst(this.cx, this.y + this.h + 1, 8, { color: '#eaf3ff', speed: 40, life: 0.24 });
      }
    }
    // soft variable-jump-height cut: release early -> keep ~62% of the rise
    if (this._canCut && !Input.down('jump')) {
      const minV = -this.jumpForce * 0.62;
      if (this.vy < minV) this.vy = minV;
      this._canCut = false;
    }
    if (this.onGround) this._canCut = false;

    /* ---- perfect parry ---- */
    if (this.parryCd > 0) this.parryCd -= dt;
    if (this.parryT > 0) this.parryT -= dt;
    if (this.parryFlash > 0) this.parryFlash -= dt;
    if (Input.justPressed('parry') && this.parryCd <= 0 && this.parryT <= 0 && this.dodgeT <= 0) {
      if (this.unlimitedParry || this.parryCharges > 0) {
        this.parryT = 0.22;
        this.parryCd = 0.5;
        this._parryUp = Input.down('up');                       // W / Up -> parry up
        this._parryDown = !this._parryUp && Input.down('down'); // S / Down -> parry down
        world.audio.sfx('parryReady');
        const gx = this._parryUp || this._parryDown ? this.cx - 2 : this.x + (this.facing > 0 ? this.w : 0);
        const gy = this._parryUp ? this.y - 3 : this._parryDown ? this.y + this.h + 1 : this.cy;
        world.particles.burst(gx, gy, 5, { color: '#9fe8ff', speed: 40, life: 0.2 });
      } else {
        this.parryCd = 0.3;
        world.audio.sfx('cancel');
        world.toast('Sin cargas de parada');
      }
    }

    /* ---- attack (persistent hitbox so swings actually connect) ---- */
    if (this.attackCd > 0) this.attackCd -= dt;
    if (this.attackT > 0) this.attackT -= dt;
    if (this.attackHitT > 0) {
      this.attackHitT -= dt;
      world.doPlayerAttack(this._swingId);
    }
    if (Input.justPressed('attack') && this.attackCd <= 0 && this.dodgeT <= 0 && this.parryT <= 0) {
      this.attackT = 0.24;
      this.attackCd = 0.34;
      this.attackHitT = 0.15;
      this._swingId++;
      world.audio.sfx('attack');
    }

    /* ---- throw selected item ---- */
    if (this.throwCd > 0) this.throwCd -= dt;
    if (Input.justPressed('throw') && this.throwCd <= 0) {
      const sel = world.inventory.selected;
      if (sel === 'lata' && world.inventory.has('lata')) {
        world.inventory.use('lata');
        this.throwCd = 0.4;
        world.audio.sfx('attack');
        world.addProjectile(new Projectile({
          x: this.cx, y: this.cy - 2,
          vx: this.facing * 200, vy: -90,
          friendly: true, dmg: 1, type: 'lata', color: '#d64b3a', bounces: 2, life: 4,
        }));
      } else if (sel) {
        world.toast('No puedes lanzar: ' + sel);
      }
    }

    /* ---- timers ---- */
    if (this.invuln > 0) this.invuln -= dt;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    if (this.landHard > 0) this.landHard -= dt;
    this._noBoost = true;
    this.holdingBulb = world.inventory.selected === 'bombilla' && world.inventory.has('bombilla');

    /* ---- integrate vs tilemap ---- */
    moveActor(this, world.map, dt);

    /* ---- fall damage: a long drop hurts on landing (a dodge-roll negates it) ---- */
    if (this.onGround) {
      if (wasAir && !this.dead) {
        const drop = this.y - this._airPeakY;
        if (drop > 140 && this.dodgeT <= 0) {
          const d = drop > 248 ? 2 : 1;
          if (this.hurt(d, 'fall')) {
            world.audio.sfx('hurt');
            world.camera.shake(3, 0.25);
            world.particles.burst(this.cx, this.y + this.h, 12, { color: '#b8bfcc', speed: 70, life: 0.35, gravity: 40 });
          }
        } else if (drop > 60) {
          this.landHard = 0.12;
          world.audio.sfx('land');
        }
      }
      this._airPeakY = this.y;
    } else {
      this._airPeakY = Math.min(this._airPeakY, this.y);
    }

    /* ---- hazards / fall out ---- */
    const m = world.map;
    const tyFoot = Math.floor((this.y + this.h - 1) / m.ts);
    for (let tx = Math.floor((this.x + 1) / m.ts); tx <= Math.floor((this.x + this.w - 1) / m.ts); tx++) {
      if (m.isHazardTile(tx, tyFoot) || m.isHazardTile(tx, Math.floor(this.cy / m.ts))) { world.killPlayer('hazard'); return; }
    }
    if (this.y > m.pixelH + 60) world.killPlayer('fall');

    /* ---- animation state ---- */
    let st = 'idle';
    if (this.attackT > 0) st = 'attack';
    else if (this.dodgeT > 0) st = 'walk';
    else if (!this.onGround) st = this.vy < 0 ? 'jump' : 'fall';
    else if (Math.abs(this.vx) > 10) st = 'walk';
    if (this.hurtFlash > 0.05) st = 'hurt';
    if (st !== this.state) { this.state = st; this.animT = 0; this.frame = 0; }
    this.animT += dt;
    const fps = st === 'walk' ? 12 : st === 'attack' ? 24 : 6;
    this.frame = Math.floor(this.animT * fps);
  }

  render(ctx, cam) {
    const sx = Math.round(this.x - cam.renderX);
    const sy = Math.round(this.y - cam.renderY);

    // air-jump puff
    if (this.airJumpFlash > 0) {
      const k = this.airJumpFlash / 0.22;
      ctx.save();
      ctx.globalAlpha = k * 0.8;
      ctx.strokeStyle = '#9fd3ff';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.ellipse(sx + this.w / 2, sy + this.h + 1, 4 + (1 - k) * 8, 2 + (1 - k) * 3, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    ctx.save();
    if (this.invuln > 0 && !this.dead && Math.floor(this.invuln * 20) % 2 === 0) ctx.globalAlpha = 0.35;
    // purely visual up-scale, anchored on the feet -- the hitbox stays exactly this.w/this.h
    const rScale = 1.4;
    const rAnchorX = sx + this.w / 2, rAnchorY = sy + this.h;
    ctx.translate(rAnchorX, rAnchorY);
    ctx.scale(rScale, rScale);
    ctx.translate(-rAnchorX, -rAnchorY);
    drawRiko(ctx, sx, sy, this.w, this.h, this.facing, this.state, this.frame, this.hurtFlash > 0.05, this.holdingBulb);
    ctx.restore();

    if (this.attackT > 0) {
      const t = clamp(this.attackT / 0.18, 0, 1);
      ctx.save();
      ctx.globalAlpha = t * 0.85;
      ctx.fillStyle = '#eaf3ff';
      const ax = this.facing > 0 ? sx + this.w - 2 : sx - 15;
      ctx.fillRect(ax, sy - 3, 17, this.h + 6);
      ctx.globalAlpha = t * 0.4;
      ctx.fillRect(ax + (this.facing > 0 ? 2 : -2), sy - 5, 13, this.h + 10);
      ctx.restore();
    }

    /* parry stance: a shimmering guard arc (front / overhead / underfoot) */
    if (this.parryT > 0) {
      ctx.save();
      ctx.globalAlpha = 0.45 + Math.sin(performance.now() / 35) * 0.25;
      ctx.strokeStyle = '#9fe8ff';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (this._parryUp) {
        ctx.arc(sx + this.w / 2, sy - 1, 9, Math.PI + 0.5, -0.5);
      } else if (this._parryDown) {
        ctx.arc(sx + this.w / 2, sy + this.h + 1, 9, 0.5, Math.PI - 0.5);
      } else {
        const ax = this.facing > 0 ? sx + this.w + 1 : sx - 1;
        ctx.arc(ax, sy + this.h / 2, 8, this.facing > 0 ? -1.1 : 2.04, this.facing > 0 ? 1.1 : 4.24);
      }
      ctx.stroke();
      ctx.restore();
    }
    /* parry success flash ring */
    if (this.parryFlash > 0) {
      const k = this.parryFlash / 0.32;
      ctx.save();
      ctx.globalAlpha = k;
      ctx.strokeStyle = '#eaf8ff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sx + this.w / 2, sy + this.h / 2, 6 + (1 - k) * 16, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** hitbox used for melee attack (world space) -- big so hits connect reliably */
  attackBox() {
    return {
      x: this.facing > 0 ? this.x + this.w - 4 : this.x - 22,
      y: this.y - 6,
      w: 26,
      h: this.h + 12,
    };
  }
}
