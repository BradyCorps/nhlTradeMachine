import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  selectCall: 0,
  dbPlayers: [] as any[],
  tradeBlockRows: [] as any[],
  rosters: {} as Record<string, any>,
  skaterSummaryRows: [] as any[],
  goalieSummaryRows: [] as any[],
}));

vi.mock("@/app/lib/db", () => ({
  TEAMS_DB: [
    { id: "WPG", name: "Winnipeg Jets", capSpace: 5, standing: 10, phase: "Contender" },
    { id: "CGY", name: "Calgary Flames", capSpace: 8, standing: 20, phase: "Retooling" },
  ],
}));

vi.mock("@/app/lib/redis", () => ({ redis: null }));

vi.mock("@/app/services/scraper", () => ({
  scrapeCapWages: vi.fn(async () => ({})),
}));

vi.mock("@/app/db/client", () => ({
  db: {
    run: vi.fn(async () => undefined),
    select: vi.fn(() => ({
      from: vi.fn(async () => {
        state.selectCall += 1;
        return state.selectCall === 3 ? state.tradeBlockRows : state.dbPlayers;
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
    state.selectCall = 0;
    state.tradeBlockRows = [];
    state.skaterSummaryRows = [];
    state.goalieSummaryRows = [];
    state.dbPlayers = [];
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
        return new Response("name,situation,I_F_points,I_F_xGoals,games_played,icetime,OnIce_A_xGoals,OffIce_A_xGoals,iceTimeRank,OnIce_F_xGoals,OffIce_F_xGoals,I_F_dZoneShiftStarts,I_F_oZoneShiftStarts,I_F_goals,position\n");
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
});
