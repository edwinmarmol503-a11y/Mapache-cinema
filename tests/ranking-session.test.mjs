import test from 'node:test';
import assert from 'node:assert/strict';
import { createRankingSession, restoreRankingSession, validSavedTicket } from '../js/ranking-session.js';

const now = 1792000000000;
const playerId = '12345678-1234-4123-8123-123456789012';
const campaignId = '12345678-1234-4123-8123-123456789013';
const base = { token: 'a'.repeat(64), ruleset: 'lumera-2026-10-v2', difficulty: 'nightmare', startedAt: now - 120000, expiresAt: now + 7200000 };
const campaignTicket = { ...base, id: campaignId, kind: 'campaign', level: -1 };
const levelTicket = { ...base, id: '12345678-1234-4123-8123-123456789014', kind: 'level', level: 3, campaignId };
const session = { playerId, difficulty: 'nightmare', levelIndex: 3, campaignTicket, levelTicket,
  campaignFresh: true, levelScored: false, levelElapsedMs: 20000, campaignActiveMs: 60000, assisted: true, deaths: 35 };
const options = { playerId, difficulty: 'nightmare', levelIndex: 3, now };

test('online session resumes the same tickets and excludes elapsed time spent outside the game', () => {
  const saved = createRankingSession(session, now);
  const restored = restoreRankingSession(JSON.parse(JSON.stringify(saved)), { ...options, now: now + 3600000 });
  assert.equal(restored.campaignFresh, true);
  assert.equal(restored.levelTicket.id, levelTicket.id);
  assert.equal(restored.campaignTicket.id, campaignTicket.id);
  assert.equal(restored.levelElapsedMs, 20000);
  assert.equal(restored.campaignActiveMs, 60000);
  assert.equal(restored.assisted, true);
  assert.equal(restored.deaths, 35);
  assert.notEqual(saved.levelTicket, levelTicket);
});

test('expired, foreign, completed or incompatible saves cannot mint a new global run', () => {
  const saved = createRankingSession(session, now);
  assert.equal(restoreRankingSession(saved, { ...options, now: now + 86400001 }), null);
  assert.equal(restoreRankingSession(saved, { ...options, playerId: campaignId }), null);
  assert.equal(restoreRankingSession(saved, { ...options, difficulty: 'easy' }), null);
  assert.equal(restoreRankingSession(saved, { ...options, levelIndex: 4 }), null);
  assert.equal(restoreRankingSession(saved, { ...options, completed: true }), null);
  assert.equal(restoreRankingSession({ ...saved, levelElapsedMs: -5 }, options), null);
  assert.equal(restoreRankingSession({ ...saved, campaignActiveMs: 0 }, options), null);
});

test('a campaign without a valid linked current level is never presented as completeable online', () => {
  const missingLevel = createRankingSession({ ...session, levelTicket: null }, now);
  assert.equal(missingLevel.campaignFresh, false);
  assert.equal(missingLevel.levelTicket, null);
  const unlinked = createRankingSession({ ...session, levelTicket: { ...levelTicket, campaignId: null } }, now);
  assert.equal(unlinked.campaignFresh, false);
  assert.equal(unlinked.campaignTicket, null);
  assert.equal(unlinked.levelTicket.id, levelTicket.id);
});

test('ticket expiration bounds, ruleset and credentials are checked without changing their lifetime', () => {
  const selection = { ...options, kind: 'level', level: 3 };
  assert.equal(validSavedTicket(levelTicket, selection), true);
  for (const change of [{ token: 'fake' }, { id: 'fake' }, { ruleset: 'old' }, { expiresAt: now },
    { expiresAt: now + 86400000 }, { startedAt: now + 3600000 }, { campaignId: 'fake' }]) {
    assert.equal(validSavedTicket({ ...levelTicket, ...change }, selection), false);
  }
});
