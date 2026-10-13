/* Standard Gamepad API button indices. Menu confirmation remains ✕ / ○ so
 * every saved gameplay layout can still be edited on a television. */
export const PAD_BINDING_VERSION = 1;
export const DEFAULT_PAD_BINDINGS = Object.freeze({
  left: 14, right: 15, up: 12, down: 13,
  jump: 0, attack: 2, dodge: 1, parry: 4, interact: 3, throw: 5,
  cycleL: 6, cycleR: 7, pause: 9,
});
export const PAD_ACTION_LABELS = Object.freeze({
  jump: 'Saltar', attack: 'Atacar', dodge: 'Esquivar', parry: 'Parada',
  interact: 'Interactuar', throw: 'Lanzar', cycleL: 'Objeto anterior',
  cycleR: 'Objeto siguiente', pause: 'Pausa', left: 'Izquierda',
  right: 'Derecha', up: 'Mirar arriba', down: 'Mirar abajo',
});
const BUTTON_NAMES = ['✕', '○', '□', '△', 'L1', 'R1', 'L2', 'R2', 'SHARE', 'OPTIONS', 'L3', 'R3', 'Cruceta ↑', 'Cruceta ↓', 'Cruceta ←', 'Cruceta →', 'PS'];
export const prettyPadButton = (index) => BUTTON_NAMES[index] || 'Botón ' + (index + 1);
const validButton = (value) => Number.isInteger(value) && value >= 0 && value <= 31;

export function createPadBindings() {
  let bindings = { ...DEFAULT_PAD_BINDINGS };
  let revision = 0;
  let capture = null;
  const listeners = new Set();
  const state = () => ({ bindings: { ...bindings }, revision, capture: capture ? { action: capture.action, ready: capture.ready } : null });
  const emit = () => { for (const listener of listeners) listener(state()); };
  const finish = (reason, button = null) => {
    const previous = capture;
    capture = null;
    emit();
    previous?.onDone?.({ reason, action: previous.action, button });
  };
  return {
    getBindings: () => ({ ...bindings }),
    getRevision: () => revision,
    getState: state,
    getButton: (action) => bindings[action],
    getHint: (action) => action === 'confirm' ? '✕' : action === 'cancel' ? '○' : Object.hasOwn(bindings, action) ? prettyPadButton(bindings[action]) : action,
    subscribe(listener) { listeners.add(listener); listener(state()); return () => listeners.delete(listener); },
    load(saved, version = 0) {
      bindings = { ...DEFAULT_PAD_BINDINGS };
      // The previous version never saved controller mappings: loading its
      // keyboard/touch bindings must not revive tap jump on the controller.
      if (version === PAD_BINDING_VERSION && saved && typeof saved === 'object' && !Array.isArray(saved)) {
        const used = new Set();
        for (const action of Object.keys(DEFAULT_PAD_BINDINGS)) {
          const button = saved[action];
          if (validButton(button) && !used.has(button)) { bindings[action] = button; used.add(button); }
          else bindings[action] = null;
        }
        // Repair damaged/incomplete profiles while keeping every action usable
        // and preventing a single button from unexpectedly doing two things.
        for (const action of Object.keys(DEFAULT_PAD_BINDINGS)) {
          if (bindings[action] !== null) continue;
          const fallback = DEFAULT_PAD_BINDINGS[action];
          const replacement = !used.has(fallback) ? fallback : Array.from({ length: 32 }, (_, index) => index).find((index) => !used.has(index));
          bindings[action] = replacement; used.add(replacement);
        }
      }
      revision++; capture = null; emit();
    },
    setBinding(action, button) {
      if (!Object.hasOwn(DEFAULT_PAD_BINDINGS, action) || !validButton(button)) return false;
      const old = bindings[action];
      if (old === button) return true;
      const other = Object.keys(bindings).find((key) => key !== action && bindings[key] === button);
      if (other) bindings[other] = old;
      bindings[action] = button; revision++; emit(); return true;
    },
    reset() { bindings = { ...DEFAULT_PAD_BINDINGS }; revision++; capture = null; emit(); },
    beginCapture(action, onDone) {
      if (!Object.hasOwn(DEFAULT_PAD_BINDINGS, action)) return false;
      if (capture) finish('cancelled');
      capture = { action, ready: false, optionsSince: null, onDone };
      emit(); return true;
    },
    cancelCapture(reason = 'cancelled') { if (capture) finish(reason); },
    isCapturing: () => !!capture,
    /** Return true while capture owns this entire poll, including the finishing
     * press. Holding the button that opened capture can never bind it. */
    feedCapture(buttons, axesCentered, now = Date.now()) {
      if (!capture) return false;
      if (!capture.ready) {
        if (!buttons.some(Boolean) && axesCentered) { capture.ready = true; emit(); }
        return true;
      }
      // A short OPTIONS press can be assigned like every other button. Holding
      // it cancels, so the TV user never needs a mouse to escape capture.
      if (capture.optionsSince !== null) {
        if (!buttons[9]) { this.setBinding(capture.action, 9); finish('bound', 9); }
        else if (now - capture.optionsSince >= 750) finish('cancelled');
        return true;
      }
      if (buttons[9]) { capture.optionsSince = now; return true; }
      const button = buttons.findIndex(Boolean);
      if (button !== -1) { this.setBinding(capture.action, button); finish('bound', button); }
      return true;
    },
  };
}

export const PadBindings = createPadBindings();
