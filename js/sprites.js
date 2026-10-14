/* ============================================================
   sprites.js  -  procedural pixel-art drawers.
   Each function draws into ctx at screen coords. Replace with
   real sprite sheets later without touching gameplay code
   (see assets/README.txt).
   ============================================================ */
export function px(ctx, x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(x | 0, y | 0, w | 0, h | 0); }

// Fine accents use half a world pixel on the high-resolution canvas. The
// familiar stepped silhouettes and their collision sizes remain unchanged.
function detail(ctx, x, y, w, h, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, w, h);
}

/**
 * The checkpoint: a battered trash can (Riko is a raccoon -- of course he
 * saves his progress by climbing into one). `pop` (0..1) is how far into the
 * lid-pop / wiggle animation we are right after activation; `used` tints it
 * once it has been triggered.
 */
export function drawTrashcan(ctx, x, y, used, pop) {
  x = Math.round(x); y = Math.round(y);
  const wob = pop ? Math.sin(pop * 50) * (1 - pop) * 2 : 0;
  const body = used ? '#3a4a44' : '#33383f';
  const hi = used ? '#54685f' : '#4a505c';
  const dk = '#1c2027';
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.fillRect(x - 6, y + 8, 12, 2);
  // body
  px(ctx, x - 5, y - 4, 10, 12, dk);
  px(ctx, x - 4, y - 3, 8, 10, body);
  px(ctx, x - 4, y - 3, 8, 3, hi);
  px(ctx, x - 2, y - 2, 1, 9, 'rgba(0,0,0,0.3)');
  px(ctx, x + 1, y - 2, 1, 9, 'rgba(0,0,0,0.3)');
  // lid (pops up a little right after use)
  const lidY = y - 8 - Math.abs(wob);
  px(ctx, x - 6, lidY, 12, 3, dk);
  px(ctx, x - 5, lidY, 10, 2, used ? '#607870' : '#565c68');
  px(ctx, x - 1, lidY - 3, 2, 3, dk);
  if (used) { px(ctx, x - 1, y + 1, 2, 2, 'rgba(244,197,66,0.55)'); }
}

