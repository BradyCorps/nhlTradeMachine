import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST as simulatePOST } from "../app/api/simulate/route";
import { POST as claudePOST } from "../app/api/claude/route";
import { projectTopScorer, scenarioSeed } from "../app/lib/sim-engine";
import { SEASON } from "../app/lib/season-config";

const teamIds = [
  "BOS","BUF","DET","FLA","MTL","OTT","TBL","TOR",
  "CAR","CBJ","NJD","NYI","NYR","PHI","PIT","WSH",
  "UTA","CHI","COL","DAL","MIN","NSH","STL","WPG",
  "ANA","CGY","EDM","LAK","SEA","SJS","VAN","VGK",
];

const teams = teamIds.map((id, i) => ({
  id,
  name: id,
  phase: i < 8 ? "Contender" : i < 16 ? "Bubble" : i < 24 ? "Retooling" : "Rebuilding",
  standing: i + 1,
  capSpace: 8,
}));

const player = (id: string, name: string, teamId: string, ptsPace: number, position = "W") => ({
  id,
  name,
  teamId,
  position,
  age: 28,
  ptsPace,
  baselinePtsPace: ptsPace,
  xGPace: 20,
  avgTOI: 18,
  capHit: 5,
  yearsRemaining: 3,
  games: 82,
});

