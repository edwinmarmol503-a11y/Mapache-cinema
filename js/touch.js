/* ============================================================
   touch.js - handheld layout with independent stick, D-pad and buttons.
   uses semantic actions, independently of keyboard bindings.
   ============================================================ */
import { Input } from './input.js';
import { Save } from './save.js';

const hasTouch = ('ontouchstart' in window) || navigator.maxTouchPoints > 0 || navigator.msMaxTouchPoints > 0;
const coarsePointer = !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches);
const mobileBrowser = navigator.userAgentData
  ? !!navigator.userAgentData.mobile
  : /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent || '');

// Incidental desktop touch screens keep the keyboard layout.
export const isTouchDevice = !!(hasTouch && (coarsePointer || mobileBrowser));

let controls = null;
const activePointers = new Map();

/** Convert a thumb position (normalised radius) to the game's digital axes.
 * The radial dead zone stops drift; diagonals preserve directional parries. */
export function joystickActions(x, y, previous = []) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) < 0.22) return [];
  const actions = [];
  const held = new Set(previous);
  // Lower release thresholds prevent direction chatter near an axis edge.
  if (x <= -(held.has('left') ? 0.22 : 0.30)) actions.push('left');
  if (x >= (held.has('right') ? 0.22 : 0.30)) actions.push('right');
  if (y <= -(held.has('up') ? 0.22 : 0.30)) actions.push('up');
  if (y >= (held.has('down') ? 0.22 : 0.30)) actions.push('down');
  return actions;
}

function canControl() {
  const app = document.getElementById('app');
  return app && app.classList.contains('touch-mode') && app.classList.contains('playing') && !app.classList.contains('paused') && !document.hidden;
}

function capture(element, pointerId) {
  try { element.setPointerCapture(pointerId); } catch (_) { /* Older embedded browsers may not support capture. */ }
}

function releaseAll() {
  for (const release of [...activePointers.values()]) release();
  activePointers.clear();
}
export { releaseAll as releaseTouchInputs };

/** Native buttons are labelled for assistive technology; pointer capture keeps
 * jump + movement + attacks independent when fingers slide off a button. */
function makeButton(label, action, cls, description = label, caption = '') {
  const button = document.createElement('button');
  button.type = 'button';
  button.tabIndex = -1;
  button.className = 'tc-btn ' + (cls || '');
  button.dataset.action = action;
  const symbol = document.createElement('span');
  symbol.className = 'tc-symbol';
  symbol.textContent = label;
  symbol.setAttribute('aria-hidden', 'true');
  button.append(symbol);
  if (caption) {
    const text = document.createElement('span');
    text.className = 'tc-caption';
    text.textContent = caption;
    text.setAttribute('aria-hidden', 'true');
    button.append(text);
  }
  button.setAttribute('aria-label', description);
  button.title = description;
  const held = new Set();
  button.addEventListener('pointerdown', (event) => {
    if (!canControl() || event.button > 0 || held.has(event.pointerId)) return;
    event.preventDefault();
    const id = event.pointerId;
    const source = 'touch:button:' + action + ':' + id;
    held.add(id);
    button.classList.add('active');
    Input.setVirtualActions(source, [action]);
    const release = () => {
      held.delete(id);
      Input.releaseVirtual(source);
      if (!held.size) button.classList.remove('active');
      activePointers.delete(id);
    };
    release.element = button;
    activePointers.set(id, release);
    capture(button, id);
  }, { passive: false });
  button.addEventListener('contextmenu', (event) => event.preventDefault());
  return button;
}

