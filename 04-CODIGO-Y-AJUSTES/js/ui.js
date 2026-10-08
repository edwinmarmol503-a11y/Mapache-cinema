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
    ctx.font = 'bold 9px "Courier New", monospace';
    ctx.textAlign = 'right';
    outText(ctx, ITEM_DEFS[sel] && ITEM_DEFS[sel].consumable ? 'x' + n : '∞', bx + 15, by + 16, '#ffffff');
    ctx.textAlign = 'left';
  } else {
    ctx.font = 'bold 9px "Courier New", monospace';
    outText(ctx, '--', bx + 4, by + 10, '#9fb2cc');
  }
  ctx.font = 'bold 9px "Courier New", monospace';
  outText(ctx, 'Q/R', bx + 20, by + 12, '#c3d0e4');

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
  ctx.font = 'bold 9px "Courier New", monospace';
  outText(ctx, 'L', bx + 29, by + 26, '#c3d0e4');

  // memory counter
  const mem = (world.save.data && world.save.data.memories) || 0;
  ctx.font = 'bold 9px "Courier New", monospace';
  drawItemIcon(ctx, 'memory', world.W - 36, 6);
  outText(ctx, 'x' + mem, world.W - 23, 15, '#ffd66a');

  // The ranked clock uses elapsed wall time, matching the server's run timer.
  // Pausing cannot make a competitive record artificially faster.
  const clockStart = Number.isFinite(world._levelClockStart) ? world._levelClockStart : performance.now();
  const elapsedMs = world._rankingStarting ? 0 : world._levelFinalMs ??
    Math.max(0, (world._levelClockCarry || 0) + performance.now() - clockStart);
  const minutes = String(Math.floor(elapsedMs / 60000)).padStart(2, '0');
  const seconds = String(Math.floor(elapsedMs / 1000) % 60).padStart(2, '0');
  const hundredths = String(Math.floor(elapsedMs / 10) % 100).padStart(2, '0');
  const timerX = Math.round(world.W / 2 - 47);
  ctx.fillStyle = 'rgba(5,10,20,0.82)';
  ctx.fillRect(timerX, 5, 94, 27);
  ctx.strokeStyle = world._levelTicket ? '#557b6b' : '#354760';
  ctx.strokeRect(timerX + 0.5, 5.5, 93, 26);
  ctx.textAlign = 'center';
  ctx.font = 'bold 10px "Courier New", monospace';
  outText(ctx, minutes + ':' + seconds + '.' + hundredths, world.W / 2, 15, '#f0e6bb');
  ctx.font = 'bold 7px "Courier New", monospace';
  const onlineLabel = world._rankingStarting ? 'CONECTANDO...' : world._levelTicket ? 'ONLINE' : 'LOCAL';
  outText(ctx, 'N' + ((world.levelIndex || 0) + 1) + '  ' + onlineLabel, world.W / 2, 26,
    world._rankingStarting ? '#d7ca8e' : world._levelTicket ? '#9bdbb1' : '#acbfce');
  ctx.textAlign = 'left';

  // "clear the zone" objectives (only on levels with an exit)
  if (world.exitRect && (world.enemiesTotal > 0 || world.lanternsTotal > 0)) {
    const rw = 96, rx = world.W - rw - 6, ry = 20;
    const done = world.cleared;
    ctx.fillStyle = 'rgba(4,8,18,0.92)';
    ctx.fillRect(rx, ry, rw, 30);
    ctx.strokeStyle = done ? '#6fbf73' : '#3b4c6b';
    ctx.strokeRect(rx + 0.5, ry + 0.5, rw - 1, 29);
    ctx.textAlign = 'left';
    ctx.font = 'bold 9px "Courier New", monospace';

    ctx.fillStyle = world.enemiesKilled >= world.enemiesTotal ? '#7fd98a' : '#ff8a6a';
    ctx.fillRect(rx + 5, ry + 6, 7, 7);
    ctx.fillStyle = '#141820'; ctx.fillRect(rx + 6, ry + 8, 5, 3);
    outText(ctx, 'Enemigos ' + world.enemiesKilled + '/' + world.enemiesTotal, rx + 17, ry + 12, '#ffffff');

    const lit = world.lanternsLit;
    ctx.fillStyle = lit >= world.lanternsTotal ? '#7fd98a' : '#f4c542';
    ctx.fillRect(rx + 5, ry + 18, 7, 7);
    outText(ctx, 'Faroles  ' + lit + '/' + world.lanternsTotal, rx + 17, ry + 24, '#ffffff');
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

/* Day uses its own material colors, keeping hazards and ledges easy to read. */
export const DAY_TILE_PALETTES = {
  roofs: { body: '#a66e57', body2: '#875744', line: 'rgba(76,43,39,0.45)', top: '#cc9771', topHi: '#f6cf95', plat: '#997d60', platHi: '#ffe2a9', spike: '#ae3945', spikeHi: '#ffd8c2' },
  forest: { body: '#8d8661', body2: '#6a6c51', line: 'rgba(55,86,47,0.32)', top: '#69a95e', topHi: '#b6d979', plat: '#807c54', platHi: '#d4d99a', spike: '#a54543', spikeHi: '#ffd8b0' },
  sewers: { body: '#64867c', body2: '#45665f', line: 'rgba(28,54,52,0.32)', top: '#7cba9f', topHi: '#c6ddae', plat: '#658c86', platHi: '#c6e2cf', spike: '#b18c3c', spikeHi: '#fff0b7' },
  district: { body: '#a69b8e', body2: '#827d73', line: 'rgba(65,66,68,0.38)', top: '#c2b29a', topHi: '#f0ddad', plat: '#9b8c76', platHi: '#e7d5b5', spike: '#ad424c', spikeHi: '#ffdad0' },
  tower: { body: '#a5a0b4', body2: '#858198', line: 'rgba(74,62,99,0.32)', top: '#c4b9ca', topHi: '#f3e6d0', plat: '#9387a4', platHi: '#dfcdec', spike: '#9555aa', spikeHi: '#f8d7ff' },
};

function modeFor(world, visualMode) {
  return visualMode || world.visualMode || (world.brightMode ? 'clear' : 'night');
}

/* ---------------- parallax backgrounds (per theme) ---------------- */
export function drawBackground(ctx, world, visualMode) {
  const W = world.W, H = world.H;
  const cam = world.camera;
  const theme = world.levelDef.key;
  const t = performance.now() / 1000;
  const mode = modeFor(world, visualMode);
  const day = mode === 'day';
  const clear = mode === 'clear';

  const SKY = (day ? {
    roofs: ['#67b4e7', '#adddf0', '#f4e7c1'],
    forest: ['#6fbeda', '#b3e0d7', '#e5efc6'],
    sewers: ['#2e5553', '#4b736c', '#77968a'],
    district: ['#7ab9da', '#c4dae1', '#f2d9b1'],
    tower: ['#88b9e0', '#c9d9e9', '#f5e4cc'],
  } : clear ? {
    roofs: ['#142849', '#1b3659', '#26466c'],
    forest: ['#112d3f', '#193c4b', '#25514d'],
    sewers: ['#15302d', '#1b3d38', '#254e45'],
    district: ['#252038', '#32293e', '#443449'],
    tower: ['#23203d', '#2b284c', '#3c365b'],
  } : {
    roofs:    ['#0d1730', '#111d3a', '#1a2a4e'],
    forest:   ['#071522', '#0a1d2c', '#0e2636'],
    sewers:   ['#0a1414', '#0c1a1a', '#102424'],
    district: ['#120d18', '#17111e', '#1d1626'],
    tower:    ['#0b0a1c', '#100e26', '#181336'],
  })[theme] || ['#0a1024', '#0c1430', '#122048'];

  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, SKY[0]); g.addColorStop(0.55, SKY[1]); g.addColorStop(1, SKY[2]);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (theme === 'roofs') bgRoofs(ctx, world, t, day, clear);
  else if (theme === 'forest') bgForest(ctx, world, t, day, clear);
  else if (theme === 'sewers') bgSewers(ctx, world, t, day, clear);
  else if (theme === 'district') bgDistrict(ctx, world, t, day, clear);
  else if (theme === 'tower') bgTower(ctx, world, t, day, clear);
  else bgRoofs(ctx, world, t, day, clear);

  // random weather (chosen per level visit in game.loadLevel)
  // A sewer stays underground; outdoor weather never passes through its ceiling.
  if (!world.reducedEffects && theme !== 'sewers') weather(ctx, W, H, t, world.weather || 'clear', cam, day);

  // weather / events on top of the sky (behind gameplay)
  const BOLT = { roofs: '#7db8ff', forest: '#8fe8b0', sewers: '#66d8c8', district: '#ff8a6a', tower: '#c9a6ff' };
  if (!world.reducedEffects && !day && theme !== 'sewers') lightning(ctx, W, H, t, BOLT[theme] || '#7db8ff');
  else _lightningFlash = 0;
  if (!world.reducedEffects && !day && theme === 'roofs') skyFarolero(ctx, W, H, t);
  drawLevelScenery(ctx, world, day);
}