/* -------- RIKO (the raccoon protagonist) -------- */
export function drawRiko(ctx, x, y, w, h, facing, state, frame, flash, holdingBulb) {
  const f = facing >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2);
  ctx.scale(f, 1);
  ctx.translate(-w / 2, -h / 2);

  let bob = 0;
  if (state === 'walk') bob = frame % 2 === 0 ? 0 : 1;
  else if (state === 'idle') bob = (Math.floor(frame / 6) % 6 === 0) ? 1 : 0;
  else if (state === 'jump') bob = -1;

  const OUT   = flash ? '#ffe0e0' : '#141d2b';
  const fur   = flash ? '#ffffff' : '#a7b3c5';
  const furD  = flash ? '#ffdede' : '#65758b';
  const dark  = flash ? '#ffd9d9' : '#253247';
  const belly = flash ? '#ffffff' : '#e2eaf2';
  const rim   = flash ? '#ffffff' : '#d0e1ee';
  const pack  = flash ? '#ffbcb0' : '#b5573a';
  const packD = flash ? '#ff9d90' : '#8a3f2c';
  const scarf = flash ? '#ffd9d9' : '#c0392b';

  if (state === 'death') {
    ctx.restore();
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate((Math.PI / 2) * f);
    // Keep the actual tail, backpack and mask on the fallen body.
    // The idle drawer is reused in a rotated frame; it never re-enters death.
    drawRiko(ctx, -w / 2, -h / 2, w, h, 1, 'idle', 18, false, false);
    for (const eyeX of [2 - w / 2, w / 2 - 4]) {
      px(ctx, eyeX, 1 - h / 2, 2, 2, '#2b3140');
      px(ctx, eyeX, 1 - h / 2, 1, 1, '#b6bccb');
      px(ctx, eyeX + 1, 2 - h / 2, 1, 1, '#b6bccb');
    }
    ctx.restore();
    return;
  }

  const by = 5 + bob;   // body top

  /* striped tail curling behind */
  px(ctx, -6, by - 1, 6, 9, OUT);
  px(ctx, -5, by, 4, 7, furD);
  px(ctx, -5, by, 4, 1, fur);                    // tail-tip highlight
  px(ctx, -5, by + 1, 4, 2, dark);
  px(ctx, -5, by + 4, 4, 2, dark);
  px(ctx, -4, by + 6, 3, 2, dark);
  px(ctx, -5, by + 3, 1, 1, rim);
  px(ctx, -4, by + 6, 1, 1, fur);

  /* backpack + shoulder strap */
  px(ctx, -2, by - 1, 4, 9, packD);
  px(ctx, -1, by, 3, 6, pack);
  px(ctx, -1, by, 3, 2, packD);
  px(ctx, 0, by + 1, 1, 1, '#d97a5c');           // little top-left highlight
  px(ctx, 2, by - 1, 2, 7, packD);
  px(ctx, -1, by + 3, 2, 1, flash ? '#ffffff' : '#f1b674');
  px(ctx, -1, by + 5, 1, 2, packD);

  /* body */
  px(ctx, 0, by - 1, w + 1, h - 4, OUT);
  px(ctx, 1, by, w - 1, h - 6, fur);
  px(ctx, 1, by, w - 1, 1, rim);                  // top-of-back highlight
  px(ctx, 1, h - 3, w - 1, 2, furD);
  px(ctx, 1, by + 2, 1, h - 9, rim);
  px(ctx, w - 1, by + 1, 1, h - 8, furD);
  px(ctx, 3, by + 2, w - 4, 4, belly);
  px(ctx, 3, by + 2, w - 4, 1, '#ffffff');        // belly sheen
  px(ctx, 3, by + 5, w - 4, 1, flash ? '#ffe0e0' : '#b8c9d9');

  /* scarf */
  px(ctx, 0, by - 2, w + 1, 2, '#7c261c');
  px(ctx, 1, by - 2, w - 1, 2, scarf);
  px(ctx, 2, by, 2, 3, scarf);
  px(ctx, 2, by, 1, 2, flash ? '#ffffff' : '#ef7862');

  /* head */
  px(ctx, 0, -2 + bob, w + 1, 8, OUT);
  px(ctx, 1, -1 + bob, w - 1, 7, fur);
  px(ctx, 1, -1 + bob, w - 1, 1, belly);          // brow stripe
  px(ctx, 1, 1 + bob, w - 1, 3, dark);            // bandit mask
  px(ctx, 1, 1 + bob, w - 1, 1, '#454d63');       // soft top edge on the mask (depth)
  px(ctx, 1, 3 + bob, w - 1, 1, '#10131a');       // mask underside shadow
  px(ctx, Math.floor(w / 2) - 1, bob, 2, 2, belly); // stepped bridge between the mask patches
  /* fluffy cheek tufts */
  px(ctx, 0, 3 + bob, 1, 2, furD);
  px(ctx, w, 3 + bob, 1, 2, furD);
  px(ctx, 0, 3 + bob, 1, 1, rim);
  /* ears */
  px(ctx, -1, -4 + bob, 4, 4, OUT); px(ctx, 0, -3 + bob, 3, 3, fur); px(ctx, 1, -2 + bob, 1, 1, '#c98a8a');
  px(ctx, w - 3, -4 + bob, 4, 4, OUT); px(ctx, w - 3, -3 + bob, 3, 3, fur); px(ctx, w - 2, -2 + bob, 1, 1, '#c98a8a');
  px(ctx, 0, -3 + bob, 2, 1, rim);
  px(ctx, w - 3, -3 + bob, 2, 1, rim);
  /* eyes -- a hair bigger, with a bright catchlight */
  px(ctx, 2, 1 + bob, 2, 2, '#f0f5ff'); px(ctx, 3, 1 + bob, 1, 1, '#141820'); px(ctx, 2, 1 + bob, 1, 1, '#ffffff');
  px(ctx, w - 4, 1 + bob, 2, 2, '#f0f5ff'); px(ctx, w - 3, 1 + bob, 1, 1, '#141820'); px(ctx, w - 4, 1 + bob, 1, 1, '#ffffff');
  px(ctx, 3, 2 + bob, 1, 1, dark);
  px(ctx, w - 3, 2 + bob, 1, 1, dark);
  /* snout + nose */
  px(ctx, w - 2, 3 + bob, 3, 3, belly);
  px(ctx, w - 1, 3 + bob, 1, 1, '#ffffff');       // snout highlight
  px(ctx, w, 4 + bob, 2, 1, '#3a2b3a');
  px(ctx, w, 4 + bob, 1, 1, '#5c4550');           // nose highlight

  /* arms / paws */
  if (state === 'attack') {
    px(ctx, w - 1, by, 5, 2, belly);
    px(ctx, w + 2, by - 1, 2, 4, fur);
  } else if (state === 'jump' || state === 'fall') {
    px(ctx, w - 2, by, 2, 2, furD);
    px(ctx, 0, by, 2, 2, furD);
  } else {
    px(ctx, w - 2, by + 2, 2, 3, furD);
    px(ctx, w - 2, by + 2, 1, 2, rim);
  }

  /* legs */
  if (state === 'walk') {
    const s = frame % 4;
    px(ctx, 2, h - 2, 3, s < 2 ? 3 : 2, dark);
    px(ctx, w - 5, h - 2, 3, s < 2 ? 2 : 3, dark);
  } else if (state === 'jump') {
    px(ctx, 3, h - 3, 3, 3, dark); px(ctx, w - 5, h - 3, 3, 3, dark);
  } else if (state === 'fall') {
    px(ctx, 1, h - 2, 3, 3, dark); px(ctx, w - 4, h - 2, 3, 3, dark);
  } else {
    px(ctx, 2, h - 2, 3, 2, dark); px(ctx, w - 5, h - 2, 3, 2, dark);
  }
  if (state !== 'jump') {
    px(ctx, state === 'fall' ? 1 : 2, h - 2, 2, 1, furD);
    px(ctx, state === 'fall' ? w - 4 : w - 5, h - 2, 2, 1, furD);
  }

  /* held bombilla */
  if (holdingBulb) {
    const bx = w - 1, hy = by + 1;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(bx + 1, hy, 0, bx + 1, hy, 9);
    g.addColorStop(0, 'rgba(255,230,160,0.45)');
    g.addColorStop(1, 'rgba(255,226,150,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(bx + 1, hy, 10, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    px(ctx, bx - 1, hy + 1, 2, 2, furD);
    px(ctx, bx, hy - 2, 3, 3, '#fff2c8');
    px(ctx, bx + 1, hy - 1, 1, 1, '#ffffff');
    px(ctx, bx, hy + 1, 3, 1, '#8a8a8a');
  }

  ctx.restore();
}

