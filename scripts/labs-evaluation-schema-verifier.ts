import type { Client } from "@libsql/client";
import { assertJournalIsCompatible, readJournal } from "./db-migration-ops";

const TABLES = [
  "labs_evaluation_protocols",
  "labs_evaluation_protocol_metrics",
  "labs_evaluation_protocol_gates",
  "labs_evaluation_runs",
  "labs_evaluation_run_artifacts",
  "labs_evaluation_metric_observations",
  "labs_evaluation_gate_results",
] as const;

const INDEXES = [
  "idx_labs_evaluation_protocols_target_created",
  "idx_labs_evaluation_protocol_gates_metric",
  "idx_labs_evaluation_runs_candidate_created",
  "idx_labs_evaluation_runs_protocol_created",
  "idx_labs_evaluation_runs_dataset",
  "idx_labs_evaluation_run_artifacts_artifact",
  "idx_labs_evaluation_metric_observations_run",
  "idx_labs_evaluation_gate_results_run",
] as const;

const TRIGGERS = [
  "prevent_labs_evaluation_protocol_update",
  "prevent_labs_evaluation_protocol_delete",
  "prevent_labs_evaluation_protocol_metric_update",
  "prevent_labs_evaluation_protocol_metric_delete",
  "prevent_labs_evaluation_protocol_gate_update",
  "prevent_labs_evaluation_protocol_gate_delete",
  "prevent_labs_evaluation_run_identity_rewrite",
  "prevent_labs_evaluation_completed_run_update",
  "prevent_labs_evaluation_result_delete",
  "prevent_labs_evaluation_run_artifact_update",
  "prevent_labs_evaluation_run_artifact_delete",
  "prevent_labs_evaluation_observation_update",
  "prevent_labs_evaluation_observation_delete",
  "prevent_labs_evaluation_gate_result_update",
  "prevent_labs_evaluation_gate_result_delete",
] as const;

async function objects(client: Client, type: "table" | "index" | "trigger", expected: readonly string[]) {
  const result = await client.execute({ sql: `SELECT name FROM sqlite_master WHERE type = ? AND name IN (${expected.map(() => "?").join(", ")})`, args: [type, ...expected] });
  return new Set(result.rows.map(row => String(row.name)));
}

async function count(client: Client, table: string) {
  const result = await client.execute(`SELECT COUNT(*) AS count FROM ${table}`);
  return Number(result.rows[0]?.count ?? 0);
}

/** Read-only deployment verifier for the additive Phase 4 evidence schema. */
export async function verifyLabsEvaluationSchema(client: Client) {
  const status = await assertJournalIsCompatible(client, readJournal());
  if (status.pending.length > 0) throw new Error(`Migration journal is still pending: ${status.pending.map(migration => migration.tag).join(", ")}`);
  const [tables, indexes, triggers, foreignKeys] = await Promise.all([
    objects(client, "table", TABLES), objects(client, "index", INDEXES), objects(client, "trigger", TRIGGERS), client.execute("PRAGMA foreign_key_check"),
  ]);
  const missing = [...TABLES.filter(name => !tables.has(name)), ...INDEXES.filter(name => !indexes.has(name)), ...TRIGGERS.filter(name => !triggers.has(name))];
  if (missing.length > 0) throw new Error(`Labs evaluation schema is incomplete: ${missing.join(", ")}`);
  if (foreignKeys.rows.length > 0) throw new Error("Foreign-key integrity check failed.");
  const counts = Object.fromEntries(await Promise.all(TABLES.map(async table => [table, await count(client, table)])));
  return { ...counts, applied: status.applied.map(migration => migration.tag) };
}
