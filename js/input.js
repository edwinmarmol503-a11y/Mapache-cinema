/* ============================================================
   input.js  -  centralised keyboard input + rebindable actions
   ============================================================ */
export const DEFAULT_BINDINGS = {
  left:     ['KeyA', 'ArrowLeft'],
  right:    ['KeyD', 'ArrowRight'],
  up:       ['KeyW', 'ArrowUp'],
  down:     ['KeyS', 'ArrowDown'],
  jump:     ['KeyW', 'ArrowUp'],
  attack:   ['KeyJ'],
  dodge:    ['ShiftLeft', 'ShiftRight'],
  parry:    ['KeyL'],
  interact: ['KeyE'],
  throw:    ['KeyK'],
  pause:    ['Escape'],
  confirm:  ['Enter', 'Space'],
  cancel:   ['Escape', 'Backspace'],
  cycleL:   ['KeyQ'],
  cycleR:   ['KeyR'],
};

const GAMEPLAY_ACTIONS = ['left', 'right', 'up', 'down', 'jump', 'attack', 'dodge', 'parry', 'interact', 'throw', 'cycleL', 'cycleR', 'confirm', 'cancel'];
const DIRECTIONS = ['left', 'right', 'up', 'down'];
export const BINDING_VERSION = 4;

export const Input = {
  keys: new Set(),
  pressed: new Set(),
  released: new Set(),
  bindings: JSON.parse(JSON.stringify(DEFAULT_BINDINGS)),
  _capture: null, // callback while listening for a rebind
  _initialized: false,
  _keyboardEnabled: true,
  _virtualHeld: new Map(),
  _virtualPressed: new Set(),
  _virtualReleased: new Set(),

  init() {
    if (this._initialized) return;
    this._initialized = true;
    window.addEventListener('keydown', (e) => {
      if (this._capture) {
        e.preventDefault();
        const cb = this._capture;
        this._capture = null;
        cb(e.code);
        return;
      }
      // don't hijack typing in form controls (options sliders/selects)
      const ae = document.activeElement;
      if (ae && (/^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName) || ae.isContentEditable)) return;
      if (!this._keyboardEnabled) return;
      if (this._isGameKey(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      if (!this._keyboardEnabled) return;
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => this.reset());
    window.addEventListener('pagehide', () => this.reset());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.reset();
    });
  },

  _isGameKey(code) {
    for (const k in this.bindings) if (Array.isArray(this.bindings[k]) && this.bindings[k].includes(code)) return true;
    return false;
  },

  _keyboardDown(action) { const b = this.bindings[action]; return this._keyboardEnabled && Array.isArray(b) && b.some((c) => this.keys.has(c)); },
  _virtualDown(action) { for (const actions of this._virtualHeld.values()) if (actions.has(action)) return true; return false; },
  down(action)        { return this._keyboardDown(action) || this._virtualDown(action); },
  justPressed(action)  { const b = this.bindings[action]; return this._virtualPressed.has(action) || (this._keyboardEnabled && Array.isArray(b) && b.some((c) => this.pressed.has(c))); },
  justReleased(action) { const b = this.bindings[action]; return !this.down(action) && (this._virtualReleased.has(action) || (this._keyboardEnabled && Array.isArray(b) && b.some((c) => this.released.has(c)))); },
  anyPressed()         { return (this._keyboardEnabled && this.pressed.size > 0) || this._virtualPressed.size > 0; },

  /** A fresh gameplay press advances one dialogue beat. Direction keys only
   * navigate choices; their shared jump action must never choose an answer. */
  advanceDialoguePressed(choices = false) {
    const actions = choices ? GAMEPLAY_ACTIONS.filter((action) => !DIRECTIONS.includes(action)) : GAMEPLAY_ACTIONS;
    for (const action of actions) {
      if (action === 'jump' && choices && DIRECTIONS.some((direction) => this._virtualPressed.has(direction))) continue;
      if (this._virtualPressed.has(action)) return true;
    }
    if (!this._keyboardEnabled) return false;
    const excluded = new Set(this.bindings.pause || []);
    if (choices) for (const action of DIRECTIONS) for (const code of this.bindings[action] || []) excluded.add(code);
    return actions.some((action) => (this.bindings[action] || []).some((code) => this.pressed.has(code) && !excluded.has(code)));
  },

  clearFrame() {
    this.pressed.clear(); this.released.clear();
    this._virtualPressed.clear(); this._virtualReleased.clear();
  },

  /** Touch controls use actions, so keyboard rebinding never breaks mobile.
   * Each finger owns a source; releasing one cannot release another finger. */
  setVirtualActions(source, actions) {
    const previous = this._virtualHeld.get(source) || new Set();
    const next = new Set(actions.filter((action) => Object.hasOwn(DEFAULT_BINDINGS, action)));
    const changed = new Set([...previous, ...next]);
    const wasDown = new Map([...changed].map((action) => [action, this.down(action)]));
    if (next.size) this._virtualHeld.set(source, next);
    else this._virtualHeld.delete(source);
    for (const action of changed) {
      const held = this.down(action);
      if (!wasDown.get(action) && held) this._virtualPressed.add(action);
      if (wasDown.get(action) && !held) this._virtualReleased.add(action);
    }
  },
  releaseVirtual(source) { this.setVirtualActions(source, []); },

  /** Cancel a disappearing device's pending press without deleting another
   * source's held input or normal release edge. */
  cancelVirtual(source) {
    const actions = [...(this._virtualHeld.get(source) || [])];
    this.releaseVirtual(source);
    for (const action of actions) if (!this.down(action)) this._virtualPressed.delete(action);
  },

  setKeyboardEnabled(enabled) {
    enabled = enabled === true;
    if (enabled === this._keyboardEnabled) return;
    this._keyboardEnabled = enabled;
    this.keys.clear();
    this.pressed.clear();
    this.released.clear();
  },

  /** Clear held input when focus is lost; a held jump must not survive a pause. */
  reset() {
    this.pressed.clear();
    this.released = new Set(this.keys);
    this._virtualPressed.clear();
    this._virtualReleased = new Set([...this._virtualHeld.values()].flatMap((actions) => [...actions]));
    this.keys.clear();
    this._virtualHeld.clear();
  },

  setBinding(action, codes) { this.bindings[action] = codes.slice(); },
  resetBindings() { this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS)); },

  /** Keep customised keys while upgrading the previous default Space jump.
   * A versioned migration runs once; explicit later Space rebindings survive. */
  loadBindings(saved, version = 0) {
    this.resetBindings();
    if (saved && typeof saved === 'object') {
      for (const action of Object.keys(DEFAULT_BINDINGS)) {
        const codes = saved[action];
        if (Array.isArray(codes) && codes.length && codes.every((code) => typeof code === 'string')) this.setBinding(action, codes);
      }
    }
    const legacyJump = version < BINDING_VERSION && this.bindings.jump.length === 1 && this.bindings.jump[0] === 'Space';
    if (legacyJump) this.setBinding('jump', DEFAULT_BINDINGS.jump);
    return legacyJump;
  },

  /** listen for the next key press and return its code via callback */
  captureNext(cb) { this._capture = cb; },
};
