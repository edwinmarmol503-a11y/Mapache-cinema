/* ============================================================
   ui.js  -  on-canvas HUD + parallax backgrounds
   ============================================================ */
import { ITEM_DEFS } from './inventory.js';
import { drawItemIcon } from './items.js';
import { px, drawRiko, drawFarolero, drawLantern } from './sprites.js';

/* ---------------- HUD ---------------- */
export function drawHUD(ctx, world) {
  const p = world.player;
  ctx.save();
  ctx.imageSmoothingEnabled = false;

  // hearts
  for (let i = 0; i < p.maxHp; i++) {
    const x = 8 + i * 12, y = 8;
    const full = i < p.hp;
    ctx.fillStyle = full ? '#d64b3a' : '#3a2030';
    ctx.fillRect(x + 2, y, 6, 3);
    ctx.fillRect(x, y + 2, 10, 4);
    ctx.fillRect(x + 2, y + 6, 6, 2);
    ctx.fillRect(x + 4, y + 8, 2, 1);
    if (full) { ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.fillRect(x + 2, y + 2, 2, 2); }
  }

  // selected item box
  const sel = world.inventory.selected;
  const bx = 8, by = 22;
  ctx.fillStyle = 'rgba(6,10,22,0.8)';
  ctx.fillRect(bx, by, 16, 16);
  ctx.strokeStyle = '#2b3c63';
  ctx.strokeRect(bx + 0.5, by + 0.5, 15, 15);
  if (sel) {
    drawItemIcon(ctx, sel, bx + 3, by + 3);
    const n = world.inventory.count(sel);
    ctx.font = 'bold 8px "Courier New", monospace';
    ctx.textAlign = 'right';
    outText(ctx, ITEM_DEFS[sel] && ITEM_DEFS[sel].consumable ? 'x' + n : '∞', bx + 15, by + 15, '#ffffff');
    ctx.textAlign = 'left';
  } else {
    ctx.font = '7px "Courier New", monospace';
    outText(ctx, '--', bx + 5, by + 10, '#7a8aa0');
  }
  ctx.font = '7px "Courier New", monospace';
  outText(ctx, 'Q/R', bx + 20, by + 12, '#9fb2cc');

  // parry charges (perfect counter)
  const pc = p.parryCharges == null ? 0 : p.parryCharges;
  const diamond = (x, y, col, hi) => {
    ctx.fillStyle = col;
    ctx.beginPath();
    ctx.moveTo(x + 3, y); ctx.lineTo(x + 6, y + 3);
    ctx.lineTo(x + 3, y + 6); ctx.lineTo(x, y + 3);
    ctx.closePath(); ctx.fill();
    if (hi) { ctx.fillStyle = 'rgba(255,255,255,0.7)'; ctx.fillRect(x + 2, y + 2, 2, 2); }
  };
  if (p.unlimitedParry) {
    diamond(bx, by + 20, '#9fe8ff', true);
    ctx.fillStyle = '#9fe8ff';
    ctx.font = 'bold 9px "Courier New", monospace';
    ctx.fillText('∞', bx + 9, by + 27);         // infinity
  } else {
    for (let i = 0; i < (p.maxParry || 3); i++) {
      diamond(bx + i * 9, by + 20, i < pc ? '#9fe8ff' : '#28323c', i < pc);
    }
  }
  ctx.font = '7px "Courier New", monospace';
  outText(ctx, 'L', bx + 29, by + 26, '#9fb2cc');

  // memory counter
  const mem = (world.save.data && world.save.data.memories) || 0;
  ctx.font = 'bold 8px "Courier New", monospace';
  drawItemIcon(ctx, 'memory', world.W - 34, 6);
  outText(ctx, 'x' + mem, world.W - 22, 14, '#ffd66a');

  // "clear the zone" objectives (only on levels with an exit)
  if (world.exitRect && (world.enemiesTotal > 0 || world.lanternsTotal > 0)) {
    const rx = world.W - 80, ry = 22;
    const done = world.cleared;
    ctx.fillStyle = 'rgba(4,8,18,0.9)';
    ctx.fillRect(rx, ry, 72, 26);
    ctx.strokeStyle = done ? '#6fbf73' : '#3b4c6b';
    ctx.strokeRect(rx + 0.5, ry + 0.5, 71, 25);
    ctx.textAlign = 'left';
    ctx.font = 'bold 8px "Courier New", monospace';

    ctx.fillStyle = world.enemiesKilled >= world.enemiesTotal ? '#7fd98a' : '#ff8a6a';
    ctx.fillRect(rx + 4, ry + 5, 6, 6);
    ctx.fillStyle = '#141820'; ctx.fillRect(rx + 5, ry + 7, 4, 2);
    outText(ctx, 'Enemigos ' + world.enemiesKilled + '/' + world.enemiesTotal, rx + 14, ry + 10, '#ffffff');

    const lit = world.lanternsLit;
    ctx.fillStyle = lit >= world.lanternsTotal ? '#7fd98a' : '#f4c542';
    ctx.fillRect(rx + 4, ry + 15, 6, 6);
    outText(ctx, 'Faroles  ' + lit + '/' + world.lanternsTotal, rx + 14, ry + 20, '#ffffff');
    ctx.textAlign = 'left';
  }

  ctx.restore();
}

