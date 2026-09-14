/* ============================================================
   dialogue.js  -  short typewriter dialogue + choice prompts.
   Kept intentionally minimal (no huge text blocks).
   ============================================================ */
import { wrapText } from './utils.js';

/* outlined text so dialogue stays readable over any background */
function _o(ctx, s, x, y, fill) {
  ctx.fillStyle = 'rgba(2,4,10,0.95)';
  ctx.fillText(s, x - 1, y); ctx.fillText(s, x + 1, y);
  ctx.fillText(s, x, y - 1); ctx.fillText(s, x, y + 1);
  ctx.fillStyle = fill;
  ctx.fillText(s, x, y);
}
function _oWrap(ctx, text, x, y, maxW, lineH) {
  const words = String(text).split(' ');
  let line = '';
  let yy = y;
  for (let n = 0; n < words.length; n++) {
    const test = line + words[n] + ' ';
    if (ctx.measureText(test).width > maxW && n > 0) { _o(ctx, line, x, yy, '#f2f7ff'); line = words[n] + ' '; yy += lineH; }
    else line = test;
  }
  _o(ctx, line, x, yy, '#f2f7ff');
}

export class Dialogue {
  constructor() {
    this.lines = [];
    this.active = false;
    this.i = 0;
    this.char = 0;
    this.timer = 0;
    this.speed = 42;      // chars / second
    this.onDone = null;
    // choice mode
    this.choice = null;   // { prompt, options:[{label,value}], onPick }
    this.choiceIndex = 0;
  }

  start(lines, onDone) {
    this.lines = (Array.isArray(lines) ? lines : [lines]).map((l) => (typeof l === 'string' ? { text: l } : l));
    this.active = true;
    this.i = 0; this.char = 0; this.timer = 0;
    this.onDone = onDone || null;
    this.choice = null;
  }

  startChoice(prompt, options, onPick) {
    this.active = true;
    this.choice = { prompt, options };
    this.choiceIndex = 0;
    this.onPick = onPick;
    this.lines = [];
  }

  get isChoice() { return !!this.choice; }

  /** advance / confirm (interact key) */
  advance() {
    if (this.choice) {
      const opt = this.choice.options[this.choiceIndex];
      const cb = this.onPick;
      this.active = false;
      this.choice = null;
      this.onPick = null;
      if (cb) cb(opt.value, this.choiceIndex);
      return;
    }
    const cur = this.lines[this.i];
    if (!cur) { this.active = false; return; }
    if (this.char < cur.text.length) { this.char = cur.text.length; return; }
    this.i++;
    if (this.i >= this.lines.length) {
      this.active = false;
      const cb = this.onDone;
      this.onDone = null;
      if (cb) cb();
    } else {
      this.char = 0; this.timer = 0;
    }
  }

  move(dir) {
    if (!this.choice) return;
    const n = this.choice.options.length;
    this.choiceIndex = (this.choiceIndex + dir + n) % n;
  }

  update(dt) {
    if (!this.active || this.choice) return;
    const cur = this.lines[this.i];
    if (!cur) return;
    if (this.char < cur.text.length) {
      this.timer += dt;
      const per = 1 / this.speed;
      while (this.timer >= per && this.char < cur.text.length) {
        this.timer -= per;
        this.char++;
      }
    }
  }

  render(ctx, W, H) {
    if (!this.active) return;
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.imageSmoothingEnabled = false;

    if (this.choice) {
      const bw = Math.min(260, W - 40);
      const bh = 30 + this.choice.options.length * 16;
      const bx = (W - bw) / 2;
      const by = (H - bh) / 2;
      ctx.fillStyle = 'rgba(4,7,16,0.97)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#5aa0e8';
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      ctx.font = 'bold 8px "Courier New", monospace';
      _o(ctx, this.choice.prompt, bx + 10, by + 8, '#ffd357');
      ctx.font = '9px "Courier New", monospace';
      this.choice.options.forEach((o, idx) => {
        const y = by + 24 + idx * 16;
        const on = idx === this.choiceIndex;
        if (on) { ctx.fillStyle = '#12203c'; ctx.fillRect(bx + 6, y - 2, bw - 12, 14); }
        _o(ctx, (on ? '> ' : '  ') + o.label, bx + 10, y, on ? '#ffd357' : '#f2f7ff');
      });
      ctx.restore();
      return;
    }

    const cur = this.lines[this.i];
    const bx = 10, bw = W - 20, bh = 50, by = H - bh - 10;
    ctx.fillStyle = 'rgba(4,7,16,0.96)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#5aa0e8';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.strokeStyle = 'rgba(90,160,232,0.35)';
    ctx.strokeRect(bx + 2.5, by + 2.5, bw - 5, bh - 5);

    ctx.font = 'bold 8px "Courier New", monospace';
    if (cur.speaker) {
      _o(ctx, cur.speaker.toUpperCase(), bx + 8, by + 6, '#ffd357');
    }
    ctx.font = '9px "Courier New", monospace';
    _oWrap(ctx, cur.text.slice(0, this.char), bx + 8, by + (cur.speaker ? 19 : 9), bw - 16, 11);

    if (this.char >= cur.text.length && Math.floor(performance.now() / 400) % 2 === 0) {
      ctx.fillStyle = '#4a90d9';
      ctx.fillText('E', bx + bw - 14, by + bh - 12);
    }
    ctx.restore();
  }
}
