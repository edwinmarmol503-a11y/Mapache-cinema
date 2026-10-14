import test from 'node:test';
import assert from 'node:assert/strict';
import Worker from '../server/index.js';
import { board, nickname, RULESET, finishValidation } from '../server/validation.js';
import { RankingClient } from '../js/ranking.js';
import { createTestDatabase } from './ranking-d1.mjs';

const ORIGIN = 'https://ranking.example';
const BASE = ORIGIN + '/api/ranking';
const tokenA = 'a'.repeat(64);
const tokenB = 'b'.repeat(64);

function fixture() {
  const db = createTestDatabase();
  let now = 2000000000000;
  const originalNow = Date.now;
  Date.now = () => now;
  const call = async (path, data, token = tokenA, method = data === undefined ? 'GET' : 'POST') => {
    const response = await Worker.fetch(new Request(BASE + path, {
      method, headers: { 'Origin': ORIGIN, 'CF-Connecting-IP': '198.51.100.1',
        ...(token ? { 'X-Player-Token': token } : {}), ...(data !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(data !== undefined ? { body: JSON.stringify(data) } : {}),
    }), { DB: db }, {});
    return { status: response.status, data: await response.json(), response };
  };
  return { db, call, advance(ms) { now += ms; }, set(ms) { now = ms; }, now: () => now,
    close() { Date.now = originalNow; db.sqlite.close(); } };
}
function memoryStorage() {
  const values = new Map();
  return { getItem: (key) => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), values };
}

test('validation rejects invalid boards, unsafe aliases and impossible active clocks', () => {
  assert.deepEqual(board({ difficulty: 'easy', kind: 'level', level: 0 }), { difficulty: 'easy', kind: 'level', level: 0 });
  for (const value of [{ difficulty: 'easy', kind: 'level' }, { difficulty: 'easy', kind: 'level', level: null },
    { difficulty: 'easy', kind: 'campaign', level: 0 }, { difficulty: 'easy', kind: 'level', level: 5 },
    { difficulty: 'hacked', kind: 'level', level: 0 }]) assert.throws(() => board(value));
  assert.equal(nickname('  José  Riko  '), 'José Riko');
  for (const nick of ['a', '<script>', 'Riko\u200b', 'a'.repeat(17)]) assert.throws(() => nickname(nick));
  const run = { kind: 'level', ruleset: RULESET, started_at: 0, expires_at: 20000, assisted: 0 };
  assert.throws(() => finishValidation(run, { activeMs: 500000 }, 10000));
  assert.throws(() => finishValidation(run, {}, 500));
  assert.throws(() => finishValidation(run, {}, 20001));
  assert.equal(finishValidation(run, { assisted: true, activeMs: 7000 }, 10000).assisted, true);
  assert.throws(() => finishValidation(run, { activeMs: 1 }, 10000));
});

test('unprovisioned API reports unavailable and preflight permits downloaded copies without cookies', async () => {
  const unavailable = await Worker.fetch(new Request(BASE + '/health'), {}, {});
  assert.equal(unavailable.status, 503);
  assert.equal((await unavailable.json()).code, 'unavailable');
  const preflight = await Worker.fetch(new Request(BASE + '/runs', { method: 'OPTIONS', headers: { Origin: 'http://localhost:8080' } }), {}, {});
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('Access-Control-Allow-Origin'), '*');
  assert.equal(preflight.headers.get('Access-Control-Allow-Credentials'), null);
});

