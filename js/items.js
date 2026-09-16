/* ============================================================
   items.js  -  world pickups, memory motes, and projectiles
   ============================================================ */
import { ITEM_DEFS } from './inventory.js';
import { rectsOverlap } from './collision.js';
import { moveActor } from './physics.js';
import { px } from './sprites.js';
import { choice } from './utils.js';

/* a friendly little nudge floating above every ground item -- purely cosmetic */
const ITEM_HINTS = ['¡TÓMAME!', 'TE AYUDARÉ', '¡AQUÍ!', 'ÚSAME BIEN', 'SOY ÚTIL', '¡PARA TI!', 'LLÉVAME'];
function _outMini(ctx, s, x, y, fill) {
  ctx.fillStyle = 'rgba(2,4,10,0.95)';
  ctx.fillText(s, x - 1, y - 1); ctx.fillText(s, x, y - 1); ctx.fillText(s, x + 1, y - 1);
  ctx.fillText(s, x - 1, y);                                 ctx.fillText(s, x + 1, y);
  ctx.fillText(s, x - 1, y + 1); ctx.fillText(s, x, y + 1); ctx.fillText(s, x + 1, y + 1);
  ctx.fillStyle = fill;
  ctx.fillText(s, x, y);
}

/* ---------------- Pickup (collectible item on the ground) --------------- */
export class Pickup {
  constructor(type, x, y, id) {
    this.type = type;
    this.x = x; this.y = y;
    this.w = 10; this.h = 10;
    this.t = Math.random() * 6;
    this.taken = false;
    this.id = id || (type + '@' + Math.round(x) + ',' + Math.round(y));
    this.hint = choice(ITEM_HINTS);
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
    const cx = sx + 5, cy = sy + 5;
    ctx.save();
    // purely visual up-scale, centered on the icon -- pickup radius/collision untouched
    const scale = 1.25;
    ctx.translate(cx, cy);
    ctx.scale(scale, scale);
    ctx.translate(-cx, -cy);
    // glow
    ctx.globalCompositeOperation = 'lighter';
    const col = this.type === 'memory' ? '#f4c542' : (ITEM_DEFS[this.type]?.color || '#fff');
    ctx.fillStyle = col;
    ctx.globalAlpha = 0.18;
    ctx.beginPath(); ctx.arc(cx, cy, 10, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    drawItemIcon(ctx, this.type, sx, sy);
    ctx.restore();

    // a friendly little floating hint above the item
    ctx.save();
    ctx.textAlign = 'center';
    ctx.font = 'bold 7px "Courier New", monospace';
    _outMini(ctx, this.hint, cx, sy - 6, '#ffe07a');
    ctx.restore();
  }
}

/** draw an 10x10-ish icon for an item type */
export function drawItemIcon(ctx, type, x, y) {
  switch (type) {
    case 'llave':
      px(ctx, x, y + 2, 6, 6, '#5c3d0e');             // outline
      px(ctx, x + 1, y + 3, 4, 4, '#d99a3c');
      px(ctx, x + 1, y + 3, 4, 1, '#f4c96a');         // top rim highlight
      px(ctx, x + 2, y + 4, 2, 2, '#3a2a12');
      px(ctx, x + 5, y + 3, 4, 3, '#5c3d0e');
      px(ctx, x + 5, y + 4, 4, 2, '#d99a3c');
      px(ctx, x + 8, y + 3, 2, 4, '#5c3d0e');
      px(ctx, x + 8, y + 4, 1, 3, '#d99a3c'); break;
    case 'lata':
      px(ctx, x + 1, y, 8, 10, '#7a2c22');             // outline
      px(ctx, x + 2, y + 1, 6, 8, '#d64b3a');
      px(ctx, x + 2, y + 1, 1, 8, '#ff8a72');          // side highlight
      px(ctx, x + 2, y + 3, 6, 2, '#eaeaea');
      px(ctx, x + 2, y + 1, 6, 1, '#8a8a8a');
      px(ctx, x + 3, y, 4, 1, '#c9c9c9');              // pull-tab
      break;
    case 'bombilla':
      px(ctx, x + 1, y, 8, 8, '#8a6a1c');              // outline
      px(ctx, x + 2, y + 1, 6, 6, '#f4c542');
      px(ctx, x + 3, y + 2, 2, 2, '#fff');
      px(ctx, x + 3, y + 2, 1, 1, '#fffde0');          // filament sparkle
      px(ctx, x + 3, y + 7, 4, 2, '#8a8a8a');
      px(ctx, x + 3, y + 8, 4, 1, '#5c5c5c'); break;
    case 'iman':
      px(ctx, x, y, 10, 8, '#5c1c14');                 // outline
      px(ctx, x + 1, y + 1, 3, 6, '#d64b3a'); px(ctx, x + 6, y + 1, 3, 6, '#4a90d9');
      px(ctx, x + 1, y + 6, 8, 3, '#888'); px(ctx, x + 1, y + 1, 3, 2, '#bbb'); px(ctx, x + 6, y + 1, 3, 2, '#bbb');
      px(ctx, x + 1, y + 1, 1, 1, '#ffd0c8'); px(ctx, x + 8, y + 1, 1, 1, '#cfe6ff'); break;
    case 'cuerda':
      ctx.strokeStyle = '#5c4325'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(x + 5, y + 5, 4, 0.3, Math.PI * 1.9); ctx.stroke();
      ctx.strokeStyle = '#c9a06a'; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(x + 5, y + 5, 4, 0.3, Math.PI * 1.9); ctx.stroke();
      ctx.strokeStyle = '#e8c48a'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(x + 4, y + 4, 2, 0.5, Math.PI * 1.4); ctx.stroke(); break;
    case 'memory':
      px(ctx, x + 3, y + 1, 4, 8, '#8a6a1c'); px(ctx, x + 1, y + 3, 8, 4, '#8a6a1c');
      px(ctx, x + 3, y + 1, 4, 8, '#f4c542'); px(ctx, x + 1, y + 3, 8, 4, '#f4c542');
      px(ctx, x + 4, y + 4, 2, 2, '#fff');
      px(ctx, x + 2, y + 2, 1, 1, '#fff6d0'); px(ctx, x + 7, y + 7, 1, 1, '#fff6d0'); break;
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

