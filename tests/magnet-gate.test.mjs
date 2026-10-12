import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { Save } from '../js/save.js';
import { Input } from '../js/input.js';
import { resolveSolids } from '../js/physics.js';

function fixture(difficulty = 'normal') {
  const originalDocument = globalThis.document, originalStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.document = { getElementById: () => null };
  globalThis.localStorage = { getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const create = () => new Game({}, { width: 480, height: 270 }, {
    save: { ...Save, data: null }, audio: { playMusic() {}, sfx() {} },
    dialogue: { active: false, start() {} },
  });
  let game = create();
  game.startAt(difficulty, 2, 'RIKO');
  Input.reset();
  const tickPuzzles = () => { for (const puzzle of game.puzzleEls) puzzle.update(1 / 60, game); };
  return {
    get game() { return game; }, tickPuzzles,
    gate: () => game.puzzleEls.find(p => p.id === 'd_s1'),
    plate: () => game.puzzleEls.find(p => p.id === 'bx1'),
    magnet: () => game.puzzleEls.find(p => p.id === 'm1'),
    async reload() { game = create(); game.continueGame(); await Promise.resolve(); },
    close() { Input.reset(); globalThis.document = originalDocument; globalThis.localStorage = originalStorage; },
  };
}

test('the sewer plate cannot unlock the sluice until the magnet moves its metal crate', () => {
  const f = fixture();
  try {
    const { game } = f, plate = f.plate(), gate = f.gate(), magnet = f.magnet();
    game.player.x = plate.x; game.player.y = plate.y - game.player.h;
    game.player.vy = 0;
    for (let frame = 0; frame < 30; frame++) f.tickPuzzles();
    assert.equal(game.signals.bx1, true, 'the player can step on the pressure plate');
    assert.equal(gate.open, false, 'a plate pressed without the magnet must stay locked');
    assert.ok(gate.solidRect);
    magnet.interact(game);
    assert.equal(magnet.used, false, 'interacting without the magnet item cannot unlock it');
    game.inventory.add('iman');
    game.player.x = 48;
    magnet.interact(game);
    for (let frame = 0; frame < 40; frame++) f.tickPuzzles();
    assert.equal(gate.open, true);
    assert.equal(gate.solidRect, null, 'the entire barrier clears after solving the puzzle');
    const crate = game.crates.find(c => c.tag === 'box1');
    assert.equal(crate.x, plate.def.tx * plate.ts);
    assert.equal(crate.y, plate.def.ty * plate.ts);
  } finally { f.close(); }
});

for (const difficulty of ['easy', 'normal', 'hard', 'nightmare']) {
  test(`double jumping and dodging cannot bypass the closed magnet barrier (${difficulty})`, () => {
    const f = fixture(difficulty);
    try {
      const { game } = f, gate = f.gate(), player = game.player;
      // Start on the nearest ledge, a stronger attempt than jumping from ground.
      player.x = gate.x - 32; player.y = 15 * 16 - player.h;
      player.onGround = true;
      let closest = player.x;
      for (let frame = 0; frame < 150; frame++) {
        const actions = ['right'];
        if (frame === 0 || frame === 18) actions.push('up', 'jump');
        if (frame === 10 || frame === 60) actions.push('dodge');
        Input.setVirtualActions('gate-review', actions);
        player.update(1 / 60, game);
        f.tickPuzzles();
        resolveSolids(player, [gate.solidRect].filter(Boolean), 1 / 60);
        closest = Math.max(closest, player.x);
        Input.clearFrame();
      }
      assert.equal(gate.open, false);
      assert.ok(closest + player.w <= gate.x + 0.01, 'no attempted jump or dodge passes through the barrier');
      assert.equal(player.onWallR, true, 'the final ground approach still collides');
    } finally { f.close(); }
  });
}

test('a solved magnet barrier remains open after saving at the next checkpoint and continuing', async () => {
  const f = fixture();
  try {
    const { game } = f;
    const pickup = game.pickups.find(p => p.type === 'iman');
    game.player.x = pickup.x; game.player.y = pickup.y;
    pickup.update(1 / 60, game);
    f.magnet().interact(game);
    for (let frame = 0; frame < 40; frame++) f.tickPuzzles();
    assert.equal(f.gate().open, true);
    game._activateCheckpoint(game.checkpointRects[0]);
    await f.reload();
    for (let frame = 0; frame < 40; frame++) f.tickPuzzles();
    assert.equal(f.magnet().used, true);
    assert.equal(f.game.signals.m1, true, 'restored magnets re-emit their required signal');
    assert.equal(f.game.signals.bx1, true, 'the restored crate still holds the plate down');
    assert.equal(f.gate().open, true);
    assert.equal(f.gate().solidRect, null);
  } finally { f.close(); }
});
