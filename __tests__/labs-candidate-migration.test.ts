import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/app/db/schema";
import { SEASON_SNAPSHOT_TABLE_STATEMENTS } from "@/app/db/ensure-schema";
import {
  assertJournalIsCompatible,
  migrationFolder,
  readJournal,
} from "@/scripts/db-migration-ops";
import { verifyLabsCandidateSchema } from "@/scripts/labs-candidate-schema-verifier";

const BATCH_ID = "snapshot:2025-26:2026-09-13:X-NAV-4.2:5af40ed576d53014";
const HASH = "5af40ed576d53014d16f1048a1971e6b69f6752412c4550d16f1048a1971e6b";
const JOURNAL_TIMESTAMPS = (JSON.parse(readFileSync(join(process.cwd(), "drizzle/meta/_journal.json"), "utf8")) as {
  entries: Array<{ when: number }>;
}).entries;

async function count(client: ReturnType<typeof createClient>, table: string) {
  const result = await client.execute(`SELECT COUNT(*) AS count FROM ${table}`);
  return Number(result.rows[0]?.count ?? 0);
}

async function snapshotSummary(client: ReturnType<typeof createClient>) {
  const [players, teams, batches, rows] = await Promise.all([
    count(client, "player_season_snapshots"),
    count(client, "team_season_snapshots"),
    count(client, "season_snapshot_batches"),
    client.execute(`
      SELECT 'player:' || id || ':' || COALESCE(batch_id, 'legacy') AS identity FROM player_season_snapshots
      UNION ALL
      SELECT 'team:' || id || ':' || COALESCE(batch_id, 'legacy') AS identity FROM team_season_snapshots
      ORDER BY identity
    `),
  ]);
  return {
    players,
    teams,
    batches,
    fingerprint: createHash("sha256").update(rows.rows.map(row => String(row.identity)).join("\n")).digest("hex"),
  };
}

