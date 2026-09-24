-- Phase 4: immutable evaluation planning and evidence only. These tables never
-- execute candidate code, select production implementations, or alter flags.
CREATE TABLE IF NOT EXISTS labs_evaluation_protocols (
  id TEXT PRIMARY KEY NOT NULL,
  target_analytic_id TEXT NOT NULL,
  name TEXT NOT NULL,
  version TEXT NOT NULL,
  purpose TEXT NOT NULL,
  population_definition TEXT NOT NULL,
  exclusions TEXT NOT NULL,
  train_definition TEXT NOT NULL,
  validation_definition TEXT NOT NULL,
  holdout_definition TEXT NOT NULL,
  random_seed_policy TEXT NOT NULL,
  leakage_controls TEXT NOT NULL,
  minimum_coverage TEXT NOT NULL,
  fingerprint TEXT NOT NULL UNIQUE CHECK (length(fingerprint) = 64 AND fingerprint NOT GLOB '*[^0-9a-f]*'),
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_source TEXT NOT NULL,
  UNIQUE (target_analytic_id, version)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_labs_evaluation_protocols_target_created ON labs_evaluation_protocols (target_analytic_id, created_at DESC, id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS labs_evaluation_protocol_metrics (
  protocol_id TEXT NOT NULL REFERENCES labs_evaluation_protocols(id) ON DELETE RESTRICT,
  metric_id TEXT NOT NULL,
  name TEXT NOT NULL,
  unit TEXT NOT NULL,
  required_cohorts TEXT NOT NULL,
  definition TEXT NOT NULL,
  metadata_schema_version INTEGER NOT NULL CHECK (metadata_schema_version = 1),
  PRIMARY KEY (protocol_id, metric_id)
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS labs_evaluation_protocol_gates (
  protocol_id TEXT NOT NULL REFERENCES labs_evaluation_protocols(id) ON DELETE RESTRICT,
  gate_id TEXT NOT NULL,
  metric_id TEXT NOT NULL,
  cohort_id TEXT NOT NULL,
  operator TEXT NOT NULL CHECK (operator IN ('GT', 'GTE', 'LT', 'LTE', 'EQ')),
  threshold_value REAL NOT NULL,
  unit TEXT NOT NULL,
  required INTEGER NOT NULL CHECK (required IN (0, 1)),
  description TEXT NOT NULL,
  metadata_schema_version INTEGER NOT NULL CHECK (metadata_schema_version = 1),
  PRIMARY KEY (protocol_id, gate_id),
  FOREIGN KEY (protocol_id, metric_id) REFERENCES labs_evaluation_protocol_metrics(protocol_id, metric_id) ON DELETE RESTRICT
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_labs_evaluation_protocol_gates_metric ON labs_evaluation_protocol_gates (protocol_id, metric_id, cohort_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS labs_evaluation_runs (
  id TEXT PRIMARY KEY NOT NULL,
  candidate_id TEXT NOT NULL REFERENCES labs_candidates(id) ON DELETE RESTRICT,
  candidate_revision TEXT NOT NULL,
  candidate_lifecycle_status TEXT NOT NULL CHECK (candidate_lifecycle_status = 'REGISTERED'),
  protocol_id TEXT NOT NULL REFERENCES labs_evaluation_protocols(id) ON DELETE RESTRICT,
  protocol_fingerprint TEXT NOT NULL,
  dataset_batch_id TEXT NOT NULL REFERENCES season_snapshot_batches(id) ON DELETE RESTRICT,
  baseline_analytic_id TEXT NOT NULL,
  baseline_version TEXT NOT NULL,
  baseline_implementation TEXT NOT NULL,
  implementation_commit TEXT NOT NULL CHECK (length(implementation_commit) = 40 AND implementation_commit NOT GLOB '*[^0-9a-f]*'),
  deterministic_seed TEXT,
  environment_metadata TEXT NOT NULL,
  status TEXT NOT NULL CHECK (status IN ('PLANNED', 'COMPLETED', 'FAILED', 'INVALIDATED')),
  started_at INTEGER,
  completed_at INTEGER,
  result_set_fingerprint TEXT CHECK (result_set_fingerprint IS NULL OR (length(result_set_fingerprint) = 64 AND result_set_fingerprint NOT GLOB '*[^0-9a-f]*')),
  failure_reason TEXT,
  invalidation_reason TEXT,
  schema_version INTEGER NOT NULL CHECK (schema_version = 1),
  created_at INTEGER NOT NULL,
  created_by TEXT NOT NULL,
  created_source TEXT NOT NULL,
  UNIQUE (candidate_id, candidate_revision, protocol_id, protocol_fingerprint, dataset_batch_id, implementation_commit)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_labs_evaluation_runs_candidate_created ON labs_evaluation_runs (candidate_id, created_at DESC, id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_labs_evaluation_runs_protocol_created ON labs_evaluation_runs (protocol_id, created_at DESC, id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_labs_evaluation_runs_dataset ON labs_evaluation_runs (dataset_batch_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS labs_evaluation_run_artifacts (
  run_id TEXT NOT NULL REFERENCES labs_evaluation_runs(id) ON DELETE RESTRICT,
  artifact_id TEXT NOT NULL REFERENCES labs_artifacts(id) ON DELETE RESTRICT,
  content_digest TEXT NOT NULL CHECK (length(content_digest) = 64 AND content_digest NOT GLOB '*[^0-9a-f]*'),
  role TEXT NOT NULL CHECK (role IN ('candidate-input', 'evidence')),
  attached_at INTEGER NOT NULL,
  attached_by TEXT NOT NULL,
  PRIMARY KEY (run_id, artifact_id)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_labs_evaluation_run_artifacts_artifact ON labs_evaluation_run_artifacts (artifact_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS labs_evaluation_metric_observations (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES labs_evaluation_runs(id) ON DELETE RESTRICT,
  metric_id TEXT NOT NULL,
  cohort_id TEXT NOT NULL,
  observed_value REAL NOT NULL,
  unit TEXT NOT NULL,
  sample_size INTEGER NOT NULL CHECK (sample_size >= 0),
  uncertainty_lower REAL,
  uncertainty_upper REAL,
  calculation_identity TEXT NOT NULL,
  evidence_artifact_id TEXT REFERENCES labs_artifacts(id) ON DELETE RESTRICT,
  metadata_schema_version INTEGER NOT NULL CHECK (metadata_schema_version = 1),
  UNIQUE (run_id, metric_id, cohort_id),
  CHECK (uncertainty_lower IS NULL OR uncertainty_upper IS NULL OR uncertainty_lower <= uncertainty_upper)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_labs_evaluation_metric_observations_run ON labs_evaluation_metric_observations (run_id, metric_id, cohort_id);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS labs_evaluation_gate_results (
  id TEXT PRIMARY KEY NOT NULL,
  run_id TEXT NOT NULL REFERENCES labs_evaluation_runs(id) ON DELETE RESTRICT,
  gate_id TEXT NOT NULL,
  observed_value REAL,
  evidence_artifact_id TEXT REFERENCES labs_artifacts(id) ON DELETE RESTRICT,
  result TEXT NOT NULL CHECK (result IN ('PASS', 'FAIL', 'INCONCLUSIVE')),
  reason TEXT NOT NULL,
  evaluator_identity TEXT NOT NULL,
  metadata_schema_version INTEGER NOT NULL CHECK (metadata_schema_version = 1),
  UNIQUE (run_id, gate_id),
  CHECK (result <> 'PASS' OR observed_value IS NOT NULL OR evidence_artifact_id IS NOT NULL)
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_labs_evaluation_gate_results_run ON labs_evaluation_gate_results (run_id, gate_id);
--> statement-breakpoint
-- Protocols are frozen before evidence is recorded; revisions require new IDs.
CREATE TRIGGER IF NOT EXISTS prevent_labs_evaluation_protocol_update
BEFORE UPDATE ON labs_evaluation_protocols
BEGIN SELECT RAISE(ABORT, 'Labs evaluation protocols are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS prevent_labs_evaluation_protocol_delete
BEFORE DELETE ON labs_evaluation_protocols
BEGIN SELECT RAISE(ABORT, 'Labs evaluation protocols are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS prevent_labs_evaluation_protocol_metric_update
BEFORE UPDATE ON labs_evaluation_protocol_metrics
BEGIN SELECT RAISE(ABORT, 'Labs evaluation protocol metrics are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS prevent_labs_evaluation_protocol_metric_delete
BEFORE DELETE ON labs_evaluation_protocol_metrics
BEGIN SELECT RAISE(ABORT, 'Labs evaluation protocol metrics are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS prevent_labs_evaluation_protocol_gate_update
BEFORE UPDATE ON labs_evaluation_protocol_gates
BEGIN SELECT RAISE(ABORT, 'Labs evaluation protocol gates are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS prevent_labs_evaluation_protocol_gate_delete
BEFORE DELETE ON labs_evaluation_protocol_gates
BEGIN SELECT RAISE(ABORT, 'Labs evaluation protocol gates are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS prevent_labs_evaluation_run_identity_rewrite
BEFORE UPDATE OF id, candidate_id, candidate_revision, candidate_lifecycle_status, protocol_id, protocol_fingerprint, dataset_batch_id, baseline_analytic_id, baseline_version, baseline_implementation, implementation_commit ON labs_evaluation_runs
BEGIN SELECT RAISE(ABORT, 'Labs evaluation run identity is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS prevent_labs_evaluation_completed_run_update
BEFORE UPDATE ON labs_evaluation_runs WHEN OLD.status = 'COMPLETED'
BEGIN SELECT RAISE(ABORT, 'Completed Labs evaluation runs are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS prevent_labs_evaluation_result_delete
BEFORE DELETE ON labs_evaluation_runs
BEGIN SELECT RAISE(ABORT, 'Labs evaluation runs are retained evidence'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS prevent_labs_evaluation_run_artifact_update
BEFORE UPDATE ON labs_evaluation_run_artifacts
BEGIN SELECT RAISE(ABORT, 'Labs evaluation artifact references are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS prevent_labs_evaluation_run_artifact_delete
BEFORE DELETE ON labs_evaluation_run_artifacts
BEGIN SELECT RAISE(ABORT, 'Labs evaluation artifact references are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS prevent_labs_evaluation_observation_update
BEFORE UPDATE ON labs_evaluation_metric_observations
BEGIN SELECT RAISE(ABORT, 'Labs metric observations are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS prevent_labs_evaluation_observation_delete
BEFORE DELETE ON labs_evaluation_metric_observations
BEGIN SELECT RAISE(ABORT, 'Labs metric observations are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS prevent_labs_evaluation_gate_result_update
BEFORE UPDATE ON labs_evaluation_gate_results
BEGIN SELECT RAISE(ABORT, 'Labs gate results are immutable'); END;
--> statement-breakpoint
CREATE TRIGGER IF NOT EXISTS prevent_labs_evaluation_gate_result_delete
BEFORE DELETE ON labs_evaluation_gate_results
BEGIN SELECT RAISE(ABORT, 'Labs gate results are immutable'); END;
