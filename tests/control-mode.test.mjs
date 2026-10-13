import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash, webcrypto } from 'node:crypto';
import { createControls } from '../js/control-mode.js';
import { Input } from '../js/input.js';
import { backingScale, resizeBacking } from '../js/display.js';

const testSalt = 'test-salt';
const testCode = 'TEST-ONLY-CODE';
const fixture = () => createControls({ salt: testSalt, digest: createHash('sha256').update(testSalt + ':' + testCode).digest('hex'), cryptoProvider: webcrypto });

test('developer modes require a valid code, with normal mobile defaults preserved', async () => {
  const controls = fixture();
  controls.initialize({ defaultMode: 'touch' });
  assert.equal(controls.getMode(), 'touch');
  assert.equal(controls.setMode('gamepad'), false);
  assert.equal(await controls.unlock('wrong'), false);
  assert.equal(controls.isUnlocked(), false);
  assert.equal(await controls.unlock('  test-only-code  '), true);
  assert.equal(controls.getMode(), 'gamepad');
  assert.equal(controls.setMode('keyboard'), false);
  assert.equal(controls.setMode('touch'), false);
  assert.equal(controls.setMode('gamepad'), true);
  assert.equal(controls.getHint('interact'), '△');
  assert.equal(controls.getHint('parry'), 'L1');
  assert.equal(controls.setMode('telepathy'), false);
  controls.lock();
  assert.equal(controls.getMode(), 'touch');
  assert.equal(controls.setMode('gamepad'), false);
});

test('the exhibition code is Mapache-cinema and the earlier long code no longer opens access', async () => {
  const controls = createControls({ cryptoProvider: webcrypto });
  assert.equal(await controls.unlock('LUMERA-107D-DBD3-387F-E7E2'), false);
  assert.equal(await controls.unlock('  Mapache-cinema  '), true);
  assert.equal(controls.getMode(), 'gamepad');
  assert.equal(controls.getHint('jump'), '✕');
});

test('a pending code check cannot unlock again after closing developer access', async () => {
  let complete;
  const controls = createControls({ salt: testSalt, digest: '00', cryptoProvider: { subtle: { digest: () => new Promise(resolve => { complete = resolve; }) } } });
  const attempt = controls.unlock(testCode);
  controls.lock();
  complete(Uint8Array.of(0).buffer);
  assert.equal(await attempt, false);
  assert.equal(controls.isUnlocked(), false);
});

test('an unsupported crypto provider keeps the developer switch closed', async () => {
  const controls = createControls({ cryptoProvider: {} });
  assert.equal(await controls.unlock(testCode), false);
  assert.equal(controls.setMode('gamepad'), false);
});

test('keyboard hints follow custom bindings and gamepad status does not emit redundant changes', async () => {
  const controls = fixture();
  const saved = Input.bindings.interact;
  Input.setBinding('interact', ['KeyF']);
  assert.equal(controls.getHint('interact'), 'F');
  Input.setBinding('interact', saved);
  let updates = 0;
  const stop = controls.subscribe(() => updates++);
  controls.setGamepadStatus({ supported: true });
  controls.setGamepadStatus({ supported: true });
  assert.equal(updates, 2);
  stop();
  controls.setGamepadStatus({ connected: true });
  assert.equal(updates, 2);
});

test('display resolution increases without changing world coordinates or exceeding Full HD', () => {
  assert.equal(backingScale(480, 1), 2);
  assert.equal(backingScale(1440, 1), 3);
  assert.equal(backingScale(3840, 3), 4);
  assert.equal(backingScale(NaN, Infinity), 2);
  const canvas = { width: 480, height: 270 };
  assert.equal(resizeBacking(canvas, 1440, 1), 3);
  assert.deepEqual(canvas, { width: 1440, height: 810 });
});
