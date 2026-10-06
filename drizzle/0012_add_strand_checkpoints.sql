CREATE TABLE strand_reference_cohorts (
  id TEXT PRIMARY KEY NOT NULL,
  season TEXT NOT NULL,
  game_type INTEGER NOT NULL CHECK (game_type IN (2, 3)),
  pos_group TEXT NOT NULL CHECK (pos_group IN ('F', 'D')),
  definition_version TEXT NOT NULL,
  min_gp INTEGER NOT NULL,
  gp_min INTEGER NOT NULL,
  gp_max INTEGER NOT NULL,
  n INTEGER NOT NULL,
  values_json TEXT NOT NULL,
  provenance_json TEXT NOT NULL,
  captured_at INTEGER NOT NULL
);
--> statement-breakpoint
CREATE TABLE strand_checkpoints (
  id TEXT PRIMARY KEY NOT NULL,
  player_id INTEGER NOT NULL,
  season TEXT NOT NULL,
  game_type INTEGER NOT NULL CHECK (game_type IN (2, 3)),
  milestone TEXT NOT NULL CHECK (milestone IN ('10', '20', '40', '60', 'END')),
  revision INTEGER NOT NULL DEFAULT 0,
  supersedes_id TEXT,
  status TEXT NOT NULL CHECK (status IN ('observed', 'reconstructed')),
  observed_gp INTEGER NOT NULL,
  pos_group TEXT NOT NULL CHECK (pos_group IN ('F', 'D')),
  captured_at INTEGER NOT NULL,
  source_as_of TEXT,
  definition_version TEXT NOT NULL,
  inputs_json TEXT NOT NULL,
  missing_json TEXT NOT NULL,
  cohort_id TEXT REFERENCES strand_reference_cohorts(id),
  provenance_json TEXT NOT NULL,
  content_hash TEXT NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX idx_strand_checkpoints_identity ON strand_checkpoints(player_id, season, game_type, milestone, revision);
--> statement-breakpoint
CREATE INDEX idx_strand_checkpoints_player ON strand_checkpoints(player_id, season, game_type);
--> statement-breakpoint
CREATE TRIGGER strand_checkpoints_no_update BEFORE UPDATE ON strand_checkpoints BEGIN SELECT RAISE(ABORT, 'strand_checkpoints rows are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER strand_checkpoints_no_delete BEFORE DELETE ON strand_checkpoints BEGIN SELECT RAISE(ABORT, 'strand_checkpoints rows are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER strand_reference_cohorts_no_update BEFORE UPDATE ON strand_reference_cohorts BEGIN SELECT RAISE(ABORT, 'strand_reference_cohorts rows are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER strand_reference_cohorts_no_delete BEFORE DELETE ON strand_reference_cohorts BEGIN SELECT RAISE(ABORT, 'strand_reference_cohorts rows are immutable'); END;
