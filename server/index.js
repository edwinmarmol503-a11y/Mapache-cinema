import { ApiError, board, nickname, credential, uuid, finishValidation, RULESET,
  LEVEL_COUNT, LEVEL_TTL_MS, CAMPAIGN_TTL_MS } from './validation.js';

const PREFIX = '/api/ranking';
const MAX_BODY_BYTES = 4096;

function randomToken() {
  return [...crypto.getRandomValues(new Uint8Array(32))].map((v) => v.toString(16).padStart(2, '0')).join('');
}
async function hash(value) {
  return [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function headers(request, env) {
  const origin = request.headers.get('Origin');
  const allowed = (env.RANKING_ALLOWED_ORIGINS || '*').split(',').map((s) => s.trim());
  const cors = allowed.includes('*') ? '*' : (origin && allowed.includes(origin) ? origin : null);
  return {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    ...(cors ? { 'Access-Control-Allow-Origin': cors } : {}),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, X-Player-Token',
    'Access-Control-Max-Age': '3600',
    'Vary': 'Origin',
  };
}

async function body(request) {
  const length = Number(request.headers.get('Content-Length') || 0);
  if (length > MAX_BODY_BYTES) throw new ApiError(413, 'body', 'Solicitud demasiado grande.');
  if (!request.headers.get('Content-Type')?.startsWith('application/json')) {
    throw new ApiError(415, 'content_type', 'La solicitud debe ser JSON.');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new ApiError(400, 'json', 'Solicitud vacía.');
  let size = 0;
  const chunks = [];
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > MAX_BODY_BYTES) { await reader.cancel(); throw new ApiError(413, 'body', 'Solicitud demasiado grande.'); }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  let parsed;
  try { parsed = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { throw new ApiError(400, 'json', 'JSON no válido.'); }
  if (!parsed || Array.isArray(parsed) || typeof parsed !== 'object') throw new ApiError(400, 'json', 'Solicitud no válida.');
  return parsed;
}

async function limit(db, key, max, windowMs, now) {
  const bucket = Math.floor(now / windowMs);
  const expires = (bucket + 2) * windowMs;
  const result = await db.prepare(`INSERT INTO rate_limits (key, count, expires_at)
    VALUES (?, 1, ?) ON CONFLICT(key) DO UPDATE SET count = count + 1 RETURNING count`)
    .bind(`${key}:${bucket}`, expires).first();
  if (result.count > max) throw new ApiError(429, 'rate_limit', 'Demasiadas solicitudes. Espera un momento.');
}

async function player(request, db, optional = false) {
  const token = request.headers.get('X-Player-Token');
  if (!token && optional) return null;
  if (!credential(token)) throw new ApiError(401, 'identity', 'Identidad del jugador no válida.');
  const result = await db.prepare('SELECT id, nickname FROM players WHERE token_hash = ?').bind(await hash(token)).first();
  if (!result) throw new ApiError(401, 'identity', 'Identidad del jugador no encontrada.');
  return result;
}

function publicScore(row, rank) {
  return { rank: Number(rank), playerId: row.player_id, nickname: row.nickname,
    elapsedMs: row.elapsed_ms, achievedAt: row.achieved_at, ending: row.ending, deaths: row.deaths };
}

async function leaderboard(db, selection, self, now) {
  const args = [RULESET, selection.difficulty, selection.kind, selection.level];
  const rows = await db.prepare(`SELECT s.*, p.nickname FROM scores s JOIN players p ON p.id = s.player_id
    WHERE s.ruleset = ? AND s.difficulty = ? AND s.kind = ? AND s.level = ?
    ORDER BY s.elapsed_ms, s.achieved_at, s.player_id LIMIT 50`).bind(...args).all();
  let own = null;
  if (self) {
    const row = await db.prepare(`SELECT s.*, p.nickname FROM scores s JOIN players p ON p.id = s.player_id
      WHERE s.ruleset = ? AND s.difficulty = ? AND s.kind = ? AND s.level = ? AND s.player_id = ?`)
      .bind(...args, self.id).first();
    if (row) {
      const count = await db.prepare(`SELECT COUNT(*) AS n FROM scores WHERE ruleset = ? AND difficulty = ? AND kind = ? AND level = ?
        AND (elapsed_ms < ? OR (elapsed_ms = ? AND achieved_at < ?) OR (elapsed_ms = ? AND achieved_at = ? AND player_id < ?))`)
        .bind(...args, row.elapsed_ms, row.elapsed_ms, row.achieved_at, row.elapsed_ms, row.achieved_at, self.id).first();
      own = publicScore(row, count.n + 1);
    }
  }
  return { ok: true, ...selection, ruleset: RULESET, updatedAt: now,
    entries: rows.results.map((row, i) => publicScore(row, i + 1)), player: own };
}

async function route(request, env, ctx, now) {
  const url = new URL(request.url);
  const path = url.pathname.slice(PREFIX.length).replace(/\/$/, '') || '/';
  const db = env.DB;
  if (!db) throw new ApiError(503, 'unavailable', 'El ranking todavía no tiene su base de datos conectada.');
  const sourceIp = request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For')?.split(',')[0].trim() || 'unknown';
  const ipKey = await hash((env.RATE_LIMIT_SALT || 'lumera-ranking') + ':' + sourceIp);
  await limit(db, `ip:${ipKey}`, 240, 60000, now);

  if (path === '/health' && request.method === 'GET') {
    await db.prepare('SELECT id FROM players LIMIT 1').first();
    return { ok: true, ruleset: RULESET, serverTime: now };
  }

  if (path === '/players' && request.method === 'POST') {
    const input = await body(request);
    if (!credential(input.token)) throw new ApiError(400, 'identity', 'Identidad del jugador no válida.');
    const nick = nickname(input.nickname);
    const tokenHash = await hash(input.token);
    const old = await db.prepare('SELECT id, nickname FROM players WHERE token_hash = ?').bind(tokenHash).first();
    if (!old) await limit(db, `new:${ipKey}`, 60, 3600000, now);
    else await limit(db, `alias:${old.id}`, 12, 60000, now);
    const id = old?.id || crypto.randomUUID();
    await db.prepare(`INSERT INTO players (id, token_hash, nickname, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(token_hash) DO UPDATE SET nickname = excluded.nickname, updated_at = excluded.updated_at`)
      .bind(id, tokenHash, nick, now, now).run();
    const registered = await db.prepare('SELECT id, nickname FROM players WHERE token_hash = ?').bind(tokenHash).first();
    return { ok: true, player: { id: registered.id, nickname: registered.nickname }, serverTime: now };
  }

  if (path === '/leaderboard' && request.method === 'GET') {
    const selection = board({ difficulty: url.searchParams.get('difficulty'), kind: url.searchParams.get('kind'), level: url.searchParams.get('level') });
    const self = await player(request, db, true);
    return leaderboard(db, selection, self, now);
  }

  if (path === '/runs' && request.method === 'POST') {
    const self = await player(request, db);
    const input = await body(request);
    const selection = board(input);
    if (input.ruleset && input.ruleset !== RULESET) throw new ApiError(409, 'ruleset', 'Actualiza el juego para participar en el ranking.');
    if (input.assisted === true) throw new ApiError(409, 'assisted', 'Las partidas con ayuda quedan como récords locales.');
    await limit(db, `start:${self.id}`, 150, 3600000, now);
    const campaignId = input.campaignId || null;
    if (campaignId) {
      if (selection.kind !== 'level' || !uuid(campaignId)) throw new ApiError(400, 'campaign', 'Campaña no válida.');
      const campaign = await db.prepare('SELECT * FROM runs WHERE id = ? AND player_id = ?').bind(campaignId, self.id).first();
      if (!campaign || campaign.kind !== 'campaign' || campaign.difficulty !== selection.difficulty
          || campaign.ruleset !== RULESET || campaign.completed_at !== null || campaign.expires_at < now) {
        throw new ApiError(409, 'campaign', 'La campaña en línea ya no está activa.');
      }
      if (selection.level > 0) {
        const previous = await db.prepare('SELECT id FROM runs WHERE campaign_id = ? AND level = ? AND completed_at IS NOT NULL LIMIT 1')
          .bind(campaignId, selection.level - 1).first();
        if (!previous) throw new ApiError(409, 'level_order', 'Completa el nivel anterior antes de continuar la campaña.');
      }
    }
    const id = crypto.randomUUID();
    const token = randomToken();
    const expiresAt = now + (selection.kind === 'campaign' ? CAMPAIGN_TTL_MS : LEVEL_TTL_MS);
    await db.prepare(`INSERT INTO runs (id, token_hash, player_id, difficulty, kind, level, ruleset, campaign_id, started_at, expires_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(id, await hash(token), self.id, selection.difficulty,
        selection.kind, selection.level, RULESET, campaignId, now, expiresAt).run();
    if (ctx?.waitUntil && Math.random() < 0.03) ctx.waitUntil(db.batch([
      db.prepare('DELETE FROM rate_limits WHERE expires_at < ?').bind(now),
      // Keep linked levels as long as the parent campaign is alive.
      db.prepare('DELETE FROM runs WHERE campaign_id IS NOT NULL AND expires_at < ? AND campaign_id IN (SELECT id FROM runs WHERE expires_at < ?)').bind(now, now),
      db.prepare('DELETE FROM runs WHERE campaign_id IS NULL AND expires_at < ? AND id NOT IN (SELECT campaign_id FROM runs WHERE campaign_id IS NOT NULL)').bind(now),
    ]).catch(() => {}));
    return { ok: true, ticket: { id, token, ...selection, campaignId, ruleset: RULESET, startedAt: now, expiresAt } };
  }

  const finishPath = path.match(/^\/runs\/([a-f0-9-]{36})\/finish$/);
  if (finishPath && request.method === 'POST') {
    const self = await player(request, db);
    const input = await body(request);
    if (!credential(input.token)) throw new ApiError(400, 'ticket', 'Ticket de partida no válido.');
    await limit(db, `finish:${self.id}`, 180, 3600000, now);
    const run = await db.prepare('SELECT * FROM runs WHERE id = ? AND player_id = ? AND token_hash = ?')
      .bind(finishPath[1], self.id, await hash(input.token)).first();
    if (!run) throw new ApiError(404, 'ticket', 'Ticket de partida no encontrado.');
    if (run.completed_at !== null) {
      return { ok: true, status: 'submitted', duplicate: true, runId: run.id, elapsedMs: run.elapsed_ms,
        completedAt: run.completed_at, board: { difficulty: run.difficulty, kind: run.kind, level: run.level } };
    }
    const validated = finishValidation(run, input, now);
    if (run.kind === 'campaign') {
      const cleared = await db.prepare('SELECT COUNT(DISTINCT level) AS n FROM runs WHERE campaign_id = ? AND completed_at IS NOT NULL')
        .bind(run.id).first();
      if (cleared.n !== LEVEL_COUNT) throw new ApiError(409, 'campaign_incomplete', 'Faltan niveles de esta campaña en línea.');
    }
    const nonce = crypto.randomUUID();
    // One atomic batch owns the finish once. The nonce prevents a simultaneous
    // replay from changing the score, and retrying after a lost response is safe.
    await db.batch([
      db.prepare(`UPDATE runs SET completed_at = ?, elapsed_ms = ?, active_ms = ?, ending = ?, deaths = ?, completion_nonce = ?
        WHERE id = ? AND completed_at IS NULL`).bind(now, validated.elapsedMs, validated.activeMs, validated.ending, validated.deaths, nonce, run.id),
      db.prepare(`INSERT INTO scores (player_id, difficulty, kind, level, ruleset, elapsed_ms, achieved_at, run_id, ending, deaths)
        SELECT player_id, difficulty, kind, level, ruleset, elapsed_ms, completed_at, id, ending, deaths FROM runs WHERE id = ? AND completion_nonce = ?
        ON CONFLICT(player_id, difficulty, kind, level, ruleset) DO UPDATE SET
          elapsed_ms = excluded.elapsed_ms, achieved_at = excluded.achieved_at, run_id = excluded.run_id,
          ending = excluded.ending, deaths = excluded.deaths WHERE excluded.elapsed_ms < scores.elapsed_ms`).bind(run.id, nonce),
    ]);
    const finished = await db.prepare('SELECT elapsed_ms, completed_at FROM runs WHERE id = ?').bind(run.id).first();
    return { ok: true, status: 'submitted', runId: run.id, elapsedMs: finished.elapsed_ms,
      completedAt: finished.completed_at, board: { difficulty: run.difficulty, kind: run.kind, level: run.level } };
  }
  throw new ApiError(404, 'not_found', 'Ruta no encontrada.');
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname !== PREFIX && !url.pathname.startsWith(PREFIX + '/')) {
      if (env.ASSETS?.fetch) return env.ASSETS.fetch(request);
      return new Response('Not found', { status: 404 });
    }
    const responseHeaders = headers(request, env);
    if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: responseHeaders });
    try {
      const result = await route(request, env, ctx, Date.now());
      return new Response(JSON.stringify(result), { headers: responseHeaders });
    } catch (error) {
      const known = error instanceof ApiError;
      const status = known ? error.status : 503;
      return new Response(JSON.stringify({ ok: false, code: known ? error.code : 'unavailable',
        message: known ? error.message : 'El ranking no responde. Tu partida y tus récords locales siguen disponibles.' }),
        { status, headers: { ...responseHeaders, ...(status === 429 ? { 'Retry-After': '60' } : {}) } });
    }
  },
};
