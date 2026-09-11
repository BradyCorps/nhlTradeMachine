import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/app/db/schema";
import { SEASON_SNAPSHOT_TABLE_STATEMENTS } from "@/app/db/ensure-schema";
import { calculateAssetNAV } from "@/app/lib/asset-nav";
import {
  captureSeasonSnapshotBatch,
  requireCompleteSeasonSnapshotBatch,
  seasonSnapshotBatchInventory,
  seasonSnapshotContext,
  writeSeasonSnapshots,
  buildSeasonSnapshotRows,
} from "@/app/lib/season-snapshot";
import type { XNAVResult } from "@/app/lib/xnav-engine";

const ASOF = "2026-09-11";

function roster() {
  return [
    { id: "batch-f", name: "Batch F", teamId: "TOR", position: "C", age: 27, capHit: 8, yearsRemaining: 3, ptsPace: 90, xGPace: 25, defRate: 0.05, avgTOI: 19, qocIndex: 60, games: 80, ops: 8, dps: 1, hasLiveStats: true },
    { id: "batch-d", name: "Batch D", teamId: "TOR", position: "D", age: 26, capHit: 6, yearsRemaining: 5, ptsPace: 45, xGPace: 8, defRate: 0.08, avgTOI: 23, qocIndex: 70, games: 78, ops: 3, dps: 5, xgaRelTM: -0.3, corsiAgainstRel: -3, hasLiveStats: true },
    { id: "batch-g", name: "Batch G", teamId: "BOS", position: "G", age: 29, capHit: 5, yearsRemaining: 2, gsax: 14, games: 55, gamesStarted: 55, savePct: 0.916, hasLiveStats: true },
  ];
}

function navMap(players: ReturnType<typeof roster>): Record<string, XNAVResult> {
  return Object.fromEntries(players.map(player => [player.id, calculateAssetNAV(player as any, 104, ASOF)]));
}

async function memoryDb() {
  // libSQL transactions use a dedicated connection. A uniquely named temp
  // database keeps schema/data visible to both connections during this test.
  const client = createClient({ url: `file:/tmp/season-snapshot-batch-${crypto.randomUUID()}.db` });
  const db = drizzle(client, { schema });
  for (const statement of SEASON_SNAPSHOT_TABLE_STATEMENTS) await db.run(sql.raw(statement));
  return db;
}

describe("Phase 1A: verified season snapshot batches", () => {
  let db: Awaited<ReturnType<typeof memoryDb>>;
  beforeEach(async () => { db = await memoryDb(); });

  const capture = () => {
    const players = roster();
    return captureSeasonSnapshotBatch(db as any, {
      snapshotKind: "completed",
      context: seasonSnapshotContext("completed", { asOf: ASOF }),
      players,
      navMap: navMap(players),
      createdBy: "test-admin",
      createdAction: "test capture",
      now: 1_789_000_000_000,
    });
  };

  it("marks a coherent player/team capture COMPLETE only after every expected row is present", async () => {
    const result = await capture();
    expect(result.idempotent).toBe(false);
    expect(result.batch).toMatchObject({
      status: "COMPLETE", expectedPlayers: 3, capturedPlayers: 3,
      expectedTeams: 2, capturedTeams: 2, skippedPlayers: 0,
      createdBy: "test-admin", createdAction: "test capture",
    });
    expect(result.batch.integrityHash).toMatch(/^[a-f0-9]{64}$/);
    expect(result.batch.completedAt).toBe(1_789_000_000_000);
  });

  it("binds player and team rows to the same completed batch", async () => {
    const { batch } = await capture();
    const players = await db.select().from(schema.playerSeasonSnapshots).where(eq(schema.playerSeasonSnapshots.batchId, batch.id));
    const teams = await db.select().from(schema.teamSeasonSnapshots).where(eq(schema.teamSeasonSnapshots.batchId, batch.id));
    expect(players).toHaveLength(batch.expectedPlayers);
    expect(teams).toHaveLength(batch.expectedTeams);
    expect(players.every(row => row.batchId === batch.id && row.season === batch.season)).toBe(true);
    expect(teams.every(row => row.batchId === batch.id && row.season === batch.season)).toBe(true);
  });

  it("returns an immutable completed batch on an identical retry without rewriting rows", async () => {
    const first = await capture();
    const second = await capture();
    expect(second.idempotent).toBe(true);
    expect(second.batch.id).toBe(first.batch.id);
    const players = await db.select().from(schema.playerSeasonSnapshots).where(eq(schema.playerSeasonSnapshots.batchId, first.batch.id));
    expect(players).toHaveLength(first.batch.expectedPlayers);
  });

  it("rejects incomplete capture when immutable legacy rows prevent full batch membership", async () => {
    const players = roster();
    const ctx = seasonSnapshotContext("completed", { asOf: ASOF });
    await writeSeasonSnapshots(db, buildSeasonSnapshotRows(players, navMap(players), ctx));
    await expect(capture()).rejects.toThrow(/Incomplete snapshot batch/);
    const batches = await seasonSnapshotBatchInventory(db);
    expect(batches).toHaveLength(1);
    expect(batches[0]).toMatchObject({ status: "FAILED", capturedPlayers: 0, capturedTeams: 0 });
  });

  it("rejects duplicate canonical player IDs before a batch can become complete", async () => {
    const players = [...roster(), { ...roster()[0] }];
    await expect(captureSeasonSnapshotBatch(db as any, {
      snapshotKind: "completed",
      context: seasonSnapshotContext("completed", { asOf: ASOF }),
      players,
      navMap: navMap(players as ReturnType<typeof roster>),
      createdBy: "test-admin",
      createdAction: "duplicate test",
      now: 1_789_000_000_000,
    })).rejects.toThrow(/Duplicate player ID/);
    expect((await seasonSnapshotBatchInventory(db))[0].status).toBe("FAILED");
  });

  it("allows Labs provenance references only to COMPLETE batches", async () => {
    const complete = await capture();
    await expect(requireCompleteSeasonSnapshotBatch(db, complete.batch.id)).resolves.toMatchObject({ id: complete.batch.id, status: "COMPLETE" });
    await expect(requireCompleteSeasonSnapshotBatch(db, "missing-batch")).rejects.toThrow(/not COMPLETE/);
  });
});
