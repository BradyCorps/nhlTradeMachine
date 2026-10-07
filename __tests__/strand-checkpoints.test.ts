import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "../app/db/schema";
import { captureStrandCheckpoints, cohortMinGpFor, inputsFromSources, readStoredCheckpoints } from "../app/lib/strand-checkpoints.server";
import { buildEvolutionView, traitValues, EDGE_EVOLUTION_WITHHELD_REASON, EVOLUTION_DEFINITION_VERSION } from "../app/lib/strand-evolution";

const SEASON = "20262027";
const migration = readMigrationFiles({ migrationsFolder: "drizzle" }).find(m => m.sql.join("").includes("strand_checkpoints"))!;

async function isolatedDb() {
  const client = createClient({ url: `file:/tmp/strand-checkpoints-${crypto.randomUUID()}.db` });
  for (const statement of migration.sql) await client.execute(statement);
  return { client, db: drizzle(client, { schema }) };
}

const edgeRaw = (gp: number, shots = 30, hd = 8, oz = 0.5) => ({
  player: { id: 1, gamesPlayed: gp },
  sogSummary: [{ locationCode: "all", shots }, { locationCode: "high", shots: hd }],
  zoneTimeDetails: { offensiveZonePctg: oz, defensiveZonePctg: 0.3 },
});
const row = (playerId: number, gp: number, points: number, pos = "C") => (
  { playerId, positionCode: pos, gamesPlayed: gp, points, timeOnIcePerGame: 1080 + playerId });
/** 25 forwards at `gp` games, player 100 being the one under test. */
const league = (gp: number, points = 6) => [
  row(100, gp, points),
  ...Array.from({ length: 24 }, (_, i) => row(200 + i, gp, 2 + i % 9)),
  row(900, gp, 0, "G"),
];
const edges = (gp: number, ids = [100, ...Array.from({ length: 24 }, (_, i) => 200 + i)]) =>
  new Map(ids.map(id => [id, { raw: edgeRaw(gp, 20 + (id % 7), 5 + (id % 4)), capturedAt: 1_000 }]));
const args = (over: Record<string, unknown> = {}) => ({
  season: SEASON, gameType: 2, summaryRows: league(12), summaryRetrievedAt: 5_000, edgeByPlayer: edges(12), now: 9_000, ...over,
});
const count = async (client: Client, table = "strand_checkpoints") => Number((await client.execute(`SELECT COUNT(*) AS n FROM ${table}`)).rows[0].n);

describe("migration 0012 is additive and isolated", () => {
  it("creates only the two new tables, indexes and immutability triggers", async () => {
    const { client } = await isolatedDb();
    const names = (await client.execute("SELECT name, type FROM sqlite_master WHERE name LIKE 'strand_%' OR name LIKE 'idx_strand_%'")).rows.map(r => `${r.type}:${r.name}`).sort();
    expect(names).toEqual([
      "index:idx_strand_checkpoints_identity", "index:idx_strand_checkpoints_player",
      "table:strand_checkpoints", "table:strand_reference_cohorts",
      "trigger:strand_checkpoints_no_delete", "trigger:strand_checkpoints_no_update",
      "trigger:strand_reference_cohorts_no_delete", "trigger:strand_reference_cohorts_no_update",
    ]);
    expect((await client.execute("SELECT name FROM sqlite_master WHERE type='table'")).rows.map(r => r.name).sort())
      .toEqual(["strand_checkpoints", "strand_reference_cohorts"]); // touches nothing else
    expect(migration.sql.every(s => !/\b(DROP|ALTER|UPDATE|DELETE)\b/i.test(s.replace(/BEFORE (UPDATE|DELETE)/g, "")))).toBe(true);
  });
});