/* deterministic pseudo-random in [0,1) */
function h1(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s); }

/* current lightning-flash intensity 0..1 -- game.js reads this so a bolt lights
   up the dark levels (and Modo Claro) instead of being hidden by the shadow. */
let _lightningFlash = 0;
export function currentLightning() { return _lightningFlash; }

/* crisp text with a full dark outline (8 directions) so it stays legible
   over any background, even at the small sizes this HUD is drawn at */
export function outText(ctx, str, x, y, fill, o) {
  o = o || 'rgba(2,4,10,0.95)';
  ctx.fillStyle = o;
  ctx.fillText(str, x - 1, y - 1); ctx.fillText(str, x, y - 1); ctx.fillText(str, x + 1, y - 1);
  ctx.fillText(str, x - 1, y);                                   ctx.fillText(str, x + 1, y);
  ctx.fillText(str, x - 1, y + 1); ctx.fillText(str, x, y + 1); ctx.fillText(str, x + 1, y + 1);
  ctx.fillStyle = fill;
  ctx.fillText(str, x, y);
}

/* ---------------- parallax backgrounds (per theme) ---------------- */
export function drawBackground(ctx, world) {
  const W = world.W, H = world.H;
  const cam = world.camera;
  const theme = world.levelDef.key;
  const t = performance.now() / 1000;

  const SKY = {
    roofs:    ['#0d1730', '#111d3a', '#1a2a4e'],
    forest:   ['#071522', '#0a1d2c', '#0e2636'],
    sewers:   ['#0a1414', '#0c1a1a', '#102424'],
    district: ['#120d18', '#17111e', '#1d1626'],
    tower:    ['#0b0a1c', '#100e26', '#181336'],
  }[theme] || ['#0a1024', '#0c1430', '#122048'];

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, SKY[0]); g.addColorStop(0.55, SKY[1]); g.addColorStop(1, SKY[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (theme === 'roofs') bgRoofs(ctx, world, t);
  else if (theme === 'forest') bgForest(ctx, world, t);
  else if (theme === 'sewers') bgSewers(ctx, world, t);
  else if (theme === 'district') bgDistrict(ctx, world, t);
  else if (theme === 'tower') bgTower(ctx, world, t);
  else bgRoofs(ctx, world, t);

  // random weather (chosen per level visit in game.loadLevel)
  weather(ctx, W, H, t, world.weather || 'clear', cam);

  // weather / events on top of the sky (behind gameplay)
  const BOLT = { roofs: '#7db8ff', forest: '#8fe8b0', sewers: '#66d8c8', district: '#ff8a6a', tower: '#c9a6ff' };
  lightning(ctx, W, H, t, BOLT[theme] || '#7db8ff');
  if (theme === 'roofs') skyFarolero(ctx, W, H, t);
}

/* ---- random weather layer: rain / snow / leaves ---- */
function weather(ctx, W, H, t, kind, cam) {
  if (kind === 'rain') {
    ctx.strokeStyle = 'rgba(170,195,240,0.20)';
    ctx.lineWidth = 1;
    for (let i = 0; i < 70; i++) {
      const rx = (i * 71 + t * 620 + cam.x * 0.3) % (W + 40) - 20;
      const ry = (i * 43 + t * 900) % (H + 40) - 20;
      ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 3, ry + 11); ctx.stroke();
    }
  } else if (kind === 'snow') {
    ctx.fillStyle = 'rgba(235,244,255,0.85)';
    for (let i = 0; i < 80; i++) {
      const sway = Math.sin(t * 1.3 + i * 1.7) * 8;
      const fx = ((i * 53 + cam.x * 0.25 + sway) % (W + 20)) - 10;
      const fy = ((i * 37 + t * (14 + (i % 5) * 4)) % (H + 20)) - 10;
      const s = i % 4 === 0 ? 2 : 1;
      ctx.globalAlpha = 0.4 + 0.5 * h1(i);
      ctx.fillRect(fx | 0, fy | 0, s, s);
    }
    ctx.globalAlpha = 1;
  } else if (kind === 'leaves') {
    for (let i = 0; i < 26; i++) {
      const spin = t * 3 + i;
      const fx = ((i * 91 + cam.x * 0.3 + Math.sin(t * 0.8 + i) * 26) % (W + 30)) - 15;
      const fy = ((i * 61 + t * (18 + (i % 4) * 6)) % (H + 30)) - 15;
      const col = ['#c67a3a', '#8a9a44', '#b5573a', '#d9a441'][i % 4];
      ctx.save();
      ctx.translate(fx, fy);
      ctx.rotate(spin);
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = col;
      ctx.fillRect(-2, -1, 4, 2);
      ctx.fillRect(-1, -2, 2, 4);
      ctx.restore();
    }
    ctx.globalAlpha = 1;
  }
}