describe("simulate route", () => {
  it("selects the actual projected top scorer after injury variance", () => {
    const scheifele = player("scheifele", "Mark Scheifele", "WPG", 95, "C");
    const connor = player("connor", "Kyle Connor", "WPG", 92, "W");

    const top = projectTopScorer([scheifele, connor], "WPG", 18);

    expect(top?.name).toBe("Kyle Connor");
    expect(top?.projectedPts).toBeGreaterThan(80);
  });

  it("returns locked traded-player outcomes for moved players", async () => {
    const connor = player("connor", "Kyle Connor", "WPG", 92, "W");
    const andersson = player("andersson", "Rasmus Andersson", "CGY", 45, "D");
    const depth = teamIds.flatMap((teamId) => [
      player(`${teamId}-f1`, `${teamId} Forward`, teamId, 42, "C"),
      player(`${teamId}-d1`, `${teamId} Defender`, teamId, 25, "D"),
      {
        ...player(`${teamId}-g1`, `${teamId} Goalie`, teamId, 0, "G"),
        gsax: 0,
        gamesStarted: 45,
        savePct: 0.905,
      },
    ]);

    const req = new Request("http://localhost/api/simulate", {
      method: "POST",
      body: JSON.stringify({
        homeTeamId: "WPG",
        partnerTeamId: "CGY",
        teams,
        players: [...depth, connor, andersson],
        seed: 18,
        trades: [{
          homeTeamId: "WPG",
          partnerTeamId: "CGY",
          outgoing: [connor],
          incoming: [andersson],
        }],
      }),
    });

    const res = await simulatePOST(req as any);
    const body = await res.json();

    expect(body.season).toBe("2026-27");
    expect(body.simulationMode).toBe(SEASON.simulationMode);
    expect(body.latestCompleted).toEqual(SEASON.latestCompleted);
    expect(body.tradedPlayerOutcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerId: "connor",
          name: "Kyle Connor",
          oldTeamId: "WPG",
          newTeamId: "CGY",
          projectedPts: expect.any(Number),
        }),
      ])
    );
  });

  it("fields best lines by default: depth beyond the top 12F is benched with no lineup set", async () => {
    const wpg = [
      player("wpg-star", "Star", "WPG", 95, "C"),
      ...Array.from({ length: 11 }, (_, i) => player(`wpg-f${i}`, `Forward ${i}`, "WPG", 40 - i, i % 2 ? "W" : "C")),
      player("wpg-13th", "Thirteenth Forward", "WPG", 6, "W"), // worst F → benched by best-lines default
      ...Array.from({ length: 6 }, (_, i) => player(`wpg-d${i}`, `Defender ${i}`, "WPG", 30 - i, "D")),
      { ...player("WPG-g1", "WPG Goalie", "WPG", 0, "G"), gsax: 0, gamesStarted: 45, savePct: 0.905 },
    ];
    const depth = teamIds.flatMap((teamId) => teamId === "WPG" ? [] : [
      player(`${teamId}-f1`, `${teamId} Forward`, teamId, 42, "C"),
      player(`${teamId}-d1`, `${teamId} Defender`, teamId, 25, "D"),
      { ...player(`${teamId}-g1`, `${teamId} Goalie`, teamId, 0, "G"), gsax: 0, gamesStarted: 45, savePct: 0.905 },
    ]);
    // No `lineup` key at all — AI/default path must still deploy best lines.
    const res = await simulatePOST(new Request("http://localhost/api/simulate", {
      method: "POST",
      body: JSON.stringify({ homeTeamId: "WPG", partnerTeamId: "CGY", teams, players: [...depth, ...wpg], seed: 7, trades: [] }),
    }) as any);
    const body = await res.json();
    const star = body.homeTeam.projectedSkaters.find((p: any) => p.playerId === "wpg-star");
    const benched = body.homeTeam.projectedSkaters.find((p: any) => p.playerId === "wpg-13th");
    expect(star.gamesPlayed).toBeGreaterThan(benched.gamesPlayed);
    expect(benched.gamesPlayed).toBeLessThanOrEqual(48); // press-box depth minutes, not a full slate
  });

  it("uses a supplied lineup starting goalie instead of the starts heuristic", async () => {
    const depth = teamIds.flatMap((teamId) => {
      const base = [
        player(`${teamId}-f1`, `${teamId} Forward`, teamId, 42, "C"),
        player(`${teamId}-d1`, `${teamId} Defender`, teamId, 25, "D"),
      ];
      if (teamId === "WPG") {
        return [
          ...base,
          {
            ...player("wpg-volume-goalie", "Volume Starter", teamId, 0, "G"),
            gsax: 8,
            gamesStarted: 58,
            savePct: 0.915,
          },
          {
            ...player("wpg-user-goalie", "User Starter", teamId, 0, "G"),
            gsax: -2,
            gamesStarted: 12,
            savePct: 0.902,
          },
        ];
      }
      return [
        ...base,
        {
          ...player(`${teamId}-g1`, `${teamId} Goalie`, teamId, 0, "G"),
          gsax: 0,
          gamesStarted: 45,
          savePct: 0.905,
        },
      ];
    });

    const res = await simulatePOST(new Request("http://localhost/api/simulate", {
      method: "POST",
      body: JSON.stringify({
        homeTeamId: "WPG",
        partnerTeamId: "CGY",
        teams,
        players: depth,
        seed: 18,
        trades: [],
        lineup: {
          startingGoalies: {
            WPG: "wpg-user-goalie",
          },
        },
      }),
    }) as any);
    const body = await res.json();

    expect(body.homeTeam.goalie.name).toBe("User Starter");
  });

  it("projects newly drafted rookies when they are dressed in the lineup", async () => {
    const gavinMcKenna = {
      ...player("draft-2026-1-gavinmckenna", "Gavin McKenna", "WPG", 0, "W"),
      age: 18,
      games: 0,
      baselinePtsPace: 0,
      prospectPtsPace: 43,
      draftYear: 2026,
      draftOverall: 1,
      hasLiveStats: false,
    };
    const ivarStenberg = {
      ...player("draft-2026-2-ivarstenberg", "Ivar Stenberg", "WPG", 0, "W"),
      age: 18,
      games: 0,
      baselinePtsPace: 0,
      prospectPtsPace: 38,
      draftYear: 2026,
      draftOverall: 2,
      hasLiveStats: false,
    };
    const depth = teamIds.flatMap((teamId) => [
      player(`${teamId}-f1`, `${teamId} Forward`, teamId, 42, "C"),
      player(`${teamId}-f2`, `${teamId} Wing`, teamId, 38, "W"),
      player(`${teamId}-d1`, `${teamId} Defender`, teamId, 25, "D"),
      {
        ...player(`${teamId}-g1`, `${teamId} Goalie`, teamId, 0, "G"),
        gsax: 0,
        gamesStarted: 45,
        savePct: 0.905,
      },
    ]);

    const res = await simulatePOST(new Request("http://localhost/api/simulate", {
      method: "POST",
      body: JSON.stringify({
        homeTeamId: "WPG",
        partnerTeamId: "CGY",
        teams,
        players: [...depth, gavinMcKenna, ivarStenberg],
        seed: 29,
        trades: [],
        lineup: {
          orders: {
            WPG: {
              forwards: [
                "draft-2026-1-gavinmckenna", "WPG-f1", "draft-2026-2-ivarstenberg",
                "WPG-f2",
              ],
              defense: ["WPG-d1"],
              goalies: ["WPG-g1"],
            },
          },
        },
      }),
    }) as any);
    const body = await res.json();
    const projectedGavin = body.homeTeam.projectedSkaters.find((p: any) => p.playerId === gavinMcKenna.id);
    const projectedIvar = body.homeTeam.projectedSkaters.find((p: any) => p.playerId === ivarStenberg.id);

    expect(projectedGavin.projectedPts).toBeGreaterThan(0);
    expect(projectedGavin.calderEligible).toBe(true);
    expect(projectedIvar.projectedPts).toBeGreaterThan(0);
  });

  it("uses the supplied skater lineup instead of only sorting the full roster by value", async () => {
    const wpgPlayers = [
      player("wpg-elite", "Elite Scratch", "WPG", 130, "C"),
      player("wpg-top-c", "Top Center", "WPG", 82, "C"),
      player("wpg-top-l", "Top Left", "WPG", 78, "W"),
      player("wpg-top-r", "Top Right", "WPG", 76, "W"),
      ...Array.from({ length: 12 }, (_, i) => player(`wpg-depth-${i}`, `Depth ${i}`, "WPG", 12, i % 3 === 0 ? "C" : "W")),
      player("wpg-d1", "First Pair", "WPG", 48, "D"),
      player("wpg-d2", "Second Pair", "WPG", 38, "D"),
      player("wpg-d3", "Third Pair", "WPG", 22, "D"),
      player("wpg-d4", "Fourth Defender", "WPG", 18, "D"),
      player("wpg-d5", "Fifth Defender", "WPG", 15, "D"),
      player("wpg-d6", "Sixth Defender", "WPG", 12, "D"),
      {
        ...player("WPG-g1", "WPG Goalie", "WPG", 0, "G"),
        gsax: 0,
        gamesStarted: 45,
        savePct: 0.905,
      },
    ];
    const depth = teamIds.flatMap((teamId) => teamId === "WPG" ? [] : [
      player(`${teamId}-f1`, `${teamId} Forward`, teamId, 42, "C"),
      player(`${teamId}-d1`, `${teamId} Defender`, teamId, 25, "D"),
      {
        ...player(`${teamId}-g1`, `${teamId} Goalie`, teamId, 0, "G"),
        gsax: 0,
        gamesStarted: 45,
        savePct: 0.905,
      },
    ]);
    const request = (forwards: string[]) => simulatePOST(new Request("http://localhost/api/simulate", {
      method: "POST",
      body: JSON.stringify({
        homeTeamId: "WPG",
        partnerTeamId: "CGY",
        teams,
        players: [...depth, ...wpgPlayers],
        seed: 31,
        trades: [],
        lineup: {
          orders: {
            WPG: {
              forwards,
              defense: ["wpg-d1", "wpg-d2", "wpg-d3", "wpg-d4", "wpg-d5", "wpg-d6"],
              goalies: ["WPG-g1"],
            },
          },
        },
      }),
    }) as any);

    const dressedTopLine = await (await request([
      "wpg-top-l", "wpg-top-c", "wpg-top-r",
      "wpg-depth-0", "wpg-depth-1", "wpg-depth-2",
      "wpg-depth-3", "wpg-depth-4", "wpg-depth-5",
      "wpg-depth-6", "wpg-depth-7", "wpg-depth-8",
    ])).json();
    const scratchedTopLine = await (await request([
      "wpg-depth-0", "wpg-depth-1", "wpg-depth-2",
      "wpg-depth-3", "wpg-depth-4", "wpg-depth-5",
      "wpg-depth-6", "wpg-depth-7", "wpg-depth-8",
      "wpg-depth-9", "wpg-depth-10", "wpg-depth-11",
    ])).json();

    expect(dressedTopLine.homeTeam.projectedPoints).toBeGreaterThan(scratchedTopLine.homeTeam.projectedPoints);
  });

  it("awards Conn Smythe to a player on the simulated Cup champion", async () => {
    const depth = teamIds.flatMap((teamId) => [
      player(`${teamId}-f1`, `${teamId} Forward`, teamId, 42, "C"),
      player(`${teamId}-d1`, `${teamId} Defender`, teamId, 25, "D"),
      {
        ...player(`${teamId}-g1`, `${teamId} Goalie`, teamId, 0, "G"),
        gsax: 0,
        gamesStarted: 45,
        savePct: 0.905,
      },
    ]);

    const res = await simulatePOST(new Request("http://localhost/api/simulate", {
      method: "POST",
      body: JSON.stringify({
        homeTeamId: "WPG",
        partnerTeamId: "CGY",
        teams,
        players: depth,
        seed: 18,
        trades: [],
      }),
    }) as any);
    const body = await res.json();

    expect(body.leaders.connSmythe.team).toBe(body.playoffBracket.champion.teamName);
  });

  it("derives a stable seed when one is not supplied", async () => {
    const connor = player("connor", "Kyle Connor", "WPG", 92, "W");
    const andersson = player("andersson", "Rasmus Andersson", "CGY", 45, "D");
    const depth = teamIds.flatMap((teamId) => [
      player(`${teamId}-f1`, `${teamId} Forward`, teamId, 42, "C"),
      player(`${teamId}-d1`, `${teamId} Defender`, teamId, 25, "D"),
      {
        ...player(`${teamId}-g1`, `${teamId} Goalie`, teamId, 0, "G"),
        gsax: 0,
        gamesStarted: 45,
        savePct: 0.905,
      },
    ]);
    const body = {
      homeTeamId: "WPG",
      partnerTeamId: "CGY",
      teams,
      players: [...depth, connor, andersson],
      trades: [{
        homeTeamId: "WPG",
        partnerTeamId: "CGY",
        outgoing: [connor],
        incoming: [andersson],
      }],
    };

    const first = await simulatePOST(new Request("http://localhost/api/simulate", {
      method: "POST",
      body: JSON.stringify(body),
    }) as any);
    const second = await simulatePOST(new Request("http://localhost/api/simulate", {
      method: "POST",
      body: JSON.stringify(body),
    }) as any);

    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(firstBody.seed).toBe(secondBody.seed);
    expect(firstBody.homeTeam.projectedPoints).toBe(secondBody.homeTeam.projectedPoints);
  });

  it("keeps projections stable when input team and player order changes", async () => {
    const depth = teamIds.flatMap((teamId, i) => [
      player(`${teamId}-f1`, `${teamId} Forward`, teamId, 38 + (i % 12), "C"),
      player(`${teamId}-d1`, `${teamId} Defender`, teamId, 21 + (i % 9), "D"),
      {
        ...player(`${teamId}-g1`, `${teamId} Goalie`, teamId, 0, "G"),
        gsax: i % 7 - 3,
        gamesStarted: 35 + (i % 20),
        savePct: 0.900 + (i % 8) / 1000,
      },
    ]);

    const payload = {
      homeTeamId: "WPG",
      partnerTeamId: "CGY",
      teams,
      players: depth,
      seed: 2027,
      trades: [],
    };

    const first = await simulatePOST(new Request("http://localhost/api/simulate", {
      method: "POST",
      body: JSON.stringify(payload),
    }) as any);
    const second = await simulatePOST(new Request("http://localhost/api/simulate", {
      method: "POST",
      body: JSON.stringify({
        ...payload,
        teams: [...teams].reverse(),
        players: [...depth].reverse(),
      }),
    }) as any);

    const firstBody = await first.json();
    const secondBody = await second.json();
    const byTeam = (body: any) => Object.fromEntries(
      body.standings.map((t: any) => [t.teamId, {
        points: t.projectedPoints,
        topScorer: t.topScorer?.name,
        goalie: t.goalie?.name,
      }])
    );

    expect(byTeam(secondBody)).toEqual(byTeam(firstBody));
    expect(secondBody.playoffBracket.champion).toEqual(firstBody.playoffBracket.champion);
    expect(secondBody.leaders.connSmythe).toEqual(firstBody.leaders.connSmythe);
  });

  it("derives scoring leaders from projected player seasons, not only team top scorers", async () => {
    const depth = teamIds.flatMap((teamId) => [
      {
        ...player(`${teamId}-playmaker`, `${teamId} Playmaker`, teamId, 78, "C"),
        xGPace: 10,
      },
      {
        ...player(`${teamId}-sniper`, `${teamId} Sniper`, teamId, 68, "W"),
        xGPace: 60,
      },
      player(`${teamId}-d1`, `${teamId} Defender`, teamId, 25, "D"),
      {
        ...player(`${teamId}-g1`, `${teamId} Goalie`, teamId, 0, "G"),
        gsax: 0,
        gamesStarted: 45,
        savePct: 0.905,
      },
    ]);

    const res = await simulatePOST(new Request("http://localhost/api/simulate", {
      method: "POST",
      body: JSON.stringify({
        homeTeamId: "WPG",
        partnerTeamId: "CGY",
        teams,
        players: depth,
        seed: 404,
        trades: [],
      }),
    }) as any);
    const body = await res.json();

    expect(body.leaders.topScorer.name).toContain("Playmaker");
    expect(body.leaders.goalsLeader.name).toContain("Sniper");
    expect(body.leaders.assistsLeader.name).toContain("Playmaker");
  });

  it("allows productive older stars to maintain high-end output", async () => {
    const olderStar = {
      ...player("older-star", "Sidney Scheifele", "WPG", 92, "C"),
      age: 36,
      avgTOI: 19.5,
      games: 78,
      baselinePtsPace: 90,
      xGPace: 32,
    };
    const depth = teamIds.flatMap((teamId) => [
      player(`${teamId}-f1`, `${teamId} Forward`, teamId, 42, "C"),
      player(`${teamId}-d1`, `${teamId} Defender`, teamId, 25, "D"),
      {
        ...player(`${teamId}-g1`, `${teamId} Goalie`, teamId, 0, "G"),
        gsax: 0,
        gamesStarted: 45,
        savePct: 0.905,
      },
    ]);

    const res = await simulatePOST(new Request("http://localhost/api/simulate", {
      method: "POST",
      body: JSON.stringify({
        homeTeamId: "WPG",
        partnerTeamId: "CGY",
        teams,
        players: [...depth, olderStar],
        seed: 19,
        trades: [],
      }),
    }) as any);
    const body = await res.json();
    const projected = body.homeTeam.projectedSkaters.find((p: any) => p.playerId === "older-star");

    expect(projected.projectedPts).toBeGreaterThanOrEqual(70);
    expect(projected.breakoutTag).not.toBe("REGRESSION");
  });

  it("excludes players with more than 14 preseason NHL games from Calder voting", async () => {
    const celebrini = {
      ...player("celebrini", "Macklin Celebrini", "SJS", 98, "C"),
      age: 19,
      games: 70,
      baselinePtsPace: 95,
      xGPace: 42,
    };
    const trueRookie = {
      ...player("true-rookie", "True Rookie", "NYI", 72, "D"),
      age: 18,
      games: 0,
      baselinePtsPace: 0,
      prospectPtsPace: 70,
      xGPace: 24,
    };
    const depth = teamIds.flatMap((teamId) => [
      player(`${teamId}-f1`, `${teamId} Forward`, teamId, 42, "C"),
      player(`${teamId}-d1`, `${teamId} Defender`, teamId, 25, "D"),
      {
        ...player(`${teamId}-g1`, `${teamId} Goalie`, teamId, 0, "G"),
        gsax: 0,
        gamesStarted: 45,
        savePct: 0.905,
      },
    ]);

    const res = await simulatePOST(new Request("http://localhost/api/simulate", {
      method: "POST",
      body: JSON.stringify({
        homeTeamId: "WPG",
        partnerTeamId: "CGY",
        teams,
        players: [...depth, celebrini, trueRookie],
        seed: 27,
        trades: [],
      }),
    }) as any);
    const body = await res.json();

    expect(body.leaders.calder.name).not.toBe("Macklin Celebrini");
    expect(body.leaders.calder.name).toBe("True Rookie");
    const projectedCelebrini = body.standings
      .find((t: any) => t.teamId === "SJS")
      .projectedSkaters.find((p: any) => p.playerId === "celebrini");
    expect(projectedCelebrini.calderEligible).toBe(false);
  });

  it("uses order-insensitive object keys for scenario seeds", () => {
    expect(scenarioSeed({ b: 2, a: 1 })).toBe(scenarioSeed({ a: 1, b: 2 }));
  });
});

