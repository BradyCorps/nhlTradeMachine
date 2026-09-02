import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";

const state = vi.hoisted(() => ({
  dbPlayers: [] as any[],
  tradeBlockRows: [] as any[],
  rosters: {} as Record<string, any>,
  skaterSummaryRows: [] as any[],
  goalieSummaryRows: [] as any[],
  skaterCsvRows: [] as string[],
}));

vi.mock("@/app/lib/db", () => ({
  TEAMS_DB: [
    { id: "WPG", name: "Winnipeg Jets", capSpace: 5, standing: 10, phase: "Contender" },
    { id: "CGY", name: "Calgary Flames", capSpace: 8, standing: 20, phase: "Retooling" },
  ],
}));

vi.mock("@/app/lib/redis", () => ({ redis: null }));

// Contracts come from the DB players table now, not the scrape — keep the mock
// so any residual import resolves, but the read path never calls it.

// Auto-seed must be a no-op in tests (the players table is supplied directly).
vi.mock("@/app/lib/league-seed", () => ({
  seedPlayersTable: vi.fn(async () => ({ inserted: 0, filled: 0, skipped: 0, total: 0 })),
}));

// Table-aware DB mock: returns rows by table identity, so the read path can
// reorder or add selects without breaking a fragile call counter.
function rowsForTable(table: any): any[] {
  switch (getTableName(table)) {
    case "players":     return state.dbPlayers;
    case "trade_block": return state.tradeBlockRows;
    default:            return [];
  }
}

vi.mock("@/app/db/client", () => ({
  db: {
    run: vi.fn(async () => undefined),
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoNothing: vi.fn(async () => undefined),
        onConflictDoUpdate: vi.fn(async () => undefined),
      })),
    })),
    select: vi.fn(() => ({
      from: vi.fn((table: any) => {
        const rows = rowsForTable(table);
        return {
          then: (resolve: (value: any[]) => unknown) => Promise.resolve(resolve(rows)),
          catch: () => Promise.resolve(rows),
          where: vi.fn(async () => rows),
        };
      }),
    })),
  },
}));

vi.mock("@/app/lib/development-sources", () => ({
  buildDevelopmentInputFromNhlTimeline: vi.fn(() => null),
  buildDevelopmentInputFromPlayerPayload: vi.fn(() => null),
  fetchCachedNhlSkaterTimelineRowsForPlayers: vi.fn(async () => new Map()),
}));

vi.mock("@/app/lib/prospect-enrichment", () => ({
  fetchProspectEnrichmentMap: vi.fn(async () => ({})),
}));

vi.mock("fs", () => ({
  default: {
    readFileSync: vi.fn(() => {
      throw new Error("fixtures do not read ignored app/data files");
    }),
  },
  readFileSync: vi.fn(() => {
    throw new Error("fixtures do not read ignored app/data files");
  }),
}));

const rosterPlayer = (id: string, firstName: string, lastName: string, positionCode = "C") => ({
  id,
  firstName: { default: firstName },
  lastName: { default: lastName },
  positionCode,
  birthDate: "2000-01-01",
  headshot: null,
});

const fillerRoster = (teamId: string) => [
  rosterPlayer(`${teamId}-1`, `${teamId} One`, "Filler"),
  rosterPlayer(`${teamId}-2`, `${teamId} Two`, "Filler"),
  rosterPlayer(`${teamId}-3`, `${teamId} Three`, "Filler"),
  rosterPlayer(`${teamId}-4`, `${teamId} Four`, "Filler"),
  rosterPlayer(`${teamId}-5`, `${teamId} Five`, "Filler"),
];

const jsonResponse = (body: unknown) => Response.json(body);

