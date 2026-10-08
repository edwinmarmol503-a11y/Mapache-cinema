import { sqliteTable, text, integer, index, primaryKey, type AnySQLiteColumn } from 'drizzle-orm/sqlite-core';

// Keep this schema equivalent to migrations/0001_ranking.sql. Sites provisions
// DB from generated Drizzle migrations; the Worker uses prepared SQL directly.
export const players = sqliteTable('players', {
  id: text('id').primaryKey().notNull(),
  tokenHash: text('token_hash').notNull().unique(),
  nickname: text('nickname').notNull(),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
});

export const runs = sqliteTable('runs', {
  id: text('id').primaryKey().notNull(),
  tokenHash: text('token_hash').notNull(),
  playerId: text('player_id').notNull().references(() => players.id),
  difficulty: text('difficulty').notNull(),
  kind: text('kind').notNull(),
  level: integer('level').notNull(),
  ruleset: text('ruleset').notNull(),
  campaignId: text('campaign_id').references((): AnySQLiteColumn => runs.id),
  startedAt: integer('started_at').notNull(),
  expiresAt: integer('expires_at').notNull(),
  completedAt: integer('completed_at'),
  elapsedMs: integer('elapsed_ms'),
  activeMs: integer('active_ms'),
  ending: text('ending'),
  deaths: integer('deaths').notNull().default(0),
  assisted: integer('assisted').notNull().default(0),
  completionNonce: text('completion_nonce'),
}, (table) => [
  index('runs_player').on(table.playerId, table.startedAt),
  index('runs_campaign').on(table.campaignId, table.level, table.completedAt),
  index('runs_expiry').on(table.expiresAt),
]);

export const scores = sqliteTable('scores', {
  playerId: text('player_id').notNull().references(() => players.id),
  difficulty: text('difficulty').notNull(),
  kind: text('kind').notNull(),
  level: integer('level').notNull(),
  ruleset: text('ruleset').notNull(),
  elapsedMs: integer('elapsed_ms').notNull(),
  achievedAt: integer('achieved_at').notNull(),
  runId: text('run_id').notNull(),
  ending: text('ending'),
  deaths: integer('deaths').notNull().default(0),
}, (table) => [
  primaryKey({ columns: [table.playerId, table.difficulty, table.kind, table.level, table.ruleset] }),
  index('scores_board').on(table.ruleset, table.difficulty, table.kind, table.level, table.elapsedMs, table.achievedAt, table.playerId),
]);

export const rateLimits = sqliteTable('rate_limits', {
  key: text('key').primaryKey().notNull(),
  count: integer('count').notNull().default(0),
  expiresAt: integer('expires_at').notNull(),
});
