import { Input } from './input.js';

// Only a salted verifier ships with the game. The access code is kept in .local/.
// This is a local exhibition switch, not server-side account authentication.
const ACCESS_SALT = '2546f8c4ba93b76fc054983293201057';
const ACCESS_DIGEST = 'a7e3af96d3affe970ef3e063065394c417c35b66d3441a8893a8bce764a820db';
const MODES = ['keyboard', 'touch', 'gamepad'];
const PAD_HINTS = { left: 'Stick / ◀', right: 'Stick / ▶', up: '▲', down: '▼', jump: '▲', attack: '□', dodge: '○', parry: 'L1', interact: '△', throw: 'R1', pause: 'OPTIONS', confirm: '✕', cancel: '○', cycleL: 'L2', cycleR: 'R2' };
const TOUCH_HINTS = { jump: 'Joystick ▲', attack: 'ATQ', dodge: 'ESQ', parry: 'BLOQ', interact: 'USAR', throw: 'LANZA', pause: 'Ⅱ', confirm: 'USAR', cancel: 'VOLVER', cycleL: '◀', cycleR: '▶' };

export function createControls({ salt = ACCESS_SALT, digest = ACCESS_DIGEST, cryptoProvider = globalThis.crypto } = {}) {
  let mode = 'keyboard';
  let defaultMode = 'keyboard';
  let unlocked = false;
  let revision = 0;
  let checking = false;
  let pad = { enabled: false, supported: false, connected: false, ready: false, id: '', mapping: '', message: '' };
  const listeners = new Set();
  const state = () => ({ mode, unlocked, gamepad: { ...pad } });
  const emit = () => { for (const listener of listeners) listener(state()); };
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
        emit();
        return true;
      } catch { return false; }
      finally { checking = false; }
    },
    lock() { revision++; unlocked = false; mode = defaultMode; emit(); },
    setMode(next) {
      if (!unlocked || !MODES.includes(next)) return false;
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
      if (mode === 'gamepad') return PAD_HINTS[action] || action;
      if (mode === 'touch') return TOUCH_HINTS[action] || 'Joystick';
      const code = Input.bindings[action]?.[0] || '';
      return ({ Space: 'ESPACIO', Escape: 'ESC', Enter: 'ENTER', ShiftLeft: 'SHIFT', ShiftRight: 'SHIFT', ArrowLeft: '◀', ArrowRight: '▶', ArrowUp: '▲', ArrowDown: '▼' })[code] || code.replace(/^Key|^Digit/, '') || action;
    },
  };
}

export const Controls = createControls();