/**
 * Iterate the WORLD-space strip of a parallax layer that is currently on screen.
 * cb(worldIndex, screenX) -- worldIndex is stable per element so hashes don't
 * flicker as the camera scrolls (fixes the "buildings resize" corruption).
 */
function worldStrip(camX, s, step, W, cb) {
  const scroll = camX * s;
  const i0 = Math.floor(scroll / step) - 1;
  const i1 = Math.ceil((scroll + W) / step) + 1;
  for (let i = i0; i <= i1; i++) cb(i, i * step - scroll);
}

function stars(ctx, W, H, cam, t, density, spread) {
  worldStrip(cam.x, 0.1, 24, W, (i, sx) => {
    if (h1(i * 1.7) > 1 - density / 24) return;
    const y = h1(i * 3.3) * H * spread;
    const off = h1(i * 5.1) * 18;
    const x = sx + off;
    const tw = Math.sin(i * 2.3 + t * 1.5);
    if (tw > 0.05) {
      ctx.fillStyle = tw > 0.7 ? 'rgba(230,240,255,0.95)' : 'rgba(190,210,245,0.55)';
      ctx.fillRect(x | 0, y | 0, 1, 1);
    }
  });
}

/* ---- occasional lightning, tinted per level ---- */
function lightning(ctx, W, H, t, color) {
  const period = 11 + (Math.floor(t / 11) % 9);      // 11..19 s, varies
  const local = t % period;
  if (local > 0.55) { _lightningFlash = 0; return; }
  const seed = Math.floor(t / period) + 1;
  // sky flash (also exported so the lighting pass can brighten the whole scene)
  const fa = local < 0.10 ? (1 - local / 0.10) : Math.max(0, 0.18 * (1 - (local - 0.10) / 0.45));
  _lightningFlash = fa;
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.globalAlpha = fa * 0.22;
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, W, H);
  // bolt for the first ~0.2s
  if (local < 0.2) {
    ctx.globalAlpha = (1 - local / 0.2) * 0.9;
    let x = 40 + h1(seed) * (W - 80), y = 0;
    const pts = [[x, y]];
    for (let s = 0; s < 8; s++) { x += (h1(seed * 7.3 + s) - 0.5) * 36; y += H / 8; pts.push([x, y]); }
    for (const lw of [5, 2]) {
      ctx.strokeStyle = color;
      ctx.lineWidth = lw;
      ctx.globalAlpha *= lw === 5 ? 0.35 : 2.6;
      ctx.beginPath();
      pts.forEach(([px2, py2], k) => (k ? ctx.lineTo(px2, py2) : ctx.moveTo(px2, py2)));
      ctx.stroke();
    }
  }
  ctx.restore();
}

