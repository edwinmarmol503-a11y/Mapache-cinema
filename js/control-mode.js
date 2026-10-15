import { Input } from './input.js';
import { PadBindings } from './controller-bindings.js';

// Only a salted verifier ships with the game. The access code is kept in .local/.
// This is a local exhibition switch, not server-side account authentication.
const ACCESS_SALT = '2546f8c4ba93b76fc054983293201057';
const ACCESS_DIGEST = '53e3ad5d6870ecc6b96b9d01f33398271da8752ce5ef16d6aeadac1749bce948';
const TOUCH_HINTS = { jump: '×', attack: '□', dodge: '○', parry: 'L', interact: '△', throw: 'R', pause: 'START', confirm: '△', cancel: 'VOLVER', cycleL: 'SELECT', cycleR: 'SELECT', emote: 'GESTO' };

export function createControls({ salt = ACCESS_SALT, digest = ACCESS_DIGEST, cryptoProvider = globalThis.crypto, padBindings = PadBindings } = {}) {
  let mode = 'keyboard';
  let defaultMode = 'keyboard';
  let unlocked = false;
  let revision = 0;
  let checking = false;
  let pad = { enabled: false, supported: false, connected: false, ready: false, id: '', mapping: '', message: '' };
  const listeners = new Set();
  const state = () => ({ mode, unlocked, gamepad: { ...pad } });
  const emit = () => { for (const listener of listeners) listener(state()); };
  padBindings.subscribe(() => emit());
  return {
    initialize({ defaultMode: next = 'keyboard' } = {}) {
      defaultMode = next === 'touch' ? 'touch' : 'keyboard';
      if (!unlocked) mode = defaultMode;
      emit();
    },
    getMode: () => mode,
    isUnlocked: () => unlocked,
    canUnlock: () => !!cryptoProvider?.subtle && typeof TextEncoder !== 'undefined',
    getState: state,
    subscribe(listener) { listeners.add(listener); listener(state()); return () => listeners.delete(listener); },
    async unlock(value) {
      if (checking || !cryptoProvider?.subtle || typeof TextEncoder === 'undefined') return false;
      const code = String(value || '').trim().toUpperCase();
      if (!code || code.length > 80) return false;
      const attempt = revision;
      checking = true;
      try {
        const bytes = await cryptoProvider.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + code));
        const candidate = [...new Uint8Array(bytes)].map(byte => byte.toString(16).padStart(2, '0')).join('');
        if (attempt !== revision || candidate !== digest) return false;
        unlocked = true;
        mode = 'gamepad';
        emit();
        return true;
      } catch { return false; }
      finally { checking = false; }
    },
    lock() { revision++; unlocked = false; mode = defaultMode; padBindings.cancelCapture(); emit(); },
    setMode(next) {
      if (!unlocked || next !== 'gamepad') return false;
      mode = next;
      emit();
      return true;
    },
    getGamepadStatus: () => ({ ...pad }),
    setGamepadStatus(status) {
      const next = { ...pad, ...status };
      if (JSON.stringify(next) === JSON.stringify(pad)) return;
      pad = next;
      emit();
    },
    getHint(action) {
      if (mode === 'gamepad') {
        if (action === 'left' || action === 'right') return 'Stick / ' + padBindings.getHint(action);
        return padBindings.getHint(action);
      }
      if (mode === 'touch') return TOUCH_HINTS[action] || 'Joystick';
      const code = Input.bindings[action]?.[0] || '';
      return ({ Space: 'ESPACIO', Escape: 'ESC', Enter: 'ENTER', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', ArrowLeft: '◀', ArrowRight: '▶', ArrowUp: '▲', ArrowDown: '▼' })[code] || code.replace(/^Key|^Digit/, '') || action;
    },
  };
}

export const Controls = createControls();
