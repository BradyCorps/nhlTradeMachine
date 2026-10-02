import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/app/db/schema";
import { parseObservedSelection, observedCacheKey, observedQuery, observedSnapshotSource, type ObservedSelection } from "@/app/lib/observed-season";
import { parseLanding, fetchPlayerLanding } from "@/app/lib/nhl-player-feed";

const state = vi.hoisted(() => ({ db: null as any, cache: new Map<string, unknown>() }));
vi.mock("@/app/db/client", () => ({ db: new Proxy({}, {
  get(_target, property) { const value = state.db[property]; return typeof value === "function" ? value.bind(state.db) : value; },
}) }));
vi.mock("@/app/lib/swr-store", () => ({ swrStore: {
  get: async (key: string) => state.cache.get(key) ?? null,
  setex: async (key: string, _ttl: number, value: unknown) => state.cache.set(key, value),
} }));
const { readObservedPlayers, readObservedSummary, validateSummary, statsFromSummary } = await import("@/app/lib/observed-stats.server");
const { readObservedEdge, edgeMatches } = await import("@/app/lib/observed-edge.server");
const current: ObservedSelection = { season: "20262027", gameType: 2 };
const history: ObservedSelection = { season: "20252026", gameType: 2 };
const playoffs: ObservedSelection = { season: "20252026", gameType: 3 };
let client: ReturnType<typeof createClient>;
let dir: string;
const edge = (selection: ObservedSelection, games: number) => ({
  player: { id: 8478402, gamesPlayed: games, headshot: `https://assets.nhle.com/mugs/nhl/${selection.season}/EDM/8478402.png` },
  seasonsWithEdgeStats: [{ id: Number(selection.season), gameTypes: [selection.gameType] }],
  sogDetails: [{ area: "Crease", shots: games }],
});
beforeEach(async () => {
  state.cache.clear();
  dir = await mkdtemp(join(tmpdir(), "observed-season-"));
  client = createClient({ url: `file:${join(dir, "isolated.db")}` });
  await client.execute("CREATE TABLE nhl_snapshots (id TEXT PRIMARY KEY, player_id INTEGER, season INTEGER, source TEXT, captured_at INTEGER, payload TEXT)");
  state.db = drizzle(client, { schema });
});
afterEach(async () => { client.close(); await rm(dir, { recursive: true, force: true }); vi.unstubAllGlobals(); });

