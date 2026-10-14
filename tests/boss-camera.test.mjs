import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { Save } from '../js/save.js';
import { Input } from '../js/input.js';

function fixture() {
  const doc = globalThis.document, storage = globalThis.localStorage;
  const values = new Map();
  globalThis.document = { getElementById: () => null };
  globalThis.localStorage = { getItem: k => values.get(k) ?? null, setItem: (k, v) => values.set(k, v), removeItem: k => values.delete(k) };
  const game = new Game({}, {}, { save: { ...Save, data: null }, dialogue: { active: false, start() {} }, audio: { playMusic() {}, sfx() {} } });
  game.startAt('normal', 4, 'PRUEBA');
  game.state = 'playing'; game.fadeAlpha = 0; game.introT = 0;
  game.enemies = []; game.triggers = []; game.projectiles = [];
  Object.assign(game.player, { x: 170, y: 288 - game.player.h, vx: 0, vy: 0, onGround: true, invuln: 60 });
  game.camera.snapTo(game.player);
  game.startBoss();
  return { game, close() { globalThis.document = doc; globalThis.localStorage = storage; Input.reset(); Input.clearFrame(); } };
}

test('boss camera eases to the arena and keeps the airborne boss and floor visible', () => {
  const f = fixture(), g = f.game;
  try {
    const oldY = g.camera.y;
    g.update(1 / 60);
    assert.ok(g.camera.y < oldY && g.camera.y > 48, 'camera enters the arena smoothly');
    for (let i = 0; i < 89; i++) g.update(1 / 60);
    assert.ok(Math.abs(g.camera.y - 48) < .1);
    assert.ok(g.boss.y - g.camera.y > 18, 'the airborne boss and projectile origin stay on screen');
    assert.ok(g.boss.y + g.boss.h - g.camera.y < g.H - 30);
    assert.ok(g.bossArena.y + g.bossArena.h - g.camera.y < g.H - 25, 'the floor and Riko stay above the boss HUD');
    const steadyY = g.camera.y;
    g.player.y -= 45;
    g.update(1 / 60);
    assert.ok(Math.abs(g.camera.y - steadyY) < .1, 'jumping does not move the arena framing');
  } finally { f.close(); }
});

test('arena framing preserves impact shake and ordinary follow resumes outside combat', () => {
  const f = fixture(), g = f.game;
  try {
    g.camera.shake(4, .3);
    g.update(1 / 60);
    assert.ok(g.camera.shakeT > 0 && g.camera.shakeT < .3);
    for (let i = 0; i < 89; i++) g.update(1 / 60);
    assert.equal(g.camera.shakeMag, 0);
    assert.equal(g.camera.ox, 0); assert.equal(g.camera.oy, 0);
    const arenaY = g.camera.y;
    g.bossActive = false; g.boss = null;
    g.update(1 / 60);
    assert.ok(g.camera.y > arenaY, 'normal player following returns after boss combat');
  } finally { f.close(); }
});
