import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { Save } from '../js/save.js';
import { Inventory } from '../js/inventory.js';
import { Player } from '../js/player.js';
import { Input } from '../js/input.js';
import { buildTileMap, LEVELS } from '../js/levels.js';

function fixture() {
  const doc = globalThis.document, storage = globalThis.localStorage;
  const values = new Map();
  globalThis.document = { getElementById: () => null };
  globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k,v) => values.set(k,v), removeItem: k => values.delete(k) };
  const game = new Game({}, {}, { save: { ...Save, data: null }, dialogue: { active: false, start() {} }, audio: { playMusic() {}, sfx() {} } });
  game.startAt('normal', 0, 'PRUEBA');
  return { game, values, close() { globalThis.document = doc; globalThis.localStorage = storage; Input.reset(); Input.clearFrame(); } };
}

test('three memories heal one heart; full health and insufficient funds never spend items', () => {
  const f = fixture(), g = f.game;
  try {
    g.inventory.add('memory', 4); g.inventory.selected = 'memory';
    assert.equal(g.useMemories(), true); assert.equal(g.inventory.count('memory'), 4);
    g.player.hp = 1; g.useMemories();
    assert.equal(g.player.hp, 2); assert.equal(g.inventory.count('memory'), 1);
    g.useMemories(); assert.equal(g.player.hp, 2); assert.equal(g.inventory.count('memory'), 1);
    assert.equal(JSON.parse(f.values.get('mapache_cinema_save_v1')).items.memory, 1);
    g.loadLevel(1, false); assert.equal(g.inventory.count('memory'), 1);
    g.loadLevel(1, true); assert.equal(g.inventory.count('memory'), 1);
  } finally { f.close(); }
});

test('legacy memories migrate once; spent memories cannot return on reload', () => {
  const f = fixture();
  try {
    const old = { ...f.game.save.data, memories: 6 }; delete old.memoryInventoryVersion;
    f.values.set('mapache_cinema_save_v1', JSON.stringify(old));
    f.game.continueGame();
    assert.equal(f.game.inventory.count('memory'), 6);
    f.game.inventory.selected = 'memory'; f.game.player.hp = 1; f.game.useMemories();
    f.game.continueGame(); assert.equal(f.game.inventory.count('memory'), 3);
  } finally { f.close(); }
});

test('inventory cannot overspend consumable quantities', () => {
  const inv = new Inventory(); inv.add('memory', 2);
  assert.equal(inv.use('memory', 3), false); assert.equal(inv.count('memory'), 2);
  assert.equal(inv.use('memory', -1), false);
});

test('four emotes cycle and leave collision, HP and vulnerability unchanged; movement and damage cancel', () => {
  const p = new Player(48, 226); p.onGround = true;
  const world = { map: buildTileMap(LEVELS[0]), audio: { sfx() {} }, particles: { burst() {} },
    inventory: new Inventory(), toast() {}, save: { update() {} } };
  Input.reset(); Input.clearFrame();
  for (const id of ['sleep', 'flip', 'wave', 'dance']) {
    Input.setVirtualActions('emote-test', ['emote']); p.update(1/60, world);
    assert.equal(p.emote.id, id); assert.equal(p.w, 10); assert.equal(p.h, 14);
    assert.equal(p.hp, 3); assert.equal(p.invuln, 0);
    Input.releaseVirtual('emote-test'); Input.clearFrame();
  }
  Input.setVirtualActions('walk-test', ['right']); p.update(1/60, world);
  assert.equal(p.emote, null); Input.reset(); Input.clearFrame();
  p.emote = { id: 'sleep' }; p.hurt(1, 80); assert.equal(p.emote, null);
});