/** A brief, recognisable raccoon soul rises from the defeated body.
 * x/y are the centre of the body; progress is its lifetime in [0, 1].
 * Rendering has no collision or gameplay state and restores the context.
 */
export function drawRikoSoul(ctx, x, y, progress, facing = 1) {
  if (!Number.isFinite(progress) || progress <= 0 || progress >= 1) return;
  const p = Math.max(0, Math.min(1, progress));
  const fadeIn = Math.min(1, p / 0.12);
  const fadeOut = 1 - Math.max(0, (p - 0.58) / 0.42);
  const rise = 44 * (p * (2 - p));
  const sway = Math.sin(p * Math.PI * 3) * (1 + p * 3);
  ctx.save();
  ctx.translate(x + sway, y - rise);
  ctx.scale(facing < 0 ? -1 : 1, 1);
  ctx.globalAlpha *= fadeIn * fadeOut * 0.88;

  // Soft light surrounds a stepped silhouette, preserving the pixel style.
  const glow = ctx.createRadialGradient(0, -3, 1, 0, -3, 14);
  glow.addColorStop(0, 'rgba(168,230,255,0.36)');
  glow.addColorStop(1, 'rgba(168,230,255,0)');
  ctx.fillStyle = glow;
  ctx.fillRect(-14, -17, 28, 28);

  // A striped tail and ears identify the apparition as Riko.
  px(ctx, -10, -2, 4, 8, '#b7dcf5');
  px(ctx, -9, 0, 3, 2, '#79abc9');
  px(ctx, -8, 4, 3, 2, '#79abc9');
  px(ctx, -5, -8, 3, 3, '#edf8ff');
  px(ctx, 2, -8, 3, 3, '#edf8ff');
  px(ctx, -5, -5, 10, 10, '#dbf1ff');
  px(ctx, -6, -3, 12, 7, '#dbf1ff');
  px(ctx, -4, 4, 8, 4, '#dbf1ff');
  const flutter = Math.sin(p * Math.PI * 8) > 0;
  px(ctx, -5, 7, 3, flutter ? 3 : 2, '#dbf1ff');
  px(ctx, 1, 7, 3, flutter ? 2 : 3, '#dbf1ff');
  px(ctx, -5, -3, 10, 3, '#6595b6');
  px(ctx, -3, -2, 2, 2, '#f8fcff');
  px(ctx, 2, -2, 2, 2, '#f8fcff');
  px(ctx, -1, 1, 3, 2, '#9dc5dc');
  px(ctx, 0, 1, 1, 1, '#426783');
  ctx.restore();
}

