-- Phase 3: candidate/artifact/history provenance only. These tables never
-- select production code, feature flags, or public analytical outputs.
CREATE TABLE IF NOT EXISTS labs_candidates (
  id TEXT PRIMARY KEY NOT NULL,
  target_analytic_id TEXT NOT NULL,
  name TEXT NOT NULL,
  revision TEXT NOT NULL,
  implementation_identity TEXT NOT NULL,
  base_analytic_version TEXT NOT NULL,
  base_implementation_identity TEXT NOT NULL,
  exposure TEXT NOT NULL CHECK (exposure IN ('internal', 'research')),
  dataset_batch_id TEXT NOT NULL REFERENCES season_snapshot_batches(id),
  description TEXT,
  hypothesis TEXT,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_source TEXT NOT NULL,
  UNIQUE (target_analytic_id, revision)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_labs_candidates_target ON labs_candidates (target_analytic_id, created_at DESC);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_labs_candidates_dataset ON labs_candidates (dataset_batch_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS labs_artifacts (
  id TEXT PRIMARY KEY NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('implementation', 'fitted-model', 'configuration', 'report')),
  content_digest TEXT NOT NULL UNIQUE CHECK (length(content_digest) = 64 AND content_digest NOT GLOB '*[^0-9a-f]*'),
  implementation_identity TEXT NOT NULL,
  media_type TEXT NOT NULL,
  artifact_schema_version TEXT NOT NULL,
  repository_commit TEXT CHECK (repository_commit IS NULL OR (length(repository_commit) = 40 AND repository_commit NOT GLOB '*[^0-9a-f]*')),
  repository_path TEXT,
  immutable_reference TEXT,
  byte_size INTEGER CHECK (byte_size IS NULL OR byte_size >= 0),
  metadata_schema_version INTEGER NOT NULL CHECK (metadata_schema_version = 1),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_source TEXT NOT NULL,
  CHECK (repository_path IS NULL OR repository_commit IS NOT NULL OR immutable_reference IS NOT NULL)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS labs_candidate_artifacts (
  candidate_id TEXT NOT NULL REFERENCES labs_candidates(id) ON DELETE RESTRICT,
  artifact_id TEXT NOT NULL REFERENCES labs_artifacts(id) ON DELETE RESTRICT,
  role TEXT NOT NULL CHECK (role IN ('implementation', 'fitted-model', 'configuration', 'report')),
  attached_at INTEGER NOT NULL,
  attached_by TEXT NOT NULL,
  PRIMARY KEY (candidate_id, artifact_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_labs_candidate_artifacts_artifact ON labs_candidate_artifacts (artifact_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS labs_candidate_lifecycle_events (
  id TEXT PRIMARY KEY NOT NULL,
  candidate_id TEXT NOT NULL REFERENCES labs_candidates(id) ON DELETE RESTRICT,
  sequence INTEGER NOT NULL CHECK (sequence >= 1),
  event_type TEXT NOT NULL CHECK (event_type IN ('DRAFT_CREATED', 'REGISTERED', 'RETIRED')),
  previous_status TEXT CHECK (previous_status IS NULL OR previous_status IN ('DRAFT', 'REGISTERED', 'RETIRED')),
  resulting_status TEXT NOT NULL CHECK (resulting_status IN ('DRAFT', 'REGISTERED', 'RETIRED')),
  occurred_at INTEGER NOT NULL,
  actor TEXT NOT NULL,
  source TEXT NOT NULL,
  note TEXT,
  evidence_reference TEXT,
  metadata_schema_version INTEGER NOT NULL CHECK (metadata_schema_version = 1),
  UNIQUE (candidate_id, sequence)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_labs_candidate_lifecycle_events_candidate ON labs_candidate_lifecycle_events (candidate_id, sequence);
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS prevent_labs_candidate_identity_rewrite
BEFORE UPDATE OF id, revision ON labs_candidates
WHEN NEW.id <> OLD.id OR NEW.revision <> OLD.revision
BEGIN
  SELECT RAISE(ABORT, 'Labs candidate identity and revision are stable');
END;
--> statement-breakpoint
-- Artifact metadata and historical events are facts once registered. There is
-- intentionally no cascade path that can silently erase that provenance.
CREATE TRIGGER IF NOT EXISTS prevent_labs_artifact_update
BEFORE UPDATE ON labs_artifacts
BEGIN
  SELECT RAISE(ABORT, 'Labs artifact metadata is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS prevent_labs_artifact_delete
BEFORE DELETE ON labs_artifacts
BEGIN
  SELECT RAISE(ABORT, 'Labs artifact metadata is immutable');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS prevent_labs_lifecycle_event_update
BEFORE UPDATE ON labs_candidate_lifecycle_events
BEGIN
  SELECT RAISE(ABORT, 'Labs lifecycle history is append-only');
END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS prevent_labs_lifecycle_event_delete
BEFORE DELETE ON labs_candidate_lifecycle_events
BEGIN
  SELECT RAISE(ABORT, 'Labs lifecycle history is append-only');
END;
