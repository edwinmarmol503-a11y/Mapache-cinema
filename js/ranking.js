import { ONLINE_CONFIG } from './config.js';

const ID_KEY = 'mapache_ranking_identity_v2';
const QUEUE_KEY = 'mapache_ranking_pending_v2';
const CACHE_KEY = 'mapache_ranking_cache_v2';
const RULESET = 'lumera-2026-10-v2';
const QUEUE_TTL_MS = 15 * 60 * 1000;
const DIFFS = ['easy', 'normal', 'hard', 'nightmare'];

function safeRead(storage, key, fallback) {
  try { return JSON.parse(storage?.getItem(key)) ?? fallback; } catch { return fallback; }
}
function cleanNickname(value) {
  const result = String(value || 'RIKO').normalize('NFKC').trim().replace(/ +/g, ' ').replace(/[^\p{L}\p{N}\p{M} _.-]/gu, '').slice(0, 16);
  return [...result].length >= 2 ? result : 'RIKO';
}
function validBoard(selection) {
  return selection && DIFFS.includes(selection.difficulty) && (selection.kind === 'level'
    ? Number.isInteger(selection.level) && selection.level >= 0 && selection.level < 5
    : selection.kind === 'campaign' && selection.level === -1);
}
function boardKey(selection) { return `${selection.difficulty}:${selection.kind}:${selection.level}`; }
function localResult(reason) { return { ok: false, status: 'local', reason, message: reason, ticket: null }; }

class RequestError extends Error {
  constructor(message, status = 0, code = 'network') { super(message); this.status = status; this.code = code; }
}

export class RankingClient {
  constructor(options = {}) {
    this.fetcher = options.fetch || globalThis.fetch?.bind(globalThis);
    this.storage = options.storage || (() => { try { return globalThis.localStorage; } catch { return null; } })();
    this.clock = options.now || Date.now;
    this.crypto = options.crypto || globalThis.crypto;
    this.timeoutMs = options.requestTimeoutMs ?? ONLINE_CONFIG.requestTimeoutMs;
    this.listeners = new Set();
    this.identity = safeRead(this.storage, ID_KEY, null);
    if (!this.identity || !/^[a-f0-9]{64}$/.test(this.identity.token || '')) this.identity = null;
    this.nickname = cleanNickname(this.identity?.nickname || options.nickname || 'RIKO');
    this.queue = safeRead(this.storage, QUEUE_KEY, []);
    if (!Array.isArray(this.queue)) this.queue = [];
    this.cache = safeRead(this.storage, CACHE_KEY, {});
    if (!this.cache || typeof this.cache !== 'object' || Array.isArray(this.cache)) this.cache = {};
    this._player = null;
    this._playerPromise = null;
    this._syncPromise = null;
    this.online = false;
    this.lastNotice = '';
    this.base = '';
    const override = globalThis.MC_CONFIG?.rankingApiBase;
    const apiBase = options.apiBase ?? override ?? ONLINE_CONFIG.apiBase;
    const location = options.location || globalThis.location;
    const candidate = apiBase || (ONLINE_CONFIG.sameOrigin && location && !['localhost', '127.0.0.1', '[::1]'].includes(location.hostname)
      && location.protocol === 'https:' ? location.origin : '');
    if (candidate) {
      try {
        const parsed = new URL(candidate);
        if (parsed.protocol === 'https:' || (parsed.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(parsed.hostname))) {
          this.base = parsed.href.replace(/\/$/, '').replace(/\/api\/ranking$/, '') + '/api/ranking';
        }
      } catch {}
    }
    this.state = this.base ? 'checking' : 'disabled';
    this._pruneQueue();
    if (options.autoEvents !== false && typeof window !== 'undefined') {
      window.addEventListener('online', () => { this.sync(); });
      window.addEventListener('offline', () => { this._setState('offline'); });
    }
  }