function makeJoystick() {
  const base = document.createElement('div');
  base.className = 'tc-joystick';
  base.setAttribute('role', 'group');
  base.setAttribute('aria-label', 'Joystick: moverte y apuntar en cuatro direcciones. Abajo permite bajar plataformas. Usa el botón equis para saltar.');
  base.innerHTML = '<span class="tc-stick-guide tc-stick-up" aria-hidden="true">▲</span><span class="tc-stick-guide tc-stick-down" aria-hidden="true">▼</span><span class="tc-stick-guide tc-stick-left" aria-hidden="true">◀</span><span class="tc-stick-guide tc-stick-right" aria-hidden="true">▶</span><div class="tc-stick-thumb" aria-hidden="true"></div>';
  const thumb = base.querySelector('.tc-stick-thumb');
  let pointer = null;
  let center = null;
  let previousActions = [];

  const move = (event) => {
    if (event.pointerId !== pointer || !center) return;
    event.preventDefault();
    const dx = event.clientX - center.x;
    const dy = event.clientY - center.y;
    const distance = Math.hypot(dx, dy);
    const limit = center.radius;
    const ratio = distance > limit ? limit / distance : 1;
    thumb.style.setProperty('--stick-x', (dx * ratio).toFixed(1) + 'px');
    thumb.style.setProperty('--stick-y', (dy * ratio).toFixed(1) + 'px');
    const actions = joystickActions(dx * ratio / limit, dy * ratio / limit, previousActions);
    previousActions = actions;
    Input.setVirtualActions('touch:joystick', actions);
    base.classList.toggle('active', actions.length > 0);
  };
  base.addEventListener('pointerdown', (event) => {
    if (!canControl() || event.button > 0 || pointer !== null) return;
    event.preventDefault();
    const bounds = base.getBoundingClientRect();
    center = { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2, radius: bounds.width * 0.30 };
    pointer = event.pointerId;
    const id = pointer;
    const release = () => {
      Input.releaseVirtual('touch:joystick');
      pointer = null;
      center = null;
      previousActions = [];
      base.classList.remove('active');
      thumb.style.setProperty('--stick-x', '0px');
      thumb.style.setProperty('--stick-y', '0px');
      activePointers.delete(id);
    };
    release.element = base;
    activePointers.set(id, release);
    capture(base, id);
    move(event);
  }, { passive: false });
  base.addEventListener('pointermove', move, { passive: false });
  base.addEventListener('contextmenu', (event) => event.preventDefault());
  return base;
}

/** Apply saved preferences; 'right' means the action buttons use the right hand. */
export function applyTouchPreferences(options = {}) {
  if (!controls) return;
  releaseAll();
  const mode = options.touchMode === 'dpad' ? 'dpad' : 'joystick';
  const layout = options.touchLayout === 'left' ? 'left' : 'right';
  controls.layer.dataset.mode = mode;
  controls.layer.dataset.layout = layout;
  if (controls.modeSelect) controls.modeSelect.value = mode;
  if (controls.layoutSelect) controls.layoutSelect.value = layout;
}

function mountOptions() {
  const panel = document.querySelector('#screen-options .panel');
  if (!panel || document.getElementById('opt-touch-mode')) return;
  const section = document.createElement('div');
  section.className = 'tc-options';
  section.innerHTML = '<h3>CONTROLES MÓVILES</h3><div class="opt-row"><label for="opt-touch-mode">Control inferior</label><select id="opt-touch-mode"><option value="joystick">Joystick</option><option value="dpad">Cruceta</option></select></div><div class="opt-row"><label for="opt-touch-layout">Mano de acciones</label><select id="opt-touch-layout"><option value="right">Derecha</option><option value="left">Izquierda</option></select></div><p>Cruceta y joystick: moverte y apuntar, sin salto automático. ×: saltar (dos pulsaciones para doble salto). □: atacar. ○: esquivar. △: usar. L: parada. R: lanzar. SELECT: siguiente objeto. START: pausa. GESTO: emote. Las acciones también continúan los diálogos.</p>';
  const controlsHeading = panel.querySelector('#control-list')?.parentElement;
  if (controlsHeading && controlsHeading.parentElement === panel) panel.insertBefore(section, controlsHeading);
  else panel.insertBefore(section, panel.querySelector('.back'));
  controls.modeSelect = section.querySelector('#opt-touch-mode');
  controls.layoutSelect = section.querySelector('#opt-touch-layout');
  const persist = () => {
    const options = Save.loadOpts();
    options.touchMode = controls.modeSelect.value;
    options.touchLayout = controls.layoutSelect.value;
    Save.saveOpts(options);
    applyTouchPreferences(options);
  };
  controls.modeSelect.addEventListener('change', persist);
  controls.layoutSelect.addEventListener('change', persist);
}

