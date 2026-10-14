/* Three independent, presentation-only finales. No save, inventory or ranking
   system is imported here, so the developer gallery cannot award a result. */
import { px, drawRiko, drawSombra, drawCuervo, drawGuardian, drawLantern } from './sprites.js';
import { celebrationSky } from './ui.js';

export const ENDINGS = Object.freeze({
  A: Object.freeze({
    choice: 'Devolverla a Lumera', title: 'FELICIDADES', theme: 'ending',
    subtitle: 'Devolviste la luz. Lumera vuelve a brillar.',
    narration: 'La ciudad recordó lo justo para seguir. Y por fin, algunas cosas pudieron olvidarse.',
    dialogue: Object.freeze([
      { speaker: 'Riko', text: 'Riko abrió la esfera. La luz se derramó y volvió a cada farol de Lumera.' },
      { text: 'La ciudad recordó lo justo para seguir. Y por fin, algunas cosas pudieron olvidarse.' },
      { text: 'FINAL A — DEVOLVER LA LUZ' },
    ]),
  }),
  B: Object.freeze({
    choice: 'Conservarla, como él', title: 'LA NUEVA AMENAZA', theme: 'ending-bad',
    subtitle: 'Conservaste la luz. Las sombras ahora siguen a Riko.',
    narration: 'Y con el poder de la luz en la palma de su mano, Riko consiguió un inmenso poder que lo fue corrompiendo poco a poco hasta convertirse en lo que juró destruir, la nueva amenaza de Ciudad Lumera…',
    dialogue: Object.freeze([
      { speaker: 'Riko', text: 'Riko decidió conservar la esfera. La luz lo elevó sobre Lumera y las sombras se reunieron a su lado.' },
      { text: 'Y con el poder de la luz en la palma de su mano, Riko consiguió un inmenso poder que lo fue corrompiendo poco a poco hasta convertirse en lo que juró destruir, la nueva amenaza de Ciudad Lumera…' },
      { text: 'FINAL B — CONSERVAR LA LUZ' },
    ]),
  }),
  C: Object.freeze({
    choice: 'Compartirla con todos', title: 'FELICIDADES', theme: 'ending',
    subtitle: 'Compartiste la luz con todos. El final verdadero.',
    narration: 'Una chispa en cada mano. Lumera recordaría junta, y junta podría cambiar.',
    dialogue: Object.freeze([
      { speaker: 'Riko', text: 'Riko partió la esfera en mil chispas y las repartió por los tejados.' },
      { text: 'Cada quien guardaría un poco. Lumera recordaría junta, y junta podría cambiar.' },
      { text: 'FINAL C — COMPARTIR LA LUZ · EL FINAL VERDADERO' },
    ]),
  }),
});

export const isEnding = (value) => Object.prototype.hasOwnProperty.call(ENDINGS, value);
export const endingMusicTheme = (value) => (ENDINGS[value] || ENDINGS.A).theme;
// Dialogue owns mutable typewriter state; every showing receives fresh lines.
export const getEndingDialogue = (value) => (ENDINGS[value] || ENDINGS.A).dialogue.map(line => ({ ...line }));

const PREVIEW_SALT = 'c184161258b44b0f328039ab803e2902';
const PREVIEW_DIGEST = '7f76e8573c1c777c279d04b92bfcda608671c988c7d96e830ab19a73e84a070b';

/** A local exhibition switch, independent of controller access. Not an account. */
export function createEndingAccess({ cryptoProvider = globalThis.crypto } = {}) {
  let unlocked = false, revision = 0;
  return {
    isUnlocked: () => unlocked,
    async unlock(value) {
      const code = String(value || '').trim().toUpperCase();
      if (!code || code.length > 80 || !cryptoProvider?.subtle || typeof TextEncoder === 'undefined') return false;
      const attempt = revision;
      try {
        const hash = await cryptoProvider.subtle.digest('SHA-256', new TextEncoder().encode(PREVIEW_SALT + ':' + code));
        if (attempt !== revision) return false;
        const digest = [...new Uint8Array(hash)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        if (digest !== PREVIEW_DIGEST) return false;
        unlocked = true;
        return true;
      } catch { return false; }
    },
    lock() { revision++; unlocked = false; },
  };
}

const TAU = Math.PI * 2;
const clamp = (value, min = 0, max = 1) => Math.min(max, Math.max(min, value));
const hash = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); };

