-- Apply at deployment, never from a request handler. Root deployment may
-- generate the equivalent Drizzle migration for Sites' D1 provisioning.
CREATE TABLE players (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  nickname TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE runs (
  id TEXT PRIMARY KEY NOT NULL,
  token_hash TEXT NOT NULL,
  player_id TEXT NOT NULL REFERENCES players(id),
  difficulty TEXT NOT NULL,
  kind TEXT NOT NULL,
  level INTEGER NOT NULL,
  ruleset TEXT NOT NULL,
  campaign_id TEXT REFERENCES runs(id),
  started_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  completed_at INTEGER,
  elapsed_ms INTEGER,
  active_ms INTEGER,
  ending TEXT,
  deaths INTEGER NOT NULL DEFAULT 0,
  assisted INTEGER NOT NULL DEFAULT 0,
  completion_nonce TEXT
);
CREATE INDEX runs_player ON runs(player_id, started_at);
CREATE INDEX runs_campaign ON runs(campaign_id, level, completed_at);
CREATE INDEX runs_expiry ON runs(expires_at);
CREATE TABLE scores (
  player_id TEXT NOT NULL REFERENCES players(id),
  difficulty TEXT NOT NULL,
  kind TEXT NOT NULL,
  level INTEGER NOT NULL,
  ruleset TEXT NOT NULL,
  elapsed_ms INTEGER NOT NULL,
  achieved_at INTEGER NOT NULL,
  run_id TEXT NOT NULL,
  ending TEXT,
  deaths INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (player_id, difficulty, kind, level, ruleset)
);
CREATE INDEX scores_board ON scores(ruleset, difficulty, kind, level, elapsed_ms, achieved_at, player_id);
CREATE TABLE rate_limits (
  key TEXT PRIMARY KEY NOT NULL,
  count INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL
);
