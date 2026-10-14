// Read-only deployment verification: GET leaderboards/health and one OPTIONS
// preflight. Never registers a player, opens a ticket, or submits a score.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { ONLINE_CONFIG } from '../js/config.js';

const option = (key, fallback) => process.argv.find(arg => arg.startsWith(`--${key}=`))?.slice(key.length + 3) || fallback;
const apiBase = option('api-base', ONLINE_CONFIG.apiBase).replace(/\/$/, '').replace(/\/api\/ranking$/, '') + '/api/ranking';
const origin = option('origin', 'https://edwinmarmol503-a11y.github.io');
const destination = path.resolve(option('output', '.release/public-ranking-v6.json'));
const report = { checkedAt: new Date().toISOString(), apiBase, origin, methods: ['GET', 'OPTIONS'], checks: [], failures: [] };
const checked = async (name, run) => {
  try { report.checks.push({ name, ...(await run()), ok: true }); }
  catch (error) { report.failures.push({ name, message: error.message }); }
};
const request = async (pathname, method = 'GET', headers = {}) => {
  assert.ok(['GET', 'OPTIONS'].includes(method), 'Only read-only HTTP methods are allowed.');
  const response = await fetch(apiBase + pathname, { method, headers: { Origin: origin, ...headers },
    credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15000) });
  const cors = response.headers.get('access-control-allow-origin');
  assert.ok(cors === '*' || cors === origin, `CORS does not admit the GitHub Pages origin (${cors}).`);
  assert.ok(response.ok, `Unexpected HTTP ${response.status} at ${pathname}.`);
  if (method === 'OPTIONS') return response;
  assert.match(response.headers.get('cache-control') || '', /no-store/);
  const body = await response.json();
  assert.equal(body.ok, true, body.message);
  assert.equal(body.ruleset, 'lumera-2026-10-v2');
  assert.equal(body.timing, 'active-v1', 'The backend has not been updated to pause-aware timing.');
  return body;
};

await checked('Health: pause-aware time and assisted boards', async () => {
  const health = await request('/health');
  assert.equal(health.features?.assistedBoards, true);
  assert.ok(Number.isSafeInteger(health.serverTime));
  return { timing: health.timing, ruleset: health.ruleset, assistedBoards: true };
});
await checked('CORS preflight for future authenticated submissions', async () => {
  const response = await request('/runs', 'OPTIONS', { 'Access-Control-Request-Method': 'POST',
    'Access-Control-Request-Headers': 'content-type,x-player-token' });
  assert.equal(response.status, 204);
  assert.match(response.headers.get('access-control-allow-methods') || '', /POST/);
  const allowed = (response.headers.get('access-control-allow-headers') || '').toLowerCase();
  assert.ok(allowed.includes('content-type') && allowed.includes('x-player-token'));
  return { status: response.status };
});
for (const difficulty of ['easy', 'normal', 'hard', 'nightmare']) {
  for (const assisted of [false, true]) {
    for (const level of [-1, 4]) {
      const kind = level === -1 ? 'campaign' : 'level';
      const query = new URLSearchParams({ difficulty, kind, level: String(level), assisted: String(assisted) });
      await checked(`${difficulty}/${kind}/${assisted ? 'assisted' : 'standard'}`, async () => {
        const board = await request(`/leaderboard?${query}`);
        assert.equal(board.difficulty, difficulty);
        assert.equal(board.kind, kind);
        assert.equal(board.level, level);
        assert.equal(board.assisted, assisted);
        assert.equal(board.player, null, 'An anonymous read must not reveal a private identity.');
        assert.ok(Array.isArray(board.entries));
        for (let i = 0; i < board.entries.length; i++) {
          const entry = board.entries[i];
          assert.equal(entry.rank, i + 1);
          assert.equal(entry.assisted, assisted);
          assert.ok(Number.isSafeInteger(entry.elapsedMs) && entry.elapsedMs > 0);
          assert.equal(typeof entry.nickname, 'string');
          assert.equal('token' in entry, false);
          if (i) assert.ok(board.entries[i - 1].elapsedMs <= entry.elapsedMs);
        }
        return { entries: board.entries.length, timing: board.timing };
      });
    }
  }
}
report.ok = report.failures.length === 0;
await mkdir(path.dirname(destination), { recursive: true });
await writeFile(destination, JSON.stringify(report, null, 2));
console.log(JSON.stringify({ ok: report.ok, passed: report.checks.length, failed: report.failures, output: destination }, null, 2));
if (!report.ok) process.exitCode = 1;
