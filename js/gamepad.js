/* ============================================================
   gamepad.js - gated standard controller input (DualShock 4).
   Bluetooth pairing belongs to the device/browser, not the game.
   ============================================================ */
import { Input } from './input.js';

const SOURCE = 'gamepad:player';
const AXIS_PRESS = 0.32;
const AXIS_RELEASE = 0.20;
const REPEAT_DELAY = 360;
const REPEAT_INTERVAL = 110;
const BUTTON_ACTIONS = [
  ['confirm'], ['dodge', 'cancel'], ['attack'], ['interact'],
  ['parry'], ['throw'], ['cycleL'], ['cycleR'], [], ['pause'], [], [],
  ['up'], ['down'], ['left'], ['right'],
];
const NAV_ACTIONS = ['up', 'down', 'left', 'right', 'confirm', 'cancel', 'pause'];
const NAV_GAME_ACTIONS = { up: ['up', 'jump'], confirm: ['confirm'], cancel: ['cancel', 'dodge'] };

const clock = () => typeof performance !== 'undefined' ? performance.now() : Date.now();
const canRead = () => typeof navigator !== 'undefined' && typeof navigator.getGamepads === 'function';
const hidden = () => typeof document !== 'undefined' && document.hidden;

function axisDirection(value, previous) {
  if (!Number.isFinite(value)) return 0;
  if (previous < 0 && value <= -AXIS_RELEASE) return -1;
  if (previous > 0 && value >= AXIS_RELEASE) return 1;
  if (value <= -AXIS_PRESS) return -1;
  if (value >= AXIS_PRESS) return 1;
  return 0;
}

function pressed(button, wasPressed) {
  if (!button) return false;
  if (typeof button === 'number') return Number.isFinite(button) && button >= (wasPressed ? 0.35 : 0.55);
  return button.pressed === true || (Number.isFinite(button.value) && button.value >= (wasPressed ? 0.35 : 0.55));
}

/** Poll once per input tick, before consuming Input and calling clearFrame().
 * onNavigate(action) returns true when a menu consumes the action. Its paired
 * gameplay action stays blocked until release, so confirming PLAY cannot jump.
 * No controller state is requested until setEnabled(true) is authorised.
 */
export class GamepadController {
  constructor({ input = Input, onNavigate = () => false, onDisconnect = () => {}, onActivity = () => {} } = {}) {
    this.input = input;
    this.onNavigate = onNavigate;
    this.onDisconnect = onDisconnect;
    this.onActivity = onActivity;
    this.enabled = false;
    this._initialized = false;
    this._focused = true;
    this._padKey = null;
    this._padInfo = null;
    this._neutralRequired = true;
    this._previous = new Set();
    this._buttons = [];
    this._axes = [0, 0];
    this._repeat = new Map();
    this._consumed = new Set();
    this._error = '';
    this._listeners = [];
  }

  init() {
    if (this._initialized) return this;
    this._initialized = true;
    const listen = (target, type, handler) => {
      if (!target || typeof target.addEventListener !== 'function') return;
      target.addEventListener(type, handler);
      this._listeners.push([target, type, handler]);
    };
    const win = typeof window !== 'undefined' ? window : null;
    const doc = typeof document !== 'undefined' ? document : null;
    listen(win, 'blur', () => { this._focused = false; this.suspend(); });
    listen(win, 'focus', () => { this._focused = true; });
    listen(win, 'pagehide', () => { this._focused = false; this.suspend(); });
    listen(win, 'pageshow', () => { this._focused = true; });
    listen(doc, 'visibilitychange', () => { if (hidden()) this.suspend(); });
    listen(win, 'gamepaddisconnected', (event) => {
      if (!this.enabled || !this._padInfo || event.gamepad.index !== this._padInfo.index) return;
      this._disconnect();
    });
    return this;
  }

  setEnabled(enabled) {
    enabled = enabled === true;
    if (enabled === this.enabled) return;
    this.enabled = enabled;
    this.suspend();
    this._padKey = null;
    this._padInfo = null;
    this._error = '';
  }

  /** A mode/menu transition or focus loss must require fresh neutral input. */
  suspend() {
    if (this.input.cancelVirtual) this.input.cancelVirtual(SOURCE);
    else this.input.releaseVirtual(SOURCE);
    this._neutralRequired = true;
    this._previous.clear();
    this._buttons = [];
    this._axes = [0, 0];
    this._repeat.clear();
    this._consumed.clear();
  }

  destroy() {
    this.setEnabled(false);
    for (const [target, type, handler] of this._listeners) target.removeEventListener?.(type, handler);
    this._listeners = [];
    this._initialized = false;
  }

  _disconnect() {
    const previous = this._padInfo;
    this.suspend();
    this._padKey = null;
    this._padInfo = null;
    if (previous?.mapping === 'standard') this.onDisconnect(previous);
  }

