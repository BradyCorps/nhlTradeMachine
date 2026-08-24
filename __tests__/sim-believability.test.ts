// Believability regression guard for the SIM-CONS conservation pass. Builds a
// realistic 32-team, ~23-man league and runs the real /api/simulate route
// across several seeds, then asserts the conservation invariants hold on every
// full team (games = 1,476, goals = team goals-for, goalie starts ~= 82) and
// that season output stays believable (standings ~91/team, a real scoring
// leader but no runaway, stars not crushed, rookie goal share off the floor).
// The printed report is a convenience for anyone tuning the sim; the soft
// bounds are what protect the shipped behaviour from a silent regression.
import { describe, it, expect } from "vitest";
import { POST as simulatePOST } from "../app/api/simulate/route";
import { recordSeason, rollLeagueForward, startCupRun } from "../app/lib/cup-run";
import { scenarioSeed } from "../app/lib/sim-engine";

const DIVISIONS: Record<string, string[]> = {
  Atlantic: ["BOS","BUF","DET","FLA","MTL","OTT","TBL","TOR"],
  Metropolitan: ["CAR","CBJ","NJD","NYI","NYR","PHI","PIT","WSH"],
  Central: ["UTA","CHI","COL","DAL","MIN","NSH","STL","WPG"],
  Pacific: ["ANA","CGY","EDM","LAK","SEA","SJS","VAN","VGK"],
};
const TEAM_IDS = Object.values(DIVISIONS).flat();

