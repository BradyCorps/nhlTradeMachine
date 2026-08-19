// ── goalie-edge-backfill.test.ts ─────────────────────────────────
//
// The goalie EDGE pipeline shipped able to capture and unable to report:
// it ran nightly for weeks, wrote nothing, and the only visible symptom
// was an empty panel on the player page. So the assertions here are less
// about the happy path than about the run being legible afterwards —
// what stored, what was already there, what could not be reached, and
// what stored but would not parse (the case that looks healthy in a row
// count and still renders nothing).
//
// The database is a real libsql file rather than a mock, because the
// stored/skipped distinction is decided by SQLite's conflict clause and
// a hand-written fake would just assert the fake.

import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/app/db/schema";

const state = vi.hoisted(() => ({
  db: null as any,
  /** playerId → payload, or a bare status for a response with no body. */
  feed: new Map<string, unknown | { status: number }>(),
  rosterGoalies: new Map<string, number[]>(),
}));

vi.mock("@/app/db/client", () => ({
  db: new Proxy({}, {
    get(_target, property) {
      const value = state.db[property];
      return typeof value === "function" ? value.bind(state.db) : value;
    },
  }),
}));

vi.mock("@/app/db/ensure-schema", () => ({
  ensureNhlSnapshotTable: vi.fn(async () => undefined),
}));

vi.mock("@/app/lib/nhl-feed-capture", () => ({
  rosterGoalieIds: vi.fn(async (team: string) => state.rosterGoalies.get(team.toUpperCase()) ?? []),
}));

// Only the network call is stubbed — `parseGoalieEdge` and
// `mapWithConcurrency` stay real so a parser change breaks this too.
vi.mock("@/app/lib/nhl-player-feed", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/nhl-player-feed")>();
  return {
    ...actual,
    fetchGoalieEdgeDetail: vi.fn(async (playerId: string | number, seasonId: number) => {
      const entry = state.feed.get(String(playerId));
      // A goalie nobody stubbed is one the NHL has no rows for: 404, the
      // ordinary case for most of a depth chart.
      if (entry == null) return { facts: null, raw: null, status: 404 };
      if (typeof entry === "object" && entry !== null && "status" in entry && Object.keys(entry).length === 1) {
        return { facts: null, raw: null, status: (entry as { status: number }).status };
      }
      return { facts: actual.parseGoalieEdge(entry, seasonId), raw: entry, status: 200 };
    }),
  };
});

const {
  NO_SEASON_DATA_SOURCE,
  captureGoalieEdgeDetail,
  resolveGoalieIds,
  goalieEdgeCoverage,
  discoverGoalieIds,
  latestGoalieEdgeDetailMap,
} = await import("@/app/lib/goalie-edge");
const { activeGoalieIds, activeGoalieIdsForTeams } = await import("@/app/lib/nhl-active-players");

const SEASON = "20252026";

/** A payload the real parser reads — trimmed from the live Sorokin response. */
const payloadFor = (playerId: number) => ({
  player: { id: playerId, gamesPlayed: 40, wins: 20, losses: 15, overtimeLosses: 5, savePctg: 0.912 },
  stats: { goalsAgainstAvg: { value: 2.61, percentile: 0.7, leagueAvg: 2.99 } },
  shotLocationSummary: [
    { locationCode: "all", goalsAgainst: 100, saves: 1000, savePctg: 0.909, savePctgLeagueAvg: 0.895 },
    { locationCode: "high", goalsAgainst: 50, saves: 300, savePctg: 0.857, savePctgLeagueAvg: 0.811 },
  ],
  shotLocationDetails: [{ area: "Slot", saves: 300, savePctg: 0.857 }],
});

let client: ReturnType<typeof createClient>;
let databaseDirectory: string;

const countRows = async () =>
  Number((await client.execute("SELECT COUNT(*) AS n FROM nhl_snapshots")).rows[0].n);

beforeEach(async () => {
  databaseDirectory = await mkdtemp(join(tmpdir(), "goalie-edge-"));
  client = createClient({ url: `file:${join(databaseDirectory, "test.db")}` });
  await client.execute(`CREATE TABLE nhl_snapshots (
    id TEXT PRIMARY KEY,
    player_id INTEGER NOT NULL,
    name TEXT,
    season INTEGER NOT NULL,
    source TEXT NOT NULL,
    captured_at INTEGER NOT NULL,
    games_played INTEGER,
    goals INTEGER,
    assists INTEGER,
    points INTEGER,
    shooting_pctg REAL,
    oz_pct REAL,
    hd_shots INTEGER,
    hd_shooting_pct REAL,
    hd_finishing_delta REAL,
    payload TEXT NOT NULL
  )`);
  state.db = drizzle(client, { schema });
  state.feed = new Map();
  state.rosterGoalies = new Map();
});

