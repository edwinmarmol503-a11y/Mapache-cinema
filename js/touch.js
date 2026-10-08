/* ============================================================
   touch.js - multitouch joystick + optional D-pad. Mobile input
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
export function joystickActions(x, y) {
  if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(x, y) < 0.22) return [];
  const actions = [];
  if (x <= -0.30) actions.push('left');
  if (x >= 0.30) actions.push('right');
  if (y <= -0.30) actions.push('up');
  if (y >= 0.30) actions.push('down');
  return actions;
}

function canControl() {
  const app = document.getElementById('app');
  return app && app.classList.contains('playing') && !app.classList.contains('paused') && !document.hidden;
}

function capture(element, pointerId) {
  try { element.setPointerCapture(pointerId); } catch (_) { /* Older embedded browsers may not support capture. */ }
}

function releaseAll() {
  for (const release of [...activePointers.values()]) release();
  activePointers.clear();
}

function releaseGroup(container) {
  for (const [id, release] of [...activePointers]) {
    if (container.contains(release.element)) { release(); activePointers.delete(id); }
  }
}

/** Native buttons are labelled for assistive technology; pointer capture keeps
 * jump + movement + attacks independent when fingers slide off a button. */
function makeButton(label, action, cls, description = label) {
  const button = document.createElement('button');
  button.type = 'button';
  button.tabIndex = -1;
  button.className = 'tc-btn ' + (cls || '');
  button.textContent = label;
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
  base.setAttribute('aria-label', 'Joystick: izquierda y derecha para moverte; arriba y abajo para apuntar y bajar plataformas');
  base.innerHTML = '<span class="tc-stick-guide tc-stick-up" aria-hidden="true">▲</span><span class="tc-stick-guide tc-stick-down" aria-hidden="true">▼</span><span class="tc-stick-guide tc-stick-left" aria-hidden="true">◀</span><span class="tc-stick-guide tc-stick-right" aria-hidden="true">▶</span><div class="tc-stick-thumb" aria-hidden="true"><span>✥</span></div>';
  const thumb = base.querySelector('.tc-stick-thumb');
  let pointer = null;
  let center = null;

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
    const actions = joystickActions(dx * ratio / limit, dy * ratio / limit);
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
  section.innerHTML = '<h3>CONTROLES MÓVILES</h3><div class="opt-row"><label for="opt-touch-mode">Movimiento</label><select id="opt-touch-mode"><option value="joystick">Joystick</option><option value="dpad">Cruceta clásica</option></select></div><div class="opt-row"><label for="opt-touch-layout">Mano de acciones</label><select id="opt-touch-layout"><option value="right">Derecha</option><option value="left">Izquierda</option></select></div><p>Arriba/abajo en el joystick: dirección del bloqueo y bajar plataformas. MÁS abre bloqueo, lanzamiento y cambio de objeto.</p>';
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
  dpad.append(
    makeButton('▲', 'up', 'tc-d-up', 'Apuntar arriba'),
    makeButton('▼', 'down', 'tc-d-down', 'Apuntar abajo y bajar plataformas'),
    makeButton('◀', 'left', 'tc-d-left', 'Mover a la izquierda'),
    makeButton('▶', 'right', 'tc-d-right', 'Mover a la derecha'),
  );
  movement.append(makeJoystick(), dpad);

  const actions = document.createElement('div');
  actions.className = 'tc-actions';
  actions.append(
    makeButton('SALTO', 'jump', 'tc-a-jump', 'Saltar; pulsa de nuevo en el aire para el doble salto'),
    makeButton('ATQ', 'attack', 'tc-a-atk', 'Atacar'),
    makeButton('ESQ', 'dodge', 'tc-a-dodge', 'Esquivar'),
    makeButton('USAR', 'interact', 'tc-a-interact', 'Interactuar y continuar diálogos'),
  );

  const secondary = document.createElement('div');
  secondary.id = 'touch-secondary';
  secondary.className = 'tc-secondary';
  secondary.hidden = true;
  secondary.append(
    makeButton('BLOQ', 'parry', 'tc-s-parry', 'Bloquear; apunta con el joystick para un bloqueo direccional'),
    makeButton('LANZA', 'throw', 'tc-s-throw', 'Lanzar el objeto seleccionado'),
    makeButton('◀', 'cycleL', 'tc-s-cycle', 'Seleccionar objeto anterior'),
    makeButton('▶', 'cycleR', 'tc-s-cycle', 'Seleccionar objeto siguiente'),
  );
  const more = document.createElement('button');
  more.type = 'button';
  more.className = 'tc-btn tc-a-more';
  more.textContent = 'MÁS';
  more.tabIndex = -1;
  more.setAttribute('aria-label', 'Mostrar acciones adicionales');
  more.setAttribute('aria-expanded', 'false');
  more.setAttribute('aria-controls', secondary.id);
  more.addEventListener('click', () => {
    secondary.hidden = !secondary.hidden;
    more.classList.toggle('expanded', !secondary.hidden);
    more.setAttribute('aria-expanded', String(!secondary.hidden));
    more.textContent = secondary.hidden ? 'MÁS' : 'MENOS';
    if (secondary.hidden) releaseGroup(secondary);
  });
  actions.append(more, secondary);
  layer.append(movement, actions, makeButton('Ⅱ', 'pause', 'tc-pause', 'Pausar juego'));
  app.append(layer);

  const rotate = document.createElement('div');
  rotate.id = 'rotate-overlay';
  rotate.innerHTML = '<div class="ro-icon" aria-hidden="true">⟳</div><p>Gira tu teléfono<br><span>Mapache Cinema se juega en horizontal</span></p>';
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
