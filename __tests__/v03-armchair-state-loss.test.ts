import { beforeAll, describe, expect, it } from "vitest";
import { POST as simulatePOST } from "../app/api/simulate/route";
import {
  applyOffseasonToRoster,
  resolveLeagueOffseason,
} from "../app/lib/free-agency";
import {
  reconcileTeamCapSpaces,
  recordSeason,
  rollLeagueForward,
  startCupRun,
} from "../app/lib/cup-run";
import { capForCupYear } from "../app/lib/season-config";
import type { Asset, Team } from "../app/lib/trade-types";

const TEAM_IDS = [
  "BOS", "BUF", "DET", "FLA", "MTL", "OTT", "TBL", "TOR",
  "CAR", "CBJ", "NJD", "NYI", "NYR", "PHI", "PIT", "WSH",
  "UTA", "CHI", "COL", "DAL", "MIN", "NSH", "STL", "WPG",
  "ANA", "CGY", "EDM", "LAK", "SEA", "SJS", "VAN", "VGK",
];

const team = (id: string, over: Partial<Team> = {}): Team => ({
  id,
  name: id,
  capSpace: 8,
  standing: TEAM_IDS.indexOf(id) + 1,
  phase: "Bubble",
  ...over,
});

const asset = (id: string, teamId: string, over: Partial<Asset> = {}): Asset => ({
  id,
  teamId,
  name: id,
  position: "C",
  age: 26,
  games: 78,
  ptsPace: 40,
  baselinePtsPace: 40,
  xGPace: 14,
  defRate: 0.08,
  avgTOI: 15,
  capHit: 2,
  yearsRemaining: 3,
  hasNMC: false,
  hasNTC: false,
  canRetain: true,
  retainedPct: 0,
  multiplier: 1,
  contractStatus: "SIGNED",
  expiresThisOffseason: false,
  hasLiveStats: true,
  ...over,
});

const fullRoster = (teamId: string, capTotal = 50): Asset[] => {
  const capHit = capTotal / 20;
  return [
    ...Array.from({ length: 12 }, (_, i) => asset(`${teamId}-f${i}`, teamId, {
      position: i % 3 === 0 ? "C" : "W",
      ptsPace: 55 - i,
      baselinePtsPace: 55 - i,
      capHit,
    })),
    ...Array.from({ length: 6 }, (_, i) => asset(`${teamId}-d${i}`, teamId, {
      position: "D",
      ptsPace: 32 - i,
      baselinePtsPace: 32 - i,
      avgTOI: 20 - i * 0.5,
      capHit,
    })),
    asset(`${teamId}-starter`, teamId, {
      name: `${teamId} Starter`,
      position: "G",
      ptsPace: 0,
      baselinePtsPace: 0,
      xGPace: 0,
      avgTOI: 0,
      gamesStarted: 55,
      savePct: 0.914,
      gsax: 8,
      capHit,
    }),
    asset(`${teamId}-backup`, teamId, {
      name: `${teamId} Backup`,
      position: "G",
      ptsPace: 0,
      baselinePtsPace: 0,
      xGPace: 0,
      avgTOI: 0,
      gamesStarted: 18,
      savePct: 0.902,
      gsax: -2,
      capHit,
    }),
  ];
};

