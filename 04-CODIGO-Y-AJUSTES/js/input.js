/* ============================================================
   input.js  -  centralised keyboard input + rebindable actions
   ============================================================ */
export const DEFAULT_BINDINGS = {
  left:     ['KeyA', 'ArrowLeft'],
  right:    ['KeyD', 'ArrowRight'],
  up:       ['KeyW', 'ArrowUp'],
  down:     ['KeyS', 'ArrowDown'],
  jump:     ['Space'],
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

export const Input = {
  keys: new Set(),
  pressed: new Set(),
  released: new Set(),
  bindings: JSON.parse(JSON.stringify(DEFAULT_BINDINGS)),
  _capture: null, // callback while listening for a rebind
  _initialized: false,
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
      if (this._isGameKey(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
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

  _keyboardDown(action) { const b = this.bindings[action]; return Array.isArray(b) && b.some((c) => this.keys.has(c)); },
  _virtualDown(action) { for (const actions of this._virtualHeld.values()) if (actions.has(action)) return true; return false; },
  down(action)        { return this._keyboardDown(action) || this._virtualDown(action); },
  justPressed(action)  { const b = this.bindings[action]; return this._virtualPressed.has(action) || (Array.isArray(b) && b.some((c) => this.pressed.has(c))); },
  justReleased(action) { const b = this.bindings[action]; return !this.down(action) && (this._virtualReleased.has(action) || (Array.isArray(b) && b.some((c) => this.released.has(c)))); },
  anyPressed()         { return this.pressed.size > 0 || this._virtualPressed.size > 0; },

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

  /** listen for the next key press and return its code via callback */
  captureNext(cb) { this._capture = cb; },
};
