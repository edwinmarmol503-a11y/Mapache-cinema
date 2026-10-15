import test from 'node:test';
import assert from 'node:assert/strict';
import { Farolero } from '../js/boss.js';
import { LEVELS, TS, buildTileMap } from '../js/levels.js';
import { makeEnemy } from '../js/enemies.js';
import { getDiff } from '../js/difficulty.js';
import { aabb } from '../js/collision.js';

function fixture(difficulty = 'nightmare') {
  const level = LEVELS[4], a = level.bossArena, diff = getDiff(difficulty);
  const world = {
    map: buildTileMap(level), diff,
    bossArena: { x: a.tx * TS, y: a.ty * TS, w: a.w * TS, h: a.h * TS },
    player: { x: 220, y: 268, w: 12, h: 20, vy: 0, dead: false, hurt: () => false },
    enemies: level.enemies.map(e => makeEnemy(e, TS, diff)), solids: [], pickups: [], projectiles: [],
    particles: { burst() {} }, audio: { sfx() {} }, camera: { shake() {} }, toast() {},
    addProjectile(p) { this.projectiles.push(p); },
  };
  const boss = new Farolero(level.bossSpawn.tx * TS, level.bossSpawn.ty * TS, world);
  return { boss, world };
}

function fixedRandom(value, fn) {
  const random = Math.random;
  Math.random = () => value;
  try { return fn(); } finally { Math.random = random; }
}

test('nightmare phase one summons before the first dive with all tower enemies still alive below', () => {
  const { boss, world } = fixture();
  // Pesadilla also duplicates two placed enemies; all six may survive the climb.
  world.enemies.push(...LEVELS[4].enemies.slice(0, 2).map(e => makeEnemy({ ...e, tx: e.tx + 4 }, TS, world.diff)));
  assert.equal(world.enemies.length, 6);
  let elapsed = 0;
  while (!world.enemies.some(e => e._bossAdd) && elapsed < 4) {
    boss.update(1 / 60, world); elapsed += 1 / 60;
  }
  const summoned = world.enemies.find(e => e._bossAdd);
  assert.ok(summoned, 'enemies in the climb must not occupy reinforcement slots');
  assert.equal(boss.phase, 1);
  assert.equal(boss.state, 'hover', 'the first reinforcement precedes the first low pass');
  assert.ok(elapsed >= 2.5 && elapsed < 2.8);
  assert.ok(aabb(summoned, world.bossArena));
});

for (const phase of [1, 2, 3]) {
  test(`phase ${phase} caps live arena reinforcements at ${phase + 1} and replaces only defeated ones`, () => {
    const { boss, world } = fixture();
    boss.hp = phase === 1 ? boss.maxHp : phase === 2 ? boss.maxHp * .5 : 1;
    fixedRandom(.02, () => {
      for (let i = 0; i < 30; i++) boss._spawnAdd(world);
      assert.equal(boss._livingAdds(world).length, phase + 1);
      const defeated = world.enemies.find(e => e._bossAdd);
      defeated.dead = true;
      assert.equal(boss._spawnAdd(world), true);
      assert.equal(boss._livingAdds(world).length, phase + 1);
      assert.equal(world.enemies.filter(e => e._bossAdd).length, phase + 2);
    });
  });
}

test('placed enemies already inside the arena consume slots; dead enemies and enemies below do not', () => {
  const { boss, world } = fixture();
  const [first, second] = world.enemies;
  Object.assign(first, { x: 80, y: 250 });
  Object.assign(second, { x: 360, y: 250 });
  assert.equal(boss._spawnAdd(world), false);
  second.dead = true;
  assert.equal(boss._spawnAdd(world), true);
  assert.equal(boss._livingAdds(world).length, 2);
});

test('summons that temporarily leave the arena still count, preventing an unbounded replacement stream', () => {
  const { boss, world } = fixture();
  fixedRandom(.3, () => {
    assert.equal(boss._spawnAdd(world), true);
    assert.equal(boss._spawnAdd(world), true);
    for (const e of world.enemies.filter(e => e._bossAdd)) e.y = world.bossArena.y - 50;
    for (let i = 0; i < 100; i++) assert.equal(boss._spawnAdd(world), false);
    assert.equal(world.enemies.filter(e => e._bossAdd).length, 2);
  });
});

for (const [type, random] of [['sombra', .01], ['cuervo', .3], ['devorador', .6], ['guardian', .9]]) {
  test(`${type} spawns wholly inside the arena, away from Riko and solid walls`, () => {
    for (const playerX of [50, 150, 220, 320, 418]) {
      const { boss, world } = fixture();
      world.player.x = playerX;
      fixedRandom(random, () => assert.equal(boss._spawnAdd(world), true));
      const e = world.enemies.find(e => e._bossAdd), a = world.bossArena;
      assert.equal(e.type, type);
      assert.ok(e.x >= a.x + 20 && e.x + e.w <= a.x + a.w - 20);
      assert.ok(e.y >= a.y && e.y + e.h <= a.y + a.h);
      assert.ok(Math.max(e.x - (world.player.x + world.player.w), world.player.x - (e.x + e.w)) >= 60);
      assert.equal(boss._safeAddPosition(e, { ...world, enemies: world.enemies.filter(other => other !== e) }), true);
    }
  });
}

test('no unsafe fallback when walls, dynamic solids or unsupported ground block all spawn locations', () => {
  const { boss, world } = fixture();
  const row = 17, originalRow = world.map.rows[row];
  world.map.rows[row] = '#'.repeat(world.map.w);
  fixedRandom(.01, () => assert.equal(boss._spawnAdd(world), false));
  world.map.rows[row] = originalRow;
  world.solids = [{ ...world.bossArena }];
  fixedRandom(.3, () => assert.equal(boss._spawnAdd(world), false));
  world.solids = [];
  world.map.rows[18] = '.'.repeat(world.map.w);
  fixedRandom(.6, () => assert.equal(boss._spawnAdd(world), false));
  world.map.rows[18] = '^'.repeat(world.map.w);
  fixedRandom(.9, () => assert.equal(boss._spawnAdd(world), false));
  assert.equal(world.enemies.some(e => e._bossAdd), false);
});

test('an obstructed arena retries at most twice per second and recovers when room opens', () => {
  const { boss, world } = fixture();
  boss.state = 'hover'; boss.swoopCd = 999; boss.addCd = 0;
  world.solids = [{ ...world.bossArena }];
  let attempts = 0;
  const spawn = boss._spawnAdd.bind(boss);
  boss._spawnAdd = (w) => { attempts++; return spawn(w); };
  for (let frame = 0; frame < 180; frame++) boss.update(1 / 60, world);
  assert.ok(attempts >= 3 && attempts <= 5, `${attempts} attempts in three seconds`);
  assert.equal(world.enemies.some(e => e._bossAdd), false);
  world.solids = [];
  for (let frame = 0; frame < 48; frame++) boss.update(1 / 60, world);
  assert.equal(world.enemies.filter(e => e._bossAdd).length, 1);
});
