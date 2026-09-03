// ── season-snapshot.test.ts ──────────────────────────────────────────
//
// DATA-06 foundation. A real libsql database rather than a mock, because
// "idempotent" and "immutable" are decided by SQLite's conflict clause.

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/app/db/schema";
import { SEASON_SNAPSHOT_TABLE_STATEMENTS } from "@/app/db/ensure-schema";
import { calculateAssetNAV } from "@/app/lib/asset-nav";
import { XNAV_MODEL_VERSION, buildLeagueProvenance, routeDataContext } from "@/app/lib/data-context";
import { SEASON } from "@/app/lib/season-config";
import {
  buildPlayerSeasonSnapshotRow,
  buildSeasonReference,
  buildSeasonSnapshotRows,
  seasonSnapshotContext,
  seasonSnapshotInventory,
  writeSeasonSnapshots,
} from "@/app/lib/season-snapshot";
import { rosterNavByPosition } from "@/app/lib/team-nav-split";
import type { XNAVResult } from "@/app/lib/xnav-engine";

const ASOF = "2026-09-03";

function roster() {
  return [
    { id: "f1", name: "F1", teamId: "TOR", position: "C", age: 27, capHit: 8, yearsRemaining: 3, ptsPace: 90, xGPace: 25, defRate: 0.05, avgTOI: 19, qocIndex: 60, games: 80, ops: 8, dps: 1, hasLiveStats: true },
    { id: "f2", name: "F2", teamId: "TOR", position: "W", age: 33, capHit: 9, yearsRemaining: 4, ptsPace: 20, xGPace: 5, defRate: -0.05, avgTOI: 12, qocIndex: 40, games: 70, ops: 1, dps: 0, hasLiveStats: true },
    { id: "d1", name: "D1", teamId: "TOR", position: "D", age: 26, capHit: 6, yearsRemaining: 5, ptsPace: 45, xGPace: 8, defRate: 0.08, avgTOI: 23, qocIndex: 70, games: 78, ops: 3, dps: 5, xgaRelTM: -0.3, corsiAgainstRel: -3, hasLiveStats: true },
    { id: "g1", name: "G1", teamId: "TOR", position: "G", age: 29, capHit: 5, yearsRemaining: 2, gsax: 14, games: 55, gamesStarted: 55, savePct: 0.916, hasLiveStats: true },
    { id: "f3", name: "F3", teamId: "BOS", position: "W", age: 24, capHit: 2, yearsRemaining: 2, ptsPace: 55, xGPace: 15, defRate: 0.02, avgTOI: 15, qocIndex: 50, games: 75, ops: 4, dps: 1, hasLiveStats: true },
    { id: "pick", name: "Pick", teamId: "BOS", position: "Pick", age: 0, capHit: 0, yearsRemaining: 0, round: 1, year: 2027, teamStanding: 10 },
  ];
}

function navMap(players: ReturnType<typeof roster>): Record<string, XNAVResult> {
  const out: Record<string, XNAVResult> = {};
  for (const p of players) out[p.id] = calculateAssetNAV(p as any, 104, ASOF);
  return out;
}

async function memoryDb() {
  const client = createClient({ url: ":memory:" });
  const db = drizzle(client, { schema });
  for (const statement of SEASON_SNAPSHOT_TABLE_STATEMENTS) await db.run(sql.raw(statement));
  return db;
}

describe("DATA-06: season snapshot contexts never substitute one season for another", () => {
  it("names the completed season on its own stats and the projected season as a preseason baseline", () => {
    const completed = seasonSnapshotContext("completed", { asOf: ASOF });
    const projected = seasonSnapshotContext("projected", { asOf: ASOF });
    expect(completed.season).toBe(SEASON.replaySeason);
    expect(completed.coverage).toBe("completed-season");
    expect(completed.statsSeason).toBe(SEASON.replaySeason);
    expect(projected.season).toBe(SEASON.label);
    expect(projected.coverage).toBe("preseason-baseline");
    expect(projected.statsSeason).toBe(SEASON.replaySeason);
    // No 2026-27 games exist: the projected row must say so, not invent them.
    expect(projected.seasonGamesObserved).toBe(0);
    expect(completed.season).not.toBe(projected.season);
    // Both are priced on the only ledger the app holds, and say which.
    expect(completed.contractSeason).toBe(SEASON.label);
    expect(projected.contractSeason).toBe(SEASON.label);
  });

  it("keys rows by season, day, model and id so no two contexts collide", () => {
    const players = roster();
    const nav = navMap(players);
    const a = buildSeasonSnapshotRows(players, nav, seasonSnapshotContext("completed", { asOf: ASOF }));
    const b = buildSeasonSnapshotRows(players, nav, seasonSnapshotContext("projected", { asOf: ASOF }));
    const c = buildSeasonSnapshotRows(players, nav, seasonSnapshotContext("projected", { asOf: "2026-10-01" }));
    const ids = new Set([...a.players, ...b.players, ...c.players].map(r => r.id));
    expect(ids.size).toBe(a.players.length * 3);
    expect(a.players[0].id).toBe(`${SEASON.replaySeason}:${ASOF}:${XNAV_MODEL_VERSION}:f1`);
  });
});

