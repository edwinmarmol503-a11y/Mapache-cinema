// A saved game may resume an already issued online ticket. It must never mint
// a new ticket for progress played before connecting to the ranking server.
const RULESET = 'lumera-2026-10-v2';
const DIFFICULTIES = ['easy', 'normal', 'hard', 'nightmare'];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const TOKEN = /^[a-f0-9]{64}$/;
const whole = (value, limit = Number.MAX_SAFE_INTEGER) => Number.isSafeInteger(value) && value >= 0 && value <= limit;

export function validSavedTicket(ticket, { difficulty, kind, level, now = Date.now() } = {}) {
  return !!(ticket && UUID.test(ticket.id || '') && TOKEN.test(ticket.token || '')
    && ticket.ruleset === RULESET && ticket.difficulty === difficulty
    && ticket.kind === kind && ticket.level === level
    && Number.isSafeInteger(ticket.startedAt) && Number.isSafeInteger(ticket.expiresAt)
    && ticket.startedAt <= now + 300000 && ticket.expiresAt > now && ticket.expiresAt > ticket.startedAt
    && ticket.expiresAt - ticket.startedAt <= (kind === 'campaign' ? 86400000 : 21600000)
    && (!ticket.campaignId || UUID.test(ticket.campaignId)));
}

function copyTicket(ticket) {
  if (!ticket) return null;
  const { id, token, difficulty, kind, level, campaignId = null, ruleset, startedAt, expiresAt, timing } = ticket;
  return { id, token, difficulty, kind, level, campaignId, ruleset, startedAt, expiresAt,
    assisted: !!ticket.assisted, ...(timing ? { timing } : {}) };
}

export function createRankingSession(value, now = Date.now()) {
  if (!value || !UUID.test(value.playerId || '') || !DIFFICULTIES.includes(value.difficulty)
    || !whole(value.levelIndex, 4) || !whole(value.levelElapsedMs) || !whole(value.campaignActiveMs)
    || value.levelElapsedMs > value.campaignActiveMs || !whole(value.deaths ?? 0, 100000)) return null;
  const selection = { difficulty: value.difficulty, now };
  const levelTicket = validSavedTicket(value.levelTicket, { ...selection, kind: 'level', level: value.levelIndex }) ? value.levelTicket : null;
  let campaignTicket = validSavedTicket(value.campaignTicket, { ...selection, kind: 'campaign', level: -1 }) ? value.campaignTicket : null;
  if (campaignTicket && levelTicket && levelTicket.campaignId !== campaignTicket.id) campaignTicket = null;
  if (!levelTicket && !campaignTicket) return null;
  return {
    version: 1, capturedAt: now, playerId: value.playerId, difficulty: value.difficulty, levelIndex: value.levelIndex,
    levelTicket: copyTicket(levelTicket), campaignTicket: copyTicket(campaignTicket),
    campaignFresh: !!(value.campaignFresh && campaignTicket && levelTicket), levelScored: !!value.levelScored,
    levelElapsedMs: value.levelElapsedMs, campaignActiveMs: value.campaignActiveMs,
    deaths: value.deaths ?? 0, assisted: !!value.assisted,
  };
}

export function restoreRankingSession(value, options = {}) {
  const { playerId, difficulty, levelIndex, now = Date.now(), completed = false } = options;
  if (completed || !value || value.version !== 1 || value.playerId !== playerId || value.difficulty !== difficulty
      || value.levelIndex !== levelIndex || !Number.isSafeInteger(value.capturedAt) || value.capturedAt > now + 300000) return null;
  return createRankingSession(value, now);
}
