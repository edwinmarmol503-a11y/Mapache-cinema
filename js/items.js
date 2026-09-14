/* ============================================================
   items.js  -  world pickups, memory motes, and projectiles
   ============================================================ */
import { ITEM_DEFS } from './inventory.js';
import { rectsOverlap } from './collision.js';
import { moveActor } from './physics.js';
import { px } from './sprites.js';

/* ---------------- Pickup (collectible item on the ground) --------------- */
export class Pickup {
  constructor(type, x, y, id) {
    this.type = type;
    this.x = x; this.y = y;
    this.w = 10; this.h = 10;
    this.t = Math.random() * 6;
    this.taken = false;
    this.id = id || (type + '@' + Math.round(x) + ',' + Math.round(y));
  }

  update(dt, world) {
    this.t += dt;
    if (this.taken) return;
    const p = world.player;
    if (rectsOverlap(this.x, this.y, this.w, this.h, p.x, p.y, p.w, p.h)) {
      this.taken = true;
      if (world.markCollected) world.markCollected(this.id);   // no re-farming after a death
      if (this.type === 'memory') {
        world.save.data.memories = (world.save.data.memories || 0) + 1;
        world.toast('Recuerdo recuperado  (' + world.save.data.memories + ')');
        world.audio.sfx('light');
        world.particles.burst(this.x + 5, this.y + 5, 20, { color: '#f4c542', speed: 70, life: 0.7, glow: true, gravity: -10 });
      } else {
        world.inventory.add(this.type);
        world.toast('Obtienes:  ' + (ITEM_DEFS[this.type]?.name || this.type));
        world.audio.sfx('pickup');
        world.particles.burst(this.x + 5, this.y + 5, 12, { color: ITEM_DEFS[this.type]?.color || '#fff', speed: 60, life: 0.5 });
      }
    }
  }

  render(ctx, cam) {
    if (this.taken) return;
    const sx = Math.round(this.x - cam.renderX);
    const sy = Math.round(this.y - cam.renderY + Math.sin(this.t * 3) * 2);
    // glow
    ctx.globalCompositeOperation = 'lighter';
    const col = this.type === 'memory' ? '#f4c542' : (ITEM_DEFS[this.type]?.color || '#fff');
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.18;
    ctx.beginPath(); ctx.arc(sx + 5, sy + 5, 10, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    drawItemIcon(ctx, this.type, sx, sy);
  }
}

/** draw an 10x10-ish icon for an item type */
export function drawItemIcon(ctx, type, x, y) {
  switch (type) {
    case 'llave':
      px(ctx, x + 1, y + 3, 4, 4, '#d99a3c'); px(ctx, x + 2, y + 4, 2, 2, '#3a2a12');
      px(ctx, x + 5, y + 4, 4, 2, '#d99a3c'); px(ctx, x + 8, y + 4, 1, 3, '#d99a3c'); break;
    case 'lata':
      px(ctx, x + 2, y + 1, 6, 8, '#d64b3a'); px(ctx, x + 2, y + 3, 6, 2, '#eaeaea'); px(ctx, x + 2, y + 1, 6, 1, '#8a8a8a'); break;
    case 'bombilla':
      px(ctx, x + 2, y + 1, 6, 6, '#f4c542'); px(ctx, x + 3, y + 7, 4, 2, '#8a8a8a'); px(ctx, x + 3, y + 2, 2, 2, '#fff'); break;
    case 'iman':
      px(ctx, x + 1, y + 1, 3, 6, '#d64b3a'); px(ctx, x + 6, y + 1, 3, 6, '#4a90d9');
      px(ctx, x + 1, y + 6, 8, 3, '#888'); px(ctx, x + 1, y + 1, 3, 2, '#bbb'); px(ctx, x + 6, y + 1, 3, 2, '#bbb'); break;
    case 'cuerda':
      ctx.strokeStyle = '#c9a06a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + 5, y + 5, 3, 0, Math.PI * 2); ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 5, y + 5, 3, 0, Math.PI * 2); ctx.stroke(); break;
    case 'memory':
      px(ctx, x + 3, y + 1, 4, 8, '#f4c542'); px(ctx, x + 1, y + 3, 8, 4, '#f4c542'); px(ctx, x + 4, y + 4, 2, 2, '#fff'); break;
    default:
      px(ctx, x + 2, y + 2, 6, 6, '#fff');
  }
}

/* ---------------- Projectile (thrown lata / feather / orb) --------------- */
export class Projectile {
  constructor(o) {
    this.x = o.x; this.y = o.y;
    this.w = o.w || 6; this.h = o.h || 6;
    this.vx = o.vx || 0; this.vy = o.vy || 0;
    this.gravity = o.gravity == null ? 380 : o.gravity;
    this.life = o.life || 3;
    this.friendly = !!o.friendly;
    this.dmg = o.dmg == null ? 1 : o.dmg;
    this.type = o.type || 'lata';
    this.color = o.color || '#d64b3a';
    this.spin = 0;
    this.dead = false;
    this.hitTiles = o.hitTiles !== false;
    this.bounces = o.bounces || 0;
  }