describe("DATA-06: builder", () => {
  it("carries the DATA-02 valuation id, components that sum to the total, market/surplus/uncertainty and contract context", () => {
    const players = roster();
    const nav = navMap(players);
    const ctx = seasonSnapshotContext("completed", { asOf: ASOF });
    const { players: rows, teams, skipped } = buildSeasonSnapshotRows(players, nav, ctx);
    expect(skipped).toEqual([]);
    expect(rows.map(r => r.playerId)).toEqual(["f1", "f2", "d1", "g1", "f3"]); // pick excluded
    for (const row of rows) {
      const result = nav[row.playerId];
      expect(row.valuationSnapshotId).toBe(result.snapshot!.snapshotId);
      expect(row.total).toBe(result.total);
      const components = JSON.parse(row.components) as Array<{ value: number }>;
      const sum = components.reduce((s, c) => s + c.value, 0);
      expect(Math.abs(sum - row.total)).toBeLessThan(1);
      expect(row.marketValue).toBe(result.snapshot!.marketValue);
      expect(row.surplus).toBe(result.snapshot!.surplus);
      expect(JSON.parse(row.contract)).toEqual(result.snapshot!.contract);
      expect(row.modelVersion).toBe(XNAV_MODEL_VERSION);
      expect(row.population.length).toBeGreaterThan(0);
    }
    expect(rows.find(r => r.playerId === "f1")!.navLabel).toBe("F-NAV");
    expect(rows.find(r => r.playerId === "d1")!.navLabel).toBe("D-NAV");
    expect(rows.find(r => r.playerId === "g1")!.navLabel).toBe("G-NAV");
    // Goalie has no FMV band: null, never zero.
    expect(rows.find(r => r.playerId === "g1")!.uncertaintyLow).toBeNull();
    expect(teams.map(t => t.teamId)).toEqual(["BOS", "TOR"]);
  });

  it("team aggregates reconcile exactly to the player rows through the same split the Teams page uses", () => {
    const players = roster();
    const nav = navMap(players);
    const ctx = seasonSnapshotContext("completed", { asOf: ASOF, capCeiling: 104 });
    const { players: rows, teams } = buildSeasonSnapshotRows(players, nav, ctx);
    const tor = teams.find(t => t.teamId === "TOR")!;
    const torRows = rows.filter(r => r.teamId === "TOR");
    const split = rosterNavByPosition(torRows.map(r => ({ position: r.position, nav: r.total })));
    expect(tor.fNav).toBe(split.signed.f);
    expect(tor.dNav).toBe(split.signed.d);
    expect(tor.gNav).toBe(split.signed.g);
    expect(tor.xnavSigned).toBe(split.signed.total);
    expect(tor.xnavSigned).toBeCloseTo(tor.fNav + tor.dNav + tor.gNav, 9);
    expect(tor.xnavPositive).toBeCloseTo(tor.fNavPositive + tor.dNavPositive + tor.gNavPositive, 9);
    expect(tor.xnavSigned).toBeCloseTo(torRows.reduce((s, r) => s + r.total, 0), 9);
    expect(tor.rosterCount).toBe(4);
    expect(tor.capCommitted).toBe(28);
    expect(tor.capCeiling).toBe(104);
  });

  it("refuses to build a row from a valuation struck for a different model version", () => {
    const players = roster();
    const nav = navMap(players);
    const ctx = seasonSnapshotContext("completed", { asOf: ASOF, modelVersion: "X-NAV 9.9" });
    expect(() => buildPlayerSeasonSnapshotRow(players[0], nav.f1, ctx)).toThrow(/X-NAV 9.9/);
  });
});

