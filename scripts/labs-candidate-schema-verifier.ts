import { createHash } from "node:crypto";
import type { Client } from "@libsql/client";

const LABS_TABLES = ["labs_candidates", "labs_artifacts", "labs_candidate_artifacts", "labs_candidate_lifecycle_events"] as const;
const LABS_INDEXES = ["idx_labs_candidates_target", "idx_labs_candidates_dataset", "idx_labs_candidates_created", "idx_labs_candidate_artifacts_artifact", "idx_labs_candidate_lifecycle_events_candidate"] as const;
const LABS_TRIGGERS = ["prevent_labs_candidate_identity_rewrite", "prevent_labs_artifact_update", "prevent_labs_artifact_delete", "prevent_labs_lifecycle_event_update", "prevent_labs_lifecycle_event_delete"] as const;

async function objectsOfType(client: Client, type: "table" | "index" | "trigger", names: readonly string[]) {
  const result = await client.execute({ sql: `SELECT name FROM sqlite_master WHERE type = ? AND name IN (${names.map(() => "?").join(", ")})`, args: [type, ...names] });
  return new Set(result.rows.map(row => String(row.name)));
}

async function count(client: Client, statement: string) {
  const result = await client.execute(statement);
  return Number(result.rows[0]?.count ?? 0);
}

async function snapshotIdentityFingerprint(client: Client) {
  const result = await client.execute(`
    SELECT 'player' AS kind, id, COALESCE(batch_id, '') AS batch_id FROM player_season_snapshots
    UNION ALL
    SELECT 'team' AS kind, id, COALESCE(batch_id, '') AS batch_id FROM team_season_snapshots
    ORDER BY kind, id
  `);
  return createHash("sha256").update(result.rows.map(row => `${row.kind}:${row.id}:${row.batch_id}`).join("\n")).digest("hex");
}

export async function verifyLabsCandidateSchema(client: Client) {
  const [tables, indexes, triggers, foreignKeyCheck] = await Promise.all([
    objectsOfType(client, "table", LABS_TABLES), objectsOfType(client, "index", LABS_INDEXES),
    objectsOfType(client, "trigger", LABS_TRIGGERS), client.execute("PRAGMA foreign_key_check"),
  ]);
  const missing = [...LABS_TABLES.filter(name => !tables.has(name)), ...LABS_INDEXES.filter(name => !indexes.has(name)), ...LABS_TRIGGERS.filter(name => !triggers.has(name))];
  if (missing.length > 0) throw new Error(`Labs candidate schema is incomplete: ${missing.join(", ")}`);
  if (foreignKeyCheck.rows.length > 0) throw new Error("Foreign-key integrity check failed.");
  const [candidateRows, artifactRows, candidateArtifactRows, lifecycleEventRows, playerRows, teamRows, snapshotBatches, legacyPlayerRows, legacyTeamRows, snapshotFingerprint] = await Promise.all([
    count(client, "SELECT COUNT(*) AS count FROM labs_candidates"), count(client, "SELECT COUNT(*) AS count FROM labs_artifacts"),
    count(client, "SELECT COUNT(*) AS count FROM labs_candidate_artifacts"), count(client, "SELECT COUNT(*) AS count FROM labs_candidate_lifecycle_events"),
    count(client, "SELECT COUNT(*) AS count FROM player_season_snapshots"), count(client, "SELECT COUNT(*) AS count FROM team_season_snapshots"),
    count(client, "SELECT COUNT(*) AS count FROM season_snapshot_batches"), count(client, "SELECT COUNT(*) AS count FROM player_season_snapshots WHERE batch_id IS NULL"),
    count(client, "SELECT COUNT(*) AS count FROM team_season_snapshots WHERE batch_id IS NULL"), snapshotIdentityFingerprint(client),
  ]);
  return { candidateRows, artifactRows, candidateArtifactRows, lifecycleEventRows, playerRows, teamRows, snapshotBatches, legacyPlayerRows, legacyTeamRows, snapshotFingerprint };
}
