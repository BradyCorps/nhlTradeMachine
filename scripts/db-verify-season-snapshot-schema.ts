import { migrationConnection } from "./db-migration-ops";

async function tableExists(client: Awaited<ReturnType<typeof migrationConnection>>["client"], table: string) {
  const result = await client.execute({
    sql: "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?",
    args: [table],
  });
  return result.rows.length === 1;
}

async function hasNullableBatchId(client: Awaited<ReturnType<typeof migrationConnection>>["client"], table: string) {
  const result = await client.execute(`PRAGMA table_info(${table})`);
  const batchId = result.rows.find(row => row.name === "batch_id");
  return Boolean(batchId && Number(batchId.notnull) === 0);
}

async function hasPartialBatchMemberIndex(client: Awaited<ReturnType<typeof migrationConnection>>["client"], name: string) {
  const result = await client.execute({
    sql: "SELECT sql FROM sqlite_master WHERE type = 'index' AND name = ?",
    args: [name],
  });
  const definition = String(result.rows[0]?.sql ?? "").toLowerCase();
  return definition.includes("unique index") && definition.includes("where batch_id is not null");
}

async function count(client: Awaited<ReturnType<typeof migrationConnection>>["client"], statement: string) {
  const result = await client.execute(statement);
  return Number(result.rows[0]?.count ?? 0);
}

async function main() {
  const { client, target } = migrationConnection();
  try {
    const batches = await tableExists(client, "season_snapshot_batches");
    const playerBatchId = await hasNullableBatchId(client, "player_season_snapshots");
    const teamBatchId = await hasNullableBatchId(client, "team_season_snapshots");
    const playerMemberIndex = await hasPartialBatchMemberIndex(client, "idx_player_season_snapshots_batch_member");
    const teamMemberIndex = await hasPartialBatchMemberIndex(client, "idx_team_season_snapshots_batch_member");

    if (!batches || !playerBatchId || !teamBatchId || !playerMemberIndex || !teamMemberIndex) {
      throw new Error("Season snapshot schema does not match the Phase 1A migration contract.");
    }

    const summary = {
      target,
      playerRows: await count(client, "SELECT COUNT(*) AS count FROM player_season_snapshots"),
      teamRows: await count(client, "SELECT COUNT(*) AS count FROM team_season_snapshots"),
      legacyPlayerRows: await count(client, "SELECT COUNT(*) AS count FROM player_season_snapshots WHERE batch_id IS NULL"),
      legacyTeamRows: await count(client, "SELECT COUNT(*) AS count FROM team_season_snapshots WHERE batch_id IS NULL"),
      snapshotBatches: await count(client, "SELECT COUNT(*) AS count FROM season_snapshot_batches"),
    };

    if (summary.snapshotBatches !== 0 || summary.legacyPlayerRows !== summary.playerRows || summary.legacyTeamRows !== summary.teamRows) {
      throw new Error("Unexpected verified batch or legacy-row mutation detected.");
    }
    console.log(JSON.stringify(summary));
  } finally {
    client.close();
  }
}

void main().catch(error => {
  console.error(error instanceof Error ? error.message : "Schema verification failed.");
  process.exitCode = 1;
});