function glow(ctx, x, y, radius, color, alpha = 0.5) {
  const gradient = ctx.createRadialGradient(x, y, 0, x, y, radius);
  gradient.addColorStop(0, `rgba(${color},${alpha})`);
  gradient.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = gradient;
  ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
}

function skyline(ctx, ending, t, visualMode, reduced, compact) {
  const dark = ending === 'B', day = visualMode === 'day' && !dark;
  const sky = ctx.createLinearGradient(0, 0, 0, 270);
  sky.addColorStop(0, dark ? '#080819' : day ? '#72b8d9' : '#0b1b37');
  sky.addColorStop(1, dark ? '#392540' : day ? '#efdab0' : ending === 'C' ? '#25465b' : '#293958');
  ctx.fillStyle = sky; ctx.fillRect(0, 0, 480, 270);
  if (!day) {
    for (let i = 0; i < 60; i++) {
      ctx.globalAlpha = reduced ? .6 : .38 + (Math.sin(t * .55 + i) + 1) * .24;
      px(ctx, hash(i + 3) * 480, 10 + hash(i + 31) * 130, 1, 1, dark ? '#b8a7d0' : '#c7e7ff');
    }
    ctx.globalAlpha = 1;
  }
  glow(ctx, 401, 63, 30, dark ? '139,119,176' : '190,220,255', .12);
  ctx.fillStyle = dark ? '#84759c' : day ? '#fff0ca' : '#d6deec';
  ctx.beginPath(); ctx.arc(401, 63, day ? 12 : 16, 0, TAU); ctx.fill();
  if (!dark) celebrationSky(ctx, 480, 270, t, day, reduced);
  for (let layer = 0; layer < 3; layer++) {
    for (let i = -1; i < 14; i++) {
      const x = i * 41 + layer * 13;
      const h = 29 + hash(i + layer * 40) * (55 + layer * 12);
      const floor = (compact ? 158 : 207) + layer * 5;
      px(ctx, x, floor - h, 33, h, dark ? ['#262238', '#201b30', '#171825'][layer] : day ? ['#97adad', '#778e94', '#4e656f'][layer] : ['#22344e', '#192b44', '#10233a'][layer]);
      px(ctx, x + 10, floor - h - 5, 9, 5, dark ? '#252235' : day ? '#789497' : '#213850');
      for (let col = 0; col < 4; col++) for (let row = 0; row < Math.floor((h - 7) / 9); row++) {
        const seed = hash(i * 173 + layer * 271 + row * 7 + col);
        const progress = reduced ? 1 : clamp(t / 10);
        const lit = dark ? seed > .87 : ending === 'A' ? x / 480 < progress && seed > .18 : seed > .16;
        px(ctx, x + 5 + col * 6, floor - h + 6 + row * 9, 2, 3,
          lit ? (ending === 'C' && seed > .62 ? '#a6e0eb' : dark ? '#a38481' : '#e2bb75') : dark ? '#2e293c' : day ? '#98b2b2' : '#304153');
      }
    }
  }
  const roof = compact ? 167 : 216;
  px(ctx, 0, roof, 480, 270 - roof, dark ? '#141523' : '#17253a');
  px(ctx, 0, roof, 480, 3, dark ? '#74617d' : '#9f8870');
  for (let row = 0; row < 14; row++) {
    px(ctx, 0, roof + 9 + row * 8, 480, 1, dark ? '#252134' : '#2b3648');
    for (let x = -12 + (row % 2) * 12; x < 480; x += 24) px(ctx, x, roof + 3 + row * 8, 1, 6, dark ? '#252134' : '#2b3648');
  }
}

