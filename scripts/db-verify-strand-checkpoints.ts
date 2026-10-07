// Read-only. Confirms migration 0012 produced exactly the Season profile evolution
// store (two tables, two indexes, four immutability triggers) and reports row counts.
// Writes nothing. Same MIGRATION_* environment as db:migrate.
import { migrationConnection } from "./db-migration-ops";

const EXPECTED = [
  "index:idx_strand_checkpoints_identity", "index:idx_strand_checkpoints_player",
  "table:strand_checkpoints", "table:strand_reference_cohorts",
  "trigger:strand_checkpoints_no_delete", "trigger:strand_checkpoints_no_update",
  "trigger:strand_reference_cohorts_no_delete", "trigger:strand_reference_cohorts_no_update",
];

async function main() {
  const { client, target } = migrationConnection();
  try {
    const found = (await client.execute("SELECT name, type FROM sqlite_master WHERE name LIKE 'strand_%' OR name LIKE 'idx_strand_%'"))
      .rows.map(r => `${r.type}:${r.name}`).sort();
    if (JSON.stringify(found) !== JSON.stringify(EXPECTED)) {
      throw new Error(`Strand checkpoint schema does not match migration 0012. Found: ${found.join(", ") || "nothing"}`);
    }
    const n = async (sql: string) => Number((await client.execute(sql)).rows[0]?.n ?? 0);
    console.log(JSON.stringify({
      target,
      checkpoints: await n("SELECT COUNT(*) AS n FROM strand_checkpoints"),
      referenceCohorts: await n("SELECT COUNT(*) AS n FROM strand_reference_cohorts"),
      revisionsAboveZero: await n("SELECT COUNT(*) AS n FROM strand_checkpoints WHERE revision > 0"),
    }));
  } finally {
    client.close();
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : "Verification failed.");
  process.exitCode = 1;
});
