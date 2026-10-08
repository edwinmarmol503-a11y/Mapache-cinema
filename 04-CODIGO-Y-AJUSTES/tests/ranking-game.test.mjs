import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../js/game.js';
import { Save } from '../js/save.js';
import { NIGHTMARE_MERCY_DEATHS } from '../js/difficulty.js';

function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}
async function settle() { for (let i = 0; i < 12; i++) await Promise.resolve(); }

function fixture({ delayedStarts = false, delayedFinishes = false } = {}) {
  const oldDocument = globalThis.document;
  const oldStorage = globalThis.localStorage;
  const values = new Map();
  globalThis.document = { getElementById: () => null };
  globalThis.localStorage = { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: (key) => values.delete(key) };
  const starts = [];
  const finishes = [];
  const ranking = {
    setNickname() {},
    beginRun(selection) {
      const wait = deferred();
      const item = { selection: { ...selection }, wait, ticket: { id: `ticket-${starts.length}`, token: 'secret' } };
      starts.push(item);
      if (!delayedStarts) wait.resolve({ ok: true, ticket: item.ticket });
      return wait.promise;
    },
    finishRun(ticket, detail) {
      const wait = deferred();
      finishes.push({ ticket: { ...ticket }, detail: { ...detail }, wait });
      if (!delayedFinishes) wait.resolve({ ok: true, status: 'submitted' });
      return wait.promise;
    },
  };
  const save = { ...Save, data: null };
  const dialogue = { active: false, start() {}, startChoice() {} };
  const game = new Game({}, { width: 480, height: 270 }, { save, ranking, dialogue,
    audio: { playMusic() {}, stopMusic() {}, sfx() {} } });
  return { game, save, ranking, starts, finishes,
    close() { globalThis.document = oldDocument; globalThis.localStorage = oldStorage; } };
}

test('late start tickets cannot reactivate a suspended session or replace a newer level ticket', async () => {
  const f = fixture({ delayedStarts: true });
  try {
    f.game.startAt('easy', 1, 'RIKO');
    await settle();
    assert.equal(f.starts.length, 1);
    f.game.suspendRun();
    f.starts[0].wait.resolve({ ok: true, ticket: f.starts[0].ticket });
    await settle();
    assert.equal(f.game._levelTicket, null);
    assert.equal(f.game._rankingStarting, false);
    f.game.startAt('hard', 2, 'RIKO');
    await settle();
    f.game.restartLevel();
    await settle();
    assert.equal(f.starts.length, 3);
    f.starts[1].wait.resolve({ ok: true, ticket: f.starts[1].ticket });
    await settle();
    assert.equal(f.game._levelTicket, null);
    assert.equal(f.game._rankingStarting, true);
    f.starts[2].wait.resolve({ ok: true, ticket: f.starts[2].ticket });
    await settle();
    assert.equal(f.game._levelTicket.id, 'ticket-2');
    assert.equal(f.game._rankingStarting, false);
  } finally { f.close(); }
});

test('continued checkpoint sessions stay local when moving to the next level or restarting', async () => {
  const f = fixture();
  try {
    f.save.newGame('easy', 0, 'RIKO');
    f.save.update({ checkpoint: { x: 150, y: 80 }, playtime: 50, collected: ['memory@5,5'] });
    f.game.continueGame();
    await settle();
    assert.equal(f.starts.length, 0);
    f.game.nextLevel();
    f.game.transition.cb();
    await settle();
    assert.equal(f.game.levelIndex, 1);
    assert.equal(f.starts.length, 0);
    f.game.restartLevel();
    await settle();
    assert.equal(f.starts.length, 0);
  } finally { f.close(); }
});

test('a manual restart restores entry inventory and progression while preserving campaign active time', async () => {
  const f = fixture();
  try {
    f.game.startAt('easy', 0, 'RIKO');
    await settle();
    f.save.update({ playtime: 30, items: { llave: 5, bombilla: 2 }, memories: 8,
      collected: ['memory@5,5'], levelProgress: { 'open:gate': true }, checkpoint: { x: 150, y: 80 } });
    f.game.restartLevel();
    await settle();
    assert.equal(f.save.data.playtime, 30);
    assert.deepEqual(f.save.data.items, {});
    assert.equal(f.save.data.memories, 0);
    assert.deepEqual(f.save.data.collected, []);
    assert.deepEqual(f.save.data.levelProgress, {});
    assert.equal(f.save.data.checkpoint, null);
    assert.equal(f.game._levelActiveStart, 30);
  } finally { f.close(); }
});

test('restarting a continued different level never restores the previous session snapshot', async () => {
  const f = fixture();
  try {
    f.game.startAt('normal', 0, 'OLD');
    await settle();
    f.game.suspendRun();
    f.save.newGame('hard', 2, 'NEW');
    f.save.update({ checkpoint: { x: 180, y: 80 }, playtime: 90, items: { lata: 1 } });
    f.game.continueGame();
    await settle();
    f.game.restartLevel();
    await settle();
    assert.equal(f.save.data.level, 2);
    assert.equal(f.game.levelIndex, 2);
    assert.equal(f.save.data.difficulty, 'hard');
    assert.equal(f.save.data.nick, 'NEW');
    assert.equal(f.save.data.playtime, 90);
  } finally { f.close(); }
});

test('a queued old campaign finish captures its original statistics before a new game starts', async () => {
  const f = fixture({ delayedFinishes: true });
  try {
    f.game.startAt('normal', 0, 'RIKO');
    await settle();
    const originalCampaign = f.game._campaignTicket;
    f.save.update({ playtime: 82.25 });
    f.game._rankDeaths = 3;
    f.game.onBossDefeated();
    await settle();
    f.game._playEnding('C');
    f.game.startAt('hard', 2, 'NEXT');
    await settle();
    f.finishes[0].wait.resolve({ ok: true, status: 'submitted' });
    await settle();
    const campaignFinish = f.finishes.find((item) => item.ticket.id === originalCampaign.id);
    assert.ok(campaignFinish);
    assert.equal(campaignFinish.detail.activeMs, 82250);
    assert.equal(campaignFinish.detail.deaths, 3);
    assert.equal(campaignFinish.detail.ending, 'C');
    assert.equal(campaignFinish.detail.assisted, false);
    campaignFinish.wait.resolve({ ok: true, status: 'submitted' });
  } finally { f.close(); }
});

test('mercy difficulty is marked as assisted immediately when the respawn loads', async () => {
  const f = fixture();
  try {
    f.game.startAt('nightmare', 2, 'RIKO');
    await settle();
    const meta = f.save.loadMeta(); meta.nightmareDeaths = NIGHTMARE_MERCY_DEATHS; f.save.saveMeta(meta);
    f.game.loadLevel(2, true);
    assert.equal(f.game.diff.enemySpeed, 1.4);
    assert.equal(f.game._rankAssisted, true);
  } finally { f.close(); }
});