/* ---- very rare Farolero silhouette drifting the L1 sky ---- */
function skyFarolero(ctx, W, H, t) {
  const period = 55;
  const local = t % period;
  if (local > 12) return;
  const p = local / 12;
  const fx = -50 + p * (W + 100);
  const fy = H * 0.15 + Math.sin(p * 5) * 8;
  ctx.save();
  ctx.globalAlpha = 0.4 * Math.sin(p * Math.PI);
  drawFarolero(ctx, fx, fy, 22, 26, -1, (t * 8) | 0, 1, false, false);
  ctx.restore();
}

function moon(ctx, x, y, r, warm) {
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const hg = ctx.createRadialGradient(x, y, 0, x, y, r * 2.6);
  hg.addColorStop(0, warm ? 'rgba(255,236,190,0.35)' : 'rgba(180,205,255,0.30)');
  hg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = hg;
  ctx.beginPath(); ctx.arc(x, y, r * 2.6, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.fillStyle = warm ? '#f4e6c0' : '#dce8ff';
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = warm ? 'rgba(210,190,150,0.5)' : 'rgba(150,175,225,0.5)';
  [[-.3, -.2, .28], [.35, .15, .2], [.05, .4, .17], [-.45, .35, .13]].forEach(([dx, dy, s]) => {
    ctx.beginPath(); ctx.arc(x + dx * r, y + dy * r, s * r, 0, Math.PI * 2); ctx.fill();
  });
}

function rain(ctx, W, H, t, dense) {
  ctx.strokeStyle = 'rgba(160,185,235,0.16)';
  ctx.lineWidth = 1;
  const n = dense ? 90 : 55;
  for (let i = 0; i < n; i++) {
    const rx = (i * 71 + t * 520) % (W + 40) - 20;
    const ry = (i * 43 + t * 780) % (H + 40) - 20;
    ctx.beginPath(); ctx.moveTo(rx, ry); ctx.lineTo(rx - 3, ry + 10); ctx.stroke();
  }
}

/* ---- ROOFS: nocturnal city skyline, three depths ---- */
function bgRoofs(ctx, world, t) {
  const W = world.W, H = world.H, cam = world.camera;
  stars(ctx, W, H, cam, t, 48, 0.62);
  moon(ctx, W * 0.8 - cam.x * 0.03, H * 0.2 - cam.y * 0.02, 15, false);

  // far skyline
  drawCitLayer(ctx, W, H, cam, { s: 0.12, base: 0.42, col: '#12203c', win: 'rgba(255,210,140,0.10)', step: 30, seed: 4 }, t);
  // mid skyline (water towers, antennas)
  drawCitLayer(ctx, W, H, cam, { s: 0.28, base: 0.56, col: '#0d1830', win: 'rgba(255,205,130,0.16)', step: 42, seed: 11, props: true }, t);
  // near rooftop band + pipes
  ctx.fillStyle = '#0a1122';
  const nearY = H * 0.72;
  ctx.fillRect(0, nearY, W, H - nearY);
  ctx.fillStyle = '#0c1526';
  for (let x = -((cam.x * 0.5) % 24) - 24; x < W + 24; x += 24) {
    ctx.fillRect(x, nearY - 3, 20, 3);           // parapet blocks
  }
  ctx.strokeStyle = '#0e1a30'; ctx.lineWidth = 2;
  ctx.beginPath();
  const po = -((cam.x * 0.5) % 60);
  for (let x = po - 60; x < W + 60; x += 60) {   // sagging power line
    ctx.moveTo(x, nearY - 8);
    ctx.quadraticCurveTo(x + 30, nearY + 4, x + 60, nearY - 8);
  }
  ctx.stroke();
}

function drawCitLayer(ctx, W, H, cam, L, t) {
  worldStrip(cam.x, L.s, L.step, W, (i, x) => {
    const r = h1(i * 2.71 + L.seed * 13.3);          // stable per building
    const bh = (H * L.base) * (0.45 + 0.6 * r);
    const by = Math.round(H - bh);
    const bw = L.step - 4 - Math.floor(r * 6);
    x = Math.round(x);
    ctx.fillStyle = L.col;
    ctx.fillRect(x, by, bw, H - by);
    // windows grid (hashed by building index + cell, so no flicker)
    let wc = 0;
    for (let wy = by + 5; wy < H - 6; wy += 7) {
      let wr = 0;
      for (let wx = x + 3; wx < x + bw - 2; wx += 6) {
        if (h1(i * 100 + wc * 11 + wr * 3.7) > 0.72) {
          ctx.fillStyle = L.win; ctx.fillRect(wx | 0, wy | 0, 2, 3); ctx.fillStyle = L.col;
        }
        wr++;
      }
      wc++;
    }
    if (L.props && r > 0.6) {
      ctx.fillStyle = L.col;                          // water tower
      ctx.fillRect(x + bw / 2 - 4, by - 8, 8, 8);
      ctx.fillRect(x + bw / 2 - 5, by - 10, 10, 2);
    } else if (L.props && r > 0.32) {
      ctx.strokeStyle = L.col; ctx.lineWidth = 1;     // antenna
      ctx.beginPath(); ctx.moveTo(x + bw / 2, by); ctx.lineTo(x + bw / 2, by - 10); ctx.stroke();
      if (Math.sin(t * 3 + i) > 0.9) { ctx.fillStyle = 'rgba(255,90,90,0.5)'; ctx.fillRect(x + bw / 2 - 1, by - 12, 2, 2); }
    }
  });
}

/* ---- FOREST: layered pines, mist, fireflies ---- */
function bgForest(ctx, world, t) {
  const W = world.W, H = world.H, cam = world.camera;
  stars(ctx, W, H, cam, t, 26, 0.4);
  moon(ctx, W * 0.72 - cam.x * 0.03, H * 0.15, 12, false);

  const pines = (s, col, base, step, seed) => {
    ctx.fillStyle = col;
    worldStrip(cam.x, s, step, W, (i, x) => {
      const r = h1(i * 3.13 + seed * 9.7);
      const th = (H * base) * (0.5 + 0.75 * r);
      ctx.beginPath();
      ctx.moveTo(x - 2, H);
      ctx.lineTo(x + step / 2, H - th);
      ctx.lineTo(x + step + 2, H);
      ctx.closePath(); ctx.fill();
    });
  };
  pines(0.14, '#0a1c26', 0.5, 34, 3);
  pines(0.3, '#0b2430', 0.62, 26, 8);

  // mist bands
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const my = H * (0.45 + i * 0.16);
    const mo = ((t * (6 + i * 3) + i * 90) % (W + 120)) - 60;
    const mg = ctx.createLinearGradient(0, my - 8, 0, my + 8);
    mg.addColorStop(0, 'rgba(120,170,190,0)');
    mg.addColorStop(0.5, 'rgba(120,170,190,0.06)');
    mg.addColorStop(1, 'rgba(120,170,190,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(mo - 80, my - 8, 240, 16);
    ctx.fillRect(mo - 80 - (W + 120), my - 8, 240, 16);
  }
  ctx.restore();

  // near trunks
  ctx.fillStyle = '#08161e';
  worldStrip(cam.x, 0.55, 90, W, (i, x) => {
    const r = h1(i * 4.4 + 20);
    ctx.fillRect(x + 10, H * (0.32 + r * 0.22), 6 + (r * 5 | 0), H);
  });

  // fireflies
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const fx = (h1(i) * W + Math.sin(t * 0.7 + i) * 20 - cam.x * 0.4) % W;
    const x = fx < 0 ? fx + W : fx;
    const fy = H * 0.35 + h1(i + 5) * H * 0.5 + Math.cos(t * 0.9 + i * 2) * 8;
    const a = 0.3 + 0.3 * Math.sin(t * 3 + i * 4);
    ctx.fillStyle = 'rgba(150,255,190,' + a.toFixed(2) + ')';
    ctx.fillRect(x | 0, fy | 0, 2, 2);
  }
  ctx.restore();
}

