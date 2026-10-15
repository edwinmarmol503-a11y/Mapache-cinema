import test from 'node:test';
import assert from 'node:assert/strict';
import { DIFFS, DIFF_ORDER, getDiff, nightmareMercyDiff, NIGHTMARE_MERCY_DEATHS } from '../js/difficulty.js';
import { Game } from '../js/game.js';
import { Save } from '../js/save.js';
import { Input } from '../js/input.js';

test('the balance change increases movement moderately without removing easy accessibility', () => {
  const previous = { easy: .9, normal: 1, hard: 1.35, nightmare: 1.55 };
  for (const mode of DIFF_ORDER) {
    const increase = DIFFS[mode].enemySpeed / previous[mode] - 1;
    assert.ok(increase >= .1 && increase <= (mode === 'nightmare' ? .2 : .15));
    if (mode === 'nightmare') assert.ok(increase >= .15);
  }
  assert.equal(DIFFS.easy.halfEnemies, true);
  assert.equal(DIFFS.easy.playerHp, 4);
  assert.equal(DIFFS.easy.extraItems, 3);
  assert.equal(DIFFS.easy.enemyHp, -1);
  assert.equal(DIFFS.easy.enemyDmg, -1);
  assert.equal(DIFFS.nightmare.playerHp, 5);
  assert.equal(DIFFS.nightmare.instaKillTouch, true);
  assert.equal(DIFFS.nightmare.meleeOff, true);
});

test('all five actual levels apply each mode to their enemies while keeping checkpoints and healing', () => {
  const document = globalThis.document, storage = globalThis.localStorage;
  const values = new Map();
  globalThis.document = { getElementById: () => null };
  globalThis.localStorage = { getItem: k => values.get(k) ?? null,
    setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  try {
    for (const mode of DIFF_ORDER) for (let level = 0; level < 5; level++) {
      const game = new Game({}, {}, { save: { ...Save, data: null },
        dialogue: { active: false, start() {} }, audio: { playMusic() {}, sfx() {} } });
      game.startAt(mode, level, 'PRUEBA');
      assert.ok(game.enemies.length > 0, `${mode}/${level}`);
      for (const e of game.enemies) {
        assert.equal(e.speedMul, getDiff(mode).enemySpeed);
        assert.ok(e.hp >= 1);
        const baseSpeed = { sombra: 46, devorador: 34, guardian: 18 }[e.type];
        if (baseSpeed) assert.equal(e.speed, baseSpeed * getDiff(mode).enemySpeed);
      }
      assert.equal(game.player.maxHp, getDiff(mode).playerHp);
      assert.ok(game.levelDef.checkpoints.length > 0);
      assert.ok(game.levelDef.memories.length > 0, 'healing memories remain available');
    }
  } finally { globalThis.document = document; globalThis.localStorage = storage; Input.reset(); }
});

test('nightmare assistance still starts after 25 deaths and preserves its existing mercy limits', () => {
  const base = { ...DIFFS.nightmare }, mercy = nightmareMercyDiff(DIFFS.nightmare);
  assert.equal(NIGHTMARE_MERCY_DEATHS, 25);
  assert.equal(mercy.enemySpeed, 1.4);
  assert.equal(mercy.orbMul, 1.6);
  assert.equal(mercy.extraEnemies, 1);
  assert.equal(mercy.bossHpMul, 1.4);
  assert.equal(mercy.instaKillTouch, true);
  assert.equal(mercy.meleeOff, true);
  assert.deepEqual(DIFFS.nightmare, base, 'applying assistance cannot mutate unassisted mode');
});
