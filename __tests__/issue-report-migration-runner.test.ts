import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { describe, expect, it } from "vitest";
import { seasonSnapshotBatches } from "@/app/db/schema";

const runner = resolve("scripts/db-migrate.ts");
const loader = createRequire(import.meta.url).resolve("tsx");

describe("issue report migration runner", () => {
  it("emits separate table and index commands for remote single-statement execution", async () => {
    const migration = readMigrationFiles({ migrationsFolder: "drizzle" }).find(m => m.sql.join("").includes("issue_reports"))!;
    const client = createClient({ url: ":memory:" });
    try {
      await client.execute(migration.sql[0]!);
      expect((await client.execute("PRAGMA index_list(issue_reports)")).rows.map(row => row.name))
        .not.toContain("idx_issue_reports_created");
      await client.execute(migration.sql[1]!);
      expect((await client.execute("PRAGMA index_list(issue_reports)")).rows.map(row => row.name))
        .toContain("idx_issue_reports_created");
      expect(migration.sql).toHaveLength(2);
    } finally { client.close(); }
  });

  it("upgrades the prior journal once and reruns without changing protected rows or journal entries", async () => {
    const folder = mkdtempSync(join(tmpdir(), "issue-report-runner-"));
    const url = `file:${join(folder, "isolated.db")}`;
    cpSync("drizzle", join(folder, "drizzle"), { recursive: true });
    const journalPath = join(folder, "drizzle/meta/_journal.json");
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    writeFileSync(journalPath, JSON.stringify({ ...journal, entries: journal.entries.slice(0, -1) }));
    const run = () => JSON.parse(execFileSync(process.execPath, ["--import", loader, runner], {
      cwd: folder, encoding: "utf8", timeout: 30000,
      env: { ...process.env, MIGRATION_TARGET: "isolated", MIGRATION_DATABASE_URL: url,
        MIGRATION_DATABASE_AUTH_TOKEN: "isolated-fixture" },
    }).trim());
    const client = createClient({ url });
    try {
      expect(run().appliedNow).toHaveLength(6);
      await drizzle(client).insert(seasonSnapshotBatches).values({
        id: "snapshot:isolated-preservation", season: "2025-26", snapshotKind: "completed", asOf: "2026-09-13",
        coverage: "completed-season", statsSeason: "2025-26", contractSeason: "2026-27", modelVersion: "X-NAV 4.2",
        status: "COMPLETE", expectedPlayers: 1, capturedPlayers: 1, expectedTeams: 1, capturedTeams: 1,
        skippedPlayers: 0, source: "isolated fixture", population: "isolated fixture",
        integrityHash: "a".repeat(64), createdBy: "isolated fixture", createdAction: "isolated fixture",
        createdAt: 1, completedAt: 1, failureReason: null,
      });
      const protectedRows = (await client.execute("SELECT * FROM season_snapshot_batches")).rows;
      const priorJournal = (await client.execute("SELECT * FROM __drizzle_migrations ORDER BY id")).rows;
      writeFileSync(journalPath, JSON.stringify(journal));
      expect(run().appliedNow).toEqual(["0012_add_strand_checkpoints"]);
      // The additive STRAND-checkpoint migration leaves every earlier table and row alone.
      expect((await client.execute("SELECT * FROM issue_reports")).rows).toEqual([]);
      expect((await client.execute("SELECT * FROM strand_checkpoints")).rows).toEqual([]);
      expect((await client.execute("SELECT * FROM strand_reference_cohorts")).rows).toEqual([]);
      expect((await client.execute("SELECT * FROM season_snapshot_batches")).rows).toEqual(protectedRows);
      const upgradedJournal = (await client.execute("SELECT * FROM __drizzle_migrations ORDER BY id")).rows;
      expect(upgradedJournal.slice(0, -1)).toEqual(priorJournal);
      expect(upgradedJournal).toHaveLength(priorJournal.length + 1);
      expect(run().appliedNow).toEqual([]);
      expect((await client.execute("SELECT * FROM __drizzle_migrations ORDER BY id")).rows).toEqual(upgradedJournal);
      expect((await client.execute("SELECT * FROM season_snapshot_batches")).rows).toEqual(protectedRows);
    } finally { client.close(); rmSync(folder, { recursive: true, force: true }); }
  }, 30000);
});
