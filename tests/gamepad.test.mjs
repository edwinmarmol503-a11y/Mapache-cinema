import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { Input } from '../js/input.js';
import { GamepadController } from '../js/gamepad.js';

const windowListeners = new Map();
const documentListeners = new Map();
const listen = (listeners) => (type, fn) => {
  const list = listeners.get(type) || new Set();
  list.add(fn);
  listeners.set(type, list);
};
const remove = (listeners) => (type, fn) => listeners.get(type)?.delete(fn);
const dispatch = (listeners, type, event = {}) => { for (const fn of listeners.get(type) || []) fn(event); };
globalThis.window = { addEventListener: listen(windowListeners), removeEventListener: remove(windowListeners) };
globalThis.document = { hidden: false, addEventListener: listen(documentListeners), removeEventListener: remove(documentListeners) };
let pads = [];
let reads = 0;
let controllers = [];
const getGamepads = () => { reads++; return pads; };
Object.defineProperty(globalThis, 'navigator', { configurable: true, value: { getGamepads } });

function pad(index = 0, id = 'DualShock 4') {
  return { index, id, mapping: 'standard', connected: true, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
}
function press(device, index, value = 1) { device.buttons[index] = { pressed: value === 1, value }; }
function release(device, index) { press(device, index, 0); }
function create(callbacks = {}) {
  const controller = new GamepadController(callbacks).init();
  controllers.push(controller);
  return controller;
}
function activate(controller, device = pad()) {
  pads = [device];
  controller.setEnabled(true);
  controller.poll(0);
  assert.equal(controller.getStatus().ready, true);
  return device;
}
beforeEach(() => {
  pads = []; reads = 0;
  navigator.getGamepads = getGamepads;
  document.hidden = false;
  Input.reset(); Input.clearFrame(); Input.resetBindings(); Input.setKeyboardEnabled(true);
});
afterEach(() => { for (const controller of controllers) controller.destroy(); controllers = []; Input.setKeyboardEnabled(true); });

test('developer gate never reads controller state while disabled and disabling releases only its source', () => {
  const controller = create();
  const device = pad(); press(device, 0); pads = [device];
  controller.poll(); controller.getStatus();
  dispatch(windowListeners, 'gamepaddisconnected', { gamepad: device });
  assert.equal(reads, 0);
  assert.equal(Input.down('jump'), false);
  release(device, 0); activate(controller, device);
  device.axes[0] = 1; controller.poll(10);
  Input.setVirtualActions('touch:finger', ['jump']);
  controller.setEnabled(false);
  assert.equal(Input.down('right'), false);
  assert.equal(Input.down('jump'), true);
  const before = reads; controller.poll(20); assert.equal(reads, before);
});

test('standard PS4 face buttons, shoulders, triggers and Options map to semantic actions', () => {
  const navigation = [];
  const controller = create({ onNavigate: (action) => { navigation.push(action); } });
  const device = activate(controller);
  const expected = new Map([[0, ['confirm']], [1, ['dodge', 'cancel']], [2, ['attack']], [3, ['interact']], [4, ['parry']], [5, ['throw']], [6, ['cycleL']], [7, ['cycleR']], [9, ['pause']], [12, ['up', 'jump']], [13, ['down']], [14, ['left']], [15, ['right']]]);
  for (const [index, actions] of expected) {
    press(device, index); controller.poll(index * 10 + 20);
    for (const action of actions) assert.equal(Input.justPressed(action), true, `${index}: ${action}`);
    Input.clearFrame(); release(device, index); controller.poll(index * 10 + 21);
    for (const action of actions) assert.equal(Input.justReleased(action), true, `${index}: ${action} released`);
    Input.clearFrame();
  }
  assert.deepEqual(navigation, ['confirm', 'cancel', 'pause', 'up', 'down', 'left', 'right']);
  assert.equal(Input.keys.size, 0);
});

test('holding Up produces a single press and held jump, while X only confirms', () => {
  const events = [];
  const controller = create({ onNavigate: (action) => { events.push(action); } });
  const device = activate(controller);
  press(device, 12); controller.poll(10);
  assert.equal(Input.justPressed('jump'), true);
  Input.clearFrame(); controller.poll(1000);
  assert.equal(Input.down('jump'), true);
  assert.equal(Input.justPressed('jump'), false);
  assert.equal(events[0], 'up');
  release(device, 12); controller.poll(1010);
  assert.equal(Input.justReleased('jump'), true);
  Input.clearFrame(); press(device, 0); controller.poll(1020);
  assert.equal(Input.justPressed('confirm'), true);
  assert.equal(Input.justPressed('jump'), false);
});

test('stick drift is ignored, hysteresis prevents jitter, diagonal and opposite input are stable', () => {
  const controller = create(); const device = activate(controller);
  device.axes = [0.18, -0.15]; controller.poll(10);
  assert.equal(Input.anyPressed(), false);
  device.axes = [0.4, -0.5]; controller.poll(20);
  assert.equal(Input.down('right'), true); assert.equal(Input.down('up'), true); assert.equal(Input.justPressed('jump'), true);
  Input.clearFrame(); device.axes = [0.25, -0.24]; controller.poll(30);
  assert.equal(Input.down('right'), true); assert.equal(Input.down('up'), true);
  assert.equal(Input.down('jump'), true); assert.equal(Input.justPressed('jump'), false);
  assert.equal(Input.anyPressed(), false);
  device.axes = [0.19, -0.19]; controller.poll(40);
  assert.equal(Input.down('right'), false); assert.equal(Input.down('up'), false);
  assert.equal(Input.down('jump'), false);
  Input.clearFrame(); device.axes = [NaN, Infinity]; controller.poll(50);
  assert.equal(Input.anyPressed(), false);
  device.axes = [1, 0]; press(device, 14); controller.poll(60);
  assert.equal(Input.down('right'), false); assert.equal(Input.down('left'), false);
});

test('analog triggers use hysteresis and are unaffected by keyboard rebinding', () => {
  const controller = create(); const device = activate(controller);
  Input.setBinding('cycleR', ['KeyT']);
  press(device, 7, 0.6); controller.poll(10);
  assert.equal(Input.justPressed('cycleR'), true);
  Input.clearFrame(); press(device, 7, 0.4); controller.poll(20);
  assert.equal(Input.down('cycleR'), true); assert.equal(Input.justPressed('cycleR'), false);
  press(device, 7, 0.2); controller.poll(30);
  assert.equal(Input.down('cycleR'), false);
});

test('menu directions repeat without catch-up bursts while confirm, cancel and pause never repeat', () => {
  const events = [];
  const controller = create({ onNavigate: (action) => { events.push(action); } });
  const device = activate(controller);
  for (const index of [0, 1, 9, 13]) press(device, index);
  controller.poll(10); Input.clearFrame(); controller.poll(200); controller.poll(369);
  assert.deepEqual(events, ['down', 'confirm', 'cancel', 'pause']);
  controller.poll(370); controller.poll(5000);
  assert.deepEqual(events.slice(4), ['down', 'down']);
  controller.poll(5001); assert.equal(events.length, 6);
});

test('menu consuming confirm blocks held X through transitions without producing jump', () => {
  let menu = true;
  const controller = create({ onNavigate: (action) => { if (menu && action === 'confirm') { menu = false; return true; } return false; } });
  const device = activate(controller); press(device, 0); controller.poll(10);
  assert.equal(menu, false); assert.equal(Input.down('confirm'), false); assert.equal(Input.down('jump'), false);
  Input.clearFrame(); controller.poll(20); assert.equal(Input.down('confirm'), false);
  release(device, 0); controller.poll(30); Input.clearFrame();
  press(device, 0); controller.poll(40); assert.equal(Input.justPressed('confirm'), true); assert.equal(Input.justPressed('jump'), false);
});

test('menu navigation consumes Up and its paired jump until neutral, including stick input', () => {
  let menu = true;
  const controller = create({ onNavigate: (action) => { if (menu && action === 'up') { menu = false; return true; } return false; } });
  const device = activate(controller); device.axes[1] = -1; controller.poll(10);
  assert.equal(Input.down('up'), false); assert.equal(Input.down('jump'), false);
  Input.clearFrame(); controller.poll(20); assert.equal(Input.down('jump'), false);
  device.axes[1] = 0; controller.poll(30); Input.clearFrame();
  press(device, 12); controller.poll(40); assert.equal(Input.justPressed('jump'), true);
});

test('enable and reconnect require neutral input, never replaying a held jump or movement', () => {
  const disconnected = [];
  const controller = create({ onDisconnect: (info) => disconnected.push(info) });
  const device = pad(); press(device, 12); device.axes[0] = 1; pads = [device];
  controller.setEnabled(true); controller.poll(10);
  assert.equal(controller.getStatus().ready, false); assert.equal(Input.anyPressed(), false);
  release(device, 12); device.axes[0] = 0; controller.poll(20);
  press(device, 12); controller.poll(30); assert.equal(Input.down('jump'), true);
  Input.clearFrame(); pads = [null]; controller.poll(40); controller.poll(50);
  assert.equal(Input.down('jump'), false); assert.equal(disconnected.length, 1);
  pads = [device]; controller.poll(60); assert.equal(Input.down('jump'), false);
  release(device, 12); controller.poll(70); assert.equal(controller.getStatus().ready, true);
  press(device, 12); controller.poll(80); assert.equal(Input.justPressed('jump'), true);
});

test('disconnect event clears immediately and releases without interfering with another input owner', () => {
  let count = 0;
  const controller = create({ onDisconnect: () => count++ }); const device = activate(controller);
  device.axes[0] = 1; controller.poll(10); Input.clearFrame();
  Input.setVirtualActions('touch:right', ['right']);
  dispatch(windowListeners, 'gamepaddisconnected', { gamepad: device }); pads = [null]; controller.poll(20);
  assert.equal(Input.down('right'), true); assert.equal(Input.justReleased('right'), false); assert.equal(count, 1);
});

test('blur and hidden tabs release inputs, skip polling and wait for neutral after return', () => {
  const controller = create(); const device = activate(controller);
  press(device, 2); controller.poll(10); Input.clearFrame();
  dispatch(windowListeners, 'blur'); const before = reads; controller.poll(20);
  assert.equal(reads, before); assert.equal(Input.down('attack'), false);
  dispatch(windowListeners, 'focus'); controller.poll(30); assert.equal(Input.down('attack'), false);
  release(device, 2); controller.poll(40); press(device, 2); controller.poll(50); assert.equal(Input.down('attack'), true);
  document.hidden = true; dispatch(documentListeners, 'visibilitychange'); const hiddenReads = reads; controller.poll(60);
  assert.equal(reads, hiddenReads); assert.equal(Input.down('attack'), false);
  document.hidden = false; controller.poll(70); assert.equal(Input.down('attack'), false);
  release(device, 2); controller.poll(80); assert.equal(controller.getStatus().ready, true);
});

test('unsupported browsers, denied permissions and nonstandard layouts fail cleanly', () => {
  const controller = create(); controller.setEnabled(true);
  navigator.getGamepads = undefined; controller.poll(10);
  assert.equal(controller.getStatus().supported, false);
  navigator.getGamepads = () => { throw new DOMException('denied', 'SecurityError'); }; controller.poll(20);
  assert.match(controller.getStatus().message, /bloqueó/);
  navigator.getGamepads = getGamepads; const device = pad(); device.mapping = ''; press(device, 0); pads = [device]; controller.poll(30);
  assert.equal(controller.getStatus().connected, true); assert.equal(controller.getStatus().ready, false);
  assert.match(controller.getStatus().message, /sin distribución estándar/); assert.equal(Input.anyPressed(), false);
});

test('stable controller ownership, null slots and replacing an index preserve fresh presses', () => {
  const controller = create(); const first = pad(1, 'PS4 A'); const second = pad(3, 'PS4 B');
  pads = [null, first, null, second]; controller.setEnabled(true); controller.poll(0);
  press(second, 0); controller.poll(10); assert.equal(Input.down('jump'), false);
  press(first, 2); controller.poll(20); assert.equal(Input.down('attack'), true);
  const replacement = pad(1, 'PS4 C'); press(replacement, 12); pads = [null, replacement]; controller.poll(30);
  assert.equal(Input.down('attack'), false); assert.equal(Input.down('jump'), false);
  release(replacement, 12); controller.poll(40); press(replacement, 12); controller.poll(50);
  assert.equal(Input.justPressed('jump'), true);
});

test('keyboard mode switching clears physical input and leaves touch/controller actions independent', () => {
  Input.keys.add('KeyW'); Input.pressed.add('KeyW'); Input.released.add('KeyJ');
  assert.equal(Input.down('jump'), true);
  Input.setVirtualActions('touch:left', ['left']);
  Input.setKeyboardEnabled(false);
  assert.equal(Input.down('jump'), false); assert.equal(Input.justPressed('jump'), false);
  assert.equal(Input.justReleased('attack'), false); assert.equal(Input.down('left'), true);
  Input.clearFrame();
  Input.keys.add('KeyW'); Input.pressed.add('KeyW'); Input.released.add('KeyJ');
  assert.equal(Input.down('jump'), false); assert.equal(Input.anyPressed(), false);
  const controller = create(); const device = activate(controller);
  press(device, 12); controller.poll(10); assert.equal(Input.justPressed('jump'), true);
  Input.setKeyboardEnabled(true);
  assert.equal(Input.keys.size, 0); assert.equal(Input.down('jump'), true);
});

test('a pad disappearing before the tick consumes input cannot leave a pending attack', () => {
  const controller = create(); const device = activate(controller);
  press(device, 2); controller.poll(10); assert.equal(Input.justPressed('attack'), true);
  pads = []; controller.poll(11);
  assert.equal(Input.down('attack'), false); assert.equal(Input.justPressed('attack'), false);
});