test('active time excludes pauses while server bounds, ticket ownership and idempotence protect scores', async () => {
  const f = fixture();
  try {
    const first = await f.call('/players', { nickname: 'RIKO', token: tokenA });
    const second = await f.call('/players', { nickname: 'Vecino', token: tokenB });
    assert.equal(first.status, 200);
    assert.notEqual(first.data.player.id, second.data.player.id);
    const start = await f.call('/runs', { difficulty: 'easy', kind: 'level', level: 0 });
    const ticket = start.data.ticket;
    assert.equal(ticket.startedAt, f.now());
    assert.equal((await f.call(`/runs/${ticket.id}/finish`, { token: ticket.token, activeMs: 1 })).data.code, 'too_fast');
    f.advance(12000);
    assert.equal((await f.call(`/runs/${ticket.id}/finish`, { token: ticket.token, activeMs: 9000 }, tokenB)).status, 404);
    const finish = await f.call(`/runs/${ticket.id}/finish`, { token: ticket.token, activeMs: 9000, time: 1, elapsedMs: 1 });
    assert.equal(finish.data.elapsedMs, 9000);
    f.advance(9000);
    const replay = await f.call(`/runs/${ticket.id}/finish`, { token: ticket.token, activeMs: 0 });
    assert.equal(replay.data.elapsedMs, 9000);
    assert.equal(replay.data.duplicate, true);
    const table = await f.call('/leaderboard?difficulty=easy&kind=level&level=0');
    assert.equal(table.data.entries.length, 1);
    assert.equal(table.data.player.rank, 1);
    assert.equal(table.data.player.elapsedMs, 9000);
    assert.equal('token' in table.data.entries[0], false);
    assert.equal((await f.call('/leaderboard?difficulty=normal&kind=level&level=0')).data.entries.length, 0);
    assert.equal((await f.call('/leaderboard?difficulty=easy&kind=level&level=1')).data.entries.length, 0);
  } finally { f.close(); }
});

test('a player has one best time per board and deterministic ties rank both devices correctly', async () => {
  const f = fixture();
  try {
    await f.call('/players', { nickname: 'RIKO', token: tokenA });
    await f.call('/players', { nickname: 'Chalchuapa', token: tokenB });
    const run = async (token, duration) => {
      const { ticket } = (await f.call('/runs', { difficulty: 'easy', kind: 'level', level: 0 }, token)).data;
      f.advance(duration);
      return f.call(`/runs/${ticket.id}/finish`, { token: ticket.token, activeMs: duration }, token);
    };
    await run(tokenA, 15000);
    const ownFirstDate = (await f.call('/leaderboard?difficulty=easy&kind=level&level=0')).data.player.achievedAt;
    await run(tokenA, 25000);
    let table = (await f.call('/leaderboard?difficulty=easy&kind=level&level=0')).data;
    assert.equal(table.entries.length, 1);
    assert.equal(table.player.elapsedMs, 15000);
    assert.equal(table.player.achievedAt, ownFirstDate);
    await run(tokenB, 10000);
    table = (await f.call('/leaderboard?difficulty=easy&kind=level&level=0')).data;
    assert.equal(table.entries[0].nickname, 'Chalchuapa');
    assert.equal(table.player.rank, 2);
    await run(tokenA, 10000);
    table = (await f.call('/leaderboard?difficulty=easy&kind=level&level=0')).data;
    assert.equal(table.entries[0].nickname, 'Chalchuapa');
    assert.equal(table.player.rank, 2);
    await f.call('/players', { nickname: 'Riko Nuevo', token: tokenA });
    assert.equal((await f.call('/leaderboard?difficulty=easy&kind=level&level=0')).data.player.nickname, 'Riko Nuevo');
  } finally { f.close(); }
});

test('concurrent finishes consume the ticket once and cannot overwrite a first completion', async () => {
  const f = fixture();
  try {
    await f.call('/players', { nickname: 'RIKO', token: tokenA });
    const { ticket } = (await f.call('/runs', { difficulty: 'hard', kind: 'level', level: 2 })).data;
    f.advance(20000);
    const responses = await Promise.all([
      f.call(`/runs/${ticket.id}/finish`, { token: ticket.token, activeMs: 15000, deaths: 1 }),
      f.call(`/runs/${ticket.id}/finish`, { token: ticket.token, activeMs: 15000, deaths: 9 }),
    ]);
    assert.ok(responses.every((response) => response.status === 200));
    assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM scores').get().n, 1);
    assert.equal(f.db.sqlite.prepare('SELECT deaths FROM scores').get().deaths, 1);
  } finally { f.close(); }
});

