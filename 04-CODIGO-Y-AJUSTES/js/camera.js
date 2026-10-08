/* ============================================================
   camera.js  -  smooth-follow 2D camera with bounds + shake
   ============================================================ */
import { clamp, lerp } from './utils.js';

export class Camera {
  constructor(vw, vh) {
    this.x = 0; this.y = 0;
    this.vw = vw; this.vh = vh;
    this.zoom = 1;
    this.bounds = { w: 99999, h: 99999 };
    this.shakeT = 0;
    this.shakeMag = 0;
    this.ox = 0; this.oy = 0;
  }

  setBounds(w, h) { this.bounds = { w, h }; }

  shake(mag = 4, time = 0.3) {
    this.shakeMag = Math.max(this.shakeMag, mag);
    this.shakeT = Math.max(this.shakeT, time);
  }

  snapTo(target) {
    this.x = target.x + target.w / 2 - this.vw / 2;
    this.y = target.y + target.h / 2 - this.vh / 2;
    this._clamp();
  }

  follow(target, dt) {
    const tx = target.x + target.w / 2 - this.vw / 2;
    const ty = target.y + target.h / 2 - this.vh / 2;
    const k = 1 - Math.pow(0.0016, dt);
    this.x = lerp(this.x, tx, k);
    this.y = lerp(this.y, ty, k);
    this._clamp();

    if (this.shakeT > 0) {
      this.shakeT -= dt;
      const f = Math.max(0, this.shakeT) * 3;
      const m = this.shakeMag * Math.min(1, f);
      this.ox = (Math.random() * 2 - 1) * m;
      this.oy = (Math.random() * 2 - 1) * m;
      if (this.shakeT <= 0) { this.shakeMag = 0; this.ox = 0; this.oy = 0; }
    } else {
      this.ox = 0; this.oy = 0;
    }
  }

  _clamp() {
    this.x = clamp(this.x, 0, Math.max(0, this.bounds.w - this.vw));
    this.y = clamp(this.y, 0, Math.max(0, this.bounds.h - this.vh));
  }

  get renderX() { return Math.round(this.x + this.ox); }
  get renderY() { return Math.round(this.y + this.oy); }

  /** is a world-space rect visible (with margin)? */
  visible(r, margin = 32) {
    return (
      r.x + r.w > this.x - margin &&
      r.x < this.x + this.vw + margin &&
      r.y + r.h > this.y - margin &&
      r.y < this.y + this.vh + margin
    );
  }
}