  update(dt, world) {
    this.life -= dt;
    this.spin += dt * 12;
    if (this.life <= 0) { this.dead = true; return; }

    this.vy += this.gravity * dt;
    // integrate with simple tile stop
    const map = world.map;
    let nx = this.x + this.vx * dt;
    let ny = this.y + this.vy * dt;

    if (this.hitTiles && map.isSolidTile(Math.floor((nx + this.w / 2) / map.ts), Math.floor((this.y + this.h / 2) / map.ts))) {
      if (this.bounces > 0) { this.vx *= -0.4; this.bounces--; nx = this.x; }
      else { this.vx = 0; nx = this.x; }
    }
    if (this.hitTiles && map.isSolidTile(Math.floor((this.x + this.w / 2) / map.ts), Math.floor((ny + this.h / 2) / map.ts))) {
      if (this.vy > 0) { this.vy = this.bounces > 0 ? -this.vy * 0.35 : 0; if (this.bounces > 0) this.bounces--; }
      else this.vy = 0;
      ny = this.y;
      this.vx *= 0.7;
    }
    this.x = nx; this.y = ny;

    // out of world
    if (this.y > map.pixelH + 100 || this.x < -50 || this.x > map.pixelW + 50) { this.dead = true; return; }

    if (this.friendly) {
      for (const e of world.enemies) {
        if (e.dead) continue;
        if (rectsOverlap(this.x, this.y, this.w, this.h, e.x, e.y, e.w, e.h)) {
          e.hurt(this.dmg, this.x, world);
          this.dead = true;
          world.particles.burst(this.x, this.y, 8, { color: this.color, speed: 60, life: 0.3 });
          return;
        }
      }
      if (world.boss && !world.boss.dead && rectsOverlap(this.x, this.y, this.w, this.h, world.boss.x, world.boss.y, world.boss.w, world.boss.h)) {
        world.boss.hurt(this.dmg, this.x, world);
        this.dead = true;
        return;
      }
    } else {
      const p = world.player;
      if (!p.dead && rectsOverlap(this.x, this.y, this.w, this.h, p.x, p.y, p.w, p.h)) {
        if (p.isParrying && p.isParrying()) {
          const up = p._parryUp;
          p.parrySuccess(null, world);
          // reflect it (upward if the parry was aimed up, else back at the sender)
          this.friendly = true;
          this.dmg = 2;
          this.color = '#9fe8ff';
          if (up) {
            this.vy = -Math.max(160, Math.abs(this.vy) * 1.4);
            this.vx *= 0.4;
          } else {
            this.vx = -this.vx * 1.5 || (p.facing * 200);
            this.vy = -Math.abs(this.vy) - 30;
          }
          this.life = Math.max(this.life, 2);
          return;
        }
        if (p.hurt(this.dmg, this.x)) { this.dead = true; world.camera.shake(3, 0.2); }
      }
    }
  }

  render(ctx, cam) {
    const sx = Math.round(this.x - cam.renderX);
    const sy = Math.round(this.y - cam.renderY);
    ctx.save();
    ctx.translate(sx + this.w / 2, sy + this.h / 2);
    ctx.rotate(this.spin);
    if (this.type === 'feather') {
      px(ctx, -this.w / 2, -1, this.w, 2, '#2c3550');
    } else if (this.type === 'orb') {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = this.color;
      ctx.beginPath(); ctx.arc(0, 0, this.w / 2 + 1, 0, Math.PI * 2); ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.fillStyle = '#fff';
      ctx.fillRect(-1, -1, 2, 2);
    } else {
      drawItemIcon(ctx, this.type, -this.w / 2 - 2, -this.h / 2 - 1);
    }
    ctx.restore();
  }
}
