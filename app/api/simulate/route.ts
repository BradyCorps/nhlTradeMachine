import { NextRequest, NextResponse } from "next/server";
import { SEASON } from "@/app/lib/season-config";
import {
  ageDecay,
  hashString,
  mulberry32,
  scenarioSeed,
  stablePts,
} from "@/app/lib/sim-engine";

// ── Types ─────────────────────────────────────────────────────
interface SimPlayer {
  id: string;
  name: string;
  position: string;
  age: number;
  ptsPace: number;
  xGPace: number;
  avgTOI: number;
  capHit: number;
  yearsRemaining: number;
  gsax?: number;
  savePct?: number;
  gamesStarted?: number;
  teamId: string;
  games?: number;
  // Multi-season baselines (stamped by league routes; client passes them through)
  baselinePtsPace?: number;
  baselineGsax?: number;
  baselineHdsvPct?: number;
  pkTimeShare?: number;
  pairDriverScore?: number;
  prospectPtsPace?: number;
}

interface SimTeam {
  id: string;
  name: string;
  phase: string;
  standing: number;
  capSpace: number;
  // From NHL API stats endpoint
  goalsFor?: number;
  goalsAgainst?: number;
  gamesPlayed?: number;
  points?: number;
}

interface ProjectedSkaterSeason {
  playerId: string;
  name: string;
  position: string;
  age: number;
  preseasonGames: number;
  calderEligible: boolean;
  projectedPts: number;
  projectedGoals: number;
  projectedAssists: number;
  gamesPlayed: number;
  breakoutTag?: "BREAKOUT" | "REGRESSION" | "VETERAN_HOLD";
}

interface PlayoffSeries {
  home:     { teamId: string; teamName: string; pts: number };
  away:     { teamId: string; teamName: string; pts: number };
  winner:   { teamId: string; teamName: string };
  homeWins: number;
  awayWins: number;
}
interface ConferenceBracket {
  r1:       PlayoffSeries[];
  r2:       PlayoffSeries[];
  cf:       PlayoffSeries;
  champion: { teamId: string; teamName: string };
}
interface PlayoffBracket {
  eastern: ConferenceBracket;
  western: ConferenceBracket;
  final:   PlayoffSeries;
  champion: { teamId: string; teamName: string };
}

interface TradeRecord {
  homeTeamId: string;
  partnerTeamId: string;
  outgoing: SimPlayer[];
  incoming: SimPlayer[];
}

interface TradedPlayerOutcome {
  playerId: string;
  name: string;
  position: string;
  oldTeamId: string;
  newTeamId: string;
  oldTeamName: string;
  newTeamName: string;
  projectedPts?: number;
  projectedGoals?: number;
  projectedAssists?: number;
  gamesPlayed?: number;
  projectedGAA?: number;
  projectedSVP?: number;
  gamesStarted?: number;
  gsax?: number;
  role: string;
}

interface SimRequest {
  homeTeamId: string;
  partnerTeamId: string;
  teams: SimTeam[];
  players: SimPlayer[];
  trades: TradeRecord[];
  seed?: number;
}

// Stable GSAX on the same blend — baselineGsax is a weighted season-scale value
const stableGsax = (p: SimPlayer): number => {
  const cur = p.gsax ?? 0;
  return p.baselineGsax != null && p.baselineGsax !== 0
    ? cur * 0.4 + p.baselineGsax * 0.6
    : cur;
};

const onIceValue = (p: SimPlayer): number => {
  if (p.position === "Pick") return 0;
  if (p.position === "G") {
    const hdsvKicker = p.baselineHdsvPct != null
      ? Math.max(-8, Math.min(12, (p.baselineHdsvPct - 0.815) * 400))
      : 0;
    return stableGsax(p) * 1.2 + hdsvKicker;
  }
  const driverBonus = p.position === "D" && p.pairDriverScore != null
    ? Math.max(-5, Math.min(10, p.pairDriverScore * 0.5))
    : 0;
  const pkBonus = p.pkTimeShare != null && p.pkTimeShare >= 0.10
    ? Math.min(5, p.pkTimeShare * 30)
    : 0;
  return stablePts(p) + driverBonus + pkBonus;
};

// ── Wild card teams — higher variance ────────────────────────
const WILD_CARD_TEAMS = new Set(["WPG", "TOR", "CGY", "EDM", "NYR"]);

// ── Phase baseline point expectations ────────────────────────
const PHASE_BASELINE: Record<string, number> = {
  "Contender":  108, "Bubble": 95, "Retooling": 88,
  "Rebuilding": 76,  "Tanking": 65,
};

