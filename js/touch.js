/* ============================================================
   touch.js  -  on-screen touch controls for phones/tablets.
   Simulates the exact same key codes the keyboard would send, so
   every mechanic (double jump, directional parry, AoE counter,
   fall damage, etc.) works identically -- no separate touch logic
   anywhere else in the game.
   ============================================================ */
import { Input } from './input.js';

export const isTouchDevice =
  ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;

function down(code) {
  if (!Input.keys.has(code)) Input.pressed.add(code);
  Input.keys.add(code);
}
function up(code) {
  Input.keys.delete(code);
  Input.released.add(code);
}

/** one round on-screen button bound to a key code (or list -- first one used) */
function makeButton(label, code, cls) {
  const b = document.createElement('div');
  b.className = 'tc-btn ' + (cls || '');
  b.textContent = label;
  let held = false;
  const onDown = (e) => {
    e.preventDefault();
    if (held) return;
    held = true;
    b.classList.add('active');
    down(code);
  };
  const onUp = (e) => {
    if (e) e.preventDefault();
    if (!held) return;
    held = false;
    b.classList.remove('active');
    up(code);
  };
  b.addEventListener('pointerdown', onDown, { passive: false });
  b.addEventListener('pointerup', onUp, { passive: false });
  b.addEventListener('pointercancel', onUp, { passive: false });
  b.addEventListener('pointerleave', onUp, { passive: false });
  b.addEventListener('contextmenu', (e) => e.preventDefault());
  return b;
}

export function initTouch() {
  if (!isTouchDevice) return null;

  const app = document.getElementById('app');
  app.classList.add('touch-mode');

  const layer = document.createElement('div');
  layer.id = 'touch-layer';

  /* ---- left: D-pad (left/right movement, up/down for parry aim) ---- */
  const dpad = document.createElement('div');
  dpad.className = 'tc-dpad';
  const bUp    = makeButton('▲', 'ArrowUp', 'tc-d-up');
  const bDown  = makeButton('▼', 'ArrowDown', 'tc-d-down');
  const bLeft  = makeButton('◀', 'ArrowLeft', 'tc-d-left');
  const bRight = makeButton('▶', 'ArrowRight', 'tc-d-right');
  dpad.appendChild(bUp); dpad.appendChild(bDown); dpad.appendChild(bLeft); dpad.appendChild(bRight);

  /* ---- right: action cluster ---- */
  const actions = document.createElement('div');
  actions.className = 'tc-actions';
  const bJump   = makeButton('SALTO', 'Space', 'tc-a-jump');
  const bAtk    = makeButton('ATQ', 'KeyJ', 'tc-a-atk');
  const bDodge  = makeButton('ESQ', 'ShiftLeft', 'tc-a-dodge');
  const bParry  = makeButton('PARA', 'KeyL', 'tc-a-parry');
  actions.appendChild(bJump); actions.appendChild(bAtk); actions.appendChild(bDodge); actions.appendChild(bParry);

  /* ---- small utility row (top) ---- */
  const utility = document.createElement('div');
  utility.className = 'tc-utility';
  const bInteract = makeButton('E', 'KeyE', 'tc-u-btn');
  const bThrow    = makeButton('LANZAR', 'KeyK', 'tc-u-btn tc-u-wide');
  const bCycleL   = makeButton('◄', 'KeyQ', 'tc-u-btn');
  const bCycleR   = makeButton('►', 'KeyR', 'tc-u-btn');
  const bPause    = makeButton('II', 'Escape', 'tc-u-btn tc-u-pause');
  utility.appendChild(bCycleL); utility.appendChild(bInteract); utility.appendChild(bThrow);
  utility.appendChild(bCycleR); utility.appendChild(bPause);

  layer.appendChild(dpad);
  layer.appendChild(actions);
  layer.appendChild(utility);
  app.appendChild(layer);

  /* orientation nudge for portrait phones */
  const rotate = document.createElement('div');
  rotate.id = 'rotate-overlay';
  rotate.innerHTML = '<div class="ro-icon">⟳</div><p>Gira tu teléfono<br><span>Mapache Cinema se juega en horizontal</span></p>';
  app.appendChild(rotate);

  return { layer, rotate };
}
