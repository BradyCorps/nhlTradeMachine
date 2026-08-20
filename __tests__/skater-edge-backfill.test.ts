// ── skater-edge-backfill.test.ts ─────────────────────────────────
//
// The skater EDGE backfill is what populates the gravity model's inputs. It
// mirrors the goalie one, so it carries the same invariants: an actual write
// is distinguished from a same-day re-run, a 404 (skater the NHL has not
// tracked) is recorded as a tombstone rather than reported as a failure, and
// coverage separates "asked, nothing there" from "never asked" so it can reach
// a truthful denominator instead of sitting at "0 of 1187" forever.
//
// The database is a real libsql file: the stored/skipped split is decided by
// SQLite's conflict clause, and a hand-rolled fake would only assert the fake.

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/app/db/schema";

const state = vi.hoisted(() => ({
  db: null as any,
  landing: new Map<string, any>(),
  edge: new Map<string, { facts: any; raw: any; status: number }>(),
  rosters: new Map<string, number[]>(),   // team → skater ids (for discover)
}));

vi.mock("@/app/db/client", () => ({
  db: new Proxy({}, {
    get(_t, p) { const v = state.db[p]; return typeof v === "function" ? v.bind(state.db) : v; },
  }),
}));
vi.mock("@/app/db/ensure-schema", () => ({ ensureNhlSnapshotTable: vi.fn(async () => undefined) }));

vi.mock("@/app/lib/nhl-player-feed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/nhl-player-feed")>();
  return {
    ...actual,
    fetchPlayerLanding: vi.fn(async (id: string | number) => {
      const f = state.landing.get(String(id));
      return { facts: f ?? null, raw: f ? { landing: true } : null };
    }),
    fetchEdgeDetail: vi.fn(async (id: string | number) => {
      const e = state.edge.get(String(id));
      if (!e) return { facts: null, raw: null, status: 404 };
      return { facts: e.facts, raw: e.raw, status: e.status };
    }),
  };
});

const {
  backfillSkaterEdge, resolveSkaterIds, skaterEdgeCoverage, discoverSkaterIds, NO_EDGE_DATA_SOURCE,
} = await import("@/app/lib/nhl-feed-capture");
const { activeSkaterIds, activeSkaterIdsForTeams } = await import("@/app/lib/nhl-active-players");

const SEASON = 20252026;
const landingFacts = (name: string) => ({ name, gamesPlayed: 60, goals: 20, assists: 25, points: 45, shootingPctg: 0.12 });
const edgeFor = (status = 200) => ({
  facts: { gamesPlayed: 60, ozPct: 0.55, hdShots: 40, hdShootingPct: 0.18, hdFinishingDelta: 0.02 },
  raw: { edge: true }, status,
});

let client: ReturnType<typeof createClient>;
let dir: string;
const countSource = async (src: string) =>
  Number((await client.execute({ sql: "SELECT COUNT(*) AS n FROM nhl_snapshots WHERE source = ?", args: [src] })).rows[0].n);

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "skater-edge-"));
  client = createClient({ url: `file:${join(dir, "t.db")}` });
  await client.execute(`CREATE TABLE nhl_snapshots (
    id TEXT PRIMARY KEY, player_id INTEGER NOT NULL, name TEXT, season INTEGER NOT NULL,
    source TEXT NOT NULL, captured_at INTEGER NOT NULL, games_played INTEGER, goals INTEGER,
    assists INTEGER, points INTEGER, shooting_pctg REAL, oz_pct REAL, hd_shots INTEGER,
    hd_shooting_pct REAL, hd_finishing_delta REAL, payload TEXT NOT NULL)`);
  state.db = drizzle(client, { schema });
  state.landing = new Map();
  state.edge = new Map();
  state.rosters = new Map();
  global.fetch = vi.fn(async (url: any) => {
    const m = String(url).match(/roster\/([A-Z]+)\/current/);
    const ids = m ? (state.rosters.get(m[1]) ?? []) : [];
    return { ok: true, json: async () => ({ forwards: ids.map(id => ({ id })), defensemen: [], goalies: [] }) } as any;
  });
});
afterEach(async () => { client.close(); await rm(dir, { recursive: true, force: true }); vi.clearAllMocks(); });

describe("resolveSkaterIds", () => {
  it("defaults to every skater in the bundled snapshot", () => {
    const { ids, eligible, nextOffset } = resolveSkaterIds({});
    expect(eligible).toBe(activeSkaterIds().length);
    expect(eligible).toBeGreaterThan(1000);
    expect(ids).toHaveLength(eligible);
    expect(nextOffset).toBeNull();
  });

  it("scopes to teams and honours explicit ids", () => {
    expect(resolveSkaterIds({ teams: ["EDM"] }).ids.sort()).toEqual([...activeSkaterIdsForTeams(["EDM"])].sort());
    expect(resolveSkaterIds({ playerIds: [8478402, "8477934"] }).ids).toEqual(["8477934", "8478402"]);
  });

  it("walks the whole list through offset/limit without gaps or repeats", () => {
    const all = resolveSkaterIds({}).ids;
    const seen: string[] = [];
    let offset: number | null = 0;
    while (offset != null) {
      const page = resolveSkaterIds({ offset, limit: 200 });
      seen.push(...page.ids);
      offset = page.nextOffset;
    }
    expect(seen).toEqual(all);
  });
});