test('full campaign requires five linked level completions in order and an ending', async () => {
  const f = fixture();
  try {
    await f.call('/players', { nickname: 'RIKO', token: tokenA });
    const campaign = (await f.call('/runs', { difficulty: 'normal', kind: 'campaign', level: -1 })).data.ticket;
    assert.equal((await f.call('/runs', { difficulty: 'normal', kind: 'level', level: 1, campaignId: campaign.id })).data.code, 'level_order');
    f.advance(30000);
    assert.equal((await f.call(`/runs/${campaign.id}/finish`, { token: campaign.token, ending: 'C' })).data.code, 'campaign_incomplete');
    for (let level = 0; level < 5; level++) {
      const ticket = (await f.call('/runs', { difficulty: 'normal', kind: 'level', level, campaignId: campaign.id })).data.ticket;
      assert.ok(ticket);
      f.advance(6000);
      assert.equal((await f.call(`/runs/${ticket.id}/finish`, { token: ticket.token, activeMs: 5000 })).status, 200);
    }
    assert.equal((await f.call(`/runs/${campaign.id}/finish`, { token: campaign.token })).data.code, 'ending');
    const finish = await f.call(`/runs/${campaign.id}/finish`, { token: campaign.token, ending: 'C', activeMs: 25000 });
    assert.equal(finish.data.elapsedMs, 25000);
    const table = (await f.call('/leaderboard?difficulty=normal&kind=campaign&level=-1')).data;
    assert.equal(table.entries.length, 1);
    assert.equal(table.player.ending, 'C');
  } finally { f.close(); }
});

test('rate limits and body bounds protect persistent ranking endpoints', async () => {
  const f = fixture();
  try {
    await f.call('/players', { nickname: 'RIKO', token: tokenA });
    const oversized = await f.call('/runs', { difficulty: 'easy', kind: 'level', level: 0, extra: 'x'.repeat(5000) });
    assert.equal(oversized.status, 413);
    let limited;
    for (let i = 0; i < 151; i++) limited = await f.call('/runs', { difficulty: 'easy', kind: 'level', level: 0 });
    assert.equal(limited.status, 429);
    assert.equal(limited.response.headers.get('Retry-After'), '60');
    assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM runs').get().n, 150);
  } finally { f.close(); }
});

test('offline-start runs are local and never masquerade as global entries', async () => {
  const client = new RankingClient({ apiBase: ORIGIN, storage: memoryStorage(), autoEvents: false,
    fetch: async () => { throw new Error('offline'); } });
  const start = await client.beginRun({ difficulty: 'easy', kind: 'level', level: 0 });
  assert.equal(start.status, 'local');
  assert.equal(start.ticket, null);
  assert.equal(client.getStatus().pending, 0);
  const table = await client.getLeaderboard({ difficulty: 'easy', kind: 'level', level: 0 });
  assert.equal(table.status, 'offline');
  assert.equal(table.cached, false);
  assert.deepEqual(table.entries, []);
});

test('an online ticket can retry a queued finish, survives reload, and caches only server scores', async () => {
  const f = fixture();
  const storage = memoryStorage();
  let disconnected = false;
  const fetch = async (url, options) => {
    if (disconnected) throw new Error('offline');
    return Worker.fetch(new Request(url, options), { DB: f.db }, {});
  };
  try {
    let client = new RankingClient({ apiBase: ORIGIN, storage, now: f.now, fetch, autoEvents: false });
    await client.setNickname('Chalchuapa');
    const originalPlayer = client.getStatus().playerId;
    const { ticket } = await client.beginRun({ difficulty: 'easy', kind: 'level', level: 0 });
    f.advance(10000);
    disconnected = true;
    assert.equal((await client.finishRun(ticket, { activeMs: 9000 })).status, 'queued');
    assert.equal(client.getStatus().pending, 1);
    assert.match(client.getStatus().lastNotice, /sin sumar la espera/);
    f.advance(40 * 60000);
    client = new RankingClient({ apiBase: ORIGIN, storage, now: f.now, fetch, autoEvents: false });
    assert.equal(client.getStatus().pending, 1);
    disconnected = false;
    await client.sync();
    assert.equal(client.getStatus().pending, 0);
    assert.equal(client.getStatus().playerId, originalPlayer);
    let table = await client.getLeaderboard({ difficulty: 'easy', kind: 'level', level: 0 });
    assert.equal(table.entries[0].elapsedMs, 9000);
    assert.equal(table.entries[0].nickname, 'Chalchuapa');
    disconnected = true;
    table = await client.getLeaderboard({ difficulty: 'easy', kind: 'level', level: 0 });
    assert.equal(table.cached, true);
    assert.equal(table.status, 'offline');
    assert.equal(table.entries[0].elapsedMs, 9000);
  } finally { f.close(); }
});

