-- Additive, idempotent. Immutable per-season analytical snapshots for players
-- and teams (docs/analytics/SEASON_SNAPSHOT_CONTRACT.md). Not applied to
-- production by this change; app/db/ensure-schema.ts carries the same
-- statements as a runtime safety net.
CREATE TABLE IF NOT EXISTS player_season_snapshots (
  id TEXT PRIMARY KEY,
  player_id TEXT NOT NULL,
  team_id TEXT,
  season TEXT NOT NULL,
  as_of TEXT NOT NULL,
  source TEXT NOT NULL,
  coverage TEXT NOT NULL,
  stats_season TEXT NOT NULL,
  season_games_observed INTEGER NOT NULL,
  contract_season TEXT NOT NULL,
  model_version TEXT NOT NULL,
  valuation_snapshot_id TEXT NOT NULL,
  position TEXT NOT NULL,
  nav_label TEXT NOT NULL,
  total REAL NOT NULL,
  components TEXT NOT NULL,
  market_value REAL,
  surplus REAL,
  uncertainty_low REAL,
  uncertainty_high REAL,
  contract TEXT NOT NULL,
  population TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_player_season_snapshots_player ON player_season_snapshots (player_id, season, as_of);
CREATE INDEX IF NOT EXISTS idx_player_season_snapshots_season ON player_season_snapshots (season, as_of, model_version);
CREATE TABLE IF NOT EXISTS team_season_snapshots (
  id TEXT PRIMARY KEY,
  team_id TEXT NOT NULL,
  season TEXT NOT NULL,
  as_of TEXT NOT NULL,
  source TEXT NOT NULL,
  coverage TEXT NOT NULL,
  stats_season TEXT NOT NULL,
  contract_season TEXT NOT NULL,
  model_version TEXT NOT NULL,
  roster_count INTEGER NOT NULL,
  f_nav REAL NOT NULL,
  d_nav REAL NOT NULL,
  g_nav REAL NOT NULL,
  xnav_signed REAL NOT NULL,
  f_nav_positive REAL NOT NULL,
  d_nav_positive REAL NOT NULL,
  g_nav_positive REAL NOT NULL,
  xnav_positive REAL NOT NULL,
  cap_ceiling REAL NOT NULL,
  cap_committed REAL NOT NULL,
  population TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_team_season_snapshots_team ON team_season_snapshots (team_id, season, as_of);