function pixelSpark(ctx, x, y, color, size = 1) {
  ctx.fillStyle = color;
  ctx.fillRect(Math.round(x) - size, Math.round(y), size * 3, size);
  ctx.fillRect(Math.round(x), Math.round(y) - size, size, size * 3);
}

function returnLight(ctx, t, reduced, compact) {
  const walk = reduced ? 0 : Math.sin(t * .12) * 30;
  const offset = compact ? 49 : 0;
  const x = 128 + walk, y = 178 - offset;
  // The restored light flows into the city, while Riko keeps walking its roofs.
  for (let i = 0; i < 6; i++) {
    const targetX = 40 + i * 78, targetY = 151 + hash(i + 80) * 38 - offset;
    const p = reduced ? .68 : (t * .22 + i * .16) % 1;
    const startX = x + 27, startY = y + 7;
    const sx = startX + (targetX - startX) * p, sy = startY + (targetY - startY) * p - Math.sin(p * Math.PI) * 42;
    ctx.strokeStyle = 'rgba(255,223,147,.12)'; ctx.lineWidth = .8;
    ctx.beginPath(); ctx.moveTo(startX, startY); ctx.quadraticCurveTo((startX + targetX) / 2, 105 - offset * .5, targetX, targetY); ctx.stroke();
    glow(ctx, sx, sy, 8, '255,211,127', .33);
    pixelSpark(ctx, sx, sy, '#fff2bc');
  }
  for (let i = 0; i < 5; i++) {
    const lampX = 43 + i * 92;
    px(ctx, lampX - 1, 197 - offset, 2, 19, '#576273');
    drawLantern(ctx, lampX, 196 - offset, true, reduced ? 0 : t);
  }
  ctx.save(); ctx.translate(x, y); ctx.scale(2.3, 2.3);
  drawRiko(ctx, 0, 0, 10, 14, 1, reduced ? 'idle' : 'walk', reduced ? 18 : Math.floor(t * 9), false, true);
  ctx.restore();
  for (let i = 0; i < 20; i++) {
    const p = reduced ? hash(i) : (t * .08 + hash(i)) % 1;
    pixelSpark(ctx, 15 + hash(i + 140) * 450, 75 + p * 112, i % 3 ? '#e9c781' : '#a7dbef', .7);
  }
}

/** A symmetrical muzzle and pupils make his gaze explicitly face the viewer. */
function frontalRiko(ctx, x, y, scale, corruption, t) {
  ctx.save(); ctx.translate(x, y); ctx.scale(scale, scale);
  const out = '#172030', fur = '#a4aebd', pale = '#e7edf3', mask = '#293346';
  px(ctx, -11, 0, 4, 12, out); px(ctx, -10, 1, 3, 10, fur);
  for (let n = 0; n < 3; n++) px(ctx, -10, 2 + n * 4, 3, 2, mask);
  px(ctx, -7, -1, 14, 15, out); px(ctx, -6, 0, 12, 12, '#68788e');
  px(ctx, -4, 2, 8, 8, pale); px(ctx, -6, 11, 4, 4, mask); px(ctx, 2, 11, 4, 4, mask);
  px(ctx, -8, -9, 4, 5, out); px(ctx, 4, -9, 4, 5, out);
  px(ctx, -7, -8, 2, 3, fur); px(ctx, 5, -8, 2, 3, fur);
  px(ctx, -8, -5, 16, 9, out); px(ctx, -7, -4, 14, 7, fur);
  px(ctx, -7, -2, 14, 4, mask); px(ctx, -2, -4, 4, 3, pale);
  px(ctx, -6, -1, 4, 2, corruption > .4 ? '#ffe49c' : '#c9eaff');
  px(ctx, 2, -1, 4, 2, corruption > .4 ? '#ffe49c' : '#c9eaff');
  px(ctx, -4, -1, 1, 2, '#192037'); px(ctx, 3, -1, 1, 2, '#192037');
  px(ctx, -3, 1, 6, 3, pale); px(ctx, -1, 1, 2, 1, '#222e41');
  px(ctx, -6, 4, 12, 2, '#9b3637'); px(ctx, 2, 5, 2, 4, '#b64540');
  px(ctx, -10, 4, 4, 3, fur); px(ctx, -11, 3, 3, 3, pale);
  px(ctx, 6, 3, 5, 3, fur); px(ctx, 9, 1, 3, 4, pale);
  // The power is held in his palm; it never becomes a projectile.
  glow(ctx, 10, -1, 8, '255,215,127', .6);
  pixelSpark(ctx, 10, -2, '#fff8db', 1);
  ctx.restore();
}

