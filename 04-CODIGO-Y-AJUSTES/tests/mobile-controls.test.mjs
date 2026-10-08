import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

// Only the input lifecycle needs browser globals. No third-party runtime or
// modification of the real player's saved settings is needed for these tests.
const windowListeners = new Map();
const documentListeners = new Map();
const listen = (listeners) => (type, fn) => {
  const list = listeners.get(type) || [];
  list.push(fn);
  listeners.set(type, list);
};
globalThis.window = { addEventListener: listen(windowListeners), matchMedia: () => ({ matches: false }) };
globalThis.document = { addEventListener: listen(documentListeners), activeElement: null, hidden: false };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { maxTouchPoints: 0, userAgent: 'Node test' } });
const { Input } = await import('../js/input.js');
const { joystickActions, isTouchDevice } = await import('../js/touch.js');
Input.init();

const dispatch = (listeners, type, event = {}) => {
  for (const listener of listeners.get(type) || []) listener(event);
};
const key = (type, code) => dispatch(windowListeners, type, { code, preventDefault() {} });

beforeEach(() => {
  Input.reset();
  Input.clearFrame();
  Input.resetBindings();
  Input._capture = null;
  document.activeElement = null;
  document.hidden = false;
});

test('joystick dead zone, cardinal directions, diagonals and invalid positions', () => {
  assert.deepEqual(joystickActions(0, 0), []);
  assert.deepEqual(joystickActions(0.15, -0.08), []);
  assert.deepEqual(joystickActions(-1, 0), ['left']);
  assert.deepEqual(joystickActions(1, 0), ['right']);
  assert.deepEqual(joystickActions(0, -1), ['up']);
  assert.deepEqual(joystickActions(0, 1), ['down']);
  assert.deepEqual(joystickActions(0.7, -0.7), ['right', 'up']);
  assert.deepEqual(joystickActions(-0.7, 0.7), ['left', 'down']);
  assert.deepEqual(joystickActions(NaN, 1), []);
  assert.deepEqual(joystickActions(1, Infinity), []);
  assert.equal(isTouchDevice, false, 'desktop keeps its keyboard layout');
});

test('movement, jumping and attacking can be held by separate fingers', () => {
  Input.setVirtualActions('stick', ['right']);
  Input.setVirtualActions('jump-finger', ['jump']);
  Input.setVirtualActions('attack-finger', ['attack']);
  assert.equal(Input.down('right'), true);
  assert.equal(Input.justPressed('jump'), true);
  assert.equal(Input.justPressed('attack'), true);
  Input.clearFrame();
  Input.releaseVirtual('jump-finger');
  assert.equal(Input.down('jump'), false);
  assert.equal(Input.justReleased('jump'), true);
  assert.equal(Input.down('right'), true);
  assert.equal(Input.down('attack'), true);
});

test('two owners of one action release only when the final finger lifts', () => {
  Input.setVirtualActions('finger-a', ['jump']);
  assert.equal(Input.justPressed('jump'), true);
  Input.clearFrame();
  Input.setVirtualActions('finger-b', ['jump']);
  assert.equal(Input.justPressed('jump'), false);
  Input.releaseVirtual('finger-a');
  assert.equal(Input.down('jump'), true);
  assert.equal(Input.justReleased('jump'), false);
  Input.releaseVirtual('finger-b');
  assert.equal(Input.down('jump'), false);
  assert.equal(Input.justReleased('jump'), true);
});

test('keyboard rebinding cannot disconnect virtual jump, parry or platform drop', () => {
  Input.setBinding('jump', ['KeyZ']);
  Input.setBinding('parry', ['KeyX']);
  Input.setBinding('down', ['KeyV']);
  Input.setVirtualActions('stick', ['down']);
  Input.setVirtualActions('button', ['parry', 'jump']);
  assert.equal(Input.down('jump'), true);
  assert.equal(Input.justPressed('parry'), true);
  assert.equal(Input.down('down'), true);
  assert.equal(Input.keys.size, 0, 'touch does not manufacture physical key state');
});

test('releasing touch does not release a keyboard key, and vice versa', () => {
  key('keydown', 'ArrowRight');
  Input.setVirtualActions('stick', ['right']);
  Input.clearFrame();
  Input.releaseVirtual('stick');
  assert.equal(Input.down('right'), true);
  assert.equal(Input.justReleased('right'), false);
  Input.setVirtualActions('stick', ['right']);
  key('keyup', 'ArrowRight');
  assert.equal(Input.down('right'), true);
  assert.equal(Input.justReleased('right'), false);
  Input.releaseVirtual('stick');
  assert.equal(Input.down('right'), false);
  assert.equal(Input.justReleased('right'), true);
});

test('changing a held joystick direction releases old axes and presses new axes', () => {
  Input.setVirtualActions('stick', joystickActions(-0.7, -0.7));
  Input.clearFrame();
  Input.setVirtualActions('stick', joystickActions(0.7, 0.7));
  assert.equal(Input.down('left'), false);
  assert.equal(Input.down('up'), false);
  assert.equal(Input.justReleased('left'), true);
  assert.equal(Input.justReleased('up'), true);
  assert.equal(Input.justPressed('right'), true);
  assert.equal(Input.justPressed('down'), true);
  Input.clearFrame();
  Input.setVirtualActions('stick', joystickActions(0.01, 0.01));
  assert.equal(Input.down('right'), false);
  assert.equal(Input.down('down'), false);
});

test('blur, page hiding and hidden tabs clear every held input', () => {
  for (const lifecycle of ['blur', 'pagehide', 'visibilitychange']) {
    key('keydown', 'KeyD');
    Input.setVirtualActions('stick', ['up']);
    Input.setVirtualActions('jump', ['jump']);
    Input.clearFrame();
    if (lifecycle === 'visibilitychange') {
      document.hidden = true;
      dispatch(documentListeners, lifecycle);
      document.hidden = false;
    } else dispatch(windowListeners, lifecycle);
    assert.equal(Input.down('right'), false, lifecycle);
    assert.equal(Input.down('up'), false, lifecycle);
    assert.equal(Input.down('jump'), false, lifecycle);
    assert.equal(Input.anyPressed(), false, lifecycle);
    assert.equal(Input.justReleased('jump'), true, lifecycle);
    Input.clearFrame();
  }
});

test('typing, rebinding capture and keyboard menu navigation keep working', () => {
  document.activeElement = { tagName: 'INPUT' };
  key('keydown', 'KeyA');
  assert.equal(Input.down('left'), false);
  document.activeElement = { tagName: 'DIV', isContentEditable: true };
  key('keydown', 'ArrowLeft');
  assert.equal(Input.down('left'), false);
  document.activeElement = null;
  let captured = null;
  Input.captureNext((code) => { captured = code; });
  key('keydown', 'KeyZ');
  assert.equal(captured, 'KeyZ');
  assert.equal(Input.keys.has('KeyZ'), false);
  key('keydown', 'ArrowDown');
  key('keydown', 'Enter');
  assert.equal(Input.justPressed('down'), true);
  assert.equal(Input.justPressed('confirm'), true);
});

test('unknown virtual actions are ignored and initialisation is idempotent', () => {
  Input.setVirtualActions('broken-source', ['teleport', '__proto__']);
  assert.equal(Input.anyPressed(), false);
  assert.equal(Input._virtualHeld.size, 0);
  const before = windowListeners.get('keydown').length;
  Input.init();
  assert.equal(windowListeners.get('keydown').length, before);
});