export function initTouch({ force = false } = {}) {
  if (controls) return controls;
  if (!force && !isTouchDevice) return null;
  const app = document.getElementById('app');
  if (!app) return null;
  app.classList.add('touch-mode');

  // Separate title words preserve the line break in portrait and a real gap
  // in the compact landscape title, without touching the desktop markup.
  const title = app.querySelector('.title');
  if (title) {
    for (const node of [...title.childNodes]) {
      if (node.nodeType !== Node.TEXT_NODE || !node.textContent.trim()) continue;
      const word = document.createElement('span');
      word.className = 'tc-title-word';
      word.textContent = node.textContent.trim();
      node.replaceWith(word);
    }
  }

  const layer = document.createElement('div');
  layer.id = 'touch-layer';
  layer.setAttribute('aria-label', 'Controles táctiles del juego');

  const movement = document.createElement('div');
  movement.className = 'tc-movement';
  const dpad = document.createElement('div');
  dpad.className = 'tc-dpad';
  dpad.setAttribute('role', 'group');
  dpad.setAttribute('aria-label', 'Cruceta de movimiento y dirección');
  dpad.append(
    makeButton('△', 'up', 'tc-d-up', 'Apuntar arriba; no salta'),
    makeButton('▽', 'down', 'tc-d-down', 'Apuntar abajo y bajar plataformas'),
    makeButton('◁', 'left', 'tc-d-left', 'Mover a la izquierda'),
    makeButton('▷', 'right', 'tc-d-right', 'Mover a la derecha'),
  );
  movement.append(makeJoystick(), dpad);

  const actions = document.createElement('div');
  actions.className = 'tc-actions';
  actions.setAttribute('role', 'group');
  actions.setAttribute('aria-label', 'Botones de acción');
  actions.append(
    makeButton('△', 'interact', 'tc-a-interact', 'Triángulo: usar objeto, interactuar y continuar diálogos', 'USAR'),
    makeButton('○', 'dodge', 'tc-a-dodge', 'Círculo: esquivar', 'ESQUIVA'),
    makeButton('×', 'jump', 'tc-a-jump', 'Equis: saltar; pulsa de nuevo para el doble salto', 'SALTA'),
    makeButton('□', 'attack', 'tc-a-atk', 'Cuadrado: atacar', 'ATACA'),
  );

  const system = document.createElement('div');
  system.className = 'tc-system';
  system.append(
    makeButton('GESTO', 'emote', 'tc-s-emote', 'Emote: acostarse, voltereta, saludar o bailar'),
    makeButton('SELECT', 'cycleR', 'tc-select', 'SELECT: seleccionar el siguiente objeto', 'OBJETO'),
    makeButton('START', 'pause', 'tc-pause', 'START: pausar juego', 'PAUSA'),
  );
  layer.append(movement, actions, system,
    makeButton('L', 'parry', 'tc-shoulder tc-s-parry', 'L: parada; apunta con cruceta o joystick para bloquear en una dirección', 'PARADA'),
    makeButton('R', 'throw', 'tc-shoulder tc-s-throw', 'R: lanzar el objeto seleccionado', 'LANZA'),
  );
  app.append(layer);

  const rotate = document.createElement('div');
  rotate.id = 'rotate-overlay';
  rotate.textContent = 'Gira tu teléfono para ver más espacio de juego';
  app.append(rotate);
  controls = { layer, rotate, release: releaseAll };
  mountOptions();
  applyTouchPreferences(Save.loadOpts());

  const releasePointer = (event) => activePointers.get(event.pointerId)?.();
  window.addEventListener('pointerup', releasePointer, true);
  window.addEventListener('pointercancel', releasePointer, true);
  layer.addEventListener('lostpointercapture', releasePointer, true);
  window.addEventListener('blur', releaseAll);
  window.addEventListener('pagehide', releaseAll);
  window.addEventListener('resize', releaseAll);
  document.addEventListener('visibilitychange', () => { if (document.hidden) releaseAll(); });
  new MutationObserver(() => { if (!canControl()) releaseAll(); }).observe(app, { attributes: true, attributeFilter: ['class'] });
  return controls;
}

/** Switch the exhibition's input layout without reloading a saved game. */
export function setTouchEnabled(enabled) {
  if (enabled) initTouch({ force: true });
  else releaseAll();
  const app = document.getElementById('app');
  if (app) app.classList.toggle('touch-mode', !!enabled);
  if (controls) {
    controls.rotate.style.display = enabled ? '' : 'none';
  }
  return controls;
}
