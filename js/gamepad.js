/* ============================================================
   gamepad.js - gated standard controller input (DualShock 4).
   Bluetooth pairing belongs to the device/browser, not the game.
   ============================================================ */
import { Input } from './input.js';
import { PadBindings } from './controller-bindings.js';

const SOURCE = 'gamepad:player';
const AXIS_PRESS = 0.32;
const AXIS_RELEASE = 0.20;
const REPEAT_DELAY = 360;
const REPEAT_INTERVAL = 110;
const NAV_ACTIONS = ['attack', 'up', 'down', 'left', 'right', 'confirm', 'cancel', 'pause'];
const FIXED_MENU_BUTTONS = { up: 12, down: 13, left: 14, right: 15, confirm: 0, cancel: 1 };

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
  constructor({ input = Input, bindings = PadBindings, onNavigate = () => false, onDisconnect = () => {}, onActivity = () => {} } = {}) {
    this.input = input;
    this.bindings = bindings;
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
    this._navPrevious = new Set();
    this._buttons = [];
    this._axes = [0, 0];
    this._repeat = new Map();
    this._consumedButtons = new Set();
    this._consumedAxes = new Set();
    this._bindingRevision = bindings.getRevision();
    this._anyButtonPressed = false;
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
    this._navPrevious.clear();
    this._buttons = [];
    this._axes = [0, 0];
    this._repeat.clear();
    this._consumedButtons.clear();
    this._consumedAxes.clear();
    this._anyButtonPressed = false;
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
    this.bindings.cancelCapture('disconnected');
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

  /** Fresh physical presses, including SHARE/L3/R3/PS, for a death-screen
   * continuation. Capture, reconnect and held buttons never count. */
  getAnyButtonPressed() { return this._anyButtonPressed; }

  poll(now = clock()) {
    this._anyButtonPressed = false;
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

    const revision = this.bindings.getRevision();
    if (revision !== this._bindingRevision) { this._bindingRevision = revision; this.suspend(); }

    const next = new Set();
    const buttons = Array.from({ length: Math.min(32, pad.buttons?.length || 0) }, (_, i) => {
      const held = pressed(pad.buttons?.[i], this._buttons[i]);
      return held;
    });
    const rawFresh = buttons.some((held, index) => held && !this._buttons[index]);
    const mapping = this.bindings.getBindings();
    for (const [action, index] of Object.entries(mapping)) if (buttons[index]) next.add(action);
    // Menu confirmation and back always remain recoverable, independent of
    // how the player arranges gameplay jump, attack or dodge.
    if (buttons[0]) next.add('confirm');
    if (buttons[1]) next.add('cancel');
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
    const navigation = new Set();
    const navButtons = { ...FIXED_MENU_BUTTONS, attack: mapping.attack, pause: mapping.pause };
    for (const [action, index] of Object.entries(navButtons)) if (buttons[index]) navigation.add(action);
    if (x < 0) navigation.add('left');
    if (x > 0) navigation.add('right');
    if (y < 0) navigation.add('up');
    if (y > 0) navigation.add('down');
    for (const [a, b] of [['left', 'right'], ['up', 'down']]) {
      if (navigation.has(a) && navigation.has(b)) { navigation.delete(a); navigation.delete(b); }
    }
    this._buttons = buttons;
    this._axes = [x, y];
    const axesCentered = [pad.axes?.[0], pad.axes?.[1]].every((value) => !Number.isFinite(value) || Math.abs(value) < AXIS_RELEASE);
    if (this.bindings.feedCapture(buttons, axesCentered, now)) { this.suspend(); return; }
    if (this._neutralRequired) {
      if (!buttons.some(Boolean) && axesCentered) this._neutralRequired = false;
      return;
    }

    this._anyButtonPressed = rawFresh;

    const newlyPressed = rawFresh || [...next].some((action) => !this._previous.has(action));
    if (newlyPressed) this.onActivity();
    for (const index of this._consumedButtons) if (!buttons[index]) this._consumedButtons.delete(index);
    for (const action of this._consumedAxes) {
      const held = (action === 'left' && x < 0) || (action === 'right' && x > 0) || (action === 'up' && y < 0) || (action === 'down' && y > 0);
      if (!held) this._consumedAxes.delete(action);
    }
    const time = Number.isFinite(now) ? now : clock();
    for (const action of NAV_ACTIONS) {
      if (!navigation.has(action)) { this._repeat.delete(action); continue; }
      const directional = action === 'up' || action === 'down' || action === 'left' || action === 'right';
      const fresh = !this._navPrevious.has(action);
      const due = directional && this._repeat.has(action) && time >= this._repeat.get(action);
      if (!fresh && !due) continue;
      if (directional) this._repeat.set(action, time + (fresh ? REPEAT_DELAY : REPEAT_INTERVAL));
      if (this.onNavigate(action) === true) {
        const button = navButtons[action];
        if (buttons[button]) this._consumedButtons.add(button);
        if (directional) this._consumedAxes.add(action);
      }
      // Navigation can switch input modes or suspend on a screen transition.
      if (!this.enabled || this._neutralRequired) return;
    }
    this.input.setVirtualActions(SOURCE, [...next].filter((action) => {
      const button = action === 'confirm' ? 0 : action === 'cancel' ? 1 : mapping[action];
      const viaButton = buttons[button] && !this._consumedButtons.has(button);
      const viaAxis = !this._consumedAxes.has(action) && ((action === 'left' && x < 0) || (action === 'right' && x > 0) || (action === 'up' && y < 0) || (action === 'down' && y > 0));
      return viaButton || viaAxis;
    }));
    this._previous = next;
    this._navPrevious = navigation;
  }
}
