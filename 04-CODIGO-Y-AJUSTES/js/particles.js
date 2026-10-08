/* ============================================================
   particles.js  -  pooled 2D particle system (canvas)
   ============================================================ */
export class Particles {
  constructor(max = 800) {
    this.pool = [];
    this.active = [];
    for (let i = 0; i < max; i++) this.pool.push(this._blank());
  }

  _blank() {
    return {
      x: 0, y: 0, vx: 0, vy: 0,
      life: 0, maxLife: 1,
      size: 2, color: '#fff',
      gravity: 0, drag: 0, alpha: 1,
      shape: 'rect', fade: true, glow: false,
    };
  }

  spawn(opts) {
    const p = this.pool.pop();
    if (!p) return null;
    Object.assign(p, this._blank(), opts);
    p.maxLife = p.life;
    this.active.push(p);
    return p;
  }

  burst(x, y, n, opts = {}) {
    for (let i = 0; i < n; i++) {
      const a = opts.dir !== undefined
        ? opts.dir + (Math.random() - 0.5) * (opts.spread || Math.PI * 2)
        : Math.random() * Math.PI * 2;
      const s = (opts.speed || 40) * (0.3 + Math.random() * 0.9);
      this.spawn({
        x, y,
        vx: Math.cos(a) * s,
        vy: Math.sin(a) * s - (opts.up || 0),
        life: (opts.life || 0.5) * (0.6 + Math.random() * 0.7),
        size: opts.size || 2,
        color: opts.color || '#fff',
        gravity: opts.gravity == null ? 120 : opts.gravity,
        drag: opts.drag || 0,
        shape: opts.shape || 'rect',
        glow: opts.glow || false,
      });
    }
  }

  update(dt) {
    for (let i = this.active.length - 1; i >= 0; i--) {
      const p = this.active[i];
      p.life -= dt;
      if (p.life <= 0) {
        this.active.splice(i, 1);
        this.pool.push(p);
        continue;
      }
      p.vy += p.gravity * dt;
      if (p.drag) { p.vx *= 1 - p.drag * dt; p.vy *= 1 - p.drag * dt; }
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.alpha = p.fade ? Math.max(0, p.life / p.maxLife) : 1;
    }
  }

  render(ctx, cam) {
    const ox = cam.renderX, oy = cam.renderY;
    for (const p of this.active) {
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      const sx = Math.round(p.x - ox);
      const sy = Math.round(p.y - oy);
      if (p.glow) {
        ctx.globalCompositeOperation = 'lighter';
      }
      if (p.shape === 'circle') {
        ctx.beginPath();
        ctx.arc(sx, sy, p.size, 0, Math.PI * 2);
        ctx.fill();
      } else {
        const s = p.size;
        ctx.fillRect(sx - (s >> 1), sy - (s >> 1), s, s);
      }
      if (p.glow) ctx.globalCompositeOperation = 'source-over';
    }
    ctx.globalAlpha = 1;
  }

  clear() {
    while (this.active.length) this.pool.push(this.active.pop());
  }
}
