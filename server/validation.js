export const DIFFICULTIES = ['easy', 'normal', 'hard', 'nightmare'];
export const LEVEL_COUNT = 5;
export const RULESET = 'lumera-2026-10-v2';
export const LEVEL_TTL_MS = 6 * 60 * 60 * 1000;
export const CAMPAIGN_TTL_MS = 24 * 60 * 60 * 1000;
export const MIN_LEVEL_MS = 5000;
export const MIN_CAMPAIGN_MS = MIN_LEVEL_MS * LEVEL_COUNT;

export class ApiError extends Error {
  constructor(status, code, message) { super(message); this.status = status; this.code = code; }
}

export function nickname(value) {
  if (typeof value !== 'string') throw new ApiError(400, 'nickname', 'Escribe un apodo.');
  const nick = value.normalize('NFKC').trim().replace(/ +/g, ' ');
  if (!/^[\p{L}\p{N}\p{M} _.-]{2,16}$/u.test(nick)) {
    throw new ApiError(400, 'nickname', 'El apodo debe tener 2–16 letras, números, espacios, puntos o guiones.');
  }
  return nick;
}

export function board(value) {
  if (!value || !DIFFICULTIES.includes(value.difficulty)) {
    throw new ApiError(400, 'difficulty', 'Dificultad no válida.');
  }
  const kind = value.kind;
  if (value.level === null || value.level === undefined || value.level === '') {
    throw new ApiError(400, 'board', 'Selección del nivel no válida.');
  }
  const level = Number(value.level);
  if ((kind !== 'level' && kind !== 'campaign') || !Number.isInteger(level)
      || (kind === 'campaign' ? level !== -1 : level < 0 || level >= LEVEL_COUNT)) {
    throw new ApiError(400, 'board', 'Selecciona un nivel o la campaña completa.');
  }
  return { difficulty: value.difficulty, kind, level };
}

export function credential(value) { return typeof value === 'string' && /^[a-f0-9]{64}$/.test(value); }
export function uuid(value) { return typeof value === 'string' && /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(value); }

export function finishValidation(run, payload, now) {
  if (run.ruleset !== RULESET) throw new ApiError(409, 'ruleset', 'Esta partida pertenece a una versión anterior.');
  if (now > run.expires_at) throw new ApiError(410, 'expired', 'La partida en línea expiró. Tu récord local se conserva.');
  if (payload.assisted === true || run.assisted) throw new ApiError(409, 'assisted', 'Las partidas con ayuda quedan como récords locales.');
  const elapsedMs = now - run.started_at;
  const min = run.kind === 'campaign' ? MIN_CAMPAIGN_MS : MIN_LEVEL_MS;
  if (!Number.isSafeInteger(elapsedMs) || elapsedMs < min) {
    throw new ApiError(400, 'too_fast', 'El tiempo de la partida no es válido.');
  }
  if (payload.activeMs !== undefined && (!Number.isSafeInteger(payload.activeMs)
      || payload.activeMs < 0 || payload.activeMs > elapsedMs + 5000)) {
    throw new ApiError(400, 'active_time', 'El reloj de la partida no es válido.');
  }
  if (payload.ending !== undefined && payload.ending !== null && !['A', 'B', 'C'].includes(payload.ending)) {
    throw new ApiError(400, 'ending', 'Final no válido.');
  }
  if (run.kind === 'campaign' && !['A', 'B', 'C'].includes(payload.ending)) {
    throw new ApiError(400, 'ending', 'Completa la campaña y elige un final.');
  }
  if (payload.deaths !== undefined && (!Number.isSafeInteger(payload.deaths) || payload.deaths < 0 || payload.deaths > 100000)) {
    throw new ApiError(400, 'deaths', 'Contador de intentos no válido.');
  }
  return { elapsedMs, activeMs: payload.activeMs ?? null, ending: payload.ending ?? null, deaths: payload.deaths ?? 0 };
}