describe("league players route roster assembly", () => {
  beforeEach(() => {
    state.tradeBlockRows = [];
    state.skaterSummaryRows = [];
    state.goalieSummaryRows = [];
    state.dbPlayers = [];
    state.skaterCsvRows = [];
    state.rosters = {
      WPG: { forwards: fillerRoster("WPG"), defensemen: [], goalies: [] },
      CGY: { forwards: fillerRoster("CGY"), defensemen: [], goalies: [] },
    };

    vi.stubGlobal("fetch", vi.fn(async (url: string | URL) => {
      const href = String(url);
      const rosterMatch = href.match(/\/roster\/([A-Z]{3})\//);
      if (rosterMatch) {
        return jsonResponse(state.rosters[rosterMatch[1]] ?? null);
      }
      if (href.includes("/skater/summary")) {
        return jsonResponse({ data: state.skaterSummaryRows });
      }
      if (href.includes("/goalie/summary")) {
        return jsonResponse({ data: state.goalieSummaryRows });
      }
      if (href.includes("/regular/skaters.csv")) {
        const header = "name,situation,I_F_points,I_F_xGoals,games_played,icetime,OnIce_A_xGoals,OffIce_A_xGoals,iceTimeRank,OnIce_F_xGoals,OffIce_F_xGoals,I_F_dZoneShiftStarts,I_F_oZoneShiftStarts,I_F_goals,position,OnIce_A_shotAttempts,OffIce_A_shotAttempts,shotsBlockedByPlayer,OnIce_A_highDangerxGoals";
        return new Response([header, ...state.skaterCsvRows].join("\n") + "\n");
      }
      if (href.includes("/regular/goalies.csv")) {
        return new Response("name,situation,games_played,xGoals,goals,ongoal,team,icetime\n");
      }
      return jsonResponse({ data: [] });
    }));
  });

  it("dedupes live roster duplicates, augments live players from DB rows, and attaches matching stats", async () => {
    state.rosters.WPG.forwards = [
      rosterPlayer("100", "Live", "Duplicate"),
      rosterPlayer("200", "DB", "Prospect"),
      rosterPlayer("300", "Right", "Stats", "L"),
      ...fillerRoster("WPG"),
    ];
    state.rosters.CGY.forwards = [
      rosterPlayer("100", "Live", "Duplicate"),
      ...fillerRoster("CGY"),
    ];
    state.dbPlayers = [{
      id: "200",
      name: "DB Prospect",
      position: "C",
      teamId: "WPG",
      age: 19,
      capHit: 0.95,
      yearsRemaining: 3,
      hasNMC: false,
      hasNTC: false,
      hasNmc: false,
      hasNtc: false,
      draftYear: 2026,
      draftOverall: 12,
      prospectPtsPace: 32,
      retired: false,
    }];
    state.skaterSummaryRows = [{
      playerId: 300,
      skaterFullName: "Right Stats",
      teamAbbrevs: "WPG",
      positionCode: "L",
      gamesPlayed: 10,
      goals: 5,
      assists: 5,
      plusMinus: 1,
      timeOnIcePerGame: 900,
    }];

    const { GET } = await import("../app/api/league/players/route");
    const response = await GET();
    const body = await response.json();

    const liveDuplicates = body.players.filter((p: any) => p.name === "Live Duplicate");
    expect(liveDuplicates).toHaveLength(1);

    const dbProspects = body.players.filter((p: any) => p.name === "DB Prospect");
    expect(dbProspects).toHaveLength(1);
    expect(dbProspects[0]).toMatchObject({
      id: "200",
      teamId: "WPG",
      draftYear: 2026,
      draftOverall: 12,
      prospectPtsPace: 32,
    });

    const rightStats = body.players.find((p: any) => p.name === "Right Stats");
    expect(rightStats).toMatchObject({
      id: "300",
      teamId: "WPG",
      games: 10,
      hasLiveStats: true,
    });
    expect(rightStats.ptsPace).toBe(82);
    expect(rightStats.avgTOI).toBe(15);
  });

  it("resolves free-agent status from the DB contract row (expiring UFA, no fake ELC year)", async () => {
    state.rosters.WPG.forwards = [
      rosterPlayer("891", "Alex", "Tuch", "R"),
      ...fillerRoster("WPG"),
    ];
    // The players table is the single source of truth: a UFA row expiring this
    // offseason surfaces as a pending free agent with zeroed cap/term.
    state.dbPlayers = [{
      id: "tuch", name: "Alex Tuch", position: "RW", teamId: "WPG", age: 30,
      capHit: 4.75, yearsRemaining: 1, hasNmc: false, hasNtc: false,
      expiryStatus: "UFA", expiryYear: 2026, excludeFromRoster: false,
      retired: false, source: "seed",
    }];

    const { GET } = await import("../app/api/league/players/route");
    const response = await GET();
    const body = await response.json();

    const tuch = body.players.find((p: any) => p.id === "891");
    expect(tuch).toMatchObject({
      id: "891",
      name: "Alex Tuch",
      contractStatus: "UFA",
      expiresThisOffseason: true,
      expiryYear: 2026,
      capHit: 0,
      yearsRemaining: 0,
    });
  });

  it("pulls excludeFromRoster players off the roster entirely", async () => {
    state.rosters.WPG.forwards = [
      rosterPlayer("891", "Alex", "Tuch", "R"),
      ...fillerRoster("WPG"),
    ];
    state.dbPlayers = [{
      id: "891", name: "Alex Tuch", position: "RW", teamId: "WPG", age: 30,
      capHit: 4.75, yearsRemaining: 1, hasNmc: false, hasNtc: false,
      expiryStatus: null, expiryYear: null, excludeFromRoster: true,
      retired: false, source: "editor",
    }];

    const { GET } = await import("../app/api/league/players/route");
    const response = await GET();
    const body = await response.json();

    expect(body.players.find((p: any) => p.name === "Alex Tuch")).toBeUndefined();
  });

  it("computes NAV-02's fitted-model inputs for a defenseman with >= 20 games from the MoneyPuck CSV", async () => {
    state.rosters.WPG.defensemen = [rosterPlayer("400", "Test", "Defenseman", "D")];
    // 25 GP, 30000s icetime (20 min/gm). onCA=500/8.3333h=60, offCA=300/16.6667h=18
    // -> corsiAgainstRel=42. blocksPer82=(50/25)*82=164. highDangerAgainstRate=10/8.3333h=1.2.
    state.skaterCsvRows = [
      "Test Defenseman,all,20,5,25,30000,50,30,100,60,40,300,200,5,D,500,300,50,10",
    ];

    const { GET } = await import("../app/api/league/players/route");
    const response = await GET();
    const body = await response.json();

    const player = body.players.find((p: any) => p.name === "Test Defenseman");
    expect(player).toBeDefined();
    expect(player.corsiAgainstRel).toBeCloseTo(42, 5);
    expect(player.blocksPer82).toBeCloseTo(164, 5);
    expect(player.highDangerAgainstRate).toBeCloseTo(1.2, 5);
  });

  it("leaves NAV-02's fitted-model inputs null for a defenseman under the 20-game validated minimum", async () => {
    state.rosters.WPG.defensemen = [rosterPlayer("401", "Small", "Sample", "D")];
    state.skaterCsvRows = [
      "Small Sample,all,5,1,8,9600,50,30,20,60,40,100,80,1,D,500,300,50,10",
    ];

    const { GET } = await import("../app/api/league/players/route");
    const response = await GET();
    const body = await response.json();

    const player = body.players.find((p: any) => p.name === "Small Sample");
    expect(player).toBeDefined();
    expect(player.corsiAgainstRel).toBeNull();
    expect(player.blocksPer82).toBeNull();
    expect(player.highDangerAgainstRate).toBeNull();
  });
});