describe("DATA-06: persistence is idempotent and immutable", () => {
  let db: Awaited<ReturnType<typeof memoryDb>>;
  beforeEach(async () => { db = await memoryDb(); });

  it("inserts once, then re-running the same backfill writes nothing", async () => {
    const players = roster();
    const nav = navMap(players);
    const rows = buildSeasonSnapshotRows(players, nav, seasonSnapshotContext("completed", { asOf: ASOF }));
    const first = await writeSeasonSnapshots(db, rows);
    expect(first).toEqual({ players: { inserted: 5, skipped: 0 }, teams: { inserted: 2, skipped: 0 } });
    const second = await writeSeasonSnapshots(db, rows);
    expect(second).toEqual({ players: { inserted: 0, skipped: 5 }, teams: { inserted: 0, skipped: 2 } });
  });

  it("keeps 2025-26 and 2026-27 as separate rows and never overwrites a stored row", async () => {
    const players = roster();
    const nav = navMap(players);
    const completed = buildSeasonSnapshotRows(players, nav, seasonSnapshotContext("completed", { asOf: ASOF }));
    const projected = buildSeasonSnapshotRows(players, nav, seasonSnapshotContext("projected", { asOf: ASOF }));
    await writeSeasonSnapshots(db, completed);
    await writeSeasonSnapshots(db, projected);

    const inventory = await seasonSnapshotInventory(db);
    expect(inventory).toEqual([
      { season: SEASON.replaySeason, asOf: ASOF, modelVersion: XNAV_MODEL_VERSION, players: 5, teams: 2 },
      { season: SEASON.label, asOf: ASOF, modelVersion: XNAV_MODEL_VERSION, players: 5, teams: 2 },
    ]);

    // A later "correction" with the same key is ignored: history is append-only.
    const tampered = {
      players: completed.players.map(r => ({ ...r, total: r.total + 1000, season: r.season })),
      teams: completed.teams.map(t => ({ ...t, xnavSigned: -1 })),
    };
    const result = await writeSeasonSnapshots(db, tampered);
    expect(result.players.inserted).toBe(0);
    expect(result.teams.inserted).toBe(0);
    const stored = await db.select().from(schema.playerSeasonSnapshots).where(sql`id = ${completed.players[0].id}`);
    expect(stored[0].total).toBe(completed.players[0].total);
    expect(stored[0].coverage).toBe("completed-season");
    const storedProjected = await db.select().from(schema.playerSeasonSnapshots).where(sql`id = ${projected.players[0].id}`);
    expect(storedProjected[0].coverage).toBe("preseason-baseline");
    expect(storedProjected[0].seasonGamesObserved).toBe(0);
    expect(storedProjected[0].statsSeason).toBe(SEASON.replaySeason);
  });
});

describe("DATA-06: season identity on the API contract", () => {
  it("every league provenance carries the season reference and the rail prints it", () => {
    const provenance = buildLeagueProvenance({
      kind: "league", generatedAt: "2026-09-03T12:00:00.000Z", cacheState: "fresh",
      liveStats: true, playerCount: 900, analyticsCount: 850, contractsLoaded: 900, teamCount: 32,
    });
    expect(provenance.seasonReference.projectedSeason).toBe(SEASON.label);
    expect(provenance.seasonReference.statsSeason).toBe(SEASON.replaySeason);
    expect(provenance.seasonReference.projectedSeasonGamesObserved).toBe(0);
    expect(provenance.seasonReference.modelVersion).toBe(XNAV_MODEL_VERSION);
    expect(provenance.seasonReference.valuationAsOf).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    const rail = routeDataContext("teams", provenance, { capCeiling: 104 });
    const line = rail.items.find(i => i.label === "Season reference")!.value;
    expect(line).toContain(`${SEASON.label} projected (0 GP observed)`);
    expect(line).toContain(`stats ${SEASON.replaySeason}`);
  });

  it("the reference the player dossier renders is the same object the API carries", () => {
    const ref = buildSeasonReference({ asOf: ASOF });
    expect(ref.valuationAsOf).toBe(ASOF);
    expect(ref.coverage).toBe("preseason-baseline");
    expect(ref.seasonSnapshotIdScheme).toBe("{season}:{asOf}:{modelVersion}:{playerId|teamId}");
  });
});