test('expired queue entries and rejected results remain local, not pending forever', async () => {
  const f = fixture();
  let disconnected = false;
  const fetch = async (url, options) => {
    if (disconnected) throw new Error('offline');
    return Worker.fetch(new Request(url, options), { DB: f.db }, {});
  };
  try {
    const client = new RankingClient({ apiBase: ORIGIN, storage: memoryStorage(), now: f.now, fetch, autoEvents: false });
    const { ticket } = await client.beginRun({ difficulty: 'easy', kind: 'level', level: 0 });
    assert.equal((await client.finishRun(ticket, {})).status, 'rejected');
    assert.equal(client.getStatus().pending, 0);
    f.advance(9000);
    disconnected = true;
    await client.finishRun(ticket, {});
    assert.equal(client.getStatus().pending, 1);
    f.advance(7 * 60 * 60000);
    await client.sync();
    assert.equal(client.getStatus().pending, 0);
    assert.match(client.getStatus().lastNotice, /expiró/);
    assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM scores').get().n, 0);
  } finally { f.close(); }
});

test('nightmare records travel between independent devices with assistance kept on its own board', async () => {
  const f = fixture();
  const fetch = (url, options) => Worker.fetch(new Request(url, options), { DB: f.db }, {});
  const deviceA = new RankingClient({ apiBase: ORIGIN, storage: memoryStorage(), now: f.now, fetch, autoEvents: false });
  const deviceB = new RankingClient({ apiBase: ORIGIN, storage: memoryStorage(), now: f.now, fetch, autoEvents: false });
  const selection = { difficulty: 'nightmare', kind: 'level', level: 4 };
  try {
    await deviceA.setNickname('Noobmaster69');
    await deviceB.setNickname('Vecino');
    const standard = await deviceA.beginRun(selection);
    f.advance(20000);
    assert.equal((await deviceA.finishRun(standard.ticket, { activeMs: 16000 })).ok, true);
    const aided = await deviceA.beginRun({ ...selection, assisted: true });
    assert.ok(aided.ticket);
    f.advance(30000);
    assert.equal((await deviceA.finishRun(aided.ticket, { activeMs: 11000, assisted: true })).ok, true);
    const standardBoard = await deviceB.getLeaderboard(selection);
    const aidedBoard = await deviceB.getLeaderboard({ ...selection, assisted: true });
    assert.equal(standardBoard.entries.length, 1);
    assert.equal(standardBoard.entries[0].elapsedMs, 16000);
    assert.equal(standardBoard.entries[0].assisted, false);
    assert.equal(aidedBoard.entries.length, 1);
    assert.equal(aidedBoard.entries[0].elapsedMs, 11000);
    assert.equal(aidedBoard.entries[0].assisted, true);
    assert.equal(aidedBoard.entries[0].nickname, 'Noobmaster69');
    assert.equal(standardBoard.entries[0].playerId, aidedBoard.entries[0].playerId);
    assert.notEqual(deviceA.getStatus().playerId, deviceB.getStatus().playerId);
  } finally { f.close(); }
});

test('mercy activated during a run cannot leak into the standard world leaderboard', async () => {
  const f = fixture();
  try {
    await f.call('/players', { nickname: 'Riko', token: tokenA });
    const { ticket } = (await f.call('/runs', { difficulty: 'nightmare', kind: 'level', level: 2 })).data;
    f.advance(60000);
    const result = await f.call(`/runs/${ticket.id}/finish`, { token: ticket.token, activeMs: 22000, assisted: true });
    assert.equal(result.data.board.assisted, true);
    assert.equal((await f.call('/leaderboard?difficulty=nightmare&kind=level&level=2')).data.entries.length, 0);
    const aided = (await f.call('/leaderboard?difficulty=nightmare&kind=level&level=2&assisted=true')).data;
    assert.equal(aided.entries[0].elapsedMs, 22000);
    assert.equal(aided.entries[0].assisted, true);
  } finally { f.close(); }
});