describe("claude narrative route contract", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it("rejects raw Anthropic messages from clients", async () => {
    const req = new Request("http://localhost/api/claude", {
      method: "POST",
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        messages: [{ role: "user", content: "Please simulate a season" }],
      }),
    });

    const res = await claudePOST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid narrative request");
  });

  it("accepts structured locked season recap payloads", async () => {
    const fetchMock = vi.fn(async () => Response.json({
      content: [{ text: "Locked recap." }],
    }));
    vi.stubGlobal("fetch", fetchMock);

    const req = new Request("http://localhost/api/claude", {
      method: "POST",
      body: JSON.stringify({
        kind: "season_recap",
        model: "claude-sonnet-4-5",
        max_tokens: 300,
        payload: {
          simulationMode: SEASON.simulationMode,
          replaySeason: SEASON.replaySeason,
          rosterMoveWindow: SEASON.rosterMoveWindow,
          latestCompleted: SEASON.latestCompleted,
          homeTeamName: "Winnipeg Jets",
          partnerTeamName: "Calgary Flames",
          homeTeam: {
            teamName: "Winnipeg Jets",
            projectedPoints: 101,
            leagueRank: 7,
            madePlayoffs: true,
          },
          partnerTeam: {
            teamName: "Calgary Flames",
            projectedPoints: 88,
            leagueRank: 18,
            madePlayoffs: false,
          },
          leaders: {
            cupWinner: { teamName: "Winnipeg Jets" },
            connSmythe: { name: "Kyle Connor", team: "Winnipeg Jets" },
          },
          playoffBracket: {
            champion: { teamName: "Winnipeg Jets" },
          },
          playoffTeams: ["WPG"],
          tradedPlayerOutcomes: [{
            name: "Kyle Connor",
            position: "W",
            oldTeamName: "Winnipeg Jets",
            newTeamName: "Calgary Flames",
            gamesPlayed: 76,
            projectedGoals: 38,
            projectedPts: 84,
          }],
          executedTrades: [{
            homeTeamName: "Winnipeg Jets",
            partnerTeamName: "Calgary Flames",
            outgoing: [{ name: "Kyle Connor", position: "W", age: 29, capHit: 7.1, yearsRemaining: 1 }],
            incoming: [],
          }],
          homeRoster: ["Mark Scheifele (C, age 33)"],
          homePhase: "Contender",
          homeContention: { present: 8.1, future: 5.4 },
          seasonStartOutlook: "opening the year with a roster built to contend immediately",
          isRebuilding: false,
          seed: 18,
          generatedLabel: "June 2026",
        },
      }),
    });

    const res = await claudePOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.content[0].text).toBe("Locked recap.");
    const anthropicBody = JSON.parse(((fetchMock as any).mock.calls[0][1] as RequestInit).body as string);
    expect(anthropicBody.messages[0].content).toContain("LOCKED JSON");
    expect(anthropicBody.messages[0].content).toContain("Latest Stanley Cup champion: Carolina Hurricanes");
    expect(anthropicBody.messages[0].content).toContain("Latest Conn Smythe winner: Jordan Staal");
    expect(anthropicBody.messages[0].content).toContain("Conn Smythe must be from the Stanley Cup champion");
  });
});
