import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { Save } from '../js/save.js';
import { Door, LightNode, Rope } from '../js/puzzles.js';

function fixture() {
  const previousDocument = globalThis.document;
  const previousStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.document = { getElementById: () => null };
  globalThis.localStorage = { getItem: (key) => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const gameWithSave = () => {
    const save = { ...Save, data: null };
    return new Game({}, { width: 480, height: 270 }, { save,
      audio: { playMusic() {}, sfx() {} }, dialogue: { active: false, start() {} } });
  };
  let game = gameWithSave();
  const collect = (type) => {
    const pickup = game.pickups.find((item) => item.type === type && !item.taken);
    assert.ok(pickup, `${type} pickup must exist`);
    game.player.x = pickup.x;
    game.player.y = pickup.y;
    pickup.update(1 / 60, game);
    return pickup.id;
  };
  return {
    get game() { return game; }, collect,
    checkpoint() { game._activateCheckpoint(game.checkpointRects[0]); },
    saved() { return JSON.parse(values.get('mapache_cinema_save_v1')); },
    async reload() { game = gameWithSave(); game.continueGame(); await Promise.resolve(); return game; },
    close() { globalThis.document = previousDocument; globalThis.localStorage = previousStorage; },
  };
}

test('a bulb collected after a checkpoint survives an immediate reload and cannot be farmed', async () => {
  const f = fixture();
  try {
    f.game.startAt('normal', 0, 'RIKO');
    f.checkpoint();
    const checkpoint = { ...f.game.save.data.checkpoint };
    const bulbId = f.collect('bombilla');
    assert.equal(f.saved().items.bombilla, 1);
    assert.ok(f.saved().collected.includes(bulbId));
    await f.reload();
    assert.equal(f.game.inventory.count('bombilla'), 1);
    assert.equal(f.game.pickups.some((item) => item.id === bulbId), false);
    assert.deepEqual(f.game.save.data.checkpoint, checkpoint);
    const light = f.game.puzzleEls.find((item) => item instanceof LightNode && !item.lit);
    const memoryBefore = f.game.save.data.memories;
    light.interact(f.game);
    assert.equal(f.saved().items.bombilla || 0, 0);
    assert.equal(f.saved().levelProgress['lit:' + light.id], true);
    assert.equal(f.saved().memories, memoryBefore + 1);
    await f.reload();
    assert.equal(f.game.inventory.count('bombilla'), 0);
    assert.equal(f.game.pickups.some((item) => item.id === bulbId), false);
    const restored = f.game.puzzleEls.find((item) => item.id === light.id);
    assert.equal(restored.lit, true);
    assert.equal(f.game.save.data.memories, memoryBefore + 1);
    restored.interact(f.game);
    assert.equal(f.game.save.data.memories, memoryBefore + 1);
  } finally { f.close(); }
});

test('a key is saved with its pickup ID, then consumed together with the permanently opened door', async () => {
  const f = fixture();
  try {
    f.game.startAt('normal', 0, 'RIKO');
    f.checkpoint();
    const keyId = f.collect('llave');
    assert.equal(f.saved().items.llave, 1);
    await f.reload();
    assert.equal(f.game.inventory.count('llave'), 1);
    assert.equal(f.game.pickups.some((item) => item.id === keyId), false);
    const door = f.game.puzzleEls.find((item) => item instanceof Door && item.locked);
    door.interact(f.game);
    assert.equal(f.saved().items.llave || 0, 0);
    assert.equal(f.saved().levelProgress['open:' + door.id], true);
    await f.reload();
    const restored = f.game.puzzleEls.find((item) => item.id === door.id);
    assert.equal(restored.open, true);
    assert.equal(restored.locked, false);
    assert.equal(f.game.inventory.count('llave'), 0);
    assert.equal(f.game.pickups.some((item) => item.id === keyId), false);
    f.game.inventory.add('llave');
    restored.interact(f.game);
    assert.equal(f.game.inventory.count('llave'), 1, 'repeating a completed puzzle must not spend another key');
  } finally { f.close(); }
});

test('a loose memory pickup is persisted before its ID prevents it from respawning', async () => {
  const f = fixture();
  try {
    f.game.startAt('normal', 0, 'RIKO');
    f.checkpoint();
    const memoryId = f.collect('memory');
    assert.equal(f.saved().memories, 1);
    assert.ok(f.saved().collected.includes(memoryId));
    await f.reload();
    assert.equal(f.game.save.data.memories, 1);
    assert.equal(f.game.pickups.some((item) => item.id === memoryId), false);
  } finally { f.close(); }
});

test('a consumed rope restores its bridge after reload and an invalid interaction awards no free light', async () => {
  const f = fixture();
  try {
    f.game.startAt('normal', 3, 'RIKO');
    f.checkpoint();
    const ropeId = f.collect('cuerda');
    const rope = f.game.puzzleEls.find((item) => item instanceof Rope && !item.done);
    rope.interact(f.game);
    assert.equal(f.saved().items.cuerda || 0, 0);
    assert.equal(f.saved().levelProgress['rope:' + rope.id], true);
    await f.reload();
    const restored = f.game.puzzleEls.find((item) => item.id === rope.id);
    assert.equal(restored.done, true);
    assert.equal(restored.extraSolids.length, restored.len);
    assert.equal(f.game.pickups.some((item) => item.id === ropeId), false);
    f.game.inventory.add('cuerda');
    restored.interact(f.game);
    assert.equal(f.game.inventory.count('cuerda'), 1);
    const light = f.game.puzzleEls.find((item) => item instanceof LightNode && !item.lit);
    const memories = f.game.save.data.memories;
    light.interact(f.game);
    assert.equal(light.lit, false);
    assert.equal(f.game.save.data.memories, memories);
    assert.equal(f.game.save.data.levelProgress['lit:' + light.id], undefined);
  } finally { f.close(); }
});
