import assert from 'node:assert/strict';
import { test } from 'node:test';
import { webcrypto } from 'node:crypto';
import { ENDINGS, isEnding, endingMusicTheme, getEndingDialogue, createEndingAccess, drawEndingScene } from '../js/endings.js';

test('the three decisions retain their identity and only B uses the bad-ending soundtrack', () => {
  assert.deepEqual(Object.keys(ENDINGS), ['A', 'B', 'C']);
  assert.equal(ENDINGS.A.choice, 'Devolverla a Lumera');
  assert.equal(ENDINGS.B.choice, 'Conservarla, como él');
  assert.equal(ENDINGS.C.choice, 'Compartirla con todos');
  assert.equal(endingMusicTheme('B'), 'ending-bad');
  assert.equal(endingMusicTheme('A'), 'ending');
  assert.equal(endingMusicTheme('C'), 'ending');
  assert.match(ENDINGS.B.narration, /lo que juró destruir, la nueva amenaza de Ciudad Lumera…$/);
  assert.equal(isEnding('constructor'), false);
  assert.equal(isEnding('D'), false);
});

test('dialogue data is fresh for every showing of an ending', () => {
  const lines = getEndingDialogue('B');
  lines[0].text = 'changed';
  assert.notEqual(getEndingDialogue('B')[0].text, 'changed');
  assert.deepEqual(getEndingDialogue('invalid'), getEndingDialogue('A'));
});

test('the animation code unlocks only the gallery and relocks without persistence', async () => {
  const access = createEndingAccess({ cryptoProvider: webcrypto });
  assert.equal(access.isUnlocked(), false);
  assert.equal(await access.unlock('Mapache-cinema'), false);
  assert.equal(await access.unlock('incorrect'), false);
  assert.equal(await access.unlock('  Animacion-cinema  '), true);
  assert.equal(access.isUnlocked(), true);
  assert.equal(createEndingAccess({ cryptoProvider: webcrypto }).isUnlocked(), false);
  access.lock();
  assert.equal(access.isUnlocked(), false);
});

test('a pending animation-code check cannot reopen a closed gallery', async () => {
  let finish;
  const access = createEndingAccess({ cryptoProvider: { subtle: { digest: () => new Promise(resolve => { finish = resolve; }) } } });
  const attempt = access.unlock('Animacion-cinema');
  access.lock();
  finish(Buffer.from('7f76e8573c1c777c279d04b92bfcda608671c988c7d96e830ab19a73e84a070b', 'hex'));
  assert.equal(await attempt, false);
  assert.equal(access.isUnlocked(), false);
});

function recordingContext() {
  const calls = [], stack = [];
  const record = (method, args) => {
    for (const arg of args) if (typeof arg === 'number') assert.equal(Number.isFinite(arg), true, `${method} must receive finite coordinates`);
    calls.push([method, ...args]);
  };
  const ctx = new Proxy({ globalAlpha: 1 }, {
    get(target, prop) {
      if (Object.hasOwn(target, prop)) return target[prop];
      if (prop === 'save') return () => { stack.push(1); record(prop, []); };
      if (prop === 'restore') return () => { assert.ok(stack.length, 'restores must have a matching save'); stack.pop(); record(prop, []); };
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return (...args) => { record(prop, args); return { addColorStop: (...args) => record('colorStop', args) }; };
      return (...args) => record(prop, args);
    },
    set(target, prop, value) { target[prop] = value; record(prop, [typeof value === 'object' ? '[gradient]' : value]); return true; },
  });
  return { ctx, calls, stack };
}

test('all three cinematics render distinct finite scenes and restore their canvas state', () => {
  const signatures = new Set();
  for (const ending of ['A', 'B', 'C']) {
    const rec = recordingContext();
    drawEndingScene(rec.ctx, 480, 270, 8, ending);
    assert.equal(rec.stack.length, 0);
    signatures.add(JSON.stringify(rec.calls));
  }
  assert.equal(signatures.size, 3);
});

test('reduced effects make each entire cinematic still, including particles and Riko', () => {
  for (const ending of ['A', 'B', 'C']) {
    const a = recordingContext(), b = recordingContext();
    drawEndingScene(a.ctx, 480, 270, 0, ending, 'night', true);
    drawEndingScene(b.ctx, 480, 270, 999, ending, 'night', true);
    assert.deepEqual(a.calls, b.calls);
  }
});
