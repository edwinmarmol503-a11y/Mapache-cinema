import test from 'node:test';
import assert from 'node:assert/strict';
import { drawHUD, touchHUDLayout } from '../js/ui.js';
import { Controls } from '../js/control-mode.js';

const rect = (left, top, width, height) => ({ left, top, width, height, right: left + width, bottom: top + height });
const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;

test('568x320 touch HUD clears both shoulder buttons without moving or colliding with the clock', () => {
  const canvas = rect(4, 2.5, 560, 315), left = rect(8, 8, 104, 44), right = rect(456, 8, 104, 44);
  const layout = touchHUDLayout(canvas, left, right);
  const onScreen = (x, y, w, h) => rect(canvas.left + x * canvas.width / 480,
    canvas.top + y * canvas.height / 270, w * canvas.width / 480, h * canvas.height / 270);
  const hearts = onScreen(4 + layout.left, 4, 78, 51);
  const memory = onScreen(439 - layout.right, 4, 37, 15);
  const objectives = onScreen(372 - layout.right, layout.objectivesY, 102, 30);
  const timer = onScreen(193, 5, 94, 27);
  for (const box of [hearts, memory, objectives]) {
    assert.equal(overlaps(box, left), false);
    assert.equal(overlaps(box, right), false);
    assert.equal(overlaps(box, timer), false);
  }
  assert.equal(layout.objectivesY, 35);
});

test('portrait shoulders outside the canvas, hidden buttons and absent controls leave HUD unchanged', () => {
  const canvas = rect(4, 196, 312, 175.5);
  const unchanged = { left: 0, right: 0, objectivesY: 20 };
  assert.deepEqual(touchHUDLayout(canvas, rect(8, 8, 104, 44), rect(208, 8, 104, 44)), unchanged);
  assert.deepEqual(touchHUDLayout(canvas, rect(0, 0, 0, 0), rect(0, 0, 0, 0)), unchanged);
  assert.deepEqual(touchHUDLayout(canvas), unchanged);
});

test('touch inventory renders SELECT once; keyboard keeps its separate cycling hints', () => {
  const labels = [];
  const noop = () => {};
  const ctx = new Proxy({ fillText: text => labels.push(text) }, { get: (o, key) => key in o ? o[key] : noop });
  const world = { W: 480, H: 270, player: { hp: 3, maxHp: 3 }, inventory: { selected: null },
    save: { data: {} }, getLevelElapsedMs: () => 0 };
  try {
    Controls.initialize({ defaultMode: 'touch' });
    drawHUD(ctx, world);
    assert.ok(labels.includes('SELECT'));
    assert.equal(labels.includes('SELECT/SELECT'), false);
    labels.length = 0;
    Controls.initialize({ defaultMode: 'keyboard' });
    drawHUD(ctx, world);
    assert.ok(labels.includes(Controls.getHint('cycleL') + '/' + Controls.getHint('cycleR')));
  } finally { Controls.initialize({ defaultMode: 'keyboard' }); }
});