afterEach(async () => {
  client.close();
  await rm(databaseDirectory, { recursive: true, force: true });
  vi.clearAllMocks();
});

describe("resolveGoalieIds", () => {
  it("defaults to every goalie in the bundled snapshot", () => {
    const { ids, eligible, nextOffset } = resolveGoalieIds({});
    expect(eligible).toBe(activeGoalieIds().length);
    expect(eligible).toBeGreaterThan(100);   // the league carries ~144
    expect(ids).toHaveLength(eligible);
    expect(nextOffset).toBeNull();           // an unlimited run finishes the list
  });

  it("scopes to teams and honours explicit ids over both", () => {
    expect(resolveGoalieIds({ teams: ["NYI"] }).ids.sort())
      .toEqual([...activeGoalieIdsForTeams(["NYI"])].sort());
    expect(resolveGoalieIds({ playerIds: [8478009, "8480313"], teams: ["NYI"] }).ids)
      .toEqual(["8478009", "8480313"]);
  });

  it("dedupes across the snapshot and discovery, and sorts for a stable slice", () => {
    const { ids, eligible } = resolveGoalieIds({ playerIds: ["8478009", 8478009, "8400002"] }, ["8478009", 8400001]);
    expect(ids).toEqual(["8400001", "8400002", "8478009"]);
    expect(eligible).toBe(3);
  });

  // The admin route slices because a 60s invocation cannot promise 144
  // EDGE requests; the walk has to cover the list exactly once.
  it("walks the whole list through offset/limit without gaps or repeats", () => {
    const all = resolveGoalieIds({}).ids;
    const seen: string[] = [];
    let offset: number | null = 0;
    while (offset != null) {
      const page = resolveGoalieIds({ offset, limit: 40 });
      seen.push(...page.ids);
      offset = page.nextOffset;
    }
    expect(seen).toEqual(all);
  });

  it("reports no next offset when the final page lands exactly on the end", () => {
    const eligible = resolveGoalieIds({}).eligible;
    expect(resolveGoalieIds({ offset: 0, limit: eligible }).nextOffset).toBeNull();
    expect(resolveGoalieIds({ offset: eligible, limit: 40 }).ids).toEqual([]);
    expect(resolveGoalieIds({ offset: eligible, limit: 40 }).nextOffset).toBeNull();
  });

  it("treats a negative offset and a fractional limit as a caller typo, not a crash", () => {
    expect(resolveGoalieIds({ offset: -5, limit: 2.7 }).ids).toHaveLength(2);
    expect(resolveGoalieIds({ limit: 0 }).ids).toEqual([]);
  });
});

