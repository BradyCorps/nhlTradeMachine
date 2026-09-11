import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq, isNull, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/app/db/schema";
import { SEASON_SNAPSHOT_TABLE_STATEMENTS } from "@/app/db/ensure-schema";
import { calculateAssetNAV } from "@/app/lib/asset-nav";
import {
  captureSeasonSnapshotBatch,
  CANONICAL_NHL_TEAM_IDS,
  assertSeasonSnapshotBatchRows,
  batchPlayerSeasonSnapshotId,
  requireCompleteSeasonSnapshotBatch,
  seasonSnapshotBatchInventory,
  seasonSnapshotContext,
  writeSeasonSnapshots,
  buildSeasonSnapshotRows,
} from "@/app/lib/season-snapshot";
import type { XNAVResult } from "@/app/lib/xnav-engine";

const ASOF = "2026-09-11";

function roster() {
  return CANONICAL_NHL_TEAM_IDS.map((teamId, index) => ({
    id: `batch-${teamId}`, name: `Batch ${teamId}`, teamId, position: "C", age: 27,
    capHit: 5, yearsRemaining: 3, ptsPace: 60 + (index % 5), xGPace: 18,
    defRate: 0.04, avgTOI: 18, qocIndex: 55, games: 80, ops: 4, dps: 1,
    hasLiveStats: true,
  }));
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
      status: "COMPLETE", expectedPlayers: 32, capturedPlayers: 32,
      expectedTeams: 32, capturedTeams: 32, skippedPlayers: 0,
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
    expect(second.batch.integrityHash).toBe(first.batch.integrityHash);
    const players = await db.select().from(schema.playerSeasonSnapshots).where(eq(schema.playerSeasonSnapshots.batchId, first.batch.id));
    expect(players).toHaveLength(first.batch.expectedPlayers);
  });

  it("keeps legacy rows unverified while a verified batch uses separate batch-scoped row identities", async () => {
    const players = roster();
    const ctx = seasonSnapshotContext("completed", { asOf: ASOF });
    const legacy = buildSeasonSnapshotRows(players, navMap(players), ctx);
    await writeSeasonSnapshots(db, legacy);

    const verified = await capture();
    const legacyPlayers = await db.select().from(schema.playerSeasonSnapshots).where(isNull(schema.playerSeasonSnapshots.batchId));
    const verifiedPlayers = await db.select().from(schema.playerSeasonSnapshots).where(eq(schema.playerSeasonSnapshots.batchId, verified.batch.id));
    expect(legacyPlayers).toHaveLength(32);
    expect(verifiedPlayers).toHaveLength(32);
    expect(verifiedPlayers.every(row => row.id === batchPlayerSeasonSnapshotId(verified.batch.id, row.playerId))).toBe(true);
    expect(verifiedPlayers.some(row => legacyPlayers.some(legacyRow => legacyRow.id === row.id))).toBe(false);
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

  it("rejects missing or duplicate canonical team membership before capture", async () => {
    const players = roster();
    await expect(captureSeasonSnapshotBatch(db as any, {
      snapshotKind: "completed",
      context: seasonSnapshotContext("completed", { asOf: ASOF }),
      players: players.slice(1), navMap: navMap(players.slice(1)),
      createdBy: "test-admin", createdAction: "missing team test", now: 1_789_000_000_000,
    })).rejects.toThrow(/missing canonical NHL team membership/);

    const rows = buildSeasonSnapshotRows(players, navMap(players), seasonSnapshotContext("completed", { asOf: ASOF }));
    expect(() => assertSeasonSnapshotBatchRows(seasonSnapshotContext("completed", { asOf: ASOF }), {
      ...rows, teams: [...rows.teams, rows.teams[0]],
    })).toThrow(/Duplicate team ID/);
  });

  it("keeps pseudo-team players outside verified membership and cannot inflate the 32-team expectation", async () => {
    const players = [...roster(), { ...roster()[0], id: "batch-fa", name: "Batch FA", teamId: "FA_POOL" }];
    const rows = buildSeasonSnapshotRows(players, navMap(players), seasonSnapshotContext("completed", { asOf: ASOF }));
    expect(rows.excluded).toEqual(["batch-fa"]);
    expect(rows.players).toHaveLength(32);
    expect(rows.teams.map(row => row.teamId)).not.toContain("FA_POOL");
    expect(rows.teams).toHaveLength(CANONICAL_NHL_TEAM_IDS.length);
  });

  it("allows distinct immutable batches to coexist while an identical recapture reuses its batch", async () => {
    const first = await capture();
    const changed = roster().map(player => player.id === "batch-TOR" ? { ...player, ptsPace: player.ptsPace + 10 } : player);
    const second = await captureSeasonSnapshotBatch(db as any, {
      snapshotKind: "completed", context: seasonSnapshotContext("completed", { asOf: ASOF }),
      players: changed, navMap: navMap(changed), createdBy: "test-admin", createdAction: "changed source capture", now: 1_789_000_000_000,
    });
    expect(second.batch.id).not.toBe(first.batch.id);
    expect((await seasonSnapshotBatchInventory(db)).filter(batch => batch.status === "COMPLETE")).toHaveLength(2);
    const secondRetry = await captureSeasonSnapshotBatch(db as any, {
      snapshotKind: "completed", context: seasonSnapshotContext("completed", { asOf: ASOF }),
      players: changed, navMap: navMap(changed), createdBy: "test-admin", createdAction: "changed source capture", now: 1_789_000_000_000,
    });
    expect(secondRetry).toMatchObject({ idempotent: true, batch: { id: second.batch.id } });
  });

  it("allows Labs provenance references only to COMPLETE batches", async () => {
    const complete = await capture();
    await expect(requireCompleteSeasonSnapshotBatch(db, complete.batch.id)).resolves.toMatchObject({ id: complete.batch.id, status: "COMPLETE" });
    await expect(requireCompleteSeasonSnapshotBatch(db, "missing-batch")).rejects.toThrow(/not COMPLETE/);
  });
});