/* -------- SOMBRA -------- */
export function drawSombra(ctx, x, y, w, h, facing, frame, flash) {
  const f = facing >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2); ctx.scale(f, 1); ctx.translate(-w / 2, -h / 2);
  const OUT = flash ? '#ffe0e0' : '#150c26';
  const body = flash ? '#ffffff' : '#52396f';
  const hi = flash ? '#ffe0e0' : '#76549a';
  const wob = Math.sin(frame * 0.35) * 1.4;

  // trailing smoke wisps
  px(ctx, -2, h - 3, 3, 2, hi);
  px(ctx, w - 1, h - 4, 3, 2, hi);
  px(ctx, w / 2 - 1, h - 2, 2, 2, hi);

  // body (teardrop-ish)
  px(ctx, 1, 1 + wob, w - 2, h - 1, OUT);
  px(ctx, 2, 2 + wob, w - 4, h - 3, body);
  px(ctx, 3, 3 + wob, w - 6, h - 6, hi);
  px(ctx, 3, 3 + wob, w - 6, 1, flash ? '#ffffff' : '#8e69b0');
  px(ctx, 2, 4 + wob, 1, h - 7, flash ? '#ffffff' : '#a67ac4');
  px(ctx, w - 4, 6 + wob, 2, h - 7, flash ? '#ffe0e0' : '#35254f');
  px(ctx, 4, h - 4 + wob, 2, 1, flash ? '#ffffff' : '#9164b4');
  // pointed ears
  px(ctx, 1, -1 + wob, 2, 3, OUT); px(ctx, 1, 0 + wob, 2, 2, body);
  px(ctx, w - 3, -1 + wob, 2, 3, OUT); px(ctx, w - 3, 0 + wob, 2, 2, body);
  px(ctx, 1, wob, 1, 1, flash ? '#ffffff' : '#bd92d4');
  px(ctx, w - 3, wob, 1, 1, flash ? '#ffffff' : '#bd92d4');
  // glowing eyes -- small cross-shaped glint reads sharper than a flat square
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  // Keep the halo compact and stepped; a pair of large discs hid the mask.
  px(ctx, 2, 3 + wob, 4, 2, 'rgba(159,232,255,0.22)');
  px(ctx, 3, 2 + wob, 2, 4, 'rgba(159,232,255,0.12)');
  px(ctx, w - 6, 3 + wob, 4, 2, 'rgba(159,232,255,0.22)');
  px(ctx, w - 5, 2 + wob, 2, 4, 'rgba(159,232,255,0.12)');
  ctx.restore();
  px(ctx, 3, 3 + wob, 2, 2, '#dff0ff'); px(ctx, w - 5, 3 + wob, 2, 2, '#dff0ff');
  px(ctx, 3, 3 + wob, 1, 1, '#8fb8ff'); px(ctx, w - 5, 3 + wob, 1, 1, '#8fb8ff');
  detail(ctx, 4, 4 + wob, 0.5, 1, '#233457');
  detail(ctx, w - 4, 4 + wob, 0.5, 1, '#233457');
  detail(ctx, w / 2 - 1.5, 7 + wob, 3, 0.5, flash ? '#ffffff' : '#c2a2dd');
  ctx.restore();
}