describe("captureGoalieEdgeDetail", () => {
  it("stores one row per goalie and reports what parsed", async () => {
    state.feed.set("8478009", payloadFor(8478009));
    state.feed.set("8480313", payloadFor(8480313));

    const result = await captureGoalieEdgeDetail(SEASON, { playerIds: ["8478009", "8480313"] });

    expect(result).toMatchObject({
      eligible: 2, requested: 2, stored: 2, skipped: 0, parsed: 2, nextOffset: null,
    });
    expect(result.failures).toEqual([]);
    expect(result.unparsed).toEqual([]);
    expect(await countRows()).toBe(2);

    const row = (await client.execute("SELECT * FROM nhl_snapshots WHERE player_id = 8478009")).rows[0];
    expect(row.source).toBe("goalie-detail");
    expect(row.season).toBe(20252026);
    expect(row.games_played).toBe(40);
    expect(row.name).toBe("Ilya Sorokin");            // named from the bundled snapshot
    expect(JSON.parse(String(row.payload)).player.id).toBe(8478009);
  });

  // Re-running a backfill is the normal case — an operator presses the
  // button again after fixing one failure — and must not look like 144
  // fresh captures.
  it("counts a same-day re-run as skipped, not stored", async () => {
    state.feed.set("8478009", payloadFor(8478009));
    await captureGoalieEdgeDetail(SEASON, { playerIds: ["8478009"] });

    const second = await captureGoalieEdgeDetail(SEASON, { playerIds: ["8478009"] });
    expect(second).toMatchObject({ stored: 0, skipped: 1, parsed: 1 });
    expect(await countRows()).toBe(1);
  });

  it("names an unreachable goalie instead of returning a bare id", async () => {
    state.feed.set("8478009", payloadFor(8478009));
    state.feed.set("8480313", { status: 503 });

    const result = await captureGoalieEdgeDetail(SEASON, { playerIds: ["8478009", "8480313"] });

    expect(result.stored).toBe(1);
    expect(result.failures).toEqual([
      { playerId: "8480313", name: "Logan Thompson", reason: "unreachable", status: 503 },
    ]);
    expect(result.noSeasonData).toEqual([]);
    expect(await countRows()).toBe(1);
  });

  // The first real backfill reported 58 "failures", every one of them a
  // depth goalie the NHL simply has no EDGE rows for. A 404 is an answer,
  // not a fault, and burying the four real problems under it defeats the
  // point of reporting failures at all.
  it("records a 404 as no-season-data rather than as a failure", async () => {
    state.feed.set("8478009", payloadFor(8478009));       // dressed this season
    state.feed.set("8480313", { status: 404 });           // has not

    const result = await captureGoalieEdgeDetail(SEASON, { playerIds: ["8478009", "8480313"] });

    expect(result.failures).toEqual([]);
    expect(result.noSeasonData).toEqual(["8480313"]);
    expect(result.stored).toBe(1);

    const tombstone = (await client.execute(
      `SELECT * FROM nhl_snapshots WHERE source = '${NO_SEASON_DATA_SOURCE}'`)).rows;
    expect(tombstone).toHaveLength(1);
    expect(tombstone[0].player_id).toBe(8480313);
    expect(tombstone[0].name).toBe("Logan Thompson");
  });

  // A nightly cron across a season would otherwise write ten thousand
  // rows saying nothing happened.
  it("keeps one no-season-data row per goalie per season, refreshing its timestamp", async () => {
    state.feed.set("8480313", { status: 404 });
    await captureGoalieEdgeDetail(SEASON, { playerIds: ["8480313"] });
    const first = (await client.execute("SELECT captured_at FROM nhl_snapshots")).rows[0].captured_at;

    await new Promise(r => setTimeout(r, 5));
    await captureGoalieEdgeDetail(SEASON, { playerIds: ["8480313"] });

    const rows = (await client.execute("SELECT captured_at FROM nhl_snapshots")).rows;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].captured_at)).toBeGreaterThan(Number(first));
  });

  // The tombstone must never reach the dossier panel as if it were data.
  it("keeps no-season-data rows out of the detail read path", async () => {
    state.feed.set("8480313", { status: 404 });
    await captureGoalieEdgeDetail(SEASON, { playerIds: ["8480313"] });
    expect((await latestGoalieEdgeDetailMap(SEASON)).size).toBe(0);
  });

  // The row exists, so coverage counts it and the dossier panel still
  // renders nothing — the one failure a row count cannot show.
  it("stores an unparseable payload and flags it separately", async () => {
    state.feed.set("8478009", { unexpected: "shape" });

    const result = await captureGoalieEdgeDetail(SEASON, { playerIds: ["8478009"] });

    expect(result).toMatchObject({ stored: 1, parsed: 0, skipped: 0 });
    expect(result.unparsed).toEqual(["8478009"]);
    expect(result.failures).toEqual([]);
    expect(await countRows()).toBe(1);
  });

  it("slices to `limit` and hands back where to resume", async () => {
    for (const id of ["8400001", "8400002", "8400003"]) state.feed.set(id, payloadFor(Number(id)));

    const first = await captureGoalieEdgeDetail(SEASON, { playerIds: ["8400001", "8400002", "8400003"], limit: 2 });
    expect(first).toMatchObject({ eligible: 3, requested: 2, stored: 2, nextOffset: 2 });

    const second = await captureGoalieEdgeDetail(SEASON, {
      playerIds: ["8400001", "8400002", "8400003"], offset: first.nextOffset!, limit: 2,
    });
    expect(second).toMatchObject({ requested: 1, stored: 1, nextOffset: null });
    expect(await countRows()).toBe(3);
  });

  it("adds live-roster goalies the bundled snapshot predates", async () => {
    state.rosterGoalies.set("NYI", [8478009, 8499999]);   // 8499999 = a call-up
    for (const id of ["8478009", "8499999"]) state.feed.set(id, payloadFor(Number(id)));

    const discovered = await discoverGoalieIds(["NYI"]);
    expect(discovered).toEqual(["8478009", "8499999"]);

    const result = await captureGoalieEdgeDetail(SEASON, { teams: ["NYI"], discover: true });
    expect(result.eligible).toBe(activeGoalieIdsForTeams(["NYI"]).length + 1);
    const captured = (await client.execute("SELECT player_id FROM nhl_snapshots")).rows.map(r => Number(r.player_id));
    expect(captured).toContain(8499999);
  });

  it("degrades to the snapshot when roster discovery fails", async () => {
    const result = await captureGoalieEdgeDetail(SEASON, { teams: ["NYI"], discover: true });
    expect(result.eligible).toBe(activeGoalieIdsForTeams(["NYI"]).length);
  });
});