/* ---- random weather layer: rain / snow / leaves ---- */
function weather(ctx, W, H, t, kind, cam, day = false) {
  if (kind === 'rain') {
    ctx.strokeStyle = day ? 'rgba(54,112,148,0.26)' : 'rgba(170,195,240,0.20)';
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

function daylight(ctx, W, H, cam, t, sunX = 0.8) {
  const sx = W * sunX - cam.x * 0.02, sy = H * 0.17 - cam.y * 0.01;
  ctx.save();
  const glow = ctx.createRadialGradient(sx, sy, 5, sx, sy, 42);
  glow.addColorStop(0, 'rgba(255,247,202,0.55)');
  glow.addColorStop(1, 'rgba(255,247,202,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(sx - 42, sy - 42, 84, 84);
  ctx.fillStyle = '#fff0b0';
  // Stepped, pixel-art sun.
  ctx.fillRect(Math.round(sx - 9), Math.round(sy - 12), 18, 24);
  ctx.fillRect(Math.round(sx - 12), Math.round(sy - 9), 24, 18);
  ctx.fillStyle = '#fff9d5';
  ctx.fillRect(Math.round(sx - 6), Math.round(sy - 9), 9, 3);
  for (let i = 0; i < 5; i++) {
    const x = Math.round(((i * 111 + t * (2 + i * 0.25) - cam.x * 0.04) % (W + 100) + W + 100) % (W + 100) - 60);
    const y = Math.round(H * (0.09 + h1(i + 16) * 0.23) - cam.y * 0.01);
    ctx.fillStyle = 'rgba(247,253,255,0.78)';
    ctx.fillRect(x, y, 35 + (i % 3) * 7, 6);
    ctx.fillRect(x + 7, y - 5, 22, 6);
    ctx.fillRect(x + 13, y - 9, 11, 4);
    ctx.fillStyle = 'rgba(157,199,218,0.28)';
    ctx.fillRect(x + 3, y + 5, 29, 2);
  }
  // Small birds provide life without obscuring the playable path.
  ctx.strokeStyle = 'rgba(64,99,123,0.55)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 3; i++) {
    const x = ((W * 0.2 + i * 22 + t * 5 - cam.x * 0.06) % (W + 60) + W + 60) % (W + 60) - 15;
    const y = H * 0.24 + i * 5 + Math.sin(t * 2 + i) * 2;
    ctx.beginPath(); ctx.moveTo(x - 3, y - 1); ctx.lineTo(x, y + 1); ctx.lineTo(x + 3, y - 1); ctx.stroke();
  }
  ctx.restore();
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
function bgRoofs(ctx, world, t, day = false, clear = false) {
  const W = world.W, H = world.H, cam = world.camera;
  if (day) daylight(ctx, W, H, cam, t);
  else {
    stars(ctx, W, H, cam, t, 48, 0.62);
    moon(ctx, W * 0.8 - cam.x * 0.03, H * 0.2 - cam.y * 0.02, 15, false);
  }

  // far skyline
  drawCitLayer(ctx, W, H, cam, { s: 0.12, base: 0.42, col: day ? '#89b4c3' : clear ? '#263e5d' : '#12203c', win: day ? '#c4e0df' : 'rgba(255,210,140,0.10)', step: 30, seed: 4 }, t);
  // mid skyline (water towers, antennas)
  drawCitLayer(ctx, W, H, cam, { s: 0.28, base: 0.56, col: day ? '#7093a3' : clear ? '#1d334e' : '#0d1830', win: day ? '#afd5dd' : 'rgba(255,205,130,0.16)', step: 42, seed: 11, props: true }, t);
  // near rooftop band + pipes
  ctx.fillStyle = day ? '#637b88' : clear ? '#17283e' : '#0a1122';
  const nearY = H * 0.72;
  ctx.fillRect(0, nearY, W, H - nearY);
  ctx.fillStyle = day ? '#89a2ab' : clear ? '#20344d' : '#0c1526';
  for (let x = -((cam.x * 0.5) % 24) - 24; x < W + 24; x += 24) {
    ctx.fillRect(x, nearY - 3, 20, 3);           // parapet blocks
  }
  ctx.strokeStyle = day ? '#455d6e' : clear ? '#263e57' : '#0e1a30'; ctx.lineWidth = 2;
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
function bgForest(ctx, world, t, day = false, clear = false) {
  const W = world.W, H = world.H, cam = world.camera;
  if (day) daylight(ctx, W, H, cam, t, 0.72);
  else {
    stars(ctx, W, H, cam, t, 26, 0.4);
    moon(ctx, W * 0.72 - cam.x * 0.03, H * 0.15, 12, false);
  }

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
  pines(0.14, day ? '#80b6a0' : clear ? '#22444d' : '#0a1c26', 0.5, 34, 3);
  pines(0.3, day ? '#569178' : clear ? '#1d3943' : '#0b2430', 0.62, 26, 8);

  // mist bands
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const my = H * (0.45 + i * 0.16);
    const mo = ((t * (6 + i * 3) + i * 90) % (W + 120)) - 60;
    const mg = ctx.createLinearGradient(0, my - 8, 0, my + 8);
    mg.addColorStop(0, 'rgba(120,170,190,0)');
    mg.addColorStop(0.5, day ? 'rgba(230,250,211,0.16)' : 'rgba(120,170,190,0.06)');
    mg.addColorStop(1, 'rgba(120,170,190,0)');
    ctx.fillStyle = mg;
    ctx.fillRect(mo - 80, my - 8, 240, 16);
    ctx.fillRect(mo - 80 - (W + 120), my - 8, 240, 16);
  }
  ctx.restore();

  // near trunks
  ctx.fillStyle = day ? '#4d6e62' : clear ? '#183039' : '#08161e';
  worldStrip(cam.x, 0.55, 90, W, (i, x) => {
    const r = h1(i * 4.4 + 20);
    ctx.fillRect(x + 10, H * (0.32 + r * 0.22), 6 + (r * 5 | 0), H);
  });

  // Butterflies in daylight; fireflies at night.
  ctx.save();
  if (!day) ctx.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 14; i++) {
    const fx = (h1(i) * W + Math.sin(t * 0.7 + i) * 20 - cam.x * 0.4) % W;
    const x = fx < 0 ? fx + W : fx;
    const fy = H * 0.35 + h1(i + 5) * H * 0.5 + Math.cos(t * 0.9 + i * 2) * 8;
    const a = 0.3 + 0.3 * Math.sin(t * 3 + i * 4);
    ctx.fillStyle = day ? ['#f0d89a', '#bbdcec', '#d5a3b7'][i % 3] : 'rgba(150,255,190,' + a.toFixed(2) + ')';
    ctx.fillRect(x | 0, fy | 0, day ? 3 : 2, 2);
    if (day) { ctx.fillStyle = '#45655c'; ctx.fillRect((x | 0) + 1, (fy | 0) - 1, 1, 3); }
  }
  ctx.restore();
}

/* ---- SEWERS: receding tunnel arch, back pipes, drips ---- */
function bgSewers(ctx, world, t, day = false, clear = false) {
  const W = world.W, H = world.H, cam = world.camera;
  // brick back wall
  ctx.fillStyle = day ? '#3b605b' : clear ? '#1b3732' : '#0c1616';
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = day ? 'rgba(173,203,168,0.19)' : 'rgba(60,90,88,0.18)';
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
  ctx.strokeStyle = day ? 'rgba(158,193,178,0.48)' : 'rgba(90,130,125,0.25)';
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
  gg.addColorStop(0, day ? 'rgba(194,233,181,0.24)' : 'rgba(70,180,165,0.12)'); gg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = gg; ctx.beginPath(); ctx.arc(vx, vy, 60, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // back pipes
  for (const py of [H * 0.22, H * 0.34]) {
    ctx.fillStyle = day ? '#66857d' : clear ? '#2c4b43' : '#14201f';
    ctx.fillRect(0, py, W, 5);
    ctx.fillStyle = day ? '#2b4843' : clear ? '#1b312d' : '#0e1817';
    for (let x = -((cam.x * 0.2) % 40); x < W; x += 40) ctx.fillRect(x, py - 2, 4, 9); // brackets
    // valve wheel
    const wx = (W * 0.4 - cam.x * 0.2) % W;
    ctx.strokeStyle = day ? '#a1b9a1' : '#1b2c2a'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc((wx + W) % W, py + 2, 4, 0, Math.PI * 2); ctx.stroke();
  }
  // drips
  ctx.fillStyle = day ? 'rgba(205,237,219,0.65)' : 'rgba(140,200,190,0.4)';
  for (let i = 0; i < 8; i++) {
    const dx = (h1(i) * W - cam.x * 0.15) % W;
    const x = dx < 0 ? dx + W : dx;
    const dy = ((t * 40 + i * 55) % (H * 0.5)) + H * 0.15;
    ctx.fillRect(x | 0, dy | 0, 1, 3);
  }
  if (day) {
    // Shafts from street grates explain daylight without putting a sky in a tunnel.
    ctx.save();
    worldStrip(cam.x, 0.1, 160, W, (i, x) => {
      const gradient = ctx.createLinearGradient(0, 0, 0, H * 0.75);
      gradient.addColorStop(0, 'rgba(255,249,190,0.20)');
      gradient.addColorStop(1, 'rgba(255,249,190,0)');
      ctx.fillStyle = gradient;
      ctx.beginPath(); ctx.moveTo(x + 20, 0); ctx.lineTo(x + 34, 0); ctx.lineTo(x + 86, H * 0.8); ctx.lineTo(x + 20, H * 0.8); ctx.fill();
      ctx.fillStyle = '#79988a';
      for (let k = 0; k < 4; k++) ctx.fillRect(x + 19 + k * 5, 0, 2, 4);
    });
    ctx.restore();
  }
}

/* ---- DISTRICT: ruined skyline, broken neon, heavy rain ---- */
function bgDistrict(ctx, world, t, day = false, clear = false) {
  const W = world.W, H = world.H, cam = world.camera;
  if (day) daylight(ctx, W, H, cam, t, 0.24);
  else moon(ctx, W * 0.24 - cam.x * 0.03, H * 0.16, 11, false);

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
  ruins(0.12, day ? '#a3b4b7' : clear ? '#3a3045' : '#1a1424', 0.5, 34, 3, false);
  ruins(0.28, day ? '#859091' : clear ? '#2b2438' : '#140f1c', 0.66, 46, 9, true);

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
      ctx.globalAlpha = day ? 0.2 : 0.5;
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
  ctx.fillStyle = day ? '#646b69' : clear ? '#201c2b' : '#0b0810';
  ctx.fillRect(((slx + W) % (W * 1.5)) - 1, H * 0.3, 3, H);
  ctx.fillRect(((slx + W) % (W * 1.5)) - 6, H * 0.3, 12, 3);

  // Rain is drawn by the common weather layer, once per frame.
}

/* ---- TOWER: gothic buttresses climbing, clouds, motes ---- */
function bgTower(ctx, world, t, day = false, clear = false) {
  const W = world.W, H = world.H, cam = world.camera;
  if (day) daylight(ctx, W, H, cam, t, 0.5);
  else {
    stars(ctx, W, H, cam, t, 30, 0.9);
    moon(ctx, W * 0.5 - cam.x * 0.02, H * 0.24 - cam.y * 0.015, 22, true);
  }

  // drifting clouds across the moon
  ctx.save();
  for (let i = 0; i < 4; i++) {
    const cxp = ((t * (5 + i * 2) + i * 120) % (W + 200)) - 100;
    const cy = H * (0.14 + i * 0.09) - cam.y * 0.02;
    ctx.fillStyle = day ? 'rgba(230,240,255,0.25)' : 'rgba(20,18,40,0.55)';
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
    ctx.fillStyle = day ? '#9f9aaa' : clear ? '#2c2842' : '#120f26';
    ctx.fillRect(baseX, 0, 32, H);
    ctx.fillStyle = day ? '#60667d' : clear ? '#1e1b33' : '#0d0b1e';
    for (let y = (colY % 40) - 40; y < H; y += 40) {
      // arched window with faint stained-glass glow
      ctx.fillStyle = day ? '#60667d' : clear ? '#1e1b33' : '#0d0b1e';
      ctx.fillRect(baseX + 8, y + 8, 16, 24);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      const wg = ctx.createLinearGradient(0, y + 8, 0, y + 32);
      wg.addColorStop(0, day ? 'rgba(161,197,249,0.38)' : 'rgba(120,90,200,0.10)');
      wg.addColorStop(1, day ? 'rgba(250,223,165,0.32)' : 'rgba(230,180,90,0.10)');
      ctx.fillStyle = wg;
      ctx.fillRect(baseX + 9, y + 9, 14, 22);
      ctx.restore();
      // ledge
      ctx.fillStyle = day ? '#c0b6c2' : clear ? '#3a3154' : '#151230';
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

/* World-space decorations stay behind actors and never contribute collision. */
function drawLevelScenery(ctx, world, day) {
  const cam = world.camera, ts = world.map ? world.map.ts : 16;
  const cx = cam.renderX ?? cam.x, cy = cam.renderY ?? cam.y;
  const metal = day ? '#728a87' : '#263b49';
  const edge = day ? '#c0d0b2' : '#496171';
  const wood = day ? '#9f8062' : '#443f40';
  for (const item of world.levelDef.scenery || []) {
    const x = Math.round(item.tx * ts - cx), y = Math.round(item.ty * ts - cy);
    if (x < -80 || x > world.W + 80 || y < -96 || y > world.H + 40) continue;
    ctx.save();
    if (item.type === 'vent') {
      ctx.fillStyle = metal; ctx.fillRect(x, y - 17, 21, 17);
      ctx.fillStyle = edge; ctx.fillRect(x - 2, y - 18, 25, 3);
      ctx.fillStyle = day ? '#4f686d' : '#152835';
      for (let i = 0; i < 3; i++) ctx.fillRect(x + 3, y - 13 + i * 4, 15, 1);
    } else if (item.type === 'planter' || item.type === 'fern') {
      ctx.fillStyle = day ? '#557d4a' : '#294b3d';
      ctx.fillRect(x + 5, y - 15, 2, 14);
      for (let i = 0; i < 3; i++) {
        ctx.fillRect(x - 1 + i * 2, y - 14 + i * 3, 7, 2);
        ctx.fillRect(x + 6, y - 12 + i * 3, 7 - i, 2);
      }
      if (item.type === 'planter') {
        ctx.fillStyle = day ? '#b9765c' : '#654639'; ctx.fillRect(x + 1, y - 5, 12, 5);
        ctx.fillStyle = day ? '#e7b28a' : '#8c674a'; ctx.fillRect(x, y - 6, 14, 2);
      }
    } else if (item.type === 'bench') {
      ctx.fillStyle = wood; ctx.fillRect(x, y - 11, 26, 3); ctx.fillRect(x, y - 6, 26, 3);
      ctx.fillStyle = metal; ctx.fillRect(x + 3, y - 12, 2, 12); ctx.fillRect(x + 21, y - 12, 2, 12);
    } else if (item.type === 'pipe') {
      ctx.fillStyle = metal; ctx.fillRect(x, y - 28, 7, 28); ctx.fillRect(x, y - 29, 28, 7);
      ctx.fillStyle = edge; ctx.fillRect(x + 1, y - 22, 1, 20); ctx.fillRect(x + 2, y - 28, 24, 1);
      ctx.fillStyle = day ? '#a7b6a2' : '#425f5b'; ctx.fillRect(x - 2, y - 17, 11, 3);
    } else if (item.type === 'banner') {
      ctx.fillStyle = metal; ctx.fillRect(x, y - 64, 2, 60); ctx.fillRect(x, y - 64, 21, 2);
      ctx.fillStyle = day ? '#a97693' : '#493356'; ctx.fillRect(x + 4, y - 61, 15, 37);
      ctx.fillStyle = day ? '#efd9b8' : '#ac905d'; ctx.fillRect(x + 10, y - 53, 3, 17); ctx.fillRect(x + 6, y - 48, 11, 3);
      ctx.fillRect(x + 4, y - 25, 5, 3); ctx.fillRect(x + 14, y - 25, 5, 3);
    } else if (item.type === 'sign') {
      ctx.fillStyle = wood; ctx.fillRect(x + 12, y - 20, 3, 20);
      const width = Math.max(28, (item.label || '').length * 5 + 8);
      ctx.fillStyle = day ? '#47746e' : '#203b41'; ctx.fillRect(x, y - 29, width, 13);
      ctx.strokeStyle = day ? '#c7d9bc' : '#658b7e'; ctx.strokeRect(x + 0.5, y - 28.5, width - 1, 12);
      ctx.font = 'bold 7px "Courier New", monospace'; ctx.textAlign = 'center';
      ctx.fillStyle = day ? '#f8f0cd' : '#cddac0'; ctx.fillText(item.label || '>>', x + width / 2, y - 20);
    } else if (item.type === 'puddle') {
      const width = item.w || 32;
      ctx.fillStyle = day ? 'rgba(151,208,211,0.72)' : 'rgba(49,82,111,0.62)'; ctx.fillRect(x, y - 2, width, 2);
      ctx.fillStyle = day ? 'rgba(246,245,200,0.74)' : 'rgba(166,202,232,0.45)';
      ctx.fillRect(x + 4, y - 2, width / 3 | 0, 1); ctx.fillRect(x + width - 7, y - 1, 4, 1);
    }
    ctx.restore();
  }
}

/* ============================================================
   MENU SCENE  -  drawn on the canvas behind the DOM menu:
   Riko sitting on a rooftop, looking at the nocturnal city.
   ============================================================ */
export function drawMenuScene(ctx, W, H, visualMode = 'night', reducedEffects = false) {
  const t = performance.now() / 1000;
  const day = visualMode === 'day';
  const clear = visualMode === 'clear';
  const camX = t * 6;                                  // slow drift
  const fakeCam = { x: camX, y: 0, renderX: camX, renderY: 0 };

  // sky
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, day ? '#6dbce5' : clear ? '#193554' : '#0c1732');
  g.addColorStop(0.55, day ? '#b6dfeb' : clear ? '#26496b' : '#122048');
  g.addColorStop(1, day ? '#f1e1b9' : clear ? '#3d6082' : '#1a2c58');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);

  if (day) daylight(ctx, W, H, fakeCam, t);
  else {
    stars(ctx, W, H, fakeCam, t, 46, 0.6);
    moon(ctx, W * 0.82, H * 0.22, 20, false);
  }

  // city skyline (3 depths)
  drawCitLayer(ctx, W, H, fakeCam, { s: 0.10, base: 0.42, col: day ? '#93b7c0' : clear ? '#2d4866' : '#16274a', win: day ? '#d4e7db' : 'rgba(255,214,150,0.12)', step: 34, seed: 4 }, t);
  drawCitLayer(ctx, W, H, fakeCam, { s: 0.24, base: 0.55, col: day ? '#78949e' : clear ? '#223c56' : '#0f1c38', win: day ? '#b1d8da' : 'rgba(255,208,140,0.18)', step: 46, seed: 12, props: true }, t);
  drawCitLayer(ctx, W, H, fakeCam, { s: 0.44, base: 0.66, col: day ? '#697f86' : clear ? '#1b2d45' : '#0b1428', win: day ? '#a5c1c5' : 'rgba(255,205,135,0.15)', step: 60, seed: 21, props: true }, t);

  // near rooftop the raccoon sits on
  const roofY = Math.round(H * 0.78);
  ctx.fillStyle = day ? '#7c6255' : clear ? '#172538' : '#0a1020';
  ctx.fillRect(0, roofY, W, H - roofY);
  ctx.fillStyle = day ? '#c79d79' : clear ? '#2c3a4c' : '#0d1526';
  ctx.fillRect(0, roofY - 4, W, 4);                    // ledge lip
  ctx.fillStyle = day ? '#a48268' : clear ? '#243347' : '#0c1424';
  for (let x = -((camX * 0.5) % 22); x < W; x += 22) ctx.fillRect(x, roofY - 8, 16, 4); // parapet
  // a vent + a chimney
  ctx.fillStyle = day ? '#888982' : clear ? '#263b50' : '#0e1730';
  ctx.fillRect(W * 0.62, roofY - 20, 22, 20);
  ctx.fillRect(W * 0.20, roofY - 30, 12, 30);
  ctx.fillStyle = day ? '#bdb9a0' : clear ? '#3c5068' : '#182240';
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
  lg.addColorStop(0, day ? 'rgba(255,214,150,0.12)' : 'rgba(255,214,150,0.5)');
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

  if (!day && !reducedEffects) {
    rain(ctx, W, H, t, false);
    lightning(ctx, W, H, t, '#7db8ff');
    skyFarolero(ctx, W, H, t);
  } else _lightningFlash = 0;

  // vignette so the DOM buttons pop
  const vg = ctx.createRadialGradient(W / 2, H / 2, H * 0.25, W / 2, H / 2, H * 0.9);
  vg.addColorStop(0, 'rgba(0,0,0,0)');
  vg.addColorStop(1, day ? 'rgba(38,65,79,0.16)' : visualMode === 'clear' ? 'rgba(2,3,10,0.25)' : 'rgba(2,3,10,0.55)');
  ctx.fillStyle = vg;
  ctx.fillRect(0, 0, W, H);
}