describe("V-03 historic Armchair state-loss fixtures", () => {
  it("keeps Celebrini and other RFAs through the Year-3 offseason while preserving a UFA market", () => {
    const teams = [
      team("SJS", { capSpace: 3, standing: 30, phase: "Rebuilding" }),
      team("WPG", { capSpace: 0, standing: 8, phase: "Contender" }),
    ];
    const celebrini = asset("sjs-celebrini", "SJS", {
      name: "Macklin Celebrini",
      position: "C",
      age: 20,
      ptsPace: 95,
      baselinePtsPace: 95,
      capHit: 0.95,
      yearsRemaining: 0,
      contractStatus: "RFA",
      expiryStatus: "RFA",
      expiresThisOffseason: true,
    });
    const secondRfa = asset("sjs-rfa", "SJS", {
      name: "San Jose RFA",
      position: "D",
      age: 22,
      ptsPace: 42,
      baselinePtsPace: 42,
      capHit: 0.9,
      yearsRemaining: 0,
      contractStatus: "RFA",
      expiryStatus: "RFA",
      expiresThisOffseason: true,
    });
    const persistentUfa = asset("persistent-ufa", "SJS", {
      name: "Persistent UFA",
      position: "W",
      age: 25,
      ptsPace: 90,
      baselinePtsPace: 90,
      capHit: 1,
      yearsRemaining: 0,
      contractStatus: "UFA",
      expiryStatus: "UFA",
      expiresThisOffseason: true,
    });
    let players = [
      ...fullRoster("SJS"),
      ...fullRoster("WPG"),
      celebrini,
      secondRfa,
      persistentUfa,
    ];

    const firstOffseason = resolveLeagueOffseason(players, {
      seed: 7,
      userTeamId: "WPG",
      capCeiling: capForCupYear(1).ceiling,
      teams,
    });
    expect(firstOffseason.resignings.map((signing) => signing.playerId))
      .toEqual(expect.arrayContaining([celebrini.id, secondRfa.id]));
    expect(firstOffseason.walkAways.map((walk) => walk.playerId))
      .not.toContain(celebrini.id);
    expect(firstOffseason.market.map((pending) => pending.player.id))
      .toContain(persistentUfa.id);
    expect(firstOffseason.stateDiagnostic.ok).toBe(true);

    players = applyOffseasonToRoster(players, firstOffseason);
    expect(players.find((player) => player.id === celebrini.id)).toMatchObject({
      teamId: "SJS",
      contractStatus: "SIGNED",
      expiresThisOffseason: false,
    });
    expect(players.find((player) => player.id === persistentUfa.id)?.teamId)
      .toBe("FA_POOL");

    let run = startCupRun(teams[1]);
    for (const year of [2, 3] as const) {
      run = recordSeason(run, {
        championTeamId: "CAR",
        championTeamName: "Carolina Hurricanes",
        madePlayoffs: true,
      });
      expect(run.currentYear).toBe(year);

      const rolled = rollLeagueForward({
        players,
        seasonStartPlayers: players,
        state: run,
        teams,
        standings: [
          { teamId: "WPG", standing: 8 },
          { teamId: "SJS", standing: 30 },
        ],
        capCeiling: capForCupYear(year).ceiling,
      });
      expect(rolled.stateDiagnostic.ok).toBe(true);
      players = rolled.players;

      const offseason = resolveLeagueOffseason(players, {
        seed: 7 + year,
        userTeamId: "WPG",
        capCeiling: capForCupYear(year).ceiling,
      });
      expect(offseason.market.map((pending) => pending.player.id))
        .toContain(persistentUfa.id);
      expect(offseason.stateDiagnostic.ok).toBe(true);
      players = applyOffseasonToRoster(players, offseason);

      for (const id of [celebrini.id, secondRfa.id, persistentUfa.id]) {
        expect(players.some((player) => player.id === id)).toBe(true);
      }
    }

    expect(players.find((player) => player.id === celebrini.id)).toMatchObject({
      teamId: "SJS",
      contractStatus: "SIGNED",
    });
    expect(players.find((player) => player.id === secondRfa.id)).toMatchObject({
      teamId: "SJS",
      contractStatus: "SIGNED",
    });
  });

  describe("simulation output", () => {
    let body: any;

    beforeAll(async () => {
      const teams = TEAM_IDS.map((id) => team(id));
      const freeAgent = asset("free-agent-canary", "FA_POOL", {
        name: "Free Agent Canary",
        position: "W",
        yearsRemaining: 0,
        contractStatus: "UFA",
        expiryStatus: "UFA",
        expiresThisOffseason: true,
      });
      const response = await simulatePOST(new Request("http://localhost/api/simulate", {
        method: "POST",
        body: JSON.stringify({
          homeTeamId: "WPG",
          partnerTeamId: "COL",
          teams,
          players: [...teams.flatMap((entry) => fullRoster(entry.id)), freeAgent],
          seed: 88944,
          trades: [],
        }),
      }) as any);
      expect(response.status).toBe(200);
      body = await response.json();
    });

    it("does not turn FA_POOL into a ghost team or simulate its unsigned player", () => {
      const standingIds = body.standings.map((standing: any) => standing.teamId);
      const projectedIds = body.standings.flatMap((standing: any) =>
        standing.projectedSkaters.map((player: any) => player.playerId));

      expect(standingIds).toHaveLength(TEAM_IDS.length);
      expect(new Set(standingIds)).toEqual(new Set(TEAM_IDS));
      expect(standingIds).not.toContain("FA_POOL");
      expect(projectedIds).not.toContain("free-agent-canary");
    });

    it("gives the backup goalie a conserved workload and complete simulated statistics", () => {
      const winnipeg = body.standings.find((standing: any) => standing.teamId === "WPG");
      expect(winnipeg.goalie.name).toBe("WPG Starter");
      expect(winnipeg.backupGoalie).toMatchObject({
        name: "WPG Backup",
        gamesStarted: expect.any(Number),
        projectedGAA: expect.any(Number),
        projectedSVP: expect.any(Number),
        gsax: expect.any(Number),
      });
      expect(winnipeg.backupGoalie.gamesStarted).toBeGreaterThan(0);
      expect(winnipeg.goalie.gamesStarted + winnipeg.backupGoalie.gamesStarted)
        .toBe(82);
      expect(Number.isFinite(winnipeg.backupGoalie.projectedGAA)).toBe(true);
      expect(Number.isFinite(winnipeg.backupGoalie.projectedSVP)).toBe(true);
    });
  });

  it("reconciles varied Year-2 commitments instead of zeroing league-wide cap space", () => {
    const teams = TEAM_IDS.map((id) => team(id, { capSpace: 0 }));
    const players = teams.flatMap((entry, index) =>
      fullRoster(entry.id, 90 + index % 10));
    const reconciled = reconcileTeamCapSpaces(
      teams,
      players,
      capForCupYear(2).ceiling,
      "WPG",
    );
    const spaces = reconciled.map((entry) => entry.capSpace);

    expect(spaces).toHaveLength(TEAM_IDS.length);
    expect(spaces.every(Number.isFinite)).toBe(true);
    expect(spaces.every((space) => space > 0)).toBe(true);
    expect(Math.max(...spaces)).toBeGreaterThan(20);
    expect(new Set(spaces).size).toBeGreaterThan(1);
  });
});