describe("goalieEdgeCoverage", () => {
  it("reports never-captured as zero rather than as an error", async () => {
    const coverage = await goalieEdgeCoverage(SEASON);
    expect(coverage.goaliesCaptured).toBe(0);
    expect(coverage.rows).toBe(0);
    expect(coverage.lastCapturedAt).toBeNull();
    expect(coverage.goaliesKnown).toBe(activeGoalieIds().length);
    // Nothing has been asked yet, so every known goalie is outstanding.
    expect(coverage.goaliesUnaccounted).toBe(activeGoalieIds().length);
  });

  // Captured can never reach 144: most of the snapshot is juniors and
  // AHL goalies with no NHL games. A full backfill is done when nothing
  // is unaccounted for, not when captured hits the roster size.
  it("counts a 404 goalie as accounted for, not as a gap", async () => {
    const known = activeGoalieIds();
    state.feed.set(known[0], payloadFor(Number(known[0])));
    state.feed.set(known[1], { status: 404 });

    await captureGoalieEdgeDetail(SEASON, { playerIds: [known[0], known[1]] });

    const coverage = await goalieEdgeCoverage(SEASON);
    expect(coverage.goaliesCaptured).toBe(1);
    expect(coverage.goaliesWithoutSeasonData).toBe(1);
    expect(coverage.goaliesUnaccounted).toBe(known.length - 2);
  });

  it("lets a real row supersede an earlier no-season-data row", async () => {
    const id = activeGoalieIds()[0];
    state.feed.set(id, { status: 404 });                  // has not dressed yet
    await captureGoalieEdgeDetail(SEASON, { playerIds: [id] });

    state.feed.set(id, payloadFor(Number(id)));           // debuts
    await captureGoalieEdgeDetail(SEASON, { playerIds: [id] });

    const coverage = await goalieEdgeCoverage(SEASON);
    expect(coverage.goaliesCaptured).toBe(1);
    expect(coverage.goaliesWithoutSeasonData).toBe(0);    // not counted twice
  });

  it("counts distinct goalies, not rows, and ignores other sources", async () => {
    state.feed.set("8478009", payloadFor(8478009));
    await captureGoalieEdgeDetail(SEASON, { playerIds: ["8478009"] });
    // A second day for the same goalie, plus an unrelated skater EDGE row.
    await client.execute(`INSERT INTO nhl_snapshots (id, player_id, season, source, captured_at, payload)
      VALUES ('8478009-20252026-goalie-detail-20250101', 8478009, 20252026, 'goalie-detail', 1, '{}'),
             ('8478402-20252026-edge-20250101', 8478402, 20252026, 'edge', 1, '{}')`);

    const coverage = await goalieEdgeCoverage(SEASON);
    expect(coverage.goaliesCaptured).toBe(1);
    expect(coverage.rows).toBe(2);
    expect(coverage.lastCapturedAt).not.toBeNull();
  });

  it("does not count another season's rows", async () => {
    state.feed.set("8478009", payloadFor(8478009));
    await captureGoalieEdgeDetail("20242025", { playerIds: ["8478009"] });
    expect((await goalieEdgeCoverage(SEASON)).goaliesCaptured).toBe(0);
    expect((await goalieEdgeCoverage("20242025")).goaliesCaptured).toBe(1);
  });
});