test('public ranking survives invalid or stale guest identities', async () => {
  const f = fixture();
  try {
    for (const token of [null, 'old-invalid-token', 'c'.repeat(64)]) {
      const result = await f.call('/leaderboard?difficulty=nightmare&kind=campaign&level=-1', undefined, token);
      assert.equal(result.status, 200);
      assert.equal(result.data.player, null);
    }
    assert.equal((await f.call('/runs', { difficulty: 'easy', kind: 'level', level: 0 }, 'bad')).status, 401);
  } finally { f.close(); }
});

test('offline level completion may upload later without breaking the next linked level', async () => {
  const f = fixture();
  try {
    await f.call('/players', { nickname: 'RIKO', token: tokenA });
    const campaign = (await f.call('/runs', { difficulty: 'normal', kind: 'campaign', level: -1 })).data.ticket;
    const levels = [];
    for (let level = 0; level < 5; level++) {
      const ticket = (await f.call('/runs', { difficulty: 'normal', kind: 'level', level, campaignId: campaign.id })).data.ticket;
      assert.ok(ticket);
      levels.push(ticket);
      f.advance(10000);
    }
    const campaignPayload = { token: campaign.token, ending: 'A', activeMs: 35000 };
    assert.equal((await f.call(`/runs/${campaign.id}/finish`, campaignPayload)).data.code, 'campaign_incomplete');
    for (let i = 0; i < levels.length; i++) {
      const ticket = levels[i];
      assert.equal((await f.call(`/runs/${ticket.id}/finish`, { token: ticket.token, activeMs: 7000, assisted: i === 3 })).status, 200);
    }
    const result = await f.call(`/runs/${campaign.id}/finish`, campaignPayload);
    assert.equal(result.status, 200);
    assert.equal(result.data.elapsedMs, 35000);
    assert.equal(result.data.assisted, true);
    assert.equal((await f.call('/leaderboard?difficulty=normal&kind=campaign&level=-1')).data.entries.length, 0);
    assert.equal((await f.call('/leaderboard?difficulty=normal&kind=campaign&level=-1&assisted=true')).data.entries[0].elapsedMs, 35000);
  } finally { f.close(); }
});

test('campaign active duration cannot undercut its five verified levels', async () => {
  const f = fixture();
  try {
    await f.call('/players', { nickname: 'RIKO', token: tokenA });
    const campaign = (await f.call('/runs', { difficulty: 'hard', kind: 'campaign', level: -1 })).data.ticket;
    for (let level = 0; level < 5; level++) {
      const ticket = (await f.call('/runs', { difficulty: 'hard', kind: 'level', level, campaignId: campaign.id })).data.ticket;
      f.advance(10000);
      await f.call(`/runs/${ticket.id}/finish`, { token: ticket.token, activeMs: 9000 });
    }
    assert.equal((await f.call(`/runs/${campaign.id}/finish`, { token: campaign.token, ending: 'B', activeMs: 25000 })).data.code, 'active_time');
    assert.equal((await f.call(`/runs/${campaign.id}/finish`, { token: campaign.token, ending: 'B', activeMs: 45000 })).status, 200);
  } finally { f.close(); }
});

test('offline caches keep assisted and standard tables separate and never fake unsupported help boards', async () => {
  const storage = memoryStorage();
  let offline = false;
  const selection = { difficulty: 'nightmare', kind: 'campaign', level: -1 };
  const client = new RankingClient({ apiBase: ORIGIN, storage, autoEvents: false,
    fetch: async url => {
      if (offline) throw new Error('offline');
      return Response.json({ ok: true, ...selection, assisted: new URL(url).searchParams.get('assisted') === 'true',
        entries: [{ nickname: 'Jugador', elapsedMs: new URL(url).searchParams.get('assisted') === 'true' ? 50000 : 90000 }] });
    } });
  await client.getLeaderboard(selection);
  await client.getLeaderboard({ ...selection, assisted: true });
  offline = true;
  assert.equal((await client.getLeaderboard(selection)).entries[0].elapsedMs, 90000);
  assert.equal((await client.getLeaderboard({ ...selection, assisted: true })).entries[0].elapsedMs, 50000);
  const oldBackend = new RankingClient({ apiBase: ORIGIN, storage: memoryStorage(), autoEvents: false,
    fetch: async () => Response.json({ ok: true, entries: [{ nickname: 'Estándar', elapsedMs: 12000 }] }) });
  const oldBoard = await oldBackend.getLeaderboard({ ...selection, assisted: true });
  assert.equal(oldBoard.ok, false);
  assert.equal(oldBoard.entries.length, 0);
});

