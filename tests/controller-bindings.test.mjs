import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createPadBindings, DEFAULT_PAD_BINDINGS, PAD_BINDING_VERSION } from '../js/controller-bindings.js';

const released = () => Array(17).fill(false);
test('controller defaults use a jump button and never persist keyboard/touch profiles as gamepad mappings', () => {
  const profile = createPadBindings();
  profile.load({ jump: ['KeyW'], attack: ['KeyJ'] }, 4);
  assert.deepEqual(profile.getBindings(), DEFAULT_PAD_BINDINGS);
  assert.equal(profile.getHint('jump'), '✕');
});

test('reassigning an occupied button swaps actions and a saved layout survives loading', () => {
  const profile = createPadBindings();
  assert.equal(profile.setBinding('jump', 2), true);
  assert.equal(profile.getButton('jump'), 2);
  assert.equal(profile.getButton('attack'), 0);
  const saved = profile.getBindings();
  const reloaded = createPadBindings(); reloaded.load(saved, PAD_BINDING_VERSION);
  assert.deepEqual(reloaded.getBindings(), saved);
  assert.equal(reloaded.getHint('confirm'), '✕');
  assert.equal(reloaded.getHint('cancel'), '○');
});

test('invalid or duplicated saved indices are repaired to unique usable buttons', () => {
  const profile = createPadBindings();
  profile.load({ jump: 2, attack: 2, dodge: -1, pause: 600, left: '14' }, PAD_BINDING_VERSION);
  const saved = profile.getBindings();
  assert.equal(saved.jump, 2);
  assert.equal(new Set(Object.values(saved)).size, Object.keys(DEFAULT_PAD_BINDINGS).length);
  assert.ok(Object.values(saved).every((value) => Number.isInteger(value) && value >= 0 && value <= 31));
  assert.equal(profile.setBinding('telepathy', 3), false);
  assert.equal(profile.setBinding('jump', NaN), false);
});

test('capture requires all buttons released and centered axes before the next fresh button', () => {
  const profile = createPadBindings(); const result = [];
  profile.beginCapture('jump', (value) => result.push(value));
  const held = released(); held[0] = true;
  profile.feedCapture(held, true, 0);
  assert.equal(profile.getState().capture.ready, false);
  profile.feedCapture(released(), false, 10);
  assert.equal(profile.getState().capture.ready, false);
  profile.feedCapture(released(), true, 20);
  assert.equal(profile.getState().capture.ready, true);
  held[0] = false; held[3] = true;
  assert.equal(profile.feedCapture(held, true, 30), true);
  assert.equal(profile.getButton('jump'), 3);
  assert.deepEqual(result, [{ reason: 'bound', action: 'jump', button: 3 }]);
  assert.equal(profile.feedCapture(held, true, 40), false);
});

test('holding OPTIONS cancels without changing a layout; a short press assigns OPTIONS', () => {
  const profile = createPadBindings(); const results = [];
  const options = released(); options[9] = true;
  profile.beginCapture('jump', (result) => results.push(result.reason));
  profile.feedCapture(released(), true, 0);
  profile.feedCapture(options, true, 10);
  profile.feedCapture(options, true, 759);
  assert.equal(profile.isCapturing(), true);
  profile.feedCapture(options, true, 760);
  assert.equal(profile.isCapturing(), false);
  assert.equal(profile.getButton('jump'), 0);
  assert.deepEqual(results, ['cancelled']);
  profile.beginCapture('jump', (result) => results.push(result.reason));
  profile.feedCapture(released(), true, 1000);
  profile.feedCapture(options, true, 1010);
  profile.feedCapture(released(), true, 1100);
  assert.equal(profile.getButton('jump'), 9);
  assert.equal(profile.getButton('pause'), 0);
  assert.deepEqual(results, ['cancelled', 'bound']);
});

test('restore defaults and closing a capture are safe and notify consumers', () => {
  const profile = createPadBindings(); const reasons = [];
  profile.setBinding('attack', 5);
  profile.beginCapture('jump', (result) => reasons.push(result.reason));
  profile.cancelCapture('disconnected');
  assert.deepEqual(reasons, ['disconnected']);
  const revision = profile.getRevision(); profile.reset();
  assert.deepEqual(profile.getBindings(), DEFAULT_PAD_BINDINGS);
  assert.equal(profile.getRevision(), revision + 1);
});