// ── Project a team's full season points ──────────────────────
function projectTeamPoints(
  team: SimTeam,
  roster: SimPlayer[],
  tradeNavDelta: number,
  capSpaceAfterTrade: number,
  rand: () => number,
): number {
  const phaseBaseline = PHASE_BASELINE[team.phase] ?? 88;

  const skaters = roster.filter(p => p.position !== "Pick" && p.position !== "G");
  const forwards = skaters
    .filter(p => p.position !== "D")
    .sort((a, b) => onIceValue(b) - onIceValue(a));
  const dmen = skaters
    .filter(p => p.position === "D")
    .sort((a, b) => onIceValue(b) - onIceValue(a));
  const goalies = roster
    .filter(p => p.position === "G")
    .sort((a, b) => onIceValue(b) - onIceValue(a));

  const avg = (arr: SimPlayer[], n: number) =>
    arr.length === 0 ? 0 : arr.slice(0, n).reduce((s, p) => s + onIceValue(p), 0) / Math.min(n, arr.length);

  const topSixF = avg(forwards, 6);
  const topNineF = avg(forwards, 9);
  const topFourD = avg(dmen, 4);
  const starterG = goalies[0] ? onIceValue(goalies[0]) : -4;
  const depthPenalty = forwards.length < 10 ? (10 - forwards.length) * 1.4 : 0;
  const dPenalty = dmen.length < 6 ? (6 - dmen.length) * 1.2 : 0;

  // Season-start replay: roster quality nudges phase baseline. Trade delta is
  // retained as a small context adjustment because it captures PK/goalie/driver
  // effects not fully visible in raw scoring depth.
  const rosterStrength =
    (topSixF - 55) * 0.20 +
    (topNineF - 42) * 0.18 +
    (topFourD - 32) * 0.20 +
    starterG * 0.18 -
    depthPenalty -
    dPenalty;
  const tradeContext = Math.max(-8, Math.min(8, tradeNavDelta / 12));

  // Hard cap enforcement: teams over the ceiling are forced to shed cap mid-season.
  // Roster disruption from emergency moves costs wins.
  // Each $1M over → lose ~3 projected pts (rough: one win ≈ $3-4M of cap value).
  const capPenalty = capSpaceAfterTrade < -0.5
    ? Math.abs(capSpaceAfterTrade) * 3
    : 0;

  // Phase variance — wild cards get wider range
  const isWildCard = WILD_CARD_TEAMS.has(team.id);
  const varianceRange = isWildCard ? 14 : 8;
  const phase = team.phase ?? "";
  let varianceMid = 0;
  if (phase === "Rebuilding" || phase === "Tanking") varianceMid = -3;
  if (phase === "Contender") varianceMid = 2;
  const variance = varianceMid + (rand() * varianceRange - varianceRange / 2);

  return Math.round(Math.max(55, Math.min(135, phaseBaseline + rosterStrength + tradeContext + variance - capPenalty)));
}

