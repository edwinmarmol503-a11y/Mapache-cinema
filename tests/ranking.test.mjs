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
  assert.throws(() => finishValidation(run, { assisted: true }, 10000));
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

test('server clock, ticket ownership and idempotence govern persisted scores', async () => {
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
    assert.equal(finish.data.elapsedMs, 12000);
    f.advance(9000);
    const replay = await f.call(`/runs/${ticket.id}/finish`, { token: ticket.token, activeMs: 0 });
    assert.equal(replay.data.elapsedMs, 12000);
    assert.equal(replay.data.duplicate, true);
    const table = await f.call('/leaderboard?difficulty=easy&kind=level&level=0');
    assert.equal(table.data.entries.length, 1);
    assert.equal(table.data.player.rank, 1);
    assert.equal(table.data.player.elapsedMs, 12000);
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
    assert.equal(finish.data.elapsedMs, 60000);
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
    assert.equal((await f.call('/runs', { difficulty: 'nightmare', kind: 'level', level: 0, assisted: true })).data.code, 'assisted');
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
    assert.match(client.getStatus().lastNotice, /incluye la demora/);
    f.advance(5000);
    client = new RankingClient({ apiBase: ORIGIN, storage, now: f.now, fetch, autoEvents: false });
    assert.equal(client.getStatus().pending, 1);
    disconnected = false;
    await client.sync();
    assert.equal(client.getStatus().pending, 0);
    assert.equal(client.getStatus().playerId, originalPlayer);
    let table = await client.getLeaderboard({ difficulty: 'easy', kind: 'level', level: 0 });
    assert.equal(table.entries[0].elapsedMs, 15000);
    assert.equal(table.entries[0].nickname, 'Chalchuapa');
    disconnected = true;
    table = await client.getLeaderboard({ difficulty: 'easy', kind: 'level', level: 0 });
    assert.equal(table.cached, true);
    assert.equal(table.status, 'offline');
    assert.equal(table.entries[0].elapsedMs, 15000);
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
    f.advance(16 * 60000);
    await client.sync();
    assert.equal(client.getStatus().pending, 0);
    assert.match(client.getStatus().lastNotice, /expiró/);
    assert.equal(f.db.sqlite.prepare('SELECT COUNT(*) AS n FROM scores').get().n, 0);
  } finally { f.close(); }
});