function rng(seed: number) {
  return () => {
    seed |= 0; seed = seed + 0x6d2b79f5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// Team tiers spread realistically across the league.
const PHASES = ["Contender","Contender","Contender","Contender","Contender","Contender","Contender","Contender",
  "Bubble","Bubble","Bubble","Bubble","Bubble","Bubble","Bubble","Bubble",
  "Retooling","Retooling","Retooling","Retooling","Retooling","Retooling","Retooling","Retooling",
  "Rebuilding","Rebuilding","Rebuilding","Rebuilding","Tanking","Tanking","Tanking","Tanking"];

const teams = TEAM_IDS.map((id, i) => ({
  id, name: id, phase: PHASES[i], standing: i + 1, capSpace: 4 + (i % 6),
}));

// A believable 23-man club: 14 F, 7 D, 2 G, paced off the team's tier.
function buildTeam(teamId: string, tierTop: number, r: () => number) {
  const players: any[] = [];
  const mk = (n: number, pos: string, pace: number, age: number, toi: number, extra: any = {}) => ({
    id: `${teamId}-${pos}${n}`, name: `${teamId} ${pos}${n}`, teamId, position: pos,
    age, ptsPace: Math.max(0, Math.round(pace)), baselinePtsPace: Math.max(0, Math.round(pace)),
    xGPace: Math.round(pace * (pos === "D" ? 0.22 : 0.38)), avgTOI: toi, capHit: 1 + pace / 14,
    yearsRemaining: 2 + (n % 4), games: 78 + Math.floor(r() * 5), ...extra,
  });
  // Forwards: top line high, tapering to depth.
  for (let n = 0; n < 14; n++) {
    const pace = tierTop * Math.pow(0.90, n) * (0.9 + r() * 0.2);
    const toi = n < 3 ? 18.5 : n < 6 ? 16 : n < 9 ? 13.5 : 11;
    players.push(mk(n, n % 3 === 0 ? "C" : n % 3 === 1 ? "L" : "R", pace, 22 + Math.floor(r() * 12), toi));
  }
  // One genuine no-xG prospect (tests the rookie goal-share prior).
  players.push({ ...mk(99, "C", 42, 20, 13, { xGPace: 0, prospectPtsPace: 44, games: 62 }) });
  // Defense: top pair strong, tapering.
  for (let n = 0; n < 7; n++) {
    const pace = (tierTop * 0.55) * Math.pow(0.87, n) * (0.9 + r() * 0.2);
    const toi = n < 2 ? 22 : n < 4 ? 19 : 16;
    players.push(mk(n, "D", pace, 23 + Math.floor(r() * 11), toi));
  }
  // Goalies.
  players.push({ ...mk(0, "G", 0, 27 + Math.floor(r() * 6), 0), gsax: (r() - 0.4) * 14, savePct: 0.905 + r() * 0.02, gamesStarted: 48 + Math.floor(r() * 14) });
  players.push({ ...mk(1, "G", 0, 25 + Math.floor(r() * 6), 0), gsax: (r() - 0.5) * 8, savePct: 0.9 + r() * 0.015, gamesStarted: 20 + Math.floor(r() * 12) });
  return players;
}

function buildLeague(seed: number) {
  const r = rng(seed);
  const tierTop: Record<string, number> = {
    Contender: 96, Bubble: 88, Retooling: 82, Rebuilding: 76, Tanking: 70,
  };
  return teams.flatMap(t => buildTeam(t.id, tierTop[t.phase] ?? 84, r));
}

describe("SIM-CONS believability (report)", () => {
  it("produces conserved, believable full-league seasons", async () => {
    const seeds = [101, 202, 303, 404, 505];
    const totals: number[] = [];
    const topScorerPts: number[] = [];
    const topScorerGames: number[] = [];
    let gamesOff = 0, goalsOff = 0, fullTeams = 0;
    const goalieStarts: number[] = [];
    let prospectG = 0, prospectA = 0, prospectSamples = 0;
    let leaderLine = "";

    for (const seed of seeds) {
      const players = buildLeague(seed);
      const res = await simulatePOST(new Request("http://localhost/api/simulate", {
        method: "POST",
        body: JSON.stringify({ homeTeamId: "WPG", partnerTeamId: "COL", teams, players, seed, trades: [] }),
      }) as any);
      const body = await res.json();

      totals.push(body.conservation.totalStandingsPoints);
      for (const d of body.conservation.teams) {
        if (d.skaterCount >= 18) {
          fullTeams++;
          if (d.skaterGames !== 1476) gamesOff++;
          if (d.summedSkaterGoals !== d.teamGoalsFor) goalsOff++;
        }
      }
      // League scoring leaders + a top scorer's games.
      const allSkaters = body.standings.flatMap((t: any) => t.projectedSkaters.map((p: any) => ({ ...p, team: t.teamId })));
      allSkaters.sort((a: any, b: any) => b.projectedPts - a.projectedPts);
      topScorerPts.push(allSkaters[0].projectedPts);
      topScorerGames.push(allSkaters[0].gamesPlayed);
      if (!leaderLine) {
        leaderLine = allSkaters.slice(0, 5)
          .map((p: any) => `${p.name} ${p.projectedGoals}-${p.projectedAssists}-${p.projectedPts} (${p.gamesPlayed}gp)`).join("  |  ");
      }
      // Goalie starts per team (starter + backup should ~= 82).
      for (const t of body.standings) {
        const s = (t.goalie?.gamesStarted ?? 0) + (t.backupGoalie?.gamesStarted ?? 0);
        if (s > 0) goalieStarts.push(s);
      }
      // No-xG prospect goal split.
      for (const t of body.standings) {
        const pr = t.projectedSkaters.find((p: any) => p.playerId?.endsWith("-C99"));
        if (pr && pr.projectedPts > 0) { prospectG += pr.projectedGoals; prospectA += pr.projectedAssists; prospectSamples++; }
      }
    }

    const mean = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
    const report = [
      "",
      "── SIM-CONS believability report ─────────────────────────",
      `seeds: ${seeds.join(", ")}   full teams checked: ${fullTeams}`,
      `standings total: mean ${mean(totals).toFixed(0)}  (avg/team ${(mean(totals) / 32).toFixed(1)}, target ~2924 / ~91.4)`,
      `skater-games != 1476 on a full team: ${gamesOff} / ${fullTeams}`,
      `team GF != summed goals on a full team: ${goalsOff} / ${fullTeams}`,
      `goalie starts/team (starter+backup): mean ${mean(goalieStarts).toFixed(1)}  min ${Math.min(...goalieStarts)}  max ${Math.max(...goalieStarts)}`,
      `league top scorer pts: ${topScorerPts.join(", ")}  (mean ${mean(topScorerPts).toFixed(0)})`,
      `league top scorer games: ${topScorerGames.join(", ")}  (mean ${mean(topScorerGames).toFixed(0)})`,
      `no-xG prospect split: ${prospectG}G / ${prospectA}A across ${prospectSamples} samples  (goal share ${(prospectG / Math.max(1, prospectG + prospectA) * 100).toFixed(0)}%)`,
      `scoring leaders (seed ${seeds[0]}):`,
      `  ${leaderLine}`,
      "──────────────────────────────────────────────────────────",
    ].join("\n");
    console.log(report);

    // Soft believability guards.
    expect(gamesOff).toBe(0);                          // every full team conserves games
    expect(goalsOff).toBe(0);                          // every full team conserves goals
    expect(mean(totals) / 32).toBeGreaterThan(85);     // standings avg not inflated to ~99
    expect(mean(totals) / 32).toBeLessThan(97);
    expect(mean(goalieStarts)).toBeGreaterThan(78);    // goalie starts ~82
    expect(mean(goalieStarts)).toBeLessThan(86);
    expect(mean(topScorerPts)).toBeGreaterThan(95);    // a real scoring leader exists
    expect(mean(topScorerPts)).toBeLessThan(165);      // but no 216-point runaway
    expect(mean(topScorerGames)).toBeGreaterThan(70);  // stars aren't crushed by conservation
    expect(prospectG / Math.max(1, prospectG + prospectA)).toBeGreaterThan(0.24); // not the 0.22 floor
  });

  it("keeps a young star's scoring believable across a three-season Cup Run", async () => {
    const runOnce = async () => {
      const youngStarId = "WPG-C0";
      let players = buildLeague(88944);
      // Keep the rest of this fixture out of the route's deliberately broad
      // <=23 single-season upside tail. The regression target is one player's
      // repeated rollover, not a league-wide tuning test for unrelated phenoms.
      for (const p of players) {
        if (p.position !== "G" && p.id !== youngStarId) p.age = Math.max(27, p.age);
      }
      const youngStar = players.find(p => p.id === youngStarId)!;
      Object.assign(youngStar, {
        age: 19,
        games: 42,
        ptsPace: 82,
        baselinePtsPace: undefined,
        prospectPtsPace: 110,
        draftOverall: 2,
        avgTOI: 20.5,
        yearsRemaining: 7,
      });

      let state = startCupRun(teams.find(t => t.id === "WPG") as any);
      const seasonLeaders: number[] = [];
      const seasonLeaderLines: string[] = [];
      const starSeasons: number[] = [];
      const carriedStarPaces: number[] = [youngStar.ptsPace];
      const careerAnchors: number[] = [youngStar.baselinePtsPace ?? 0];

      for (let year = 1; year <= 3; year++) {
        const seed = scenarioSeed({ cupRunSeed: state.seed, cupRunYear: year });
        const res = await simulatePOST(new Request("http://localhost/api/simulate", {
          method: "POST",
          body: JSON.stringify({
            homeTeamId: "WPG",
            partnerTeamId: "COL",
            teams,
            players,
            seed,
            trades: [],
            lineupContext: true,
          }),
        }) as any);
        expect(res.status).toBe(200);
        const body = await res.json();
        const allSkaters = body.standings.flatMap((t: any) => t.projectedSkaters);
        const starSeason = allSkaters.find((p: any) => p.playerId === youngStarId);
        expect(starSeason).toBeDefined();

        const leader = [...allSkaters].sort((a: any, b: any) => b.projectedPts - a.projectedPts)[0];
        seasonLeaders.push(leader.projectedPts);
        seasonLeaderLines.push(`${leader.playerId}: ${leader.projectedPts}`);
        starSeasons.push(starSeason.projectedPts);

        for (const diagnostic of body.conservation.teams) {
          if (diagnostic.skaterCount < 18) continue;
          expect(diagnostic.skaterGames).toBe(1476);
          expect(diagnostic.summedSkaterGoals).toBe(diagnostic.teamGoalsFor);
        }
        expect(body.conservation.totalStandingsPoints).toBeGreaterThan(2880);
        expect(body.conservation.totalStandingsPoints).toBeLessThan(2970);

        if (year === 3) break;
        state = recordSeason(state, {
          championTeamId: "CAR",
          championTeamName: "Carolina Hurricanes",
          madePlayoffs: true,
        });
        const rolled = rollLeagueForward({
          players,
          seasonStartPlayers: players,
          state,
          teams: teams as any,
          standings: body.standings.map((t: any, i: number) => ({ teamId: t.teamId, standing: i + 1 })),
          capCeiling: 200,
          simSkaterSeasons: allSkaters,
        });
        players = rolled.players;
        const carriedStar = players.find(p => p.id === youngStarId)!;
        carriedStarPaces.push(carriedStar.ptsPace);
        careerAnchors.push(carriedStar.baselinePtsPace ?? 0);
      }

      return { seasonLeaders, seasonLeaderLines, starSeasons, carriedStarPaces, careerAnchors };
    };

    const first = await runOnce();
    const replay = await runOnce();
    console.log([
      "",
      "── Three-season Cup Run believability report ─────────────",
      `league leaders: ${first.seasonLeaderLines.join(" | ")}`,
      `young star seasons: ${first.starSeasons.join(", ")}`,
      `young star carried paces: ${first.carriedStarPaces.join(" → ")}`,
      `young star career anchors: ${first.careerAnchors.join(" → ")}`,
      "──────────────────────────────────────────────────────────",
    ].join("\n"));

    expect(replay).toEqual(first);
    expect(Math.max(...first.seasonLeaders)).toBeLessThanOrEqual(150);
    expect(first.careerAnchors[1]).toBeGreaterThan(0);
    for (let i = 1; i < first.carriedStarPaces.length; i++) {
      expect(first.carriedStarPaces[i] - first.carriedStarPaces[i - 1]).toBeLessThanOrEqual(20);
    }
    for (let i = 2; i < first.careerAnchors.length; i++) {
      expect(first.careerAnchors[i] - first.careerAnchors[i - 1]).toBeLessThanOrEqual(20);
    }
  });
});