test('queued results retry automatically when connectivity returns without requiring a menu refresh', async () => {
  const f = fixture();
  const oldWindow = globalThis.window;
  globalThis.window = { addEventListener() {} };
  let disconnected = false;
  let retry;
  try {
    const client = new RankingClient({ apiBase: ORIGIN, storage: memoryStorage(), now: f.now,
      setRetryTimeout(callback) { retry = callback; return 1; },
      fetch: async (url, options) => {
        if (disconnected) throw new Error('offline');
        return Worker.fetch(new Request(url, options), { DB: f.db }, {});
      } });
    await client.setNickname('Regreso');
    const { ticket } = await client.beginRun({ difficulty: 'hard', kind: 'level', level: 1 });
    f.advance(18000);
    disconnected = true;
    await client.finishRun(ticket, { activeMs: 12000 });
    assert.equal(client.getStatus().pending, 1);
    assert.equal(typeof retry, 'function');
    disconnected = false;
    f.advance(60000);
    await retry();
    assert.equal(client.getStatus().pending, 0);
    const row = f.db.sqlite.prepare('SELECT elapsed_ms FROM scores').get();
    assert.equal(row.elapsed_ms, 12000);
  } finally { globalThis.window = oldWindow; f.close(); }
});

test('a fresh level can classify independently after an earlier offline stage broke campaign verification', async () => {
  const f = fixture();
  const client = new RankingClient({ apiBase: ORIGIN, storage: memoryStorage(), now: f.now, autoEvents: false,
    fetch: (url, options) => Worker.fetch(new Request(url, options), { DB: f.db }, {}) });
  try {
    const campaign = await client.beginRun({ difficulty: 'nightmare', kind: 'campaign', level: -1 });
    const nextLevel = await client.beginRun({ difficulty: 'nightmare', kind: 'level', level: 1, campaignId: campaign.ticket.id });
    assert.equal(nextLevel.ok, true);
    assert.equal(nextLevel.campaignLost, true);
    assert.equal(nextLevel.ticket.campaignId, null);
    f.advance(12000);
    assert.equal((await client.finishRun(nextLevel.ticket, { activeMs: 10000 })).ok, true);
    const table = await client.getLeaderboard({ difficulty: 'nightmare', kind: 'level', level: 1 });
    assert.equal(table.entries.length, 1);
    assert.equal((await client.finishRun(campaign.ticket, { activeMs: 30000, ending: 'B' })).ok, false);
  } finally { f.close(); }
});

test('closing during the first finish request retains the result for another device after reload', async () => {
  const f = fixture();
  const storage = memoryStorage();
  const directFetch = (url, options) => Worker.fetch(new Request(url, options), { DB: f.db }, {});
  let release;
  const responseGate = new Promise(resolve => { release = resolve; });
  let pending;
  try {
    const first = new RankingClient({ apiBase: ORIGIN, storage, now: f.now, autoEvents: false,
      fetch: async (url, options) => {
        if (url.endsWith('/finish')) await responseGate;
        return directFetch(url, options);
      } });
    await first.setNickname('Noobmaster69');
    const selection = { difficulty: 'nightmare', kind: 'level', level: 4 };
    const { ticket } = await first.beginRun(selection);
    f.advance(17000);
    pending = first.finishRun(ticket, { activeMs: 12000, deaths: 1 });
    const persisted = JSON.parse(storage.getItem('mapache_ranking_pending_v2'));
    assert.equal(persisted.length, 1, 'The request must be durable before its response or error arrives.');
    assert.equal(persisted[0].detail.activeMs, 12000);
    assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM scores').get().n, 0);
    // A fresh page loads the same persistent browser storage. The original
    // page is still waiting; the new page must independently recover the run.
    const reloaded = new RankingClient({ apiBase: ORIGIN, storage, now: f.now, fetch: directFetch, autoEvents: false });
    await reloaded.init();
    assert.equal(reloaded.getStatus().pending, 0);
    const otherDevice = new RankingClient({ apiBase: ORIGIN, storage: memoryStorage(), now: f.now, fetch: directFetch, autoEvents: false });
    const board = await otherDevice.getLeaderboard(selection);
    assert.equal(board.entries.length, 1);
    assert.equal(board.entries[0].nickname, 'Noobmaster69');
    assert.equal(board.entries[0].elapsedMs, 12000);
    assert.notEqual(reloaded.getStatus().playerId, otherDevice.getStatus().playerId);
    release();
    assert.equal((await pending).duplicate, true);
    assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM scores').get().n, 1);
  } finally { release(); if (pending) await pending; f.close(); }
});