describe("capture", () => {
  let client: Client, db: Awaited<ReturnType<typeof isolatedDb>>["db"];
  beforeEach(async () => { ({ client, db } = await isolatedDb()); });

  it("records the first observation inside a window under its real GP and pins a cohort", async () => {
    const report = await captureStrandCheckpoints(db as any, args());
    expect(report).toMatchObject({ considered: 25, inserted: 25, unchanged: 0, corrected: 0, noMilestone: 0, cohortsInserted: 1 });
    const stored = await readStoredCheckpoints(db as any, 100, SEASON, 2);
    expect(stored).toHaveLength(1);
    expect(stored[0]).toMatchObject({ milestone: "10", observedGp: 12, status: "observed", revision: 0 });
    expect(stored[0].inputs).toMatchObject({ gp: 12, points: 6, toiSecondsPerGame: 1180, edgeGp: 12 });
    expect(stored[0].cohort).toMatchObject({ season: SEASON, gameType: 2, posGroup: "F", n: 25, minGp: cohortMinGpFor("10"), gpMin: 12, gpMax: 12 });
    expect(stored[0].provenance).toMatchObject({ summary: { report: "skater/summary", retrievedAt: 5_000 }, edge: { table: "nhl_snapshots", capturedAt: 1_000, lagBehindSummaryMs: 4_000 } });
    expect(await count(client, "strand_reference_cohorts")).toBe(1);
  });

  it("is idempotent: a retry adds no checkpoint, no revision and no cohort", async () => {
    await captureStrandCheckpoints(db as any, args());
    const again = await captureStrandCheckpoints(db as any, args({ now: 99_000 }));
    expect(again).toMatchObject({ inserted: 0, unchanged: 25, corrected: 0, cohortsInserted: 0 });
    expect(await count(client)).toBe(25);
  });

  it("does not read a shifted league field on retry as a source correction", async () => {
    await captureStrandCheckpoints(db as any, args());
    const shifted = league(12).map(r => r.playerId === 205 ? { ...r, points: 40 } : r); // someone else's totals moved
    const retry = await captureStrandCheckpoints(db as any, args({ summaryRows: shifted, onlyPlayerIds: new Set([100]), now: 50_000 }));
    expect(retry).toMatchObject({ unchanged: 1, corrected: 0, cohortsInserted: 0 });
    expect(await count(client)).toBe(25);
    expect(await count(client, "strand_reference_cohorts")).toBe(1);
  });

  it("does not call a later capture the same milestone", async () => {
    await captureStrandCheckpoints(db as any, args());
    const later = await captureStrandCheckpoints(db as any, args({ summaryRows: league(14), edgeByPlayer: edges(14) }));
    expect(later).toMatchObject({ inserted: 0, noMilestone: 25 });
    expect((await readStoredCheckpoints(db as any, 100, SEASON, 2))[0].observedGp).toBe(12);
  });

  it("keeps a late source correction as a new revision and retains the original", async () => {
    await captureStrandCheckpoints(db as any, args());
    const original = (await client.execute("SELECT * FROM strand_checkpoints WHERE player_id = 100")).rows[0];
    const corrected = await captureStrandCheckpoints(db as any, args({ summaryRows: league(12, 7), now: 20_000, onlyPlayerIds: new Set([100]) }));
    expect(corrected).toMatchObject({ considered: 1, corrected: 1, inserted: 0 });
    const rows = (await client.execute("SELECT id, revision, supersedes_id, inputs_json FROM strand_checkpoints WHERE player_id = 100 ORDER BY revision")).rows;
    expect(rows.map(r => r.revision)).toEqual([0, 1]);
    expect(rows[1].supersedes_id).toBe(rows[0].id);
    expect((await client.execute("SELECT * FROM strand_checkpoints WHERE id = ?", [original.id as string])).rows[0]).toEqual(original);
    expect(JSON.parse(rows[1].inputs_json as string).points).toBe(7);
    // The page uses the corrected revision and says so.
    const stored = await readStoredCheckpoints(db as any, 100, SEASON, 2);
    const view = buildEvolutionView({ season: SEASON, gameType: 2, latestInputs: stored[0].inputs, latestCapturedAt: 1, latestCohort: null,
      baselineSeason: null, baselineInputs: null, baselineCohort: null, checkpoints: stored, storeUnavailable: false });
    expect(view.options[0].revisionNote).toMatch(/revision 1/);
  });

  it("refuses UPDATE and DELETE at the database", async () => {
    await captureStrandCheckpoints(db as any, args());
    await expect(client.execute("UPDATE strand_checkpoints SET observed_gp = 10")).rejects.toThrow(/immutable/);
    await expect(client.execute("DELETE FROM strand_checkpoints")).rejects.toThrow(/immutable/);
    await expect(client.execute("UPDATE strand_reference_cohorts SET n = 1")).rejects.toThrow(/immutable/);
    await expect(client.execute("DELETE FROM strand_reference_cohorts")).rejects.toThrow(/immutable/);
    expect(await count(client)).toBe(25);
  });

  it("manufactures nothing: outside a window, in the playoffs, or for goalies", async () => {
    for (const gp of [9, 17, 30]) {
      const r = await captureStrandCheckpoints(db as any, args({ summaryRows: league(gp), edgeByPlayer: edges(gp) }));
      expect(r.inserted, String(gp)).toBe(0);
    }
    const playoffs = await captureStrandCheckpoints(db as any, args({ gameType: 3 }));
    expect(playoffs).toMatchObject({ considered: 0, inserted: 0 });
    expect(await count(client)).toBe(0);
    expect(await count(client, "strand_reference_cohorts")).toBe(0);
    await captureStrandCheckpoints(db as any, args());
    expect((await client.execute("SELECT COUNT(*) AS n FROM strand_checkpoints WHERE player_id = 900")).rows[0].n).toBe(0);
  });

  it("isolates seasons: a 2025-26 read never sees a 2026-27 checkpoint", async () => {
    await captureStrandCheckpoints(db as any, args());
    expect(await readStoredCheckpoints(db as any, 100, "20252026", 2)).toEqual([]);
    expect(await readStoredCheckpoints(db as any, 100, SEASON, 3)).toEqual([]);
  });

  it("captures the season end only when told the season is complete", async () => {
    const rows = league(82);
    expect((await captureStrandCheckpoints(db as any, args({ summaryRows: rows, edgeByPlayer: edges(82) }))).inserted).toBe(0);
    const end = await captureStrandCheckpoints(db as any, args({ summaryRows: rows, edgeByPlayer: edges(82), seasonComplete: true }));
    expect(end.inserted).toBe(25);
    expect((await readStoredCheckpoints(db as any, 100, SEASON, 2))[0]).toMatchObject({ milestone: "END", observedGp: 82 });
  });

  it("records missingness instead of a value, including a misaligned EDGE sample", async () => {
    const e = edges(12);
    e.set(100, { raw: edgeRaw(9), capturedAt: 1_000 }); // EDGE says 9 GP, summary says 12
    await captureStrandCheckpoints(db as any, args({ edgeByPlayer: e }));
    const r = (await client.execute("SELECT missing_json, inputs_json FROM strand_checkpoints WHERE player_id = 100")).rows[0];
    const missing = JSON.parse(r.missing_json as string);
    expect(missing.sog_gp).toMatch(/EDGE sample is 9 GP but the NHL summary says 12 GP/);
    expect(missing.pts_gp).toBeUndefined();
  });

  it("preserves aligned raw EDGE inputs but withholds evolution values and cohort percentiles", async () => {
    await captureStrandCheckpoints(db as any, args());
    const stored = (await readStoredCheckpoints(db as any, 100, SEASON, 2))[0];
    expect(stored.inputs).toMatchObject({ edgeGp: 12, edgeShotsAll: 22, edgeHdShots: 5, edgeOzPct: 0.5 });
    const traits = traitValues(stored.inputs);
    expect(traits.pts_gp.value).toBeCloseTo(0.5);
    expect(traits.toi_gp.value).toBeCloseTo(1180 / 60);
    for (const key of ["sog_gp", "hd_sog_gp", "oz_time"] as const) {
      expect(traits[key]).toMatchObject({ value: null, missing: EDGE_EVOLUTION_WITHHELD_REASON });
      expect(stored.cohort?.values[key]).toEqual([]);
    }
    expect(stored.cohort?.definitionVersion).toBe(EVOLUTION_DEFINITION_VERSION);
    const raw = JSON.parse((await client.execute("SELECT inputs_json FROM strand_checkpoints WHERE player_id=100")).rows[0].inputs_json as string);
    expect(raw.edgeShotsAll).toBe(22);
    expect(JSON.parse((await client.execute("SELECT missing_json FROM strand_checkpoints WHERE player_id=100")).rows[0].missing_json as string).hd_sog_gp)
      .toBe(EDGE_EVOLUTION_WITHHELD_REASON);
  });

  it("withholds EDGE values from older stored rows without rewriting their raw inputs", async () => {
    const legacyInputs = { gp: 12, points: 6, toiSecondsPerGame: 1423.6666, edgeGp: 12, edgeShotsAll: 30, edgeHdShots: 8, edgeOzPct: 0.5 };
    await db.insert(schema.strandCheckpoints).values({
      id: "legacy", playerId: 100, season: SEASON, gameType: 2, milestone: "10", revision: 0,
      status: "observed", observedGp: 12, posGroup: "F", capturedAt: 1_000, definitionVersion: "strand-evo-v1",
      inputsJson: JSON.stringify(legacyInputs), missingJson: "{}", provenanceJson: "{}", contentHash: "legacy",
    });
    const stored = (await readStoredCheckpoints(db as any, 100, SEASON, 2))[0];
    expect(traitValues(stored.inputs).hd_sog_gp).toMatchObject({ value: null, missing: EDGE_EVOLUTION_WITHHELD_REASON });
    expect(traitValues(stored.inputs).toi_gp.value).toBeCloseTo(1423.6666 / 60);
    expect(JSON.parse((await client.execute("SELECT inputs_json FROM strand_checkpoints WHERE id='legacy'")).rows[0].inputs_json as string)).toEqual(legacyInputs);
  });

  it("reads inputs defensively from partial sources", () => {
    expect(inputsFromSources({ gamesPlayed: 4 }, null, SEASON)).toMatchObject({ gp: 4, points: null, toiSecondsPerGame: null, edgeGp: null });
    expect(inputsFromSources(undefined, { not: "edge" }, SEASON).edgeGp).toBeNull();
  });
});
