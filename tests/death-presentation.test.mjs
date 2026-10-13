import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { Save } from '../js/save.js';
import { Input } from '../js/input.js';
import { Dialogue } from '../js/dialogue.js';

function fixture(level = 0, cuesAvailable = true) {
  const previousDocument = globalThis.document, previousStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.document = { getElementById: () => null };
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const music = [], reserved = [], started = [], cues = [];
  const audio = {
    sfx() {}, stopMusic() {}, cancelTransientCue() {},
    playMusic: (...args) => music.push(args),
    reserveMusic: theme => { const token = { theme, id: reserved.length + 1 }; reserved.push(token); return token; },
    playReservedMusic: token => { started.push(token); return true; },
  };
  if (cuesAvailable) audio.playTransitionCue = name => new Promise(resolve => cues.push({ name, resolve }));
  const game = new Game({}, { width: 480, height: 270 }, { audio, save: { ...Save, data: null }, dialogue: new Dialogue() });
  game.startAt('normal', level, 'RIKO');
  game.state = 'playing'; game._rankingStarting = false;
  Input.setKeyboardEnabled(true); Input.reset(); Input.clearFrame();
  return { game, audio, music, reserved, started, cues, close() { Input.reset(); Input.clearFrame(); globalThis.document = previousDocument; globalThis.localStorage = previousStorage; } };
}

const settle = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };
function black(f) { f.game.killPlayer('fall'); f.game.update(1.51); assert.equal(f.game.state, 'death-black'); }
async function phrase(f) { black(f); f.cues.at(-1)?.resolve({ status: 'ended' }); await settle(); f.game.update(0.51); assert.equal(f.game.state, 'death-phrase'); }

test('soul precedes black; black waits for the complete cue and for at least half a second', async () => {
  const f = fixture();
  try {
    f.game.killPlayer('enemy');
    assert.equal(f.game.state, 'dying'); assert.ok(f.game._deathSoul);
    f.game.update(1); assert.equal(f.game.state, 'dying');
    f.game.update(.51); assert.equal(f.game.state, 'death-black');
    assert.equal(f.cues.at(-1).name, 'death');
    f.game.update(.2); f.cues.at(-1).resolve({ status: 'ended' }); await settle();
    f.game.update(.2); assert.equal(f.game.state, 'death-black');
    f.game.update(.11); assert.equal(f.game.state, 'death-phrase');
    assert.ok(f.game._deathPhrase.length); assert.equal(f.game._rankDeaths, 1);
  } finally { f.close(); }
});

test('a held black-screen press never retries until a fresh press; respawn reserves one song before its cue', async () => {
  const f = fixture();
  try {
    black(f);
    const deadPlayer = f.game.player, before = f.music.length;
    Input.setVirtualActions('held', ['attack']); f.game.update(1); Input.clearFrame();
    assert.equal(f.game.state, 'death-black', 'full audio still pending');
    f.cues.at(-1).resolve({ status: 'ended' }); await settle(); f.game.update(.01);
    assert.equal(f.game.state, 'death-phrase'); f.game.update(.1);
    assert.equal(f.game.player, deadPlayer, 'held button cannot acknowledge the phrase');
    Input.releaseVirtual('held'); Input.clearFrame(); Input.setVirtualActions('fresh', ['pause']); f.game.update(.01);
    assert.equal(f.game.state, 'playing'); assert.notEqual(f.game.player, deadPlayer);
    assert.equal(f.game.player.dead, false); assert.equal(f.reserved.length, 1);
    assert.equal(f.cues.at(-1).name, 'respawn'); assert.equal(f.started.length, 0);
    assert.equal(f.music.length, before, 'level music waits for REAPARICION');
    assert.equal(f.game.player.attackT, 0); assert.equal(f.game.requestRespawn(), false);
    f.cues.at(-1).resolve({ status: 'ended' }); await settle();
    assert.deepEqual(f.started, [f.reserved[0]]);
  } finally { f.close(); }
});

test('missing or unavailable cue support still permits the phrase and a retry', async () => {
  const f = fixture(0, false);
  try {
    black(f); await settle(); f.game.update(.51);
    assert.equal(f.game.state, 'death-phrase');
    assert.equal(f.game.requestRespawn(), true); await settle();
    assert.equal(f.game.state, 'playing'); assert.equal(f.started.length, 1);
  } finally { f.close(); }
});

test('a second death during REAPARICION invalidates the old continuation and reserves the next song once', async () => {
  const f = fixture();
  try {
    await phrase(f); f.game.requestRespawn(); const firstRespawn = f.cues.at(-1);
    black(f); firstRespawn.resolve({ status: 'ended' }); await settle();
    assert.equal(f.started.length, 0, 'a dead player cannot receive the previous reserved music');
    f.cues.at(-1).resolve({ status: 'ended' }); await settle(); f.game.update(.51);
    f.game.requestRespawn(); assert.equal(f.reserved.length, 2);
    f.cues.at(-1).resolve({ status: 'ended' }); await settle();
    assert.deepEqual(f.started, [f.reserved[1]]); assert.equal(f.game._rankDeaths, 2);
  } finally { f.close(); }
});

test('leaving a death presentation cannot start delayed music over the menu', async () => {
  const f = fixture();
  try {
    await phrase(f); f.game.requestRespawn(); const pending = f.cues.at(-1);
    f.game.suspendRun(); f.audio.playMusic('menu'); pending.resolve({ status: 'ended' }); await settle();
    assert.equal(f.started.length, 0); assert.deepEqual(f.music.at(-1), ['menu']);
  } finally { f.close(); }
});

test('passing a level during the respawn clip cancels its continuation and keeps the new level music', async () => {
  const f = fixture();
  try {
    await phrase(f); f.game.requestRespawn(); const pending = f.cues.at(-1);
    f.game.nextLevel(); f.game.update(.5);
    assert.equal(f.game.levelIndex, 1);
    const current = f.music.at(-1); pending.resolve({ status: 'ended' }); await settle();
    assert.equal(f.started.length, 0); assert.equal(f.music.at(-1), current);
  } finally { f.close(); }
});

test('entering the boss arena during REAPARICION defers the fixed boss theme until that clip finishes', async () => {
  const f = fixture(4);
  try {
    await phrase(f); f.game.requestRespawn(); const before = f.music.length;
    f.game.startBoss(); assert.equal(f.music.length, before);
    assert.equal(f.reserved.at(-1).theme, 'boss');
    f.cues.at(-1).resolve({ status: 'ended' }); await settle();
    assert.equal(f.started.at(-1).theme, 'boss');
  } finally { f.close(); }
});

test('fall deaths keep the soul visible above the screen edge', () => {
  const f = fixture();
  try {
    f.game.player.y = f.game.map.pixelH + 100;
    f.game.killPlayer('fall');
    assert.ok(f.game._deathSoul);
    assert.ok(f.game._deathSoul.y <= f.game.camera.renderY + f.game.H - 24);
  } finally { f.close(); }
});
