import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { sql } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import * as schema from "@/app/db/schema";
import { SEASON_SNAPSHOT_TABLE_STATEMENTS } from "@/app/db/ensure-schema";
import { assertJournalIsCompatible, migrationFolder, readJournal } from "@/scripts/db-migration-ops";
import { verifyLabsEvaluationSchema } from "@/scripts/labs-evaluation-schema-verifier";

const JOURNAL_TIMESTAMPS = (JSON.parse(readFileSync(join(process.cwd(), "drizzle/meta/_journal.json"), "utf8")) as { entries: Array<{ when: number }> }).entries;
const PHASE_3 = readFileSync(join(process.cwd(), "drizzle/0009_add_labs_candidate_foundation.sql"), "utf8")
  .split("--> statement-breakpoint").map(statement => statement.trim()).filter(Boolean);

describe("Phase 4 migration upgrade", () => {
  it("applies 0010 once after the current Phase 3 schema without changing snapshot foundations", async () => {
    const client = createClient({ url: `file:/tmp/labs-evaluation-upgrade-${crypto.randomUUID()}.db` });
    const db = drizzle(client, { schema });
    try {
      for (const statement of SEASON_SNAPSHOT_TABLE_STATEMENTS) await db.run(sql.raw(statement));
      for (const statement of PHASE_3) await db.run(sql.raw(statement));
      await db.insert(schema.seasonSnapshotBatches).values({
        id: "snapshot:complete", season: "2025-26", snapshotKind: "completed", asOf: "2026-09-13", coverage: "completed-season",
        statsSeason: "2025-26", contractSeason: "2026-27", modelVersion: "X-NAV 4.2", status: "COMPLETE",
        expectedPlayers: 1, capturedPlayers: 1, expectedTeams: 1, capturedTeams: 1, skippedPlayers: 0, source: "test", population: "test",
        integrityHash: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa", createdBy: "test", createdAction: "test", createdAt: 1, completedAt: 1, failureReason: null,
      });
      await client.execute("CREATE TABLE __drizzle_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, hash TEXT NOT NULL, created_at INTEGER NOT NULL)");
      const journal = readJournal();
      for (const [index, entry] of journal.slice(0, 4).entries()) {
        await client.execute({ sql: "INSERT INTO __drizzle_migrations (hash, created_at) VALUES (?, ?)", args: [entry.hash, JOURNAL_TIMESTAMPS[index]!.when] });
      }
      expect((await assertJournalIsCompatible(client, journal)).pending.map(entry => entry.tag)).toEqual(["0010_add_labs_evaluation_evidence"]);
      const before = await client.execute("SELECT id, integrity_hash FROM season_snapshot_batches");
      await migrate(drizzle(client), { migrationsFolder: migrationFolder() });
      expect((await client.execute("SELECT id, integrity_hash FROM season_snapshot_batches")).rows).toEqual(before.rows);
      await expect(verifyLabsEvaluationSchema(client)).resolves.toMatchObject({
        labs_evaluation_protocols: 0, labs_evaluation_protocol_metrics: 0, labs_evaluation_protocol_gates: 0,
        labs_evaluation_runs: 0, labs_evaluation_run_artifacts: 0, labs_evaluation_metric_observations: 0, labs_evaluation_gate_results: 0,
      });
      await migrate(drizzle(client), { migrationsFolder: migrationFolder() });
      expect((await assertJournalIsCompatible(client, journal)).pending).toEqual([]);
      expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    } finally {
      client.close();
    }
  });
});