function corruptedLight(ctx, t, reduced, compact) {
  const corruption = reduced ? .8 : clamp(t / 18);
  const offset = compact ? 49 : 0;
  const cx = 240, cy = (compact ? 112 : 143) + (reduced ? 0 : Math.sin(t * 1.15) * 3);
  const radius = compact ? 39 : 49;
  glow(ctx, cx, cy, 77, '170,113,222', .10 + corruption * .18);
  glow(ctx, cx, cy, 58, '255,215,125', .28);
  const sphere = ctx.createRadialGradient(cx - 13, cy - 18, 2, cx, cy, radius);
  sphere.addColorStop(0, 'rgba(255,245,199,.16)');
  sphere.addColorStop(.76, 'rgba(245,199,106,.07)');
  sphere.addColorStop(.96, 'rgba(249,214,143,.46)');
  sphere.addColorStop(1, 'rgba(249,214,143,0)');
  ctx.fillStyle = sphere; ctx.beginPath(); ctx.arc(cx, cy, radius, 0, TAU); ctx.fill();
  for (let ring = 0; ring < 3; ring++) {
    ctx.strokeStyle = ring ? 'rgba(207,177,243,.23)' : 'rgba(255,235,170,.7)';
    ctx.lineWidth = ring ? .7 : 1;
    ctx.beginPath(); ctx.ellipse(cx, cy, radius - 1 + ring * 3, radius - 3 - ring * 6, ring * .7 + (reduced ? 0 : t * .04), 0, TAU); ctx.stroke();
  }
  // Calm, stationary guards flank their new leader; no lunges or attack poses.
  for (const side of [-1, 1]) {
    const gx = cx + side * 106;
    glow(ctx, gx, 204 - offset, 22, '168,143,221', .17);
    ctx.save(); ctx.translate(gx - 12, 182 - offset); ctx.scale(1.45, 1.45);
    drawGuardian(ctx, 0, 0, 16, 23, -side, 0, false, false); ctx.restore();
    ctx.save(); ctx.translate(cx + side * 65 - 7, 195 - offset); ctx.scale(1.35, 1.35);
    drawSombra(ctx, 0, 0, 12, 15, -side, reduced ? 0 : Math.floor(t * 3), false); ctx.restore();
    ctx.save(); ctx.translate(cx + side * 89 - 6, 132 - offset * .7 + (reduced ? 0 : Math.sin(t + side) * 2));
    drawCuervo(ctx, 0, 0, 14, 11, -side, reduced ? 0 : Math.floor(t * 4), false); ctx.restore();
    ctx.strokeStyle = 'rgba(224,182,239,.15)'; ctx.lineWidth = .6;
    ctx.beginPath(); ctx.moveTo(cx + side * 33, cy + 28); ctx.quadraticCurveTo(cx + side * 50, 210 - offset, gx, 210 - offset); ctx.stroke();
  }
  glow(ctx, cx, 215 - offset, 35, '220,179,255', .23);
  ctx.fillStyle = 'rgba(236,200,255,.26)'; ctx.beginPath(); ctx.ellipse(cx, 215 - offset, 30, 3, 0, 0, TAU); ctx.fill();
  frontalRiko(ctx, cx, cy - 3, compact ? 1.9 : 2.2, corruption, t);
  for (let i = 0; i < 20; i++) {
    const angle = i / 20 * TAU + (reduced ? 0 : t * .18);
    const r = radius - 1 + Math.sin(i * 3) * 7;
    pixelSpark(ctx, cx + Math.cos(angle) * r, cy + Math.sin(angle) * r,
      i % 4 === 0 && corruption > .5 ? '#d6a6ef' : '#f8d58b', .7);
  }
}

