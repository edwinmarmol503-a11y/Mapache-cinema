/* ============================================================
   dialogue.js  -  short typewriter dialogue + choice prompts.
   Kept intentionally minimal (no huge text blocks).
   ============================================================ */
import { canvasFont, outText } from './ui.js';

const _o = outText;
/** word-wrap into an array of lines (uses the CURRENT ctx.font for measuring) */
function _wrapLines(ctx, text, maxW) {
  const lines = [];
  for (const paragraph of String(text).split('\n')) {
    let line = '';
    for (const word of paragraph.split(/\s+/).filter(Boolean)) {
      const test = line ? line + ' ' + word : word;
      if (line && ctx.measureText(test).width > maxW) { lines.push(line); line = ''; }
      // A long player nickname or an unbroken word must also fit the box.
      if (ctx.measureText(word).width <= maxW) {
        line = line ? line + ' ' + word : word;
        continue;
      }
      for (const char of [...word]) {
        const next = line + char;
        if (ctx.measureText(next).width > maxW && line) { lines.push(line); line = char; }
        else line = next;
      }
    }
    if (line || !paragraph) lines.push(line);
  }
  return lines;
}
function _drawLines(ctx, lines, x, y, lineH, fill) {
  lines.forEach((ln, i) => _o(ctx, ln, x, y + i * lineH, fill || '#f2f7ff'));
}

// Touch controls are positioned in CSS pixels and can move after rotation,
// safe-area changes or switching hands. Convert their actual upper edge back
// to logical canvas coordinates instead of assuming a fixed lower corner.
function _safeTouchBottom(H) {
  const fallback = H - 8;
  if (typeof document === 'undefined') return fallback;
  const app = document.getElementById('app');
  const canvas = document.getElementById('gs');
  if (!app?.classList.contains('playing') || !app.classList.contains('touch-mode') ||
      app.classList.contains('paused') || !canvas?.getBoundingClientRect) return fallback;
  const bounds = canvas.getBoundingClientRect();
  if (bounds.height <= 0) return fallback;
  let bottom = fallback;
  for (const selector of ['.tc-movement', '.tc-actions']) {
    const control = document.querySelector(selector);
    if (!control) continue;
    const rect = control.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    bottom = Math.min(bottom, (rect.top - bounds.top - 6) * H / bounds.height);
  }
  return Math.max(4, bottom);
}

export class Dialogue {
  constructor({ touch = false } = {}) {
    this.touch = touch;
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
    ctx.textAlign = 'left';
    ctx.imageSmoothingEnabled = false;
    const safeBottom = this.touch ? _safeTouchBottom(H) : H - 8;

    if (this.choice) {
      const bw = Math.min(400, W - 16);
      const promptMaxW = bw - 20;
      ctx.font = canvasFont(12, 700);
      const promptLines = _wrapLines(ctx, this.choice.prompt, promptMaxW);
      const lineH = 16;
      const promptH = promptLines.length * lineH;
      ctx.font = canvasFont(12, 400);
      const optionLines = this.choice.options.map(option => _wrapLines(ctx, option.label, bw - 38));
      const optionHeights = optionLines.map(lines => lines.length * lineH + 6);
      const bh = 14 + promptH + 8 + optionHeights.reduce((a, b) => a + b, 0) + 18;
      const bx = (W - bw) / 2;
      const by = Math.max(4, Math.min((H - bh) / 2, this.touch ? 54 : H, safeBottom - bh));
      ctx.fillStyle = 'rgba(4,7,16,0.97)';
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeStyle = '#5aa0e8';
      ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
      ctx.font = canvasFont(12, 700);
      _drawLines(ctx, promptLines, bx + 10, by + 9, lineH, '#ffd357');
      ctx.font = canvasFont(12, 400);
      let optionY = by + 9 + promptH + 9;
      this.choice.options.forEach((o, idx) => {
        const on = idx === this.choiceIndex;
        if (on) { ctx.fillStyle = '#1d3354'; ctx.fillRect(bx + 6, optionY - 2, bw - 12, optionHeights[idx] - 2); }
        _o(ctx, on ? '›' : '', bx + 10, optionY, '#ffd357');
        _drawLines(ctx, optionLines[idx], bx + 24, optionY, lineH, on ? '#ffd357' : '#f2f7ff');
        optionY += optionHeights[idx];
      });
      ctx.font = canvasFont(10);
      ctx.textAlign = 'right';
      _o(ctx, '↑↓ · opción   Botón de acción · elegir', bx + bw - 10, by + bh - 16, '#a9ccf1');
      ctx.restore();
      return;
    }

    const cur = this.lines[this.i];
    const bx = 8, bw = W - 16;
    const headerH = cur.speaker ? 18 : 4;
    const lineH = 16;
    // size the box off the FULL line so it doesn't resize mid-typewriter,
    // and clamp so it can never overflow the top of the screen
    ctx.font = canvasFont(12, 400);
    const fullLines = _wrapLines(ctx, cur.text, bw - 16);
    const bh = Math.min(H - 16, Math.max(62, headerH + fullLines.length * lineH + 25));
    // Prefer the space below the HUD, but on short phones move the entire box
    // upward so every line and the advance hint stay above the thumb controls.
    const by = this.touch ? Math.max(4, Math.min(64, safeBottom - bh)) : H - bh - 8;

    ctx.fillStyle = 'rgba(4,7,16,0.96)';
    ctx.fillRect(bx, by, bw, bh);
    ctx.strokeStyle = '#5aa0e8';
    ctx.lineWidth = 1;
    ctx.strokeRect(bx + 0.5, by + 0.5, bw - 1, bh - 1);
    ctx.strokeStyle = 'rgba(90,160,232,0.35)';
    ctx.strokeRect(bx + 2.5, by + 2.5, bw - 5, bh - 5);

    ctx.font = canvasFont(11, 700);
    if (cur.speaker) {
      _o(ctx, cur.speaker.toUpperCase(), bx + 8, by + 7, '#ffd357');
    }
    ctx.font = canvasFont(12, 400);
    const shownLines = _wrapLines(ctx, cur.text.slice(0, this.char), bw - 16);
    _drawLines(ctx, shownLines, bx + 8, by + (cur.speaker ? 24 : 10), lineH, '#f2f7ff');

    if (this.char >= cur.text.length && Math.floor(performance.now() / 400) % 2 === 0) {
      ctx.font = canvasFont(10);
      ctx.textAlign = 'right';
      _o(ctx, 'Cualquier control · seguir', bx + bw - 8, by + bh - 16, '#a9ccf1');
    }
    ctx.restore();
  }
}