/* -------- CUERVO -------- */
export function drawCuervo(ctx, x, y, w, h, facing, frame, flash) {
  const f = facing >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2); ctx.scale(f, 1); ctx.translate(-w / 2, -h / 2);
  const OUT = flash ? '#ffe0e0' : '#0e1420';
  const body = flash ? '#ffffff' : '#354763';
  const hi = flash ? '#ffe0e0' : '#6485a4';
  const flap = Math.sin(frame * 0.6);

  // tail fan
  px(ctx, 1, h - 4, 5, 2, OUT);
  px(ctx, 2, h - 3, 4, 2, body);
  px(ctx, 2, h - 3, 3, 1, hi);

  // tucked talons (this one flies, but a hint of feet reads more like a bird)
  px(ctx, 4, h - 3, 1, 2, '#b5822f');
  px(ctx, w - 6, h - 3, 1, 2, '#b5822f');

  // body + head
  px(ctx, 3, 3, w - 5, h - 5, OUT);
  px(ctx, 4, 4, w - 7, h - 7, body);
  px(ctx, 5, 5, w - 9, 3, hi);
  px(ctx, 5, 5, w - 9, 1, flash ? '#ffffff' : '#8aabc4');
  px(ctx, w - 6, h - 5, 2, 1, flash ? '#ffe0e0' : '#1b2b42');
  px(ctx, w - 4, 2, 4, 4, OUT);
  px(ctx, w - 3, 3, 3, 3, body);
  px(ctx, w, 4, 2, 1, '#d9a441');                 // beak
  px(ctx, w + 1, 5, 1, 1, '#b5822f');
  px(ctx, w - 3, 3, 1, 1, '#ff6a6a');             // eye
  detail(ctx, w - 3, 2.5, 2, 0.5, flash ? '#ffffff' : '#91a8c5');
  detail(ctx, w - 2.5, 3, 0.5, 0.5, '#fff0c2');

  // wings
  // A passing pose softens the beat without stretching or blurring pixels.
  const wingY = flap > 0.4 ? 0 : flap < -0.4 ? 4 : 2;
  const tipY = flap > 0.4 ? -1 : flap < -0.4 ? 6 : 2;
  px(ctx, -1, wingY, 6, 3, OUT);
  px(ctx, 0, wingY + 1, 5, 2, hi);
  px(ctx, 1, tipY, 3, 2, body);
  px(ctx, 0, wingY + 1, 4, 1, flash ? '#ffffff' : '#a8c6da');
  detail(ctx, 1, wingY + 2, 0.5, 1, flash ? '#ffffff' : '#1c293b');
  detail(ctx, 3, wingY + 2, 0.5, 1, flash ? '#ffffff' : '#1c293b');
  ctx.restore();
}

