import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { Save } from '../js/save.js';
import { Input } from '../js/input.js';
import { Dialogue } from '../js/dialogue.js';

function fixture(level = 0) {
  const oldDocument = globalThis.document, oldStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.document = { getElementById: () => null };
  globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
  const music = [], audio = { playMusic: (...args) => music.push(args), sfx() {} };
  const game = new Game({}, { width: 1920, height: 1080 }, { audio, save: { ...Save, data: null }, dialogue: new Dialogue() });
  game.startAt('normal', level, 'RIKO');
  game.state = 'playing'; game._rankingStarting = false;
  Input.reset(); Input.clearFrame();
  return { game, music, close() { Input.reset(); Input.clearFrame(); globalThis.document = oldDocument; globalThis.localStorage = oldStorage; } };
}

test('every action can advance ordinary dialogue without changing music or attacking afterward', () => {
  const f = fixture();
  try {
    f.game.dialogue.start([{ text: 'Un recuerdo de Lumera.' }]);
    const before = f.music.length;
    Input.setVirtualActions('test', ['attack']);
    f.game.update(1 / 60);
    assert.equal(f.game.dialogue.char, 'Un recuerdo de Lumera.'.length);
    assert.equal(f.game.player.attackT, 0);
    assert.equal(f.music.length, before);
    Input.clearFrame();
    f.game.update(1 / 60);
    assert.equal(f.game.dialogue.active, true, 'held attack cannot dismiss the whole dialogue');
    Input.releaseVirtual('test'); Input.clearFrame(); Input.setVirtualActions('test', ['dodge']);
    f.game.update(1 / 60);
    assert.equal(f.game.dialogue.active, false);
    assert.equal(f.music.length, before);
  } finally { f.close(); }
});

test('direction-generated jumps navigate an ending choice without accidentally choosing it', () => {
  const f = fixture();
  try {
    let selected = null;
    f.game.state = 'choice';
    f.game.dialogue.startChoice('¿Qué haces?', [{ label: 'Devolver', value: 'A' }, { label: 'Compartir', value: 'C' }], value => { selected = value; });
    Input.setVirtualActions('test', ['up', 'jump']);
    f.game.update(1 / 60);
    assert.equal(selected, null);
    assert.equal(f.game.dialogue.choiceIndex, 1);
    Input.releaseVirtual('test'); Input.clearFrame(); Input.setVirtualActions('test', ['attack']);
    f.game.update(1 / 60);
    assert.equal(selected, 'C');
  } finally { f.close(); }
});

test('manually restarting a level preserves its song instead of consuming another random choice', () => {
  const f = fixture();
  try {
    const before = f.music.length;
    f.game.restartLevel();
    assert.equal(f.music.length, before);
  } finally { f.close(); }
});

test('an enemy death creates one soul and respawning clears the previous apparition', () => {
  const f = fixture();
  try {
    f.game.killPlayer('enemy');
    const soul = f.game._deathSoul;
    assert.ok(soul);
    assert.equal(f.game.state, 'dying');
    f.game.killPlayer('enemy');
    assert.equal(f.game._deathSoul, soul);
    assert.equal(f.game._rankDeaths, 1);
    f.game.update(1 / 60);
    assert.ok(soul.elapsed > 0);
    f.game.loadLevel(0, true);
    assert.equal(f.game._deathSoul, null);
  } finally { f.close(); }
});

test('boss death retries keep the fixed boss song and boss defeat waits for credits to change it', () => {
  const f = fixture(4);
  try {
    f.game.startBoss();
    assert.equal(f.music.at(-1)[0], 'boss');
    f.game.killPlayer('enemy');
    f.game.loadLevel(4, true);
    assert.deepEqual(f.music.at(-1), ['boss', { restart: true }]);
    f.game.startBoss();
    const count = f.music.length;
    f.game.onBossDefeated();
    assert.equal(f.music.length, count);
    f.game._playEnding('A');
    assert.equal(f.music.length, count, 'story text does not start or reset Lo Que Soy before credits');
  } finally { f.close(); }
});