/* ---- SEWERS: receding tunnel arch, back pipes, drips ---- */
function bgSewers(ctx, world, t) {
  const W = world.W, H = world.H, cam = world.camera;
  // brick back wall
  ctx.fillStyle = '#0c1616';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = 'rgba(60,90,88,0.18)';
  ctx.lineWidth = 1;
  const bo = -((cam.x * 0.1) % 18);
  for (let y = 6; y < H; y += 8) {
    ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke();
    const stag = (y / 8) % 2 ? 9 : 0;
    for (let x = bo + stag - 18; x < W + 18; x += 18) {
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 8); ctx.stroke();
    }
  }
  // concentric tunnel arches -> vanishing point
  const vx = W * 0.62 - cam.x * 0.05, vy = H * 0.5;
  ctx.strokeStyle = 'rgba(90,130,125,0.25)';
  for (let k = 1; k <= 6; k++) {
    const rw = 26 * k, rh = 22 * k;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(vx, vy, rw, rh, 0, Math.PI, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(vx - rw, vy); ctx.lineTo(vx - rw, H);
    ctx.moveTo(vx + rw, vy); ctx.lineTo(vx + rw, H);
    ctx.stroke();
  }
  // teal depth glow
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const gg = ctx.createRadialGradient(vx, vy, 0, vx, vy, 60);
  gg.addColorStop(0, 'rgba(70,180,165,0.12)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(vx, vy, 60, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // back pipes
  for (const py of [H * 0.22, H * 0.34]) {
    ctx.fillStyle = '#14201f';
    ctx.fillRect(0, py, W, 5);
    ctx.fillStyle = '#0e1817';
    for (let x = -((cam.x * 0.2) % 40); x < W; x += 40) ctx.fillRect(x, py - 2, 4, 9); // brackets
    // valve wheel
    const wx = (W * 0.4 - cam.x * 0.2) % W;
    ctx.strokeStyle = '#1b2c2a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc((wx + W) % W, py + 2, 4, 0, Math.PI * 2); ctx.stroke();
  }
  // drips
  ctx.fillStyle = 'rgba(140,200,190,0.4)';
  for (let i = 0; i < 8; i++) {
    const dx = (h1(i) * W - cam.x * 0.15) % W;
    const x = dx < 0 ? dx + W : dx;
    const dy = ((t * 40 + i * 55) % (H * 0.5)) + H * 0.15;
    ctx.fillRect(x | 0, dy | 0, 1, 3);
  }
}

/* ---- DISTRICT: ruined skyline, broken neon, heavy rain ---- */
function bgDistrict(ctx, world, t) {
  const W = world.W, H = world.H, cam = world.camera;
  moon(ctx, W * 0.24 - cam.x * 0.03, H * 0.16, 11, false);

  // far ruins (some leaning) -- stable per world index
  const ruins = (s, col, base, step, seed, lean) => {
    worldStrip(cam.x, s, step, W, (i, x) => {
      const r = h1(i * 2.3 + seed * 7.1);
      const bh = (H * base) * (0.45 + 0.75 * r);
      const by = Math.round(H - bh);
      const sk = lean ? (h1(i * 5.5 + seed) - 0.5) * 6 : 0;
      x = Math.round(x);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.moveTo(x, H); ctx.lineTo(x + sk, by);
      ctx.lineTo(x + step - 4 + sk, by - (h1(i * 9.1) * 6 | 0));
      ctx.lineTo(x + step - 4, H);
      ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      let wc = 0;
      for (let wy = by + 6; wy < H - 6; wy += 8) { if (h1(i * 40 + wc * 3.3) > 0.4) ctx.fillRect(x + 4 + sk, wy, 3, 4); wc++; }
    });
  };
  ruins(0.12, '#1a1424', 0.5, 34, 3, false);
  ruins(0.28, '#140f1c', 0.66, 46, 9, true);

  // flickering broken neon signs
  for (let i = 0; i < 5; i++) {
    const nx = (i * 260 + 60 - cam.x * 0.28) % (W + 200);
    const x = nx < -60 ? nx + W + 200 : nx;
    const y = H * (0.28 + h1(i) * 0.28);
    const on = Math.sin(t * (7 + i * 3) + i) > (-0.3 + h1(i));
    const col = ['#ff5a7a', '#5ad1ff', '#ffd060', '#8a7aff'][i % 4];
    ctx.save();
    if (on) {
      ctx.globalCompositeOperation = 'lighter';
      ctx.fillStyle = col;
      ctx.globalAlpha = 0.5;
      ctx.fillRect(x - 1, y - 1, 16, 6);
      ctx.globalAlpha = 1;
      ctx.fillRect(x, y, 14, 4);
    } else {
      ctx.fillStyle = 'rgba(40,40,50,0.6)';
      ctx.fillRect(x, y, 14, 4);
    }
    ctx.restore();
  }

  // near: dead streetlight
  const slx = (W * 0.5 - cam.x * 0.5) % (W * 1.5);
  ctx.fillStyle = '#0b0810';
  ctx.fillRect(((slx + W) % (W * 1.5)) - 1, H * 0.3, 3, H);
  ctx.fillRect(((slx + W) % (W * 1.5)) - 6, H * 0.3, 12, 3);

  rain(ctx, W, H, t, true);
}

/* ---- TOWER: gothic buttresses climbing, clouds, motes ---- */
function bgTower(ctx, world, t) {
  const W = world.W, H = world.H, cam = world.camera;
  stars(ctx, W, H, cam, t, 30, 0.9);
  moon(ctx, W * 0.5 - cam.x * 0.02, H * 0.24 - cam.y * 0.015, 22, true);

  // drifting clouds across the moon
  ctx.save();
  for (let i = 0; i < 4; i++) {
    const cxp = ((t * (5 + i * 2) + i * 120) % (W + 200)) - 100;
    const cy = H * (0.14 + i * 0.09) - cam.y * 0.02;
    ctx.fillStyle = 'rgba(20,18,40,0.55)';
    ctx.beginPath();
    ctx.ellipse(cxp, cy, 40, 9, 0, 0, Math.PI * 2);
    ctx.ellipse(cxp + 24, cy + 3, 26, 7, 0, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();

  // buttress columns on both sides receding upward
  const colY = -cam.y * 0.2;
  for (const side of [0, 1]) {
    const baseX = side ? W - 40 : 8;
    ctx.fillStyle = '#120f26';
    ctx.fillRect(baseX, 0, 32, H);
    ctx.fillStyle = '#0d0b1e';
    for (let y = (colY % 40) - 40; y < H; y += 40) {
      // arched window with faint stained-glass glow
      ctx.fillStyle = '#0d0b1e';
      ctx.fillRect(baseX + 8, y + 8, 16, 24);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const wg = ctx.createLinearGradient(0, y + 8, 0, y + 32);
      wg.addColorStop(0, 'rgba(120,90,200,0.10)');
      wg.addColorStop(1, 'rgba(230,180,90,0.10)');
      ctx.fillStyle = wg;
      ctx.fillRect(baseX + 9, y + 9, 14, 22);
      ctx.restore();
      // ledge
      ctx.fillStyle = '#151230';
      ctx.fillRect(baseX - 3, y, 38, 3);
    }
  }

  // rising light motes
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 16; i++) {
    let x = (h1(i) * W - cam.x * 0.15) % W; if (x < 0) x += W;
    const y = (H - ((t * 12 + i * 90) % (H * 1.4))) - cam.y * 0.1;
    const a = 0.25 + 0.25 * Math.sin(t * 2 + i);
    ctx.fillStyle = 'rgba(255,224,150,' + a.toFixed(2) + ')';
    ctx.fillRect(x | 0, y | 0, 2, 2);
  }
  ctx.restore();
}

/* ============================================================
   MENU SCENE  -  drawn on the canvas behind the DOM menu:
   Riko sitting on a rooftop, looking at the nocturnal city.
   ============================================================ */
export function drawMenuScene(ctx, W, H) {
  const t = performance.now() / 1000;
  const camX = t * 6;                                  // slow drift
  const fakeCam = { x: camX, y: 0, renderX: camX, renderY: 0 };

  // sky
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#0c1732'); g.addColorStop(0.55, '#122048'); g.addColorStop(1, '#1a2c58');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  stars(ctx, W, H, fakeCam, t, 46, 0.6);
  moon(ctx, W * 0.82, H * 0.22, 20, false);

  // city skyline (3 depths)
  drawCitLayer(ctx, W, H, fakeCam, { s: 0.10, base: 0.42, col: '#16274a', win: 'rgba(255,214,150,0.12)', step: 34, seed: 4 }, t);
  drawCitLayer(ctx, W, H, fakeCam, { s: 0.24, base: 0.55, col: '#0f1c38', win: 'rgba(255,208,140,0.18)', step: 46, seed: 12, props: true }, t);
  drawCitLayer(ctx, W, H, fakeCam, { s: 0.44, base: 0.66, col: '#0b1428', win: 'rgba(255,205,135,0.15)', step: 60, seed: 21, props: true }, t);

  // near rooftop the raccoon sits on
  const roofY = Math.round(H * 0.78);
  ctx.fillStyle = '#0a1020';
  ctx.fillRect(0, roofY, W, H - roofY);
  ctx.fillStyle = '#0d1526';
  ctx.fillRect(0, roofY - 4, W, 4);                    // ledge lip
  ctx.fillStyle = '#0c1424';
  for (let x = -((camX * 0.5) % 22); x < W; x += 22) ctx.fillRect(x, roofY - 8, 16, 4); // parapet
  // a vent + a chimney
  ctx.fillStyle = '#0e1730';
  ctx.fillRect(W * 0.62, roofY - 20, 22, 20);
  ctx.fillRect(W * 0.20, roofY - 30, 12, 30);
  ctx.fillStyle = '#182240';
  ctx.fillRect(W * 0.20 - 2, roofY - 32, 16, 4);

  // Riko sitting on the ledge, looking right toward the horizon, lantern beside him
  const rx = Math.round(W * 0.30), ry = roofY - 20;
  ctx.save();
  ctx.translate(rx, ry);
  ctx.scale(1.7, 1.7);
  // lantern glow
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const lg = ctx.createRadialGradient(9, 5, 0, 9, 5, 20);
  lg.addColorStop(0, 'rgba(255,214,150,0.5)');
  lg.addColorStop(1, 'rgba(255,214,150,0)');
  ctx.fillStyle = lg;
  ctx.beginPath(); ctx.arc(9, 5, 20, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  drawLantern(ctx, 9, 6, true, t);
  // Riko in a sitting idle pose (feet dangling off the ledge)
  drawRiko(ctx, -8, -3, 10, 14, 1, 'idle', (t * 6) | 0, false, false);
  // dangling legs
  ctx.fillStyle = '#333a49';
  ctx.fillRect(-5, 10, 2, 5); ctx.fillRect(-1, 10, 2, 5);
  ctx.restore();

  rain(ctx, W, H, t, false);
  lightning(ctx, W, H, t, '#7db8ff');
  skyFarolero(ctx, W, H, t);

  // vignette so the DOM buttons pop
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.9);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, 'rgba(2,3,10,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}
