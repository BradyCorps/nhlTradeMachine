-- Phase 1A: verified, immutable analytical snapshot captures. Existing
-- DATA-06 rows remain legacy/unverified until a batch proves their membership.
CREATE TABLE IF NOT EXISTS season_snapshot_batches (
  id TEXT PRIMARY KEY,
  season TEXT NOT NULL,
  snapshot_kind TEXT NOT NULL,
  as_of TEXT NOT NULL,
  coverage TEXT NOT NULL,
  stats_season TEXT NOT NULL,
  contract_season TEXT NOT NULL,
  model_version TEXT NOT NULL,
  status TEXT NOT NULL,
  expected_players INTEGER NOT NULL,
  captured_players INTEGER NOT NULL DEFAULT 0,
  expected_teams INTEGER NOT NULL,
  captured_teams INTEGER NOT NULL DEFAULT 0,
  skipped_players INTEGER NOT NULL DEFAULT 0,
  source TEXT NOT NULL,
  population TEXT NOT NULL,
  integrity_hash TEXT NOT NULL,
  created_by TEXT NOT NULL,
  created_action TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  completed_at INTEGER,
  failure_reason TEXT
);
CREATE INDEX IF NOT EXISTS idx_snapshot_batches_inventory ON season_snapshot_batches (season, as_of, model_version, status);

ALTER TABLE player_season_snapshots ADD COLUMN batch_id TEXT;
ALTER TABLE team_season_snapshots ADD COLUMN batch_id TEXT;
CREATE INDEX IF NOT EXISTS idx_player_season_snapshots_batch ON player_season_snapshots (batch_id, player_id);
CREATE INDEX IF NOT EXISTS idx_team_season_snapshots_batch ON team_season_snapshots (batch_id, team_id);