describe("Phase 3 migration upgrade", () => {
  it("applies 0009 once to the current snapshot schema without changing existing snapshot data", async () => {
    const client = createClient({ url: `file:/tmp/labs-candidate-upgrade-${crypto.randomUUID()}.db` });
    const db = drizzle(client, { schema });
    try {
      for (const statement of SEASON_SNAPSHOT_TABLE_STATEMENTS) await db.run(sql.raw(statement));
      await db.insert(schema.seasonSnapshotBatches).values({
        id: BATCH_ID, season: "2025-26", snapshotKind: "completed", asOf: "2026-09-13", coverage: "completed-season",
        statsSeason: "2025-26", contractSeason: "2026-27", modelVersion: "X-NAV 4.2", status: "COMPLETE",
        expectedPlayers: 1, capturedPlayers: 1, expectedTeams: 1, capturedTeams: 1, skippedPlayers: 0,
        source: "isolated-test", population: "isolated-test", integrityHash: HASH, createdBy: "test", createdAction: "test",
        createdAt: 1, completedAt: 1, failureReason: null,
      });
      await db.insert(schema.playerSeasonSnapshots).values([
        {
          id: "legacy-player", playerId: "legacy-player", teamId: "EDM", season: "2025-26", asOf: "2026-09-12",
          source: "legacy", coverage: "completed-season", statsSeason: "2025-26", seasonGamesObserved: 82,
          contractSeason: "2026-27", modelVersion: "X-NAV 4.2", valuationSnapshotId: "legacy", position: "F",
          navLabel: "F-NAV", total: 1, components: "[]", marketValue: null, surplus: null, uncertaintyLow: null,
          uncertaintyHigh: null, contract: "{}", population: "legacy", batchId: null, createdAt: 1,
        },
        {
          id: "verified-player", playerId: "verified-player", teamId: "EDM", season: "2025-26", asOf: "2026-09-13",
          source: "verified", coverage: "completed-season", statsSeason: "2025-26", seasonGamesObserved: 82,
          contractSeason: "2026-27", modelVersion: "X-NAV 4.2", valuationSnapshotId: "verified", position: "F",
          navLabel: "F-NAV", total: 1, components: "[]", marketValue: null, surplus: null, uncertaintyLow: null,
          uncertaintyHigh: null, contract: "{}", population: "verified", batchId: BATCH_ID, createdAt: 1,
        },
      ]);
      await db.insert(schema.teamSeasonSnapshots).values([
        {
          id: "legacy-team", teamId: "EDM", season: "2025-26", asOf: "2026-09-12", source: "legacy",
          coverage: "completed-season", statsSeason: "2025-26", contractSeason: "2026-27", modelVersion: "X-NAV 4.2",
          rosterCount: 1, fNav: 1, dNav: 0, gNav: 0, xnavSigned: 1, fNavPositive: 1, dNavPositive: 0,
          gNavPositive: 0, xnavPositive: 1, capCeiling: 1, capCommitted: 1, population: "legacy", batchId: null, createdAt: 1,
        },
        {
          id: "verified-team", teamId: "EDM", season: "2025-26", asOf: "2026-09-13", source: "verified",
          coverage: "completed-season", statsSeason: "2025-26", contractSeason: "2026-27", modelVersion: "X-NAV 4.2",
          rosterCount: 1, fNav: 1, dNav: 0, gNav: 0, xnavSigned: 1, fNavPositive: 1, dNavPositive: 0,
          gNavPositive: 0, xnavPositive: 1, capCeiling: 1, capCommitted: 1, population: "verified", batchId: BATCH_ID, createdAt: 1,
        },
      ]);
      const before = await snapshotSummary(client);
      await client.execute("CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at INTEGER NOT NULL)");
      const journal = readJournal();
      for (const [index, entry] of journal.slice(0, 3).entries()) {
        await client.execute({
          sql: "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)",
          args: [entry.hash, JOURNAL_TIMESTAMPS[index]!.when],
        });
      }

      const pendingBefore = await assertJournalIsCompatible(client, journal);
      expect(pendingBefore.pending.map(entry => entry.tag)).toEqual(["0009_add_labs_candidate_foundation"]);
      await migrate(drizzle(client), { migrationsFolder: migrationFolder() });
      const after = await snapshotSummary(client);
      const pendingAfter = await assertJournalIsCompatible(client, journal);

      expect(after).toEqual(before);
      expect(pendingAfter.pending).toEqual([]);
      expect(pendingAfter.applied.map(entry => entry.tag)).toEqual(journal.map(entry => entry.tag));
      expect(await Promise.all([
        count(client, "labs_candidates"),
        count(client, "labs_artifacts"),
        count(client, "labs_candidate_artifacts"),
        count(client, "labs_candidate_lifecycle_events"),
      ])).toEqual([0, 0, 0, 0]);
      expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
      await expect(verifyLabsCandidateSchema(client)).resolves.toMatchObject({
        candidateRows: 0,
        artifactRows: 0,
        candidateArtifactRows: 0,
        lifecycleEventRows: 0,
        playerRows: 2,
        teamRows: 2,
        snapshotBatches: 1,
        legacyPlayerRows: 1,
        legacyTeamRows: 1,
      });
      const metadata = await client.execute("SELECT type, name FROM sqlite_master WHERE name LIKE 'labs_%' OR name LIKE 'idx_labs_%' OR name LIKE 'prevent_labs_%' ORDER BY type, name");
      expect(metadata.rows.map(row => String(row.name))).toEqual(expect.arrayContaining([
        "labs_candidates",
        "labs_artifacts",
        "labs_candidate_artifacts",
        "labs_candidate_lifecycle_events",
        "idx_labs_candidates_created",
        "prevent_labs_artifact_update",
        "prevent_labs_lifecycle_event_delete",
      ]));
      const candidateColumns = await client.execute("PRAGMA table_info(labs_candidates)");
      expect(candidateColumns.rows.map(row => String(row.name))).toEqual([
        "id", "target_analytic_id", "name", "revision", "implementation_identity",
        "base_analytic_version", "base_implementation_identity", "exposure", "dataset_batch_id",
        "description", "hypothesis", "schema_version", "created_at", "created_by", "created_source",
      ]);
      const candidateForeignKeys = await client.execute("PRAGMA foreign_key_list(labs_candidates)");
      expect(candidateForeignKeys.rows).toHaveLength(1);
      expect(candidateForeignKeys.rows[0]).toMatchObject({ table: "season_snapshot_batches", from: "dataset_batch_id", to: "id", on_delete: "NO ACTION" });
      const attachmentForeignKeys = await client.execute("PRAGMA foreign_key_list(labs_candidate_artifacts)");
      expect(attachmentForeignKeys.rows).toEqual(expect.arrayContaining([
        expect.objectContaining({ table: "labs_candidates", from: "candidate_id", to: "id", on_delete: "RESTRICT" }),
        expect.objectContaining({ table: "labs_artifacts", from: "artifact_id", to: "id", on_delete: "RESTRICT" }),
      ]));
      const eventForeignKeys = await client.execute("PRAGMA foreign_key_list(labs_candidate_lifecycle_events)");
      expect(eventForeignKeys.rows).toEqual([expect.objectContaining({ table: "labs_candidates", from: "candidate_id", to: "id", on_delete: "RESTRICT" })]);

      await migrate(drizzle(client), { migrationsFolder: migrationFolder() });
      expect(await snapshotSummary(client)).toEqual(before);
      expect(await assertJournalIsCompatible(client, journal)).toMatchObject({ pending: [] });
    } finally {
      client.close();
    }
  });
});