test('campaign and last level survive closing before the last level response', async () => {
  const f = fixture();
  const storage = memoryStorage();
  const directFetch = (url, options) => Worker.fetch(new Request(url, options), { DB: f.db }, {});
  let blockFinish = false;
  let release;
  const responseGate = new Promise(resolve => { release = resolve; });
  let lastFinish;
  let campaignFinish;
  try {
    const client = new RankingClient({ apiBase: ORIGIN, storage, now: f.now, autoEvents: false,
      fetch: async (url, options) => {
        if (blockFinish && url.endsWith('/finish')) await responseGate;
        return directFetch(url, options);
      } });
    await client.setNickname('Lumera');
    const selection = { difficulty: 'nightmare', kind: 'campaign', level: -1 };
    const campaign = await client.beginRun(selection);
    for (let level = 0; level < 5; level++) {
      const { ticket } = await client.beginRun({ ...selection, kind: 'level', level, campaignId: campaign.ticket.id });
      f.advance(8000);
      if (level === 4) {
        blockFinish = true;
        lastFinish = client.finishRun(ticket, { activeMs: 7000 });
      } else assert.equal((await client.finishRun(ticket, { activeMs: 7000 })).ok, true);
    }
    campaignFinish = client.finishRun(campaign.ticket, { activeMs: 35000, ending: 'B' }, { after: lastFinish });
    const pending = JSON.parse(storage.getItem('mapache_ranking_pending_v2'));
    assert.equal(pending.length, 2);
    assert.equal(pending[1].ticket.kind, 'campaign');
    assert.equal(pending[1].detail.ending, 'B');
    const reloaded = new RankingClient({ apiBase: ORIGIN, storage, now: f.now, fetch: directFetch, autoEvents: false });
    await reloaded.init();
    assert.equal(reloaded.getStatus().pending, 0);
    const otherDevice = new RankingClient({ apiBase: ORIGIN, storage: memoryStorage(), now: f.now, fetch: directFetch, autoEvents: false });
    const table = await otherDevice.getLeaderboard(selection);
    assert.equal(table.entries.length, 1);
    assert.equal(table.entries[0].nickname, 'Lumera');
    assert.equal(table.entries[0].elapsedMs, 35000);
    assert.equal(table.entries[0].ending, 'B');
    assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) n FROM scores').get().n, 6);
    release();
    assert.equal((await campaignFinish).duplicate, true);
  } finally { release(); await Promise.all([lastFinish, campaignFinish]); f.close(); }
});

test('retrying a pending finish preserves the first captured duration and ending', async () => {
  const f = fixture();
  let disconnected = false;
  const client = new RankingClient({ apiBase: ORIGIN, storage: memoryStorage(), now: f.now, autoEvents: false,
    fetch: (url, options) => {
      if (disconnected) throw new Error('offline');
      return Worker.fetch(new Request(url, options), { DB: f.db }, {});
    } });
  try {
    const selection = { difficulty: 'hard', kind: 'level', level: 4 };
    const { ticket } = await client.beginRun(selection);
    f.advance(25000);
    disconnected = true;
    assert.equal((await client.finishRun(ticket, { activeMs: 16000, ending: 'B' })).status, 'queued');
    assert.equal((await client.finishRun(ticket, { activeMs: 21000, ending: 'C' })).status, 'queued');
    disconnected = false;
    await client.sync();
    const table = await client.getLeaderboard(selection);
    assert.equal(table.entries[0].elapsedMs, 16000);
    assert.equal(table.entries[0].ending, 'B');
    assert.equal(client.getStatus().lastNotice, '');
  } finally { f.close(); }
});