function citizen(ctx, x, y, variant, light) {
  ctx.save(); ctx.translate(x, y);
  const coat = ['#52778d', '#886989', '#778a77', '#a37c68'][variant % 4];
  px(ctx, -4, -17, 8, 7, '#1c2b3c'); px(ctx, -3, -16, 6, 5, '#c1b7ae');
  px(ctx, -4, -10, 8, 9, coat); px(ctx, -3, -1, 2, 3, '#142536'); px(ctx, 1, -1, 2, 3, '#142536');
  px(ctx, 4, -10, 4, 2, '#c1b7ae');
  if (light) { glow(ctx, 7, -12, 12, '255,218,145', .43); pixelSpark(ctx, 7, -13, '#fff0bb'); }
  ctx.restore();
}

function sharedLight(ctx, t, reduced, compact) {
  const offset = compact ? 49 : 0;
  const centerX = 240, centerY = 168 - offset;
  const progress = reduced ? 1 : clamp(t / 6);
  glow(ctx, centerX, centerY, 58, '144,222,238', .20);
  for (let i = 0; i < 6; i++) {
    const x = 48 + i * 76;
    const y = 209 + (i % 2 ? 3 : 0) - offset;
    citizen(ctx, x, y, i, progress > .2 + i * .1);
    const p = reduced ? .72 : (t * .22 + i * .16) % 1;
    const endX = x + 7, endY = y - 13;
    const sparkX = centerX + (endX - centerX) * p;
    const sparkY = centerY + (endY - centerY) * p - Math.sin(p * Math.PI) * 27;
    ctx.strokeStyle = 'rgba(158,223,236,.2)'; ctx.lineWidth = .7;
    ctx.beginPath(); ctx.moveTo(centerX, centerY); ctx.quadraticCurveTo((centerX + endX) / 2, 122 - offset * .5, endX, endY); ctx.stroke();
    glow(ctx, sparkX, sparkY, 7, '255,223,153', .48);
    pixelSpark(ctx, sparkX, sparkY, '#fff2bd');
  }
  frontalRiko(ctx, centerX, 187 - offset, 1.8, 0, t);
  // The sphere is already open: separated motes form an expanding constellation.
  for (let i = 0; i < 34; i++) {
    const angle = i * 2.39996;
    const radius = 23 + hash(i + 30) * 64;
    const sway = reduced ? 0 : Math.sin(t * .35 + i) * 3;
    const x = centerX + Math.cos(angle) * radius * 1.8;
    const y = 131 + Math.sin(angle) * radius * .55 + sway - offset * .6;
    pixelSpark(ctx, x, y, i % 3 ? '#ffdda0' : '#9ee4f4', i % 9 === 0 ? 1 : .65);
  }
}

/** Pure rendering. Time is supplied by the app, and reduced motion is static. */
export function drawEndingScene(ctx, W, H, time, ending = 'A', visualMode = 'night', reducedEffects = false, compact = false) {
  const key = isEnding(ending) ? ending : 'A';
  const t = reducedEffects ? 12 : Math.max(0, Number.isFinite(time) ? time : 0);
  ctx.save(); ctx.scale(W / 480, H / 270); ctx.imageSmoothingEnabled = false;
  skyline(ctx, key, t, visualMode, reducedEffects, compact);
  if (key === 'B') corruptedLight(ctx, t, reducedEffects, compact);
  else if (key === 'C') sharedLight(ctx, t, reducedEffects, compact);
  else returnLight(ctx, t, reducedEffects, compact);
  const grade = ctx.createLinearGradient(0, 0, 0, 270);
  grade.addColorStop(0, 'rgba(2,5,13,.52)'); grade.addColorStop(.31, 'rgba(2,5,13,0)');
  grade.addColorStop(.78, 'rgba(2,5,13,0)'); grade.addColorStop(1, 'rgba(2,5,13,.66)');
  ctx.fillStyle = grade; ctx.fillRect(0, 0, 480, 270);
  ctx.restore();
}