/* -------- DEVORADOR -------- */
export function drawDevorador(ctx, x, y, w, h, facing, frame, flash) {
  const f = facing >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2); ctx.scale(f, 1); ctx.translate(-w / 2, -h / 2);
  const OUT = flash ? '#ffe0e0' : '#150b1a';
  const body = flash ? '#ffffff' : '#593a67';
  const hi = flash ? '#ffe0e0' : '#79538a';
  const plate = flash ? '#ffe0e0' : '#956ba6';
  const chew = Math.floor(frame / 4) % 2;

  // legs
  px(ctx, 2, h - 3, 3, 3, OUT); px(ctx, w - 8, h - 3, 3, 3, OUT);
  px(ctx, 2, h - 2, 3, 2, '#241531'); px(ctx, w - 8, h - 2, 3, 2, '#241531');

  // body
  px(ctx, 0, 3, w, h - 3, OUT);
  px(ctx, 1, 4, w - 1, h - 5, body);
  px(ctx, 2, 5, w - 3, 3, hi);
  px(ctx, 2, 5, w - 3, 1, flash ? '#ffffff' : '#b58ac4');
  px(ctx, 1, 7, 1, h - 9, flash ? '#ffffff' : '#b286c2');
  px(ctx, 2, h - 3, w - 12, 1, flash ? '#ffe0e0' : '#382743');
  px(ctx, 4, 8, 3, 1, flash ? '#ffffff' : '#8d699d');
  px(ctx, 6, 9, 3, 1, flash ? '#ffe0e0' : '#3d2a4d');
  detail(ctx, 4, h - 5, 3, 0.5, flash ? '#ffffff' : '#3a214c');
  // back plates
  for (let i = 0; i < 4; i++) {
    px(ctx, 2 + i * 4, 1, 3, 3, OUT);
    px(ctx, 3 + i * 4, 2, 2, 2, plate);
    px(ctx, 3 + i * 4, 2, 2, 1, flash ? '#ffffff' : '#d0a4dc');
  }
  // maw
  const open = chew ? 7 : 5;
  px(ctx, w - 9, 5, 9, open + 1, OUT);
  px(ctx, w - 8, 6, 8, open - 1, '#120814');
  px(ctx, w - 7, 6 + (chew ? 1 : 0), 6, 2, '#ff7a3c');
  px(ctx, w - 6, 7 + (chew ? 1 : 0), 4, 1, '#ffd060');
  for (let i = 0; i < 3; i++) {                    // teeth
    px(ctx, w - 8 + i * 3, 6, 1, 2, '#f0f0ff');
    px(ctx, w - 7 + i * 3, 4 + open, 1, 2, '#f0f0ff');
  }
  if (chew) px(ctx, w - 8, 4 + open + 1, 1, 2, '#8fd6ff');   // a drop of drool when the jaw opens wide
  px(ctx, w - 5, 3, 2, 2, '#ff5a5a');              // eye
  px(ctx, w - 5, 3, 1, 1, '#ffb0a0');              // eye glint
  px(ctx, w - 3, 4, 1, 1, OUT);
  detail(ctx, w - 8, 5, 7, 0.5, flash ? '#ffffff' : '#b07b9e');
  ctx.restore();
}

/* -------- GUARDIAN -------- */
export function drawGuardian(ctx, x, y, w, h, facing, frame, flash, charging) {
  const f = facing >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2); ctx.scale(f, 1); ctx.translate(-w / 2, -h / 2);
  const OUT = flash ? '#ffe0e0' : '#1b1f26';
  const metal = flash ? '#ffffff' : '#7a899a';
  const metalD = flash ? '#ffe0e0' : '#47566a';
  const rivet = flash ? '#ffffff' : '#c6d6e2';
  const lamp = charging ? '#ff7a3c' : '#f4c542';
  const bob = Math.floor(frame / 6) % 2;

  // legs
  px(ctx, 1, h - 4, 4, 4, OUT); px(ctx, w - 5, h - 4, 4, 4, OUT);
  px(ctx, 2, h - 3, 3, 3, metalD); px(ctx, w - 5, h - 3, 3, 3, metalD);
  px(ctx, 2, h - 3, 2, 1, metal); px(ctx, w - 5, h - 3, 2, 1, metal);

  // antenna, blinking with the charge state
  px(ctx, w / 2 - 1, bob - 3, 1, 3, metalD);
  px(ctx, w / 2 - 1, bob - 4, 1, 1, charging ? '#ff7a3c' : '#8fb8ff');

  // head + torso
  px(ctx, 3, bob, w - 6, 4, OUT);
  px(ctx, 4, 1 + bob, w - 8, 3, metalD);
  px(ctx, w - 7, 1 + bob, 2, 2, charging ? '#ff5a5a' : '#8fb8ff');
  px(ctx, w - 7, 1 + bob, 1, 1, charging ? '#ffe0b0' : '#d8f4ff');
  px(ctx, 1, 4, w - 2, h - 7, OUT);
  px(ctx, 2, 5, w - 4, h - 9, metal);
  px(ctx, 2, 5, w - 4, 1, flash ? '#ffffff' : '#beceda');
  px(ctx, 3, 6, w - 6, h - 12, metalD);
  px(ctx, 2, 6, 1, h - 11, flash ? '#ffffff' : '#b8cedd');
  detail(ctx, w - 3, 6, 0.5, h - 11, flash ? '#ffffff' : '#334357');
  detail(ctx, 4, 1 + bob, w - 8, 0.5, flash ? '#ffffff' : '#8babc3');
  // rivets
  px(ctx, 3, 6, 1, 1, rivet); px(ctx, w - 4, 6, 1, 1, rivet);
  px(ctx, 3, h - 6, 1, 1, rivet); px(ctx, w - 4, h - 6, 1, 1, rivet);
  px(ctx, 5, h - 6, w - 10, 1, flash ? '#ffffff' : '#829bb0');
  // core lantern
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, 8);
  g.addColorStop(0, charging ? 'rgba(255,140,80,0.7)' : 'rgba(244,197,66,0.55)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(w / 2, h / 2, 8, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  px(ctx, w / 2 - 3, h / 2 - 3, 6, 6, OUT);
  px(ctx, w / 2 - 2, h / 2 - 3, 4, 1, rivet);
  px(ctx, w / 2 - 2, h / 2 - 2, 4, 4, lamp);
  px(ctx, w / 2 - 1, h / 2 - 1, 2, 2, '#fff6d8');
  ctx.restore();
}

