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

  init() {
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
      if (ae && /^(INPUT|SELECT|TEXTAREA)$/.test(ae.tagName)) return;
      if (this._isGameKey(e.code)) e.preventDefault();
      if (!this.keys.has(e.code)) this.pressed.add(e.code);
      this.keys.add(e.code);
    });
    window.addEventListener('keyup', (e) => {
      this.keys.delete(e.code);
      this.released.add(e.code);
    });
    window.addEventListener('blur', () => this.keys.clear());
  },

  _isGameKey(code) {
    for (const k in this.bindings) if (this.bindings[k].includes(code)) return true;
    return false;
  },

  down(action)        { const b = this.bindings[action]; return !!b && b.some((c) => this.keys.has(c)); },
  justPressed(action)  { const b = this.bindings[action]; return !!b && b.some((c) => this.pressed.has(c)); },
  justReleased(action) { const b = this.bindings[action]; return !!b && b.some((c) => this.released.has(c)); },
  anyPressed()         { return this.pressed.size > 0; },

  clearFrame() { this.pressed.clear(); this.released.clear(); },

  setBinding(action, codes) { this.bindings[action] = codes.slice(); },
  resetBindings() { this.bindings = JSON.parse(JSON.stringify(DEFAULT_BINDINGS)); },

  /** listen for the next key press and return its code via callback */
  captureNext(cb) { this._capture = cb; },
};