describe("observed season identity", () => {
  it("defaults to current regular season and rejects invalid identities", () => {
    expect(parseObservedSelection(new URLSearchParams())).toEqual(current);
    expect(parseObservedSelection(new URLSearchParams(observedQuery(playoffs)))).toEqual(playoffs);
    for (const query of ["season=20242025", "gameType=1", "gameType=02", "season="]) {
      expect(() => parseObservedSelection(new URLSearchParams(query))).toThrow();
    }
    expect(() => parseObservedSelection(new URLSearchParams("season=20262027&season=20252026"))).toThrow();
    expect(observedSnapshotSource("edge", 2)).toBe("edge");
    expect(observedSnapshotSource("edge", 3)).toBe("edge:3");
  });
  it("rejects wrong-season, truncated, malformed and wrong-competition summaries", () => {
    for (const raw of [null, { data: [], total: 1 }, { data: [{ seasonId: 20252026, gamesPlayed: 82 }], total: 1 },
      { data: [{ seasonId: 20262027, gamesPlayed: 1, gameTypeId: 3 }], total: 1 }]) {
      expect(validateSummary(raw, current)).toBeNull();
    }
  });
  it("refuses missing and duplicate player identities", () => {
    expect(validateSummary({ total: 1, data: [{ seasonId: 20262027, gamesPlayed: 1 }] }, current, "skater")).toBeNull();
    const row = { seasonId: 20262027, gamesPlayed: 1, playerId: 1 };
    expect(validateSummary({ total: 2, data: [row, row] }, current, "skater")).toBeNull();
  });
  it("distinguishes explicit zero games from missing and unavailable coverage", () => {
    const summary = { selection: current, coverage: "available" as const };
    expect(statsFromSummary({ gamesPlayed: 0, points: 0 }, summary)).toMatchObject({ coverage: "zero-games", games: 0, points: 0 });
    expect(statsFromSummary(undefined, summary)).toMatchObject({ coverage: "missing", games: null, points: null });
    expect(statsFromSummary(undefined, { ...summary, coverage: "unavailable" })).toMatchObject({ coverage: "unavailable", games: null });
  });
  it("switches real requests and caches independently across regular seasons and playoffs", async () => {
    const requests: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      requests.push(url);
      const expression = new URL(url).searchParams.get("cayenneExp")!;
      const season = Number(expression.match(/seasonId=(\d+)/)![1]);
      const gameType = Number(expression.match(/gameTypeId=(\d+)/)![1]);
      const goalie = url.includes("/goalie/");
      return Response.json({ total: 1, data: [{ playerId: goalie ? 2 : 1, seasonId: season, gameTypeId: gameType,
        gamesPlayed: season === 20262027 ? 2 : gameType === 3 ? 6 : 82, points: season === 20262027 ? 7 : gameType === 3 ? 6 : 138 }] });
    }));
    const results = await Promise.all([readObservedPlayers(current), readObservedPlayers(history), readObservedPlayers(playoffs)]);
    expect(results.map(result => result.byId.get("1")?.points)).toEqual([7, 138, 6]);
    expect((await readObservedPlayers(current)).byId.get("1")?.points).toBe(7);
    expect(requests).toHaveLength(6);
    expect(state.cache.size).toBe(6);
    expect(await client.execute("SELECT count(*) AS n FROM nhl_snapshots")).toMatchObject({ rows: [{ n: 0 }] });
  });
  it("fails closed on a poisoned cache or upstream outage without another-season fallback", async () => {
    state.cache.set(observedCacheKey(current, "skater"), { builtAt: Date.now(), value: { selection: history, rows: [{ points: 138 }] } });
    expect(await readObservedSummary(current, "skater")).toMatchObject({ coverage: "unavailable", rows: [] });
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 503 })));
    expect(await readObservedSummary(current, "goalie")).toMatchObject({ coverage: "unavailable", rows: [] });
    expect(state.cache.has(observedCacheKey(current, "goalie"))).toBe(false);
  });
  it("reads only the selected snapshot and never writes historical records", async () => {
    for (const selection of [history, playoffs]) await client.execute({
      sql: "INSERT INTO nhl_snapshots VALUES (?, ?, ?, ?, ?, ?)",
      args: [observedQuery(selection), 8478402, Number(selection.season), observedSnapshotSource("edge", selection.gameType), 100, JSON.stringify(edge(selection, selection.gameType === 2 ? 82 : 6))],
    });
    const before = (await client.execute("SELECT * FROM nhl_snapshots ORDER BY id")).rows;
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(edge(current, 2))));
    expect((await readObservedEdge(8478402, history)).raw?.player.gamesPlayed).toBe(82);
    expect((await readObservedEdge(8478402, playoffs)).raw?.player.gamesPlayed).toBe(6);
    expect((await readObservedEdge(8478402, current)).raw?.player.gamesPlayed).toBe(2);
    expect((await readObservedEdge(8478402, history)).raw?.player.gamesPlayed).toBe(82);
    expect(fetch).toHaveBeenCalledTimes(1);
    expect((await client.execute("SELECT * FROM nhl_snapshots ORDER BY id")).rows).toEqual(before);
  });
  it("rejects EDGE substitution, missing competition and mismatched players", () => {
    expect(edgeMatches(edge(history, 82), 8478402, current)).toBe(false);
    expect(edgeMatches(edge(current, 2), 8478402, { ...current, gameType: 3 })).toBe(false);
    expect(edgeMatches(edge(current, 2), 1, current)).toBe(false);
  });
  it("does not interpret absent EDGE records as zero games", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(null, { status: 404 })));
    expect(await readObservedEdge(8478402, { ...current, gameType: 3 })).toMatchObject({ raw: null, coverage: "missing" });
  });
});

describe("landing capture provenance", () => {
  const raw = { playerId: 1, birthDate: "2000-01-01", position: "C",
    featuredStats: { season: 20262027, regularSeason: { subSeason: { gamesPlayed: 2, goals: 1, assists: 6, points: 7 } } },
    seasonTotals: [{ season: 20252026, gameTypeId: 2, leagueAbbrev: "NHL", gamesPlayed: 82, goals: 48, assists: 90, points: 138 },
      { season: 20252026, gameTypeId: 3, leagueAbbrev: "NHL", gamesPlayed: 6, points: 6 }] };
  it("extracts the exact historical season and competition from current landing JSON", () => {
    expect(parseLanding(raw, 20252026)).toMatchObject({ season: 20252026, gamesPlayed: 82, points: 138 });
    expect(parseLanding(raw, 20252026, 3)).toMatchObject({ season: 20252026, gamesPlayed: 6, points: 6 });
    expect(parseLanding(raw, 20262027)).toMatchObject({ season: 20262027, gamesPlayed: 2, points: 7 });
  });
  it("passes the requested season into the fetch parser and refuses missing lines", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json(raw)));
    expect((await fetchPlayerLanding(1, 20252026)).facts?.points).toBe(138);
    expect(parseLanding(raw, 20242025)).toBeNull();
    expect(parseLanding({ ...raw, featuredStats: { season: 20262027 } }, 20262027)).toBeNull();
    expect(parseLanding({ ...raw, featuredStats: { season: 20262027, regularSeason: { subSeason: { gamesPlayed: 0, points: 0 } } } }, 20262027)?.gamesPlayed).toBe(0);
  });
  it("refuses ambiguous traded-player lines without an aggregate", () => {
    expect(parseLanding({ ...raw, seasonTotals: [raw.seasonTotals[0], { ...raw.seasonTotals[0], teamAbbrev: "TOR" }] }, 20252026)).toBeNull();
  });
});