  getStatus() {
    const supported = canRead();
    const connected = this.enabled && !!this._padInfo;
    const ready = connected && this._padInfo.mapping === 'standard' && !this._neutralRequired && this._focused && !hidden();
    let message = 'El mando está desactivado.';
    if (this.enabled) {
      if (!supported) message = 'Este navegador no admite Gamepad API. Prueba en un navegador compatible con HTTPS.';
      else if (this._error) message = 'El navegador bloqueó el acceso al mando. Abre el juego mediante HTTPS y revisa sus permisos.';
      else if (!connected) message = 'Empareja el mando por Bluetooth y pulsa y suelta un botón para detectarlo.';
      else if (this._padInfo.mapping !== 'standard') message = 'Mando detectado sin distribución estándar. Prueba otro navegador compatible.';
      else if (!this._focused || hidden()) message = 'Regresa al juego para utilizar el mando.';
      else if (!ready) message = 'Suelta los botones y centra el stick para activar el mando.';
      else message = 'Mando conectado y listo.';
    }
    return {
      enabled: this.enabled, supported, connected, ready,
      index: this._padInfo?.index ?? null,
      id: this._padInfo?.id || '', mapping: this._padInfo?.mapping || '', message,
    };
  }

  poll(now = clock()) {
    if (!this.enabled) return;
    if (!this._focused || hidden()) { this.suspend(); return; }
    if (!canRead()) { if (this._padInfo) this._disconnect(); return; }
    let pads;
    try {
      // The fresh browser snapshot is essential: connection-event objects can
      // stop updating, and unplugging leaves null slots in this array.
      pads = Array.from(navigator.getGamepads() || []).filter((pad) => pad && pad.connected !== false);
      this._error = '';
    } catch (error) {
      this._error = error?.name || 'blocked';
      if (this._padInfo) this._disconnect();
      this.suspend();
      return;
    }
    const current = pads.find((pad) => this._padKey === `${pad.index}:${pad.id}` && pad.mapping === 'standard');
    const pad = current || pads.find((candidate) => candidate.mapping === 'standard') || pads[0];
    const key = pad ? `${pad.index}:${pad.id}` : null;
    if (key !== this._padKey) {
      if (this._padKey) this._disconnect();
      this._padKey = key;
      this._padInfo = pad ? { index: pad.index, id: pad.id, mapping: pad.mapping } : null;
      this.suspend();
    }
    if (!pad) return;
    this._padInfo = { index: pad.index, id: pad.id, mapping: pad.mapping };
    if (pad.mapping !== 'standard') { this.suspend(); return; }

    const next = new Set();
    const buttons = BUTTON_ACTIONS.map((actions, i) => {
      const held = pressed(pad.buttons?.[i], this._buttons[i]);
      if (held) for (const action of actions) next.add(action);
      return held;
    });
    const x = axisDirection(pad.axes?.[0], this._axes[0]);
    const y = axisDirection(pad.axes?.[1], this._axes[1]);
    if (x < 0) next.add('left');
    if (x > 0) next.add('right');
    if (y < 0) next.add('up');
    if (y > 0) next.add('down');
    // Opposite D-pad/stick directions cancel instead of accelerating a menu.
    for (const [a, b] of [['left', 'right'], ['up', 'down']]) {
      if (next.has(a) && next.has(b)) { next.delete(a); next.delete(b); }
    }
    if (next.has('up')) next.add('jump');
    this._buttons = buttons;
    this._axes = [x, y];
    if (this._neutralRequired) {
      const axesCentered = [pad.axes?.[0], pad.axes?.[1]].every((value) => !Number.isFinite(value) || Math.abs(value) < AXIS_RELEASE);
      if (!buttons.some(Boolean) && axesCentered) this._neutralRequired = false;
      return;
    }

    const newlyPressed = [...next].some((action) => !this._previous.has(action));
    if (newlyPressed) this.onActivity();
    for (const action of this._consumed) if (!next.has(action)) this._consumed.delete(action);
    const time = Number.isFinite(now) ? now : clock();
    for (const action of NAV_ACTIONS) {
      if (!next.has(action)) { this._repeat.delete(action); continue; }
      const directional = action === 'up' || action === 'down' || action === 'left' || action === 'right';
      const fresh = !this._previous.has(action);
      const due = directional && this._repeat.has(action) && time >= this._repeat.get(action);
      if (!fresh && !due) continue;
      if (directional) this._repeat.set(action, time + (fresh ? REPEAT_DELAY : REPEAT_INTERVAL));
      if (this.onNavigate(action) === true) {
        for (const blocked of NAV_GAME_ACTIONS[action] || [action]) this._consumed.add(blocked);
      }
      // Navigation can switch input modes or suspend on a screen transition.
      if (!this.enabled || this._neutralRequired) return;
    }
    this.input.setVirtualActions(SOURCE, [...next].filter((action) => !this._consumed.has(action)));
    this._previous = next;
  }
}
