import { NextRequest, NextResponse } from "next/server";

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

interface SimRequest {
  homeTeamId: string;
  partnerTeamId: string;
  teams: SimTeam[];
  players: SimPlayer[];
  trades: TradeRecord[];
  seed?: number;
}

// ── Seeded PRNG — mulberry32 ──────────────────────────────────
// Deterministic randomness so same seed = same sim result
function mulberry32(seed: number) {
  return function() {
    seed |= 0; seed = seed + 0x6D2B79F5 | 0;
    let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// ── Pythagorean win expectation ───────────────────────────────
// Classic hockey formula: GF^2.37 / (GF^2.37 + GA^2.37)
const pythagorean = (gf: number, ga: number): number => {
  const exp = 2.37;
  const gfP = Math.pow(Math.max(gf, 1), exp);
  const gaP = Math.pow(Math.max(ga, 1), exp);
  return gfP / (gfP + gaP);
};

// ── Stable production estimate ────────────────────────────────
// 40% current pace / 60% multi-season baseline — same blend the X-NAV engine
// uses. YoY persistence audit (2022-26, n=1667): single-season r=0.864, so a
// hot or injury-skewed season shouldn't fully drive the projection.
const stablePts = (p: SimPlayer): number =>
  p.baselinePtsPace && p.baselinePtsPace > 0
    ? p.ptsPace * 0.4 + p.baselinePtsPace * 0.6
    : p.ptsPace;

// Stable GSAX on the same blend — baselineGsax is a weighted season-scale value
const stableGsax = (p: SimPlayer): number => {
  const cur = p.gsax ?? 0;
  return p.baselineGsax != null && p.baselineGsax !== 0
    ? cur * 0.4 + p.baselineGsax * 0.6
    : cur;
};

// ── Age decay factor ──────────────────────────────────────────
// Cohort audit (2022-26): forwards decline ≈ -2.5 pts/82 per year from 28,
// steepening to -6+/yr by 34. The flat per-year rate matches the early phase;
// the 33+ tail needs to be ~2.5x steeper than the old linear extension.
const ageDecay = (age: number, position: string): number => {
  const peak = position === "D" ? 27 : position === "G" ? 29 : 26;
  if (age <= peak) return 1.0 + Math.max(0, (peak - age) * 0.005);
  const baseRate  = position === "D" ? 0.018 : 0.022;
  const earlyYears = Math.min(age, 33) - peak;
  const lateYears  = Math.max(0, age - 33);
  const decline = earlyYears * baseRate + lateYears * baseRate * 2.5;
  return Math.max(0.50, 1.0 - decline);
};

// ── Wild card teams — higher variance ────────────────────────
const WILD_CARD_TEAMS = new Set(["WPG", "TOR", "CGY", "EDM", "NYR"]);

// ── Phase baseline point expectations ────────────────────────
const PHASE_BASELINE: Record<string, number> = {
  "Contender":  108, "Bubble": 95, "Retooling": 88,
  "Rebuilding": 76,  "Tanking": 65,
};

// ── Fetch live standings from NHL API ────────────────────────
async function fetchLiveStandings(): Promise<Map<string, { points: number; gamesPlayed: number; goalsFor: number; goalsAgainst: number }>> {
  const map = new Map<string, { points: number; gamesPlayed: number; goalsFor: number; goalsAgainst: number }>();
  try {
    const res = await fetch(
      "https://api.nhle.com/stats/rest/en/team/summary?cayenneExp=seasonId=20252026%20and%20gameTypeId=2&limit=32",
      { signal: AbortSignal.timeout(8000), cache: "no-store" }
    );
    if (!res.ok) return map;
    const data = await res.json();
    const NHL_ID_TO_TRICODE: Record<number, string> = {
      1:"NJD",2:"NYI",3:"NYR",4:"PHI",5:"PIT",6:"BOS",7:"BUF",8:"MTL",9:"OTT",10:"TOR",
      12:"CAR",13:"FLA",14:"TBL",15:"WSH",16:"CHI",17:"DET",18:"NSH",19:"STL",20:"CGY",
      21:"COL",22:"EDM",23:"VAN",24:"ANA",25:"DAL",26:"LAK",28:"SJS",29:"CBJ",30:"MIN",
      52:"WPG",54:"VGK",55:"SEA",68:"UTA",
    };
    for (const t of data.data ?? []) {
      const id = NHL_ID_TO_TRICODE[t.teamId];
      if (id) map.set(id, {
        points:       t.points       ?? 0,
        gamesPlayed:  t.gamesPlayed  ?? 1,
        goalsFor:     t.goalsFor     ?? 150,
        goalsAgainst: t.goalsAgainst ?? 150,
      });
    }
  } catch (_) {}
  return map;
}

// ── Project a team's full season points ──────────────────────
function projectTeamPoints(
  team: SimTeam,
  liveStats: { points: number; gamesPlayed: number; goalsFor: number; goalsAgainst: number } | undefined,
  tradeNavDelta: number,
  capSpaceAfterTrade: number,
  rand: () => number,
): number {
  let pacedPts: number;
  if (liveStats && liveStats.gamesPlayed > 10) {
    const gp         = liveStats.gamesPlayed;
    const remaining  = 82 - gp;
    const winPct     = pythagorean(liveStats.goalsFor, liveStats.goalsAgainst);
    pacedPts         = liveStats.points + remaining * winPct * 2;
  } else {
    pacedPts = PHASE_BASELINE[team.phase] ?? 88;
  }

  // Trade impact: ptsPace delta → standings pts
  const tradeImpact = tradeNavDelta / 3.5;

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

  return Math.round(Math.max(55, Math.min(135, pacedPts + tradeImpact + variance - capPenalty)));
}

// ── Project top scorer for a team ────────────────────────────
function projectTopScorer(
  roster: SimPlayer[],
  rand: () => number,
): { name: string; projectedPts: number; projectedGoals: number; position: string } | null {
  const skaters = roster
    .filter(p => p.position !== "Pick" && p.position !== "G"
      && p.ptsPace > 0
      && (p as any).games >= 20)
    .sort((a, b) => stablePts(b) - stablePts(a));

  if (skaters.length === 0) return null;

  const top   = skaters[0];
  const decay = ageDecay(top.age, top.position);

  // Catastrophic injury variance: 5% chance of losing 30-60 games.
  // Forces the sim to test depth — a McDavid injury tanks EDM, Carolina survives.
  let gamesPlayed = Math.round(72 + rand() * 10);
  if (rand() < 0.05) {
    gamesPlayed = Math.max(5, gamesPlayed - Math.round(30 + rand() * 30));
  }

  const rawPts       = (stablePts(top) / 82) * gamesPlayed * decay;
  const variance     = 0.88 + rand() * 0.24;
  const projectedPts = Math.round(rawPts * variance);

  const goalPct      = top.position === "D" ? 0.25 : 0.40;
  const projectedGoals = Math.round(projectedPts * goalPct * (0.90 + rand() * 0.20));
  return { name: top.name, projectedPts, projectedGoals, position: top.position };
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

// ── Project top defenseman (Norris candidate) ───────────────────
function projectTopDefenseman(roster: SimPlayer[], rand: () => number): { name: string; projectedPts: number } | null {
  // Norris ranking: stable scoring + pairing driver score — voters reward
  // two-way anchors, not just point producers on the top PP unit
  const norrisScore = (p: SimPlayer) => stablePts(p) + (p.pairDriverScore ?? 0) * 0.8;
  const dmen = roster.filter(p => p.position === "D" && p.ptsPace > 0 && (p as any).games >= 10)
    .sort((a, b) => norrisScore(b) - norrisScore(a));
  if (dmen.length === 0) return null;
  const top  = dmen[0];
  const decay = ageDecay(top.age, top.position);
  const proj  = Math.round((stablePts(top) / 82) * (72 + rand() * 10) * decay * (0.85 + rand() * 0.30));
  return { name: top.name, projectedPts: proj };
}

// ── Simulate full league standings ────────────────────────────
function simulateLeague(
  teams: SimTeam[],
  playersByTeam: Map<string, SimPlayer[]>,
  tradeNavDeltas: Map<string, number>,
  capDeltas: Map<string, number>,
  liveStandings: Map<string, { points: number; gamesPlayed: number; goalsFor: number; goalsAgainst: number }>,
  rand: () => number,
): SimTeamResult[] {
  return teams.map(team => {
    const roster     = playersByTeam.get(team.id) ?? [];
    const navDelta   = tradeNavDeltas.get(team.id) ?? 0;
    const capDelta   = capDeltas.get(team.id) ?? 0;
    const capSpaceAfterTrade = team.capSpace - capDelta;
    const liveStats  = liveStandings.get(team.id);
    const projectedPoints = projectTeamPoints(team, liveStats, navDelta, capSpaceAfterTrade, rand);
    const topScorer  = projectTopScorer(roster, rand);
    const winPct     = projectedPoints / 164;
    const goalie     = projectGoalie(roster, winPct, rand);
    const topDefenseman = projectTopDefenseman(roster, rand);
    return {
      teamId: team.id, teamName: team.name, phase: team.phase,
      projectedPoints, topScorer, goalie, topDefenseman,
      madePlayoffs: false, divisionRank: 0, leagueRank: 0, division: "",
    };
  });
}

interface SimTeamResult {
  teamId: string;
  teamName: string;
  phase: string;
  projectedPoints: number;
  topScorer: { name: string; projectedPts: number; projectedGoals: number; position: string } | null;
  goalie: { name: string; projectedGAA: number; projectedSVP: number; gamesStarted: number; gsax: number } | null;
  topDefenseman: { name: string; projectedPts: number } | null;
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
  if (seeds.length < 8) {
    while (seeds.length < 8) seeds.push(seeds[seeds.length - 1]);
  }

  const divNames = conf === "E"
    ? ["Atlantic", "Metropolitan"]
    : ["Central", "Pacific"];

  // Fallback to last seed if a slot can't be filled (handles edge-case missing teams)
  const last = seeds[seeds.length - 1];
  const find = (div: string, rank: number): SimTeamResult =>
    seeds.find(t => t.division === div && t.divisionRank === rank) ?? last;

  const divAWin = find(divNames[0], 1);
  const divBWin = find(divNames[1], 1);

  // Top conference seed = better record among the two division winners
  const [topWin, otherWin] = divAWin.projectedPoints >= divBWin.projectedPoints
    ? [divAWin, divBWin]
    : [divBWin, divAWin];

  const topDiv2   = find(topWin.division,   2);
  const topDiv3   = find(topWin.division,   3);
  const otherDiv2 = find(otherWin.division, 2);
  const otherDiv3 = find(otherWin.division, 3);

  // Wildcards sorted best→worst; WC1 is the better wildcard
  const wcs = seeds
    .filter(t => t.divisionRank > 3)
    .sort((a, b) =>
      b.projectedPoints !== a.projectedPoints
        ? b.projectedPoints - a.projectedPoints
        : a.teamId.localeCompare(b.teamId)
    );
  const wc1 = wcs[0] ?? last;
  const wc2 = wcs[1] ?? last;

  // Round 1
  const r1 = [
    simulateSeries(topWin,   wc2,      rand), // best conf seed vs WC2
    simulateSeries(otherWin, wc1,      rand), // other div winner vs WC1
    simulateSeries(topDiv2,  topDiv3,  rand), // top div's 2nd vs 3rd
    simulateSeries(otherDiv2, otherDiv3, rand), // other div's 2nd vs 3rd
  ];

  const getW = (s: PlayoffSeries): SimTeamResult =>
    seeds.find(t => t.teamId === s.winner.teamId) ?? last;

  // Round 2 — bracket stays on same side, no re-seeding
  const r2 = [
    simulateSeries(getW(r1[0]), getW(r1[2]), rand), // top div winner's side
    simulateSeries(getW(r1[1]), getW(r1[3]), rand), // other div winner's side
  ];

  const cf = simulateSeries(getW(r2[0]), getW(r2[1]), rand);
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

  let topScorerResult: { name: string; team: string; pts: number } | null = null;
  for (const team of standings) {
    if (team.topScorer && (!topScorerResult || team.topScorer.projectedPts > topScorerResult.pts)) {
      topScorerResult = { name: team.topScorer.name, team: team.teamName, pts: team.topScorer.projectedPts };
    }
  }

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
  for (const team of standings) {
    if (!team.topScorer) continue;
    const bonus = team.madePlayoffs ? 1.10 + (1 / (team.leagueRank + 1)) * 0.20 : 0.80;
    const score = team.topScorer.projectedPts * bonus * (0.88 + rand() * 0.24);
    if (score > bestHart) {
      bestHart = score;
      hartResult = { name: team.topScorer.name, team: team.teamName, pts: team.topScorer.projectedPts };
    }
  }

  let norrisResult: { name: string; team: string; pts: number } | null = null;
  let bestNorris = -Infinity;
  for (const team of standings) {
    if (!team.topDefenseman) continue;
    const score = team.topDefenseman.projectedPts * (0.82 + rand() * 0.36);
    if (score > bestNorris) {
      bestNorris = score;
      norrisResult = { name: team.topDefenseman.name, team: team.teamName, pts: team.topDefenseman.projectedPts };
    }
  }

  let goalsLeader:   { name: string; team: string; goals: number } | null = null;
  let assistsLeader: { name: string; team: string; assists: number } | null = null;
  for (const team of standings) {
    if (!team.topScorer) continue;
    const goals   = team.topScorer.projectedGoals ?? Math.round(team.topScorer.projectedPts * 0.40);
    const assists = team.topScorer.projectedPts - goals;
    if (!goalsLeader   || goals   > goalsLeader.goals)    goalsLeader   = { name: team.topScorer.name, team: team.teamName, goals };
    if (!assistsLeader || assists > assistsLeader.assists) assistsLeader = { name: team.topScorer.name, team: team.teamName, assists };
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

// ── Main handler ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body: SimRequest = await req.json();
    const { homeTeamId, partnerTeamId, teams, players, trades } = body;

    const seed = body.seed ?? Math.floor(Math.random() * 100000);
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

    // Trade impact and cap delta per team.
    // Per-player on-ice value in "ptsPace-equivalent" units:
    //   Skaters — stable (baseline-blended) scoring pace, plus a D-man driver
    //   bonus: pairing data shows drivers lift partners' xGF% beyond their own
    //   point production (Fox-tier ≈ +20 driver score ≈ +10 pts-equivalent).
    //   Two-way forwards get a small PK-usage credit for the same reason.
    //   Goalies — previously contributed ZERO (no ptsPace), so goalie trades
    //   never moved the sim. Stable GSAX converts to pts-equivalent: ~6 goals
    //   ≈ 1 win ≈ 2 standings pts, and tradeImpact divides by 3.5, so
    //   gsax * 1.2 lands a +20 GSAX starter at ≈ +7 projected standings pts.
    //   HDSV% above league average (.815) adds a stable-skill kicker.
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

    const liveStandings = await fetchLiveStandings();

    const rawStandings = simulateLeague(teams, playersByTeam, tradeNavDeltas, capDeltas, liveStandings, rand);
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

    // Draftees with no NHL games carry an NHLe-translated prospectPtsPace —
    // they belong in the Calder pool alongside rookies with live stats
    const rookiePace = (p: SimPlayer): number =>
      p.ptsPace > 0 ? p.ptsPace : (p.prospectPtsPace ?? 0) * 0.7; // NHLe haircut for jump risk
    const rookieCandidates = [...playersByTeam.entries()].flatMap(([teamId, roster]) =>
      roster
        .filter(p => p.age <= 22 && p.position !== "G" && rookiePace(p) > 0)
        .map(p => ({ ...p, teamId }))
    );
    const calderWinner = (() => {
      if (rookieCandidates.length === 0) return { name: "Matthew Schaefer", team: "New York Islanders", note: "—" };
      const sorted = rookieCandidates
        .map(p => ({ p, score: rookiePace(p) * (0.50 + rand() * 1.00) }))
        .sort((a, b) => b.score - a.score);
      const winner   = sorted[0].p;
      const teamName = teams.find(t => t.id === winner.teamId)?.name ?? winner.teamId;
      const pace     = rookiePace(winner);
      return { name: winner.name, team: teamName, note: `${Math.round(pace * 0.9)}-${Math.round(pace * 0.9 * 0.55)} in projected first full season` };
    })();

    const playoffBracket = simulatePlayoffs(standings, rand);
    const cupWinner = standings.find(t => t.teamId === playoffBracket.champion.teamId) ?? leaders.cupWinner;

    return NextResponse.json({
      seed,
      homeTeam:    homeResult,
      partnerTeam: partnerResult,
      standings:   standings.slice(0, 32),
      divisions:   divisionContext,
      leaders: {
        ...leaders,
        cupWinner,
        calder: calderWinner,
      },
      playoffBracket,
      playoffTeams: standings.filter(t => t.madePlayoffs).map(t => t.teamId),
      generatedAt: new Date().toISOString(),
    });

  } catch (e: any) {
    console.error("[simulate]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