describe("backfillSkaterEdge", () => {
  it("stores landing + edge and reports the writes", async () => {
    state.landing.set("8478402", landingFacts("Connor McDavid"));
    state.edge.set("8478402", edgeFor());

    const r = await backfillSkaterEdge(SEASON, { playerIds: ["8478402"] });
    expect(r).toMatchObject({ eligible: 1, requested: 1, landingStored: 1, edgeStored: 1, edgeSkipped: 0 });
    expect(r.failures).toEqual([]);
    expect(r.noEdgeData).toEqual([]);
    expect(await countSource("edge")).toBe(1);
    expect(await countSource("landing")).toBe(1);
  });

  it("counts a same-day re-run as skipped, not stored", async () => {
    state.landing.set("8478402", landingFacts("Connor McDavid"));
    state.edge.set("8478402", edgeFor());
    await backfillSkaterEdge(SEASON, { playerIds: ["8478402"] });
    const r = await backfillSkaterEdge(SEASON, { playerIds: ["8478402"] });
    expect(r).toMatchObject({ edgeStored: 0, edgeSkipped: 1 });
    expect(await countSource("edge")).toBe(1);
  });

  // A 404 skater (never tracked) is recorded, not counted as a failure — the
  // exact thing that made the goalie run look like 58 failures.
  it("records a 404 as no-edge-data with a tombstone, not a failure", async () => {
    state.landing.set("8480000", landingFacts("Rookie Skater"));  // played, but no EDGE rows
    // no edge entry → fetchEdgeDetail returns status 404
    const r = await backfillSkaterEdge(SEASON, { playerIds: ["8480000"] });
    expect(r.failures).toEqual([]);
    expect(r.noEdgeData).toEqual(["8480000"]);
    expect(await countSource(NO_EDGE_DATA_SOURCE)).toBe(1);
    expect(await countSource("edge")).toBe(0);
  });

  it("reports an unreachable skater when neither feed answers", async () => {
    // no landing, edge present-but-facts-null via a non-404 status
    state.edge.set("8480222", { facts: null, raw: null, status: 500 });
    const r = await backfillSkaterEdge(SEASON, { playerIds: ["8480222"] });
    expect(r.failures).toEqual([{ playerId: "8480222", name: null, reason: "unreachable", status: 500 }]);
    expect(r.noEdgeData).toEqual([]);
  });

  it("slices to limit and resumes from nextOffset", async () => {
    for (const id of ["8400001", "8400002", "8400003"]) {
      state.landing.set(id, landingFacts(id));
      state.edge.set(id, edgeFor());
    }
    const first = await backfillSkaterEdge(SEASON, { playerIds: ["8400001", "8400002", "8400003"], limit: 2 });
    expect(first).toMatchObject({ eligible: 3, requested: 2, nextOffset: 2 });
    const second = await backfillSkaterEdge(SEASON, { playerIds: ["8400001", "8400002", "8400003"], offset: 2, limit: 2 });
    expect(second).toMatchObject({ requested: 1, nextOffset: null });
    expect(await countSource("edge")).toBe(3);
  });

  it("adds live-roster skaters via discover", async () => {
    state.rosters.set("EDM", [8478402, 8499001]);
    for (const id of ["8478402", "8499001"]) { state.landing.set(id, landingFacts(id)); state.edge.set(id, edgeFor()); }
    expect(await discoverSkaterIds(["EDM"])).toEqual(["8478402", "8499001"]);
    const r = await backfillSkaterEdge(SEASON, { teams: ["EDM"], discover: true });
    expect(r.eligible).toBe(activeSkaterIdsForTeams(["EDM"]).length + (activeSkaterIdsForTeams(["EDM"]).includes("8499001") ? 0 : 1));
  });
});

describe("skaterEdgeCoverage", () => {
  it("reports never-captured as all unaccounted", async () => {
    const c = await skaterEdgeCoverage(SEASON);
    expect(c.skatersCaptured).toBe(0);
    expect(c.skatersKnown).toBe(activeSkaterIds().length);
    expect(c.skatersUnaccounted).toBe(activeSkaterIds().length);
  });

  it("counts a 404 skater as accounted for, not a gap", async () => {
    const known = activeSkaterIds();
    state.landing.set(known[0], landingFacts("A")); state.edge.set(known[0], edgeFor());
    state.landing.set(known[1], landingFacts("B"));  // 404 edge
    await backfillSkaterEdge(SEASON, { playerIds: [known[0], known[1]] });
    const c = await skaterEdgeCoverage(SEASON);
    expect(c.skatersCaptured).toBe(1);
    expect(c.skatersWithoutEdgeData).toBe(1);
    expect(c.skatersUnaccounted).toBe(known.length - 2);
  });

  it("lets a real edge row supersede an earlier tombstone", async () => {
    const id = activeSkaterIds()[0];
    state.landing.set(id, landingFacts("X"));       // 404 edge first
    await backfillSkaterEdge(SEASON, { playerIds: [id] });
    state.edge.set(id, edgeFor());                   // now tracked
    await backfillSkaterEdge(SEASON, { playerIds: [id] });
    const c = await skaterEdgeCoverage(SEASON);
    expect(c.skatersCaptured).toBe(1);
    expect(c.skatersWithoutEdgeData).toBe(0);
  });
});
