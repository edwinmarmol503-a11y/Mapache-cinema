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
  let game = create(); game.startAt(difficulty, 2, 'RIKO'); Input.reset();
  const tick = (frames = 1) => {
    for (let frame = 0; frame < frames; frame++) {
      for (const puzzle of game.puzzleEls) puzzle.update(1 / 60, game);
    }
  };
  return {
    get game() { return game; }, tick,
    gate: () => game.puzzleEls.find(puzzle => puzzle.id === 'd_s2'),
    sequence: () => game.puzzleEls.find(puzzle => puzzle.id === 'seq1'),
    press(id, frames = 1) {
      const button = game.puzzleEls.find(puzzle => puzzle.id === id);
      game.player.x = button.x; game.player.y = button.y - game.player.h;
      game.player.vy = 0; tick(frames);
      game.player.x = 80 * 16; tick();
    },
    async reload() { game = create(); game.continueGame(); await Promise.resolve(); },
    close() { Input.reset(); globalThis.document = originalDocument; globalThis.localStorage = originalStorage; },
  };
}

test('the sequence barrier only opens after fresh presses in the required order', () => {
  const f = fixture();
  try {
    const gate = f.gate(), sequence = f.sequence();
    f.press('sq_a', 30);
    assert.equal(sequence.progress, 1, 'holding the first plate never counts as more presses');
    assert.equal(gate.open, false);
    f.press('sq_c');
    assert.equal(sequence.progress, 0, 'a wrong third plate resets the incomplete sequence');
    f.press('sq_b'); f.press('sq_c'); f.tick(40);
    assert.equal(gate.open, false, 'missing the first plate cannot solve the order');
    assert.ok(gate.solidRect, 'the full barrier still collides after an incorrect order');
    f.press('sq_a'); f.press('sq_b');
    assert.equal(gate.open, false, 'two plates do not unlock it');
    f.press('sq_c'); f.tick(40);
    assert.equal(sequence.solved, true);
    assert.equal(gate.open, true);
    assert.equal(gate.solidRect, null, 'a solved order clears the complete passage');
    assert.equal(f.game.progress('seq:seq1'), true);
  } finally { f.close(); }
});

for (const difficulty of ['easy', 'normal', 'hard', 'nightmare']) {
  test(`double jumping and dodging from the high ledge cannot bypass the sequence (${difficulty})`, () => {
    const f = fixture(difficulty);
    try {
      const { game } = f, gate = f.gate(), player = game.player;
      assert.equal(gate.y, 0, 'the barrier reaches the top of the corridor');
      assert.equal(gate.y + gate.h, game.levelDef.def.groundY * 16, 'the barrier meets solid ground');
      assert.ok(game.map.isSolidTile(gate.def.tx, game.levelDef.def.groundY));
      player.x = 109 * 16; player.y = 13 * 16 - player.h; player.onGround = true;
      let closest = player.x;
      for (let frame = 0; frame < 210; frame++) {
        const actions = ['right'];
        if (frame <= 12 || (frame >= 20 && frame <= 33)) actions.push('jump');
        if (frame === 9 || frame === 70 || frame === 120) actions.push('dodge');
        Input.setVirtualActions('sequence-review', actions);
        player.update(1 / 60, game); f.tick();
        resolveSolids(player, [gate.solidRect].filter(Boolean), 1 / 60);
        closest = Math.max(closest, player.x); Input.clearFrame();
      }
      assert.equal(gate.open, false);
      assert.ok(closest + player.w <= gate.x + 0.01, 'no jump, double jump or dodge bypasses it');
      assert.equal(player.onWallR, true, 'the final approach remains blocked');
    } finally { f.close(); }
  });
}

test('a solved sequence stays open after a checkpoint save and continue', async () => {
  const f = fixture();
  try {
    f.press('sq_a'); f.press('sq_b'); f.press('sq_c'); f.tick(40);
    assert.equal(f.gate().open, true);
    f.game._activateCheckpoint(f.game.checkpointRects[1]);
    await f.reload(); f.tick(40);
    assert.equal(f.sequence().solved, true);
    assert.equal(f.game.signals.seq1, true, 'the saved sequence re-emits its required signal');
    assert.equal(f.gate().open, true);
    assert.equal(f.gate().solidRect, null, 'a saved completion never locks the passage again');
  } finally { f.close(); }
});

test('an incomplete order is not restored as a solved passage', async () => {
  const f = fixture();
  try {
    f.press('sq_a'); f.press('sq_b');
    f.game._activateCheckpoint(f.game.checkpointRects[1]);
    await f.reload(); f.tick(40);
    assert.equal(f.sequence().solved, false);
    assert.equal(f.sequence().progress, 0);
    assert.equal(f.gate().open, false);
    assert.ok(f.gate().solidRect);
  } finally { f.close(); }
});