  _persist(key, value) {
    try { this.storage?.setItem(key, JSON.stringify(value)); return !!this.storage; } catch { return false; }
  }
  _emit(event, result) {
    const status = { ...this.getStatus(), event, result };
    for (const callback of this.listeners) { try { callback(status); } catch {} }
  }
  _setState(state) { this.state = state; this.online = state === 'ready'; this._emit('status'); }
  getStatus() {
    return { configured: !!this.base, online: this.online, state: this.state,
      playerId: this._player?.id || this.identity?.playerId || null, nickname: this.nickname,
      pending: this.queue.length, lastNotice: this.lastNotice };
  }
  subscribe(callback) {
    this.listeners.add(callback);
    callback(this.getStatus());
    return () => this.listeners.delete(callback);
  }

  async _request(path, method = 'GET', data, auth = true) {
    if (!this.base || !this.fetcher) throw new RequestError('El ranking en línea todavía no está configurado.', 0, 'disabled');
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);
    try {
      const response = await this.fetcher(this.base + path, {
        method, signal: controller.signal, cache: 'no-store', credentials: 'omit',
        headers: { ...(data ? { 'Content-Type': 'application/json' } : {}),
          ...(auth && this.identity ? { 'X-Player-Token': this.identity.token } : {}) },
        ...(data ? { body: JSON.stringify(data) } : {}),
      });
      let result;
      try { result = await response.json(); }
      catch { throw new RequestError('El servidor de ranking no está disponible.', response.status >= 500 ? response.status : 503); }
      if (!response.ok || result.ok !== true) {
        throw new RequestError(result.message || 'No se pudo contactar el ranking.', response.status, result.code);
      }
      this._setState('ready');
      return result;
    } catch (error) {
      if (error instanceof RequestError) {
        if (error.status === 0 || error.status >= 500) this._setState(this.base ? 'offline' : 'disabled');
        throw error;
      }
      this._setState('offline');
      throw new RequestError('Sin conexión al ranking. Tu partida se guarda en este dispositivo.');
    } finally { clearTimeout(timer); }
  }

  async _ensurePlayer(force = false) {
    if (this._playerPromise) await this._playerPromise;
    if (this._player && !force) return this._player;
    if (!this.identity) {
      if (!this.crypto?.getRandomValues) throw new RequestError('Este navegador no puede crear una identidad segura.');
      const token = [...this.crypto.getRandomValues(new Uint8Array(32))].map((v) => v.toString(16).padStart(2, '0')).join('');
      this.identity = { token, nickname: this.nickname, playerId: null };
      if (!this._persist(ID_KEY, this.identity)) this.lastNotice = 'La identidad solo dura esta sesión: permite el almacenamiento del navegador para conservarla.';
    }
    this._playerPromise = (async () => {
      const result = await this._request('/players', 'POST', { token: this.identity.token, nickname: this.nickname }, false);
      this._player = result.player;
      Object.assign(this.identity, { nickname: result.player.nickname, playerId: result.player.id });
      this._persist(ID_KEY, this.identity);
      this._emit('identity', result.player);
      return result.player;
    })();
    try { return await this._playerPromise; }
    finally { this._playerPromise = null; }
  }

  async setNickname(value) {
    this.nickname = cleanNickname(value);
    if (this.identity) { this.identity.nickname = this.nickname; this._persist(ID_KEY, this.identity); }
    this._emit('nickname');
    if (!this.base) return localResult('El apodo se guardó en este dispositivo.');
    try { return { ok: true, player: await this._ensurePlayer(true) }; }
    catch (error) { return { ok: false, reason: error.message, code: error.code }; }
  }

  async init() {
    if (!this.base) return this.getStatus();
    try { await this._request('/health', 'GET', undefined, false); await this._ensurePlayer(); await this.sync(); }
    catch (error) { this.lastNotice = error.message; this._emit('status'); }
    return this.getStatus();
  }

  async beginRun(selection) {
    if (!validBoard(selection)) return localResult('La selección del ranking no es válida.');
    if (selection.assisted) return localResult('Partida con ayuda: cuenta como récord local.');
    if (!this.base) return localResult('El ranking en línea todavía no está configurado.');
    try {
      await this._ensurePlayer();
      return await this._request('/runs', 'POST', { ...selection, ruleset: RULESET });
    } catch (error) {
      this.lastNotice = error.message;
      this._emit('run-local', { reason: error.message });
      return localResult(error.message);
    }
  }

  _pruneQueue() {
    const before = this.queue.length;
    const now = this.clock();
    this.queue = this.queue.filter((entry) => entry && entry.ticket?.id && entry.ticket?.token
      && entry.expiresAt > now && entry.ticket.expiresAt > now).slice(-15);
    if (before !== this.queue.length) {
      this.lastNotice = 'Un envío pendiente expiró. Tu récord local se conserva.';
      this._persist(QUEUE_KEY, this.queue);
    }
  }

  async finishRun(ticket, detail = {}) {
    if (!ticket?.id || !ticket?.token) return localResult('Partida local: se necesita conexión al empezar para entrar al ranking global.');
    if (detail.assisted) return localResult('Partida con ayuda: cuenta como récord local.');
    const now = this.clock();
    if (ticket.expiresAt <= now) return { ok: false, status: 'rejected', reason: 'El ticket en línea expiró; tu récord local se conserva.' };
    const payload = { ...detail, token: ticket.token };
    try {
      const result = await this._request(`/runs/${encodeURIComponent(ticket.id)}/finish`, 'POST', payload);
      this.queue = this.queue.filter((entry) => entry.ticket.id !== ticket.id);
      this._persist(QUEUE_KEY, this.queue);
      this._emit('submitted', result);
      return result;
    } catch (error) {
      if (error.status === 0 || error.status >= 500 || error.status === 429 || error.code === 'campaign_incomplete') {
        this._pruneQueue();
        if (!this.queue.some((entry) => entry.ticket.id === ticket.id)) {
          this.queue.push({ ticket, detail, queuedAt: now, expiresAt: Math.min(now + QUEUE_TTL_MS, ticket.expiresAt) });
          this.queue = this.queue.slice(-15);
          this._persist(QUEUE_KEY, this.queue);
        }
        this.lastNotice = 'Envío pendiente (hasta 15 min). El ranking usa el tiempo real del servidor e incluye la demora sin conexión.';
        const result = { ok: false, status: 'queued', reason: this.lastNotice, message: this.lastNotice };
        this._emit('queued', result);
        return result;
      }
      this.lastNotice = error.message;
      const result = { ok: false, status: 'rejected', reason: error.message, code: error.code };
      this._emit('rejected', result);
      return result;
    }
  }

  async sync() {
    if (this._syncPromise) return this._syncPromise;
    this._syncPromise = (async () => {
      this._pruneQueue();
      if (!this.base || this.queue.length === 0) return this.getStatus();
      try { await this._ensurePlayer(); } catch { return this.getStatus(); }
      // Preserve level completion order, followed by its campaign result.
      const pending = [...this.queue].sort((a, b) => a.queuedAt - b.queuedAt || (a.ticket.kind === 'campaign' ? 1 : -1));
      for (const entry of pending) {
        if (!this.queue.some((item) => item.ticket.id === entry.ticket.id)) continue;
        const result = await this.finishRun(entry.ticket, entry.detail);
        if (result.status === 'rejected') {
          this.queue = this.queue.filter((item) => item.ticket.id !== entry.ticket.id);
          this._persist(QUEUE_KEY, this.queue);
        } else if (result.status === 'queued') break;
      }
      this._emit('sync');
      return this.getStatus();
    })();
    try { return await this._syncPromise; } finally { this._syncPromise = null; }
  }

  async getLeaderboard(selection) {
    if (!validBoard(selection)) return { ok: false, status: 'disabled', entries: [], player: null, reason: 'Selecciona una tabla válida.' };
    const key = boardKey(selection);
    const fallback = (reason) => ({ ...(this.cache[key] || { ...selection, entries: [], player: null, updatedAt: null }),
      ok: false, status: this.base ? 'offline' : 'disabled', cached: !!this.cache[key], reason });
    if (!this.base) return fallback('El ranking global todavía no está configurado.');
    try {
      // Leaderboards remain readable even if creating the guest identity fails.
      try { await this._ensurePlayer(); } catch {}
      await this.sync();
      const query = new URLSearchParams({ difficulty: selection.difficulty, kind: selection.kind, level: String(selection.level) });
      const result = await this._request(`/leaderboard?${query}`, 'GET');
      this.cache[key] = result;
      this._persist(CACHE_KEY, this.cache);
      return { ...result, status: 'ready', cached: false };
    } catch (error) { return fallback(error.message); }
  }
}

export const Ranking = new RankingClient();