// ── Project starting goalie ───────────────────────────────────
function projectGoalie(
  roster: SimPlayer[],
  teamWinPct: number,
  rand: () => number,
): { name: string; projectedGAA: number; projectedSVP: number; gamesStarted: number; gsax: number } | null {
  const goalies = roster
    .filter(p => p.position === "G")
    .sort((a, b) => (b.gamesStarted ?? 0) - (a.gamesStarted ?? 0));

  if (goalies.length === 0) return null;

  const g    = goalies[0];
  // Multi-season blend — single-season GSAX is noisy; the baseline (when
  // present) anchors the projection the same way the X-NAV engine blends it
  const gsax = stableGsax(g);

  const gsaxSVP  = 0.910 + (gsax / 20) * 0.015;
  const currentSVP = g.savePct ?? 0.910;
  let baseSVP    = gsaxSVP * 0.70 + currentSVP * 0.30;

  // HDSV% anchor: high-danger save % is the most repeatable goalie skill.
  // A goalie at .835 HDSV (elite) gets ~+0.004 SVP pull; .795 gets ~-0.004.
  if (g.baselineHdsvPct != null) {
    baseSVP += (g.baselineHdsvPct - 0.815) * 0.20;
  }

  const teamContext  = (teamWinPct - 0.5) * 0.008;
  const age          = g.age ?? 28;
  const ageRegression = age > 33 ? -(age - 33) * 0.002 :
                        age < 24 ? -(24 - age)  * 0.001 : 0;

  // Depth/call-up penalty: a goalie with very few career starts has an unknown
  // quality floor. Widen variance significantly and anchor closer to league average
  // so a 0-start call-up doesn't silently inherit a .910 baseline.
  // A multi-season HDSV% baseline is proven skill — it narrows the band.
  const careerStarts  = g.gamesStarted ?? 0;
  const isUnproven    = careerStarts < 20 && g.baselineHdsvPct == null;
  const varianceWidth = isUnproven    ? 0.028 :  // wide: could be .880 or .935
                        g.baselineHdsvPct != null ? 0.010 :
                        Math.abs(gsax) > 15 ? 0.008 :
                        Math.abs(gsax) > 5  ? 0.012 : 0.018;

  // Pull unproven goalies toward league average (penalises the call-up vacuum)
  const provenWeight  = isUnproven ? Math.min(0.5, careerStarts / 20) : 1.0;
  const anchoredBase  = baseSVP * provenWeight + 0.906 * (1 - provenWeight);

  const svpVariance   = (rand() - 0.5) * varianceWidth * 2;
  const projectedSVP  = Math.max(0.880, Math.min(0.945,
    anchoredBase + teamContext + ageRegression + svpVariance
  ));

  const shotsPerGame  = 28 + (1 - teamWinPct) * 8;
  const projectedGAA  = shotsPerGame * (1 - projectedSVP);
  const gamesStarted  = Math.round(48 + rand() * 20);

  return {
    name: g.name,
    projectedGAA: Math.round(projectedGAA * 100) / 100,
    projectedSVP: Math.round(projectedSVP * 1000) / 1000,
    gamesStarted,
    gsax: g.gsax ?? 0,
  };
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

// ── Project skater seasons across a full roster ───────────────
// This keeps last-season scoring as the anchor, but lets age, prospect NHLe,
// prior usage, and controlled variance create believable breakouts/regressions.
function projectSkaterOutcome(p: SimPlayer, teamId: string, seed: number): ProjectedSkaterSeason {
  const rand = mulberry32(seed + hashString(`${teamId}:${p.id}:skater-season`));
  const priorGames = p.games ?? 82;
  const prospectPace = p.prospectPtsPace != null ? p.prospectPtsPace * 0.72 : 0;
  const stablePace = p.ptsPace > 0
    ? stablePts(p)
    : prospectPace;

  const isProspectProfile = p.age <= 22 && (priorGames < 45 || prospectPace > stablePace);
  const isYoungRegular    = p.age <= 24 && priorGames >= 20;
  const isPrime           = p.age >= 25 && p.age <= 29;
  const isDeclineRisk     = p.age >= 32;
  const isAgingWell       = p.age >= 31
    && stablePace >= 65
    && (p.avgTOI ?? 0) >= (p.position === "D" ? 21 : 17)
    && priorGames >= 45;

  let development = ageDecay(p.age, p.position);
  if (isProspectProfile) development *= 0.94 + rand() * 0.34;
  else if (isYoungRegular) development *= 0.96 + rand() * 0.24;
  else if (isPrime) development *= 0.96 + rand() * 0.12;
  else if (isAgingWell) development *= 1.04 + rand() * 0.12;
  else development *= 0.90 + rand() * 0.18;

  let breakoutTag: ProjectedSkaterSeason["breakoutTag"];
  const breakoutChance =
    isProspectProfile ? 0.24 :
    isYoungRegular    ? 0.16 :
    p.age <= 26 && stablePace < 55 ? 0.08 :
    0.03;
  const regressionChance =
    isAgingWell ? 0.07 :
    isDeclineRisk ? 0.18 :
    stablePace >= 85 ? 0.10 :
    isProspectProfile ? 0.12 :
    0.05;

  const eventRoll = rand();
  if (eventRoll < breakoutChance) {
    development *= 1.14 + rand() * (isProspectProfile ? 0.24 : 0.16);
    breakoutTag = "BREAKOUT";
  } else if (eventRoll > 1 - regressionChance) {
    development *= 0.78 + rand() * 0.14;
    breakoutTag = "REGRESSION";
  } else if (isAgingWell && eventRoll > 0.55) {
    development *= 1.02 + rand() * 0.08;
    breakoutTag = "VETERAN_HOLD";
  }

  let gamesPlayed = Math.round(70 + rand() * 12);
  if (isProspectProfile) gamesPlayed = Math.round(55 + rand() * 27);
  if (rand() < (isAgingWell ? 0.04 : isDeclineRisk ? 0.10 : 0.055)) {
    gamesPlayed = Math.max(8, gamesPlayed - Math.round((isAgingWell ? 10 : 18) + rand() * (isAgingWell ? 18 : 38)));
  }

  const paceVariance = isAgingWell ? 0.98 + rand() * 0.14 : 0.91 + rand() * 0.18;
  const projectedPts = Math.max(0, Math.round((stablePace / 82) * gamesPlayed * development * paceVariance));
  const xgGoalShare = stablePace > 0
    ? clamp((p.xGPace ?? 0) / Math.max(stablePace, 1), 0.22, p.position === "D" ? 0.36 : 0.55)
    : p.position === "D" ? 0.24 : 0.38;
  const roleGoalShare = p.position === "D" ? 0.24 : xgGoalShare;
  const projectedGoals = Math.max(0, Math.min(projectedPts, Math.round(projectedPts * roleGoalShare * (0.88 + rand() * 0.24))));

  return {
    playerId: p.id,
    name: p.name,
    position: p.position,
    age: p.age,
    preseasonGames: priorGames,
    calderEligible: p.age <= 22 && priorGames <= 14,
    projectedPts,
    projectedGoals,
    projectedAssists: Math.max(0, projectedPts - projectedGoals),
    gamesPlayed,
    breakoutTag,
  };
}

// ── Simulate full league standings ────────────────────────────
function simulateLeague(
  teams: SimTeam[],
  playersByTeam: Map<string, SimPlayer[]>,
  tradeNavDeltas: Map<string, number>,
  capDeltas: Map<string, number>,
  seed: number,
): SimTeamResult[] {
  return teams.map(team => {
    const roster     = playersByTeam.get(team.id) ?? [];
    const navDelta   = tradeNavDeltas.get(team.id) ?? 0;
    const capDelta   = capDeltas.get(team.id) ?? 0;
    const capSpaceAfterTrade = team.capSpace - capDelta;
    const teamSeed = seed + hashString(`team:${team.id}`);
    const projectedPoints = projectTeamPoints(
      team,
      roster,
      navDelta,
      capSpaceAfterTrade,
      mulberry32(teamSeed + hashString("points")),
    );
    const projectedSkaters = roster
      .filter(p => p.position !== "Pick" && p.position !== "G"
        && (p.ptsPace > 0 || (p.prospectPtsPace ?? 0) > 0)
        && ((p.games ?? 0) >= 5 || (p.prospectPtsPace ?? 0) > 0))
      .map(p => projectSkaterOutcome(p, team.id, seed))
      .sort((a, b) =>
        b.projectedPts !== a.projectedPts
          ? b.projectedPts - a.projectedPts
          : a.name.localeCompare(b.name)
      );
    const topScorer  = projectedSkaters[0] ?? null;
    const winPct     = projectedPoints / 164;
    const goalie     = projectGoalie(roster, winPct, mulberry32(teamSeed + hashString("goalie")));
    const topDefenseman = projectedSkaters
      .filter(p => p.position === "D")
      .sort((a, b) =>
        b.projectedPts !== a.projectedPts
          ? b.projectedPts - a.projectedPts
          : a.name.localeCompare(b.name)
      )[0] ?? null;
    return {
      teamId: team.id, teamName: team.name, phase: team.phase,
      projectedPoints, topScorer, projectedSkaters: projectedSkaters.slice(0, 18), goalie, topDefenseman,
      madePlayoffs: false, divisionRank: 0, leagueRank: 0, division: "",
    };
  });
}

interface SimTeamResult {
  teamId: string;
  teamName: string;
  phase: string;
  projectedPoints: number;
  topScorer: ProjectedSkaterSeason | null;
  projectedSkaters: ProjectedSkaterSeason[];
  goalie: { name: string; projectedGAA: number; projectedSVP: number; gamesStarted: number; gsax: number } | null;
  topDefenseman: ProjectedSkaterSeason | null;
  madePlayoffs: boolean;
  divisionRank: number;
  leagueRank: number;
  division: string;
}

// ── Division/conference structure ─────────────────────────────
const DIVISIONS: Record<string, string[]> = {
  Atlantic:     ["BOS","BUF","DET","FLA","MTL","OTT","TBL","TOR"],
  Metropolitan: ["CAR","CBJ","NJD","NYI","NYR","PHI","PIT","WSH"],
  Central:      ["UTA","CHI","COL","DAL","MIN","NSH","STL","WPG"],
  Pacific:      ["ANA","CGY","EDM","LAK","SEA","SJS","VAN","VGK"],
};
const EASTERN = new Set([...DIVISIONS.Atlantic, ...DIVISIONS.Metropolitan]);

function assignPlayoffSeeds(results: SimTeamResult[]): SimTeamResult[] {
  const byId = new Map(results.map(r => [r.teamId, r]));
  const conferenceNonDiv = new Map<string, SimTeamResult[]>();
  conferenceNonDiv.set("E", []);
  conferenceNonDiv.set("W", []);

  for (const [divName, teamIds] of Object.entries(DIVISIONS)) {
    const divTeams = teamIds
      .map(id => byId.get(id))
      .filter(Boolean) as SimTeamResult[];

    // Deterministic tiebreaker: if points equal, sort by teamId string for stability
    divTeams.sort((a, b) =>
      b.projectedPoints !== a.projectedPoints
        ? b.projectedPoints - a.projectedPoints
        : a.teamId.localeCompare(b.teamId)
    );

    divTeams.forEach((t, i) => {
      t.divisionRank = i + 1;
      t.division     = divName;
      if (i < 3) {
        t.madePlayoffs = true;
      }
    });

    const conf = EASTERN.has(teamIds[0]) ? "E" : "W";
    divTeams.slice(3).forEach(t => conferenceNonDiv.get(conf)!.push(t));
  }

  // Wildcards — top 2 non-div qualifiers per conference
  for (const conf of ["E", "W"]) {
    const remaining = conferenceNonDiv.get(conf)!.sort((a, b) =>
      b.projectedPoints !== a.projectedPoints
        ? b.projectedPoints - a.projectedPoints
        : a.teamId.localeCompare(b.teamId)
    );
    remaining.slice(0, 2).forEach(t => { t.madePlayoffs = true; });
  }

  // Overall league rank — deterministic tiebreaker
  results.sort((a, b) =>
    b.projectedPoints !== a.projectedPoints
      ? b.projectedPoints - a.projectedPoints
      : a.teamId.localeCompare(b.teamId)
  );
  results.forEach((t, i) => { t.leagueRank = i + 1; });

  return results;
}

// ── Simulate a single playoff series ─────────────────────────
function simulateSeries(high: SimTeamResult, low: SimTeamResult, rand: () => number): PlayoffSeries {
  const gap     = high.projectedPoints - low.projectedPoints;
  const winProb = Math.min(0.72, Math.max(0.35, 0.50 + gap * 0.0025));
  let highWins = 0, lowWins = 0;
  while (highWins < 4 && lowWins < 4) {
    if (rand() < winProb) highWins++; else lowWins++;
  }
  const winner = highWins === 4 ? high : low;
  return {
    home:     { teamId: high.teamId, teamName: high.teamName, pts: high.projectedPoints },
    away:     { teamId: low.teamId,  teamName: low.teamName,  pts: low.projectedPoints  },
    winner:   { teamId: winner.teamId, teamName: winner.teamName },
    homeWins: highWins,
    awayWins: lowWins,
  };
}

function simulateSeriesByStrength(a: SimTeamResult, b: SimTeamResult, rand: () => number): PlayoffSeries {
  return a.projectedPoints >= b.projectedPoints
    ? simulateSeries(a, b, rand)
    : simulateSeries(b, a, rand);
}

// ── Simulate conference playoff bracket (NHL format since 2014) ──
// Round 1: Top div winner vs WC2 · Other div winner vs WC1
//          Top div 2nd vs 3rd   · Other div 2nd vs 3rd
// Round 2: Winners stay on their bracket side (no re-seeding)
// Conf Final: R2 winners
function simulateConference(
  seeds: SimTeamResult[],
  conf: "E" | "W",
  rand: () => number,
): ConferenceBracket {
  const uniqueSeeds = Array.from(
    new Map(seeds.map((team) => [team.teamId, team])).values()
  ).sort((a, b) =>
    b.projectedPoints !== a.projectedPoints
      ? b.projectedPoints - a.projectedPoints
      : a.teamId.localeCompare(b.teamId)
  );

  if (uniqueSeeds.length < 2) {
    throw new Error("Cannot simulate conference playoffs with fewer than two unique teams");
  }

  const divNames = conf === "E"
    ? ["Atlantic", "Metropolitan"]
    : ["Central", "Pacific"];

  const seedById = new Map(uniqueSeeds.map((team) => [team.teamId, team]));
  const usedSlots = new Set<string>();
  const takeFallback = (avoidTeamId?: string): SimTeamResult => {
    const team = uniqueSeeds.find(t => t.teamId !== avoidTeamId && !usedSlots.has(t.teamId))
      ?? uniqueSeeds.find(t => t.teamId !== avoidTeamId)
      ?? uniqueSeeds[0];
    usedSlots.add(team.teamId);
    return team;
  };
  const takeSlot = (preferred: SimTeamResult | undefined, avoidTeamId?: string): SimTeamResult => {
    if (preferred && preferred.teamId !== avoidTeamId && !usedSlots.has(preferred.teamId)) {
      usedSlots.add(preferred.teamId);
      return preferred;
    }
    return takeFallback(avoidTeamId);
  };
  const find = (div: string, rank: number): SimTeamResult | undefined =>
    uniqueSeeds.find(t => t.division === div && t.divisionRank === rank);

  const divAWin = takeSlot(find(divNames[0], 1));
  const divBWin = takeSlot(find(divNames[1], 1), divAWin.teamId);

  // Top conference seed = better record among the two division winners
  const [topWin, otherWin] = divAWin.projectedPoints >= divBWin.projectedPoints
    ? [divAWin, divBWin]
    : [divBWin, divAWin];

  const topDiv2   = takeSlot(find(topWin.division,   2), topWin.teamId);
  const topDiv3   = takeSlot(find(topWin.division,   3), topDiv2.teamId);
  const otherDiv2 = takeSlot(find(otherWin.division, 2), otherWin.teamId);
  const otherDiv3 = takeSlot(find(otherWin.division, 3), otherDiv2.teamId);

  // Wildcards sorted best→worst; WC1 is the better wildcard
  const wcs = uniqueSeeds
    .filter(t => t.divisionRank > 3)
    .sort((a, b) =>
      b.projectedPoints !== a.projectedPoints
        ? b.projectedPoints - a.projectedPoints
        : a.teamId.localeCompare(b.teamId)
    );
  const wc1 = takeSlot(wcs[0]);
  const wc2 = takeSlot(wcs[1], wc1.teamId);

  // Round 1
  const r1 = [
    simulateSeriesByStrength(topWin,   wc2,      rand), // best conf seed vs WC2
    simulateSeriesByStrength(otherWin, wc1,      rand), // other div winner vs WC1
    simulateSeriesByStrength(topDiv2,  topDiv3,  rand), // top div's 2nd vs 3rd
    simulateSeriesByStrength(otherDiv2, otherDiv3, rand), // other div's 2nd vs 3rd
  ];

  const getW = (s: PlayoffSeries): SimTeamResult => {
    const winner = seedById.get(s.winner.teamId);
    if (!winner) throw new Error(`Playoff winner ${s.winner.teamId} was not found in conference seeds`);
    return winner;
  };

  // Round 2 — bracket stays on same side, no re-seeding
  const r2 = [
    simulateSeriesByStrength(getW(r1[0]), getW(r1[2]), rand), // top div winner's side
    simulateSeriesByStrength(getW(r1[1]), getW(r1[3]), rand), // other div winner's side
  ];

  const cf = simulateSeriesByStrength(getW(r2[0]), getW(r2[1]), rand);
  return { r1, r2, cf, champion: cf.winner };
}

function simulatePlayoffs(standings: SimTeamResult[], rand: () => number): PlayoffBracket {
  const playoffTeams = standings.filter(t => t.madePlayoffs);
  const eastern = playoffTeams
    .filter(t => EASTERN.has(t.teamId))
    .sort((a, b) => b.projectedPoints - a.projectedPoints);
  const western = playoffTeams
    .filter(t => !EASTERN.has(t.teamId))
    .sort((a, b) => b.projectedPoints - a.projectedPoints);

  const eastBracket = simulateConference(eastern, "E", rand);
  const westBracket = simulateConference(western, "W", rand);

  const eastChamp = playoffTeams.find(t => t.teamId === eastBracket.champion.teamId)!;
  const westChamp = playoffTeams.find(t => t.teamId === westBracket.champion.teamId)!;
  const final = simulateSeries(
    eastChamp.projectedPoints >= westChamp.projectedPoints ? eastChamp : westChamp,
    eastChamp.projectedPoints >= westChamp.projectedPoints ? westChamp : eastChamp,
    rand
  );

  return { eastern: eastBracket, western: westBracket, final, champion: final.winner };
}

function findLeagueLeaders(
  standings: SimTeamResult[],
  rand: () => number,
): {
  topScorer: { name: string; team: string; pts: number } | null;
  topGoalie:     { name: string; team: string; gaa: number; svp: number } | null;
  vezina:        { name: string; team: string; gaa: number; svp: number } | null;
  hart:          { name: string; team: string; pts: number } | null;
  norris:        { name: string; team: string; pts: number } | null;
  goalsLeader:   { name: string; team: string; goals: number } | null;
  assistsLeader: { name: string; team: string; assists: number } | null;
  connSmythe:    { name: string; team: string } | null;
  presidentsTrophy: SimTeamResult;
  cupWinner: SimTeamResult;
  draftLottery: SimTeamResult;
} {
  const presidentsTrophy = standings[0];
  const playoffTeams = standings.filter(t => t.madePlayoffs);
  const sortedPlayoff = [...playoffTeams].sort((a, b) => b.projectedPoints - a.projectedPoints);

  const cupIndex = Math.min(
    sortedPlayoff.length - 1,
    Math.floor(Math.pow(rand(), 1.8) * sortedPlayoff.length)
  );
  const rawCupWinner = sortedPlayoff[cupIndex];
  const cupWinner = rawCupWinner?.teamId === "FLA"
    ? sortedPlayoff.find(t => t.teamId !== "FLA") ?? rawCupWinner
    : rawCupWinner;

  const skaterPool = standings.flatMap(team =>
    team.projectedSkaters.map(p => ({
      ...p,
      teamId: team.teamId,
      teamName: team.teamName,
      teamRank: team.leagueRank,
      madePlayoffs: team.madePlayoffs,
    }))
  );

  const topScorer = [...skaterPool].sort((a, b) =>
    b.projectedPts !== a.projectedPts
      ? b.projectedPts - a.projectedPts
      : a.name.localeCompare(b.name)
  )[0];
  const topScorerResult = topScorer
    ? { name: topScorer.name, team: topScorer.teamName, pts: topScorer.projectedPts }
    : null;

  let topGoalieResult: { name: string; team: string; gaa: number; svp: number } | null = null;
  for (const team of standings) {
    if (team.goalie && team.goalie.gamesStarted >= 25 &&
        (!topGoalieResult || team.goalie.projectedGAA < topGoalieResult.gaa)) {
      topGoalieResult = { name: team.goalie.name, team: team.teamName,
                          gaa: team.goalie.projectedGAA, svp: team.goalie.projectedSVP };
    }
  }

  let vezinaResult: { name: string; team: string; gaa: number; svp: number } | null = null;
  let bestVezinaScore = -Infinity;
  for (const team of standings) {
    if (!team.goalie || team.goalie.gamesStarted < 25) continue;
    const gsax  = team.goalie.gsax ?? 0;
    const score = gsax * 2.5 + (team.goalie.projectedSVP - 0.905) * 200 + rand() * 5;
    if (score > bestVezinaScore) {
      bestVezinaScore = score;
      vezinaResult = { name: team.goalie.name, team: team.teamName,
                       gaa: team.goalie.projectedGAA, svp: team.goalie.projectedSVP };
    }
  }

  let hartResult: { name: string; team: string; pts: number } | null = null;
  let bestHart = -Infinity;
  for (const p of skaterPool.filter(p => p.projectedPts >= 65)) {
    const teamBonus = p.madePlayoffs ? 1.10 + (1 / (p.teamRank + 1)) * 0.20 : 0.78;
    const breakoutBonus = p.breakoutTag === "BREAKOUT" ? 1.04 : 1.0;
    const score = p.projectedPts * teamBonus * breakoutBonus * (0.90 + rand() * 0.20);
    if (score > bestHart) {
      bestHart = score;
      hartResult = { name: p.name, team: p.teamName, pts: p.projectedPts };
    }
  }

  let norrisResult: { name: string; team: string; pts: number } | null = null;
  let bestNorris = -Infinity;
  for (const p of skaterPool.filter(p => p.position === "D" && p.projectedPts >= 35)) {
    const score = p.projectedPts * (0.84 + rand() * 0.32);
    if (score > bestNorris) {
      bestNorris = score;
      norrisResult = { name: p.name, team: p.teamName, pts: p.projectedPts };
    }
  }

  let goalsLeader:   { name: string; team: string; goals: number } | null = null;
  let assistsLeader: { name: string; team: string; assists: number } | null = null;
  for (const p of skaterPool) {
    if (!goalsLeader || p.projectedGoals > goalsLeader.goals) {
      goalsLeader = { name: p.name, team: p.teamName, goals: p.projectedGoals };
    }
    if (!assistsLeader || p.projectedAssists > assistsLeader.assists) {
      assistsLeader = { name: p.name, team: p.teamName, assists: p.projectedAssists };
    }
  }

  const cupTeam          = standings.find(t => t.teamId === cupWinner?.teamId);
  const connSmytheResult = cupTeam?.topScorer
    ? { name: cupTeam.topScorer.name, team: cupTeam.teamName }
    : null;

  const nonPlayoff   = standings.filter(t => !t.madePlayoffs)
    .sort((a, b) => a.projectedPoints - b.projectedPoints);
  const draftLottery = nonPlayoff[0];

  return {
    topScorer: topScorerResult, topGoalie: topGoalieResult,
    vezina: vezinaResult, hart: hartResult, norris: norrisResult,
    goalsLeader, assistsLeader, connSmythe: connSmytheResult,
    presidentsTrophy, cupWinner, draftLottery,
  };
}

function buildTradedPlayerOutcomes(
  trades: TradeRecord[],
  teams: SimTeam[],
  standings: SimTeamResult[],
  seed: number,
): TradedPlayerOutcome[] {
  const teamName = (id: string) => teams.find(t => t.id === id)?.name ?? id;
  const teamWinPct = (id: string) =>
    (standings.find(t => t.teamId === id)?.projectedPoints
      ?? PHASE_BASELINE[teams.find(t => t.id === id)?.phase ?? "Retooling"]
      ?? 88) / 164;
  const outcomes: TradedPlayerOutcome[] = [];

  const addOutcome = (p: SimPlayer, oldTeamId: string, newTeamId: string) => {
    if (p.position === "Pick") return;
    if (p.position === "G") {
      const winPctAnchor = teamWinPct(newTeamId);
      const goalie = projectGoalie([p], winPctAnchor, mulberry32(seed + hashString(`${newTeamId}:${p.id}:goalie-outcome`)));
      outcomes.push({
        playerId: p.id,
        name: p.name,
        position: p.position,
        oldTeamId,
        newTeamId,
        oldTeamName: teamName(oldTeamId),
        newTeamName: teamName(newTeamId),
        projectedGAA: goalie?.projectedGAA,
        projectedSVP: goalie?.projectedSVP,
        gamesStarted: goalie?.gamesStarted,
        gsax: goalie?.gsax,
        role: (p.gamesStarted ?? p.games ?? 0) >= 45 ? "starter goalie" : "goalie",
      });
      return;
    }

    const skater = projectSkaterOutcome(p, newTeamId, seed);
    outcomes.push({
      playerId: p.id,
      name: p.name,
      position: p.position,
      oldTeamId,
      newTeamId,
      oldTeamName: teamName(oldTeamId),
      newTeamName: teamName(newTeamId),
      projectedPts: skater.projectedPts,
      projectedGoals: skater.projectedGoals,
      projectedAssists: skater.projectedAssists,
      gamesPlayed: skater.gamesPlayed,
      role: p.position === "D" ? "defenceman" : "skater",
    });
  };

  for (const trade of trades) {
    trade.outgoing.forEach(p => addOutcome(p, trade.homeTeamId, trade.partnerTeamId));
    trade.incoming.forEach(p => addOutcome(p, trade.partnerTeamId, trade.homeTeamId));
  }

  const seen = new Set<string>();
  return outcomes.filter(o => {
    const key = `${o.playerId}:${o.oldTeamId}:${o.newTeamId}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Main handler ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body: SimRequest = await req.json();
    const { homeTeamId, partnerTeamId, teams, players, trades } = body;

    const seed = body.seed ?? scenarioSeed({
      mode: SEASON.simulationMode,
      homeTeamId,
      partnerTeamId,
      trades: trades.map(t => ({
        homeTeamId: t.homeTeamId,
        partnerTeamId: t.partnerTeamId,
        outgoing: t.outgoing.map(p => ({ id: p.id, retainedPct: (p as any).retainedPct ?? 0 })),
        incoming: t.incoming.map(p => ({ id: p.id, retainedPct: (p as any).retainedPct ?? 0 })),
      })),
    });
    const rand = mulberry32(seed);

    // Build player roster map — apply trades
    const playersByTeam = new Map<string, SimPlayer[]>();
    for (const team of teams) playersByTeam.set(team.id, []);
    for (const p of players) {
      if (p.position === "Pick") continue;
      playersByTeam.get(p.teamId)?.push(p);
    }
    for (const trade of trades) {
      const outIds = new Set(trade.outgoing.map(p => p.id));
      const inIds  = new Set(trade.incoming.map(p => p.id));
      for (const [teamId, roster] of playersByTeam) {
        if (teamId === trade.homeTeamId) {
          playersByTeam.set(teamId, [
            ...roster.filter(p => !outIds.has(p.id)),
            ...trade.incoming.filter(p => p.position !== "Pick"),
          ]);
        } else if (teamId === trade.partnerTeamId) {
          playersByTeam.set(teamId, [
            ...roster.filter(p => !inIds.has(p.id)),
            ...trade.outgoing.filter(p => p.position !== "Pick"),
          ]);
        }
      }
    }

    // Trade impact and cap delta per team. The season-start replay uses the
    // post-trade roster for team strength, with this delta retained as a small
    // context adjustment for special-teams, goalie, and driver effects.
    const tradeNavDeltas = new Map<string, number>();
    const capDeltas      = new Map<string, number>();
    for (const trade of trades) {
      const skaters = (arr: SimPlayer[]) => arr.filter(p => p.position !== "Pick");
      const outVal = skaters(trade.outgoing).reduce((s, p) => s + onIceValue(p), 0);
      const inVal  = skaters(trade.incoming).reduce((s, p) => s + onIceValue(p), 0);
      const outCap = skaters(trade.outgoing).reduce((s, p) => s + p.capHit,  0);
      const inCap  = skaters(trade.incoming).reduce((s, p) => s + p.capHit,  0);
      const valDelta = inVal  - outVal;
      const capDelta = inCap  - outCap;
      tradeNavDeltas.set(trade.homeTeamId,    (tradeNavDeltas.get(trade.homeTeamId)    ?? 0) + valDelta);
      tradeNavDeltas.set(trade.partnerTeamId, (tradeNavDeltas.get(trade.partnerTeamId) ?? 0) - valDelta);
      capDeltas.set(trade.homeTeamId,         (capDeltas.get(trade.homeTeamId)         ?? 0) + capDelta);
      capDeltas.set(trade.partnerTeamId,      (capDeltas.get(trade.partnerTeamId)      ?? 0) - capDelta);
    }

    const rawStandings = simulateLeague(teams, playersByTeam, tradeNavDeltas, capDeltas, seed);
    const standings    = assignPlayoffSeeds(rawStandings);
    const leaders      = findLeagueLeaders(standings, rand);

    const homeResult    = standings.find(t => t.teamId === homeTeamId);
    const partnerResult = standings.find(t => t.teamId === partnerTeamId);

    const divisionContext: Record<string, SimTeamResult[]> = {};
    for (const [div, teamIds] of Object.entries(DIVISIONS)) {
      divisionContext[div] = standings
        .filter(t => teamIds.includes(t.teamId))
        .sort((a, b) => b.projectedPoints - a.projectedPoints);
    }

    const rookieCandidates = standings.flatMap(team =>
      team.projectedSkaters
        .filter(p => p.calderEligible && p.gamesPlayed >= 35)
        .map(p => ({ ...p, teamName: team.teamName }))
    );
    const calderWinner = (() => {
      if (rookieCandidates.length === 0) return { name: "Matthew Schaefer", team: "New York Islanders", note: "—" };
      const sorted = rookieCandidates
        .map(p => ({ p, score: p.projectedPts + (p.breakoutTag === "BREAKOUT" ? 8 : 0) + rand() * 10 }))
        .sort((a, b) => b.score - a.score);
      const winner = sorted[0].p;
      return {
        name: winner.name,
        team: winner.teamName,
        note: `${winner.projectedGoals}-${winner.projectedAssists}-${winner.projectedPts} in projected rookie season`,
      };
    })();

    const playoffBracket = simulatePlayoffs(standings, rand);
    const cupWinner = standings.find(t => t.teamId === playoffBracket.champion.teamId) ?? leaders.cupWinner;
    const connSmythe = cupWinner?.topScorer
      ? { name: cupWinner.topScorer.name, team: cupWinner.teamName }
      : null;
    const tradedPlayerOutcomes = buildTradedPlayerOutcomes(trades, teams, standings, seed);

    return NextResponse.json({
      seed,
      homeTeam:    homeResult,
      partnerTeam: partnerResult,
      standings:   standings.slice(0, 32),
      divisions:   divisionContext,
      leaders: {
        ...leaders,
        cupWinner,
        connSmythe,
        calder: calderWinner,
      },
      playoffBracket,
      playoffTeams: standings.filter(t => t.madePlayoffs).map(t => t.teamId),
      tradedPlayerOutcomes,
      simulationMode: SEASON.simulationMode,
      replaySeason: SEASON.replaySeason,
      rosterMoveWindow: SEASON.rosterMoveWindow,
      latestCompleted: SEASON.latestCompleted,
      generatedAt: new Date().toISOString(),
    });

  } catch (e: any) {
    console.error("[simulate]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