/* -------- BOSS: EL FAROLERO -------- */
export function drawFarolero(ctx, x, y, w, h, facing, frame, phase, flash, vulnerable) {
  const f = facing >= 0 ? 1 : -1;
  ctx.save();
  ctx.translate(x + w / 2, y + h / 2); ctx.scale(f, 1); ctx.translate(-w / 2, -h / 2);
  const OUT  = flash ? '#ffe6e6' : '#0d1424';
  const robe = flash ? '#ffffff' : phase >= 3 ? '#3a2350' : phase === 2 ? '#2a2a52' : '#22304f';
  const robeD = flash ? '#ffdede' : phase >= 3 ? '#26183a' : '#161f36';
  const trim = flash ? '#ffe6e6' : '#f4c542';
  const float = Math.sin(frame * 0.13) * 3;
  const cx = w / 2;

  // flared robe (skirt)
  px(ctx, 3, h - 12 + float, w - 6, 12, OUT);
  px(ctx, 5, h - 11 + float, w - 10, 11, robeD);
  px(ctx, 2, h - 4 + float, w - 4, 4, OUT);
  px(ctx, 3, h - 4 + float, w - 6, 3, robeD);
  px(ctx, 5, h - 10 + float, 1, 6, flash ? '#ffffff' : '#62759b');
  px(ctx, w - 7, h - 10 + float, 1, 6, robe);
  px(ctx, 5, h - 3 + float, w - 10, 1, flash ? '#ffe0e0' : '#ad9255');
  // torso
  px(ctx, cx - 7, 6 + float, 14, h - 14, OUT);
  px(ctx, cx - 6, 7 + float, 12, h - 16, robe);
  px(ctx, cx - 6, 7 + float, 12, 2, trim);
  px(ctx, cx - 5, 11 + float, 2, h - 22, robeD);
  px(ctx, cx + 3, 10 + float, 1, h - 18, flash ? '#ffffff' : '#61789d');
  px(ctx, cx, 10 + float, 1, h - 15, robeD);
  px(ctx, cx - 1, 10 + float, 2, 2, trim);
  // hood
  px(ctx, cx - 6, float, 12, 9, OUT);
  px(ctx, cx - 5, 1 + float, 10, 8, robe);
  px(ctx, cx - 5, 1 + float, 10, 2, robeD);
  px(ctx, cx - 5, 1 + float, 10, 1, flash ? '#ffffff' : '#7c91b3');
  px(ctx, cx - 6, 8 + float, 1, h - 19, flash ? '#ffffff' : '#7383a8');
  px(ctx, cx - 4, 3 + float, 8, 4, OUT);
  // eyes under the hood
  const eye = vulnerable ? '#ffb060' : '#8fb8ff';
  px(ctx, cx - 4, 4 + float, 2, 2, eye);
  px(ctx, cx + 2, 4 + float, 2, 2, eye);
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  ctx.fillStyle = vulnerable ? 'rgba(255,160,80,0.4)' : 'rgba(143,184,255,0.35)';
  ctx.fillRect(cx - 5, 3 + float, 10, 4);
  ctx.restore();

  // the great lantern, held out in front
  const lx = w - 5, ly = 11 + float + Math.sin(frame * 0.28) * 2;
  px(ctx, w - 12, 12 + float, 6, 3, robe);           // arm
  px(ctx, lx - 5, ly - 3, 12, 15, OUT);
  px(ctx, lx - 4, ly - 2, 10, 3, '#6b4a26');         // cap
  px(ctx, lx - 3, ly + 1, 8, 9, '#5b4326');          // cage
  px(ctx, lx - 2, ly + 2, 6, 7, vulnerable ? '#ffbe6a' : '#ffe79a');
  px(ctx, lx - 1, ly + 3, 4, 5, '#fffbe6');
  ctx.save();
  ctx.globalCompositeOperation = 'lighter';
  const lg = ctx.createRadialGradient(lx + 1, ly + 5, 0, lx + 1, ly + 5, 16);
  lg.addColorStop(0, vulnerable ? 'rgba(255,180,110,0.65)' : 'rgba(255,224,150,0.55)');
  lg.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = lg; ctx.beginPath(); ctx.arc(lx + 1, ly + 5, 16, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // Reapply the cage over its bloom so the lamp still has a crisp silhouette.
  px(ctx, lx - 4, ly - 2, 10, 1, flash ? '#ffffff' : '#d9bc7c');
  px(ctx, lx - 3, ly + 1, 1, 9, '#aa8146');
  px(ctx, lx + 4, ly + 1, 1, 9, '#76582e');
  px(ctx, lx - 3, ly + 9, 8, 1, '#bc9558');
  ctx.restore();
}

/* -------- small props -------- */
/**
 * A tidy little cage lantern. `t` animates the flame flicker.
 * Draws its own small warm bloom when lit (kept deliberately compact so it
 * reads as a lamp, not a smear).
 */
export function drawLantern(ctx, x, y, lit, t = 0) {
  x = Math.round(x); y = Math.round(y);
  // hook + top cap
  px(ctx, x - 1, y - 9, 2, 3, '#3c2f19');
  px(ctx, x - 4, y - 6, 8, 2, '#6b5228');
  // cage frame
  px(ctx, x - 4, y - 4, 1, 9, '#6b5228');
  px(ctx, x + 3, y - 4, 1, 9, '#6b5228');
  px(ctx, x - 4, y + 4, 8, 2, '#6b5228');
  if (lit) {
    const fl = 0.82 + Math.sin(t * 7) * 0.14 + Math.sin(t * 17) * 0.05;
    // glass + flame
    px(ctx, x - 3, y - 4, 6, 8, '#e8a43c');
    px(ctx, x - 2, y - 3, 4, 6, '#ffd97a');
    px(ctx, x - 1, y - 2, 2, 4, '#fff4d0');
    // thin, translucent bloom -- you can see straight through it
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    const g = ctx.createRadialGradient(x, y, 0, x, y, 18);
    g.addColorStop(0, 'rgba(255,224,155,' + (0.28 * fl).toFixed(3) + ')');
    g.addColorStop(0.5, 'rgba(255,208,125,' + (0.09 * fl).toFixed(3) + ')');
    g.addColorStop(1, 'rgba(255,205,120,0)');
    ctx.fillStyle = g;
    ctx.beginPath(); ctx.arc(x, y, 18, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
  } else {
    px(ctx, x - 3, y - 4, 6, 8, '#23232b');
    px(ctx, x - 2, y - 3, 4, 6, '#2c2c36');
  }
}
