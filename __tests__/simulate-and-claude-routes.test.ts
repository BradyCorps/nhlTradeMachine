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

  it("feeds line and PP deployment into a skater's goal-vs-assist split (SIM-P1-6)", async () => {
    const subject = { ...player("wpg-split", "Split Subject", "WPG", 82, "W"), xGPace: 30 };
    const forwards = Array.from({ length: 11 }, (_, i) =>
      player(`wpg-split-f${i}`, `Split Forward ${i}`, "WPG", 48 - i, i % 2 ? "W" : "C")
    );
    const defender = player("wpg-split-d", "Split Defender", "WPG", 28, "D");
    const goalie = {
      ...player("wpg-split-g", "Split Goalie", "WPG", 0, "G"),
      gsax: 0,
      gamesStarted: 45,
      savePct: 0.905,
    };
    const depth = teamIds.flatMap((teamId) => teamId === "WPG" ? [] : [
      player(`${teamId}-split-f`, `${teamId} Forward`, teamId, 42, "C"),
      player(`${teamId}-split-d`, `${teamId} Defender`, teamId, 25, "D"),
      { ...player(`${teamId}-split-g`, `${teamId} Goalie`, teamId, 0, "G"), gsax: 0, gamesStarted: 45, savePct: 0.905 },
    ]);
    const run = async (forwardOrder: string[], powerPlay: string[]) => {
      const res = await simulatePOST(new Request("http://localhost/api/simulate", {
        method: "POST",
        body: JSON.stringify({
          homeTeamId: "WPG",
          partnerTeamId: "CGY",
          teams,
          players: [...depth, subject, ...forwards, defender, goalie],
          trades: [],
          seed: 73,
          lineup: {
            orders: {
              WPG: {
                forwards: forwardOrder,
                defense: [defender.id],
                goalies: [goalie.id],
                powerPlay,
              },
            },
          },
        }),
      }) as any);
      const body = await res.json();
      return body.homeTeam.projectedSkaters.find((skater: any) => skater.playerId === subject.id);
    };

    const forwardIds = forwards.map((forward) => forward.id);
    const featured = await run(
      [subject.id, ...forwardIds],
      [subject.id, ...forwardIds.slice(0, 3), defender.id],
    );
    const depthRole = await run(
      [...forwardIds.slice(0, 9), subject.id, ...forwardIds.slice(9)],
      [...forwardIds.slice(0, 4), defender.id],
    );

    expect(featured.projectedGoals / featured.projectedPts)
      .toBeGreaterThan(depthRole.projectedGoals / depthRole.projectedPts);
  });

  it("gives an explosive skater (EDGE burst) a rush-offense lift in the projection", async () => {
    // Same player id + same seed => identical RNG stream, so the ONLY difference
    // between the two runs is the burst channel. Explosiveness must not lower it
    // and should lift it.
    const depth = teamIds.flatMap((teamId) => [
      player(`${teamId}-f1`, `${teamId} Forward`, teamId, 42, "C"),
      player(`${teamId}-d1`, `${teamId} Defender`, teamId, 25, "D"),
      { ...player(`${teamId}-g1`, `${teamId} Goalie`, teamId, 0, "G"), gsax: 0, gamesStarted: 45, savePct: 0.905 },
    ]);
    const run = async (edge: Record<string, unknown>) => {
      const subject = { ...player("burst-subject", "Burst Subject", "WPG", 60, "C"), age: 26, games: 78, avgTOI: 18, ...edge };
      const res = await simulatePOST(new Request("http://localhost/api/simulate", {
        method: "POST",
        body: JSON.stringify({ homeTeamId: "WPG", partnerTeamId: "CGY", teams, players: [...depth, subject], seed: 5, trades: [] }),
      }) as any);
      const body = await res.json();
      return body.homeTeam.projectedSkaters.find((p: any) => p.playerId === "burst-subject").projectedPts;
    };
    const explosive = await run({ edgeBurstsOver20: 46, edgeSpeedMaxMph: 23.2 });
    const cruiser = await run({}); // no EDGE sample — burst is a strict no-op
    expect(explosive).toBeGreaterThan(cruiser);
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
    expect(projectedGavin.projectedTOI).toBeGreaterThan(0);
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

  it("conserves a full roster's skater-games to 1476 and goals to the team goals-for (SIM-CONS)", async () => {
    // A believable 20-skater WPG roster (12F + 6D + 2 extra F) plus a goalie —
    // enough bodies to ice 18 a night, so conservation engages.
    const wpg = [
      ...Array.from({ length: 14 }, (_, i) => player(`wpg-f${i}`, `WPG Forward ${i}`, "WPG", 70 - i * 3, i % 2 ? "W" : "C")),
      ...Array.from({ length: 6 }, (_, i) => player(`wpg-d${i}`, `WPG Defender ${i}`, "WPG", 34 - i * 3, "D")),
      { ...player("wpg-g1", "WPG Goalie", "WPG", 0, "G"), gsax: 2, gamesStarted: 55, savePct: 0.912 },
      { ...player("wpg-g2", "WPG Backup", "WPG", 0, "G"), gsax: 0, gamesStarted: 22, savePct: 0.905 },
    ];
    const depth = teamIds.flatMap((teamId) => teamId === "WPG" ? [] : [
      player(`${teamId}-f1`, `${teamId} Forward`, teamId, 42, "C"),
      player(`${teamId}-d1`, `${teamId} Defender`, teamId, 25, "D"),
      { ...player(`${teamId}-g1`, `${teamId} Goalie`, teamId, 0, "G"), gsax: 0, gamesStarted: 45, savePct: 0.905 },
    ]);

    const res = await simulatePOST(new Request("http://localhost/api/simulate", {
      method: "POST",
      body: JSON.stringify({ homeTeamId: "WPG", partnerTeamId: "CGY", teams, players: [...depth, ...wpg], seed: 42, trades: [] }),
    }) as any);
    const body = await res.json();

    const wpgDiag = body.conservation.teams.find((t: any) => t.teamId === "WPG");
    expect(wpgDiag.skaterCount).toBe(20);
    expect(wpgDiag.skaterGames).toBe(1476);             // 18 skaters × 82, conserved
    expect(wpgDiag.summedSkaterGoals).toBe(wpgDiag.teamGoalsFor); // Σ player goals = team GF
    // Legality diagnostic (audit P0-2): a legal 14F / 6D / 2G roster.
    expect(wpgDiag).toMatchObject({ forwards: 14, defense: 6, goalies: 2, rosterLegal: true });

    // And the season stays internally consistent: pts = G + A for every skater.
    const wpgTeam = body.standings.find((t: any) => t.teamId === "WPG");
    for (const s of wpgTeam.projectedSkaters) {
      expect(s.projectedGoals + s.projectedAssists).toBe(s.projectedPts);
    }
    // League standings total sits near the realistic ~2,924, not inflated.
    expect(Math.abs(body.conservation.totalStandingsPoints - 2924)).toBeLessThan(60);
  });

  it("does not floor a no-xG young forward at a 20/80 goal split (SIM-CONS P0-4)", async () => {
    // Small WPG roster (conservation off) so the raw per-player goal share shows.
    // A prospect with a scoring pace but no xG sample used to be pinned at the
    // 0.22 goal floor → ~78% assists. He should now get a real prior share.
    const prospect = { ...player("prospect", "No-xG Prospect", "WPG", 55, "C"), age: 22, xGPace: 0, baselinePtsPace: 55, games: 60 };
    const depth = teamIds.flatMap((teamId) => [
      player(`${teamId}-f1`, `${teamId} Forward`, teamId, 42, "C"),
      player(`${teamId}-d1`, `${teamId} Defender`, teamId, 25, "D"),
      { ...player(`${teamId}-g1`, `${teamId} Goalie`, teamId, 0, "G"), gsax: 0, gamesStarted: 45, savePct: 0.905 },
    ]);
    const res = await simulatePOST(new Request("http://localhost/api/simulate", {
      method: "POST",
      body: JSON.stringify({ homeTeamId: "WPG", partnerTeamId: "CGY", teams, players: [...depth, prospect], seed: 71, trades: [] }),
    }) as any);
    const body = await res.json();
    const p = body.homeTeam.projectedSkaters.find((s: any) => s.playerId === "prospect");
    expect(p.projectedPts).toBeGreaterThan(0);
    expect(p.projectedGoals / p.projectedPts).toBeGreaterThan(0.27); // was ~0.22 floor
  });

  it("does not dress a no-signal prospect for NHL games with zero possible offense (SIM-CONS P0-5)", async () => {
    const noSignalProspect = {
      ...player("zero-signal-prospect", "Zero-signal Prospect", "WPG", 0, "C"),
      age: 20,
      games: 0,
      baselinePtsPace: 0,
      xGPace: 0,
      avgTOI: 0,
      prospectPtsPace: 0,
    };
    const wpg = [
      ...Array.from({ length: 13 }, (_, i) =>
        player(`wpg-signal-f${i}`, `WPG Signal Forward ${i}`, "WPG", 62 - i * 2, i % 2 ? "W" : "C")
      ),
      noSignalProspect,
      ...Array.from({ length: 6 }, (_, i) =>
        player(`wpg-signal-d${i}`, `WPG Signal Defender ${i}`, "WPG", 36 - i * 3, "D")
      ),
      { ...player("wpg-zero-g1", "WPG Goalie", "WPG", 0, "G"), gsax: 2, gamesStarted: 55, savePct: 0.912 },
      { ...player("wpg-zero-g2", "WPG Backup", "WPG", 0, "G"), gsax: 0, gamesStarted: 22, savePct: 0.905 },
    ];
    const depth = teamIds.flatMap((teamId) => teamId === "WPG" ? [] : [
      player(`${teamId}-zero-f1`, `${teamId} Forward`, teamId, 42, "C"),
      player(`${teamId}-zero-d1`, `${teamId} Defender`, teamId, 25, "D"),
      { ...player(`${teamId}-zero-g1`, `${teamId} Goalie`, teamId, 0, "G"), gsax: 0, gamesStarted: 45, savePct: 0.905 },
    ]);

    const res = await simulatePOST(new Request("http://localhost/api/simulate", {
      method: "POST",
      body: JSON.stringify({
        homeTeamId: "WPG",
        partnerTeamId: "CGY",
        teams,
        players: [...depth, ...wpg],
        seed: 42,
        trades: [],
      }),
    }) as any);
    const body = await res.json();
    const wpgTeam = body.standings.find((t: any) => t.teamId === "WPG");
    const prospect = wpgTeam.projectedSkaters.find((s: any) => s.playerId === noSignalProspect.id);

    expect(body.conservation.teams.find((t: any) => t.teamId === "WPG").skaterGames).toBe(1476);
    expect(prospect.projectedPts).toBe(0);
    expect(prospect.gamesPlayed).toBe(0);
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

// ── G4 — gravity + roles propagate into the season simulator ─────
// The sim's team strength was points-pace-only; the zone-mass field now
// adds what pace misses (suppression, transition). These tests hold every
// input identical except the on-ice fields, with a fixed seed, so any
// difference in output IS the propagation.
describe("simulate route — G4 gravity and role propagation", () => {
  beforeEach(() => {
    vi.stubEnv("GRAVITY_V3_SIMULATION_ENABLED", "true");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  // The on-ice block of a heavy shutdown profile: big suppression, PK
  // trust, tough zone starts. Gravity-positive; barely moves pts pace.
  const shutdownFields = {
    xgRelTM: 2, baselineXgRel: 0.01, xgaRelTM: -0.8,
    baselineIxg82: 3.5, ppPtsPace82: 0.5, assistsPace: 21, goalsPace: 4,
    dps: 4.8, pkTimeShare: 0.24, pairDriverScore: 8,
    qocIndex: 80, dzPct: 0.62, edgeOzPct: 0.40,
  };

  const depth = () => teamIds.flatMap((teamId) => teamId === "WPG" ? [] : [
    player(`${teamId}-f1`, `${teamId} Forward`, teamId, 42, "C"),
    player(`${teamId}-d1`, `${teamId} Defender`, teamId, 25, "D"),
    { ...player(`${teamId}-g1`, `${teamId} Goalie`, teamId, 0, "G"), gsax: 0, gamesStarted: 45, savePct: 0.905 },
  ]);

  const wpgRoster = (withGravity: boolean) => {
    const onIce = withGravity ? shutdownFields : {};
    return [
      ...Array.from({ length: 12 }, (_, i) =>
        ({ ...player(`wpg-f${i}`, `WPG Forward ${i}`, "WPG", 55 - i, i % 2 ? "W" : "C"), avgTOI: 18, ...onIce })),
      ...Array.from({ length: 6 }, (_, i) =>
        ({ ...player(`wpg-d${i}`, `WPG Defender ${i}`, "WPG", 40 - i, "D"), avgTOI: 21, ...onIce })),
      { ...player("wpg-g1", "WPG Goalie", "WPG", 0, "G"), gsax: 0, gamesStarted: 45, savePct: 0.905 },
    ];
  };

  it("a gravity-rich roster projects more points than a stat-identical data-blank twin", async () => {
    const run = async (withGravity: boolean) => {
      const res = await simulatePOST(new Request("http://localhost/api/simulate", {
        method: "POST",
        body: JSON.stringify({
          homeTeamId: "WPG", partnerTeamId: "CGY", teams,
          players: [...depth(), ...wpgRoster(withGravity)],
          seed: 11, trades: [],
        }),
      }) as any);
      const body = await res.json();
      return body.homeTeam.projectedPoints as number;
    };
    const withField = await run(true);
    const blank = await run(false);
    // Same paces, same seed, same RNG streams — the zone-mass field is the
    // only difference, and suppression/transition value must show up.
    expect(withField).toBeGreaterThan(blank);
  });

  it("stamps the modern role into traded-player outcomes, with generic fallback", async () => {
    const lockdown = {
      ...player("lockdown-d", "Lockdown Defender", "CGY", 25, "D"),
      avgTOI: 21.5, ...shutdownFields,
    };
    const bare = player("bare-f", "Bare Forward", "WPG", 60, "W"); // no on-ice data → fallback
    const res = await simulatePOST(new Request("http://localhost/api/simulate", {
      method: "POST",
      body: JSON.stringify({
        homeTeamId: "WPG", partnerTeamId: "CGY", teams,
        players: [...depth(), ...wpgRoster(false), lockdown, bare],
        seed: 3,
        trades: [{ homeTeamId: "WPG", partnerTeamId: "CGY", outgoing: [bare], incoming: [lockdown] }],
      }),
    }) as any);
    const body = await res.json();
    const moved = (id: string) => body.tradedPlayerOutcomes.find((o: any) => o.playerId === id);
    expect(moved("lockdown-d").role).toBe("Perimeter Lockdown");
    expect(moved("bare-f").role).toBe("skater");
  });
});
