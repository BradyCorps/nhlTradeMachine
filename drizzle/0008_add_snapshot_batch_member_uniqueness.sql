-- Phase 1A.3: verified rows are batch-scoped. This additive partial index
-- leaves legacy batch_id = NULL rows untouched while enforcing one canonical
-- player/team member per verified batch.
CREATE UNIQUE INDEX IF NOT EXISTS idx_player_season_snapshots_batch_member
  ON player_season_snapshots (batch_id, player_id)
  WHERE batch_id IS NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS idx_team_season_snapshots_batch_member
  ON team_season_snapshots (batch_id, team_id)
  WHERE batch_id IS NOT NULL;
