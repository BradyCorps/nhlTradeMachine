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
  games?: number;
  teamId: string;
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
  navMap?: Record<string, number>;
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
// More accurate than simple goal differential
const pythagorean = (gf: number, ga: number): number => {
  const exp = 2.37;
  const gfP = Math.pow(Math.max(gf, 1), exp);
  const gaP = Math.pow(Math.max(ga, 1), exp);
  return gfP / (gfP + gaP);
};

// ── Age decay factor ──────────────────────────────────────────
const ageDecay = (age: number, position: string): number => {
  const peak = position === "D" ? 27 : position === "G" ? 29 : 26;
  if (age <= peak) return 1.0 + Math.max(0, (peak - age) * 0.005); // slight upside for young
  const decline = (age - peak) * (position === "D" ? 0.018 : 0.022);
  return Math.max(0.55, 1.0 - decline);
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
  rand: () => number,
): number {
  // Use live standings data if available, fall back to phase baseline
  let pacedPts: number;
  if (liveStats && liveStats.gamesPlayed > 10) {
    // Pythagorean expectation for remaining games
    const gp   = liveStats.gamesPlayed;
    const remaining = 82 - gp;
    const winPct = pythagorean(liveStats.goalsFor, liveStats.goalsAgainst);
    // Current points + projected points from remaining games (2pts per win)
    const projRemaining = remaining * winPct * 2;
    pacedPts = liveStats.points + projRemaining;
  } else {
    pacedPts = PHASE_BASELINE[team.phase] ?? 88;
  }

  // Trade impact: ~14 NAV = 1 win = 2 standings pts (NAV scale, not ptsPace)
  const tradeImpact = tradeNavDelta / 7;

  // Phase variance — wild cards get wider range
  const isWildCard = WILD_CARD_TEAMS.has(team.id);
  const varianceRange = isWildCard ? 14 : 8;
  const phase = team.phase ?? "";

  // Skew variance by phase
  let varianceMid = 0;
  if (phase === "Rebuilding" || phase === "Tanking") varianceMid = -3;
  if (phase === "Contender") varianceMid = 2;

  const variance = varianceMid + (rand() * varianceRange - varianceRange / 2);

  return Math.round(Math.max(55, Math.min(135, pacedPts + tradeImpact + variance)));
}

// ── Project top scorer for a team ────────────────────────────
function projectTopScorer(
  roster: SimPlayer[],
  rand: () => number,
): { name: string; projectedPts: number; projectedGoals: number; position: string } | null {
  const skaters = roster
    .filter(p => p.position !== "Pick" && p.position !== "G"
      && p.ptsPace > 0
      && (p.games ?? 0) >= 20)
    .sort((a, b) => b.ptsPace - a.ptsPace);

  if (skaters.length === 0) return null;

  const top = skaters[0];
  const decay = ageDecay(top.age, top.position);
  const gamesPlayed = Math.round(72 + rand() * 10);
  const rawPts = (top.ptsPace / 82) * gamesPlayed * decay;
  const variance = 0.88 + rand() * 0.24; // ±12% variance
  const projectedPts = Math.round(rawPts * variance);

  // Estimate goals: forwards ~40% of points, D ~25%
  const goalPct = top.position === "D" ? 0.25 : 0.40;
  const projectedGoals = Math.round(projectedPts * goalPct * (0.90 + rand() * 0.20));
  return { name: top.name, projectedPts, projectedGoals, position: top.position };
}

// ── Project starting goalie ───────────────────────────────────
// VARIANCE FIX: Previous version had Math.max(0.895,...) hard floor which
// caused every goalie to land at exactly .895 regardless of actual quality.
// Now: anchor to career quality via gsax, wider realistic variance,
// age regression, and position-appropriate ranges.
function projectGoalie(
  roster: SimPlayer[],
  teamWinPct: number,
  rand: () => number,
): { name: string; projectedGAA: number; projectedSVP: number; gamesStarted: number; gsax: number } | null {
  const goalies = roster
    .filter(p => p.position === "G")
    .sort((a, b) => (b.gamesStarted ?? 0) - (a.gamesStarted ?? 0));

  if (goalies.length === 0) return null;

  const g = goalies[0];

  // ── Quality anchor: gsax tells us how good this goalie actually is ──
  // League average GSAX ≈ 0 → .910 SVP, elite (+20) → .925, poor (-10) → .900
  const gsax = g.gsax ?? 0;
  const gsaxSVP = 0.910 + (gsax / 20) * 0.015; // +1.5% SVP per 20 GSAX above average

  // ── Base: blend current save% with gsax-derived quality ──────────────
  // Heavy weight on gsax (70%) — current stats are small-sample; gsax is career signal
  const currentSVP = g.savePct ?? 0.910;
  const baseSVP    = gsaxSVP * 0.70 + currentSVP * 0.30;

  // ── Team defense context (stronger team = fewer dangerous shots) ──────
  const teamContext = (teamWinPct - 0.5) * 0.008;

  // ── Age regression: goalies peak 27-32, decline after ────────────────
  const age = g.age ?? 28;
  const ageRegression = age > 33 ? -(age - 33) * 0.002 : // -0.002 per year after 33
                        age < 24 ? -(24 - age)  * 0.001 : // slight regression for very young
                        0;

  // ── Realistic season-long variance (±0.010 = realistic swing) ────────
  // Elite goalies have tighter variance; backups have wider
  const gsaxQuality = Math.abs(gsax);
  const varianceWidth = gsaxQuality > 15 ? 0.008 :  // elite: tight
                        gsaxQuality > 5  ? 0.012 :  // solid: moderate
                                           0.018;   // fringe: wide
  const svpVariance = (rand() - 0.5) * varianceWidth * 2;

  // ── Final projected SVP — no hard floor, natural bounds only ─────────
  const projectedSVP = Math.max(0.880, Math.min(0.945,
    baseSVP + teamContext + ageRegression + svpVariance
  ));

  // ── GAA from SVP and context-adjusted shots/game ──────────────────────
  // Better teams face fewer shots (25-32 range)
  const shotsPerGame  = 28 + (1 - teamWinPct) * 8; // worse team → more shots faced
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
  const dmen = roster.filter(p => p.position === "D" && p.ptsPace > 0 && (p.games ?? 0) >= 10)
    .sort((a, b) => b.ptsPace - a.ptsPace);
  if (dmen.length === 0) return null;
  const top = dmen[0];
  const decay = ageDecay(top.age, top.position);
  const proj  = Math.round((top.ptsPace / 82) * (72 + rand() * 10) * decay * (0.85 + rand() * 0.30));
  return { name: top.name, projectedPts: proj };
}

// ── Simulate full league standings ────────────────────────────
function simulateLeague(
  teams: SimTeam[],
  playersByTeam: Map<string, SimPlayer[]>,
  tradeNavDeltas: Map<string, number>,
  liveStandings: Map<string, { points: number; gamesPlayed: number; goalsFor: number; goalsAgainst: number }>,
  rand: () => number,
): SimTeamResult[] {
  return teams.map(team => {
    const roster     = playersByTeam.get(team.id) ?? [];
    const navDelta   = tradeNavDeltas.get(team.id) ?? 0;
    const liveStats  = liveStandings.get(team.id);
    const projectedPoints = projectTeamPoints(team, liveStats, navDelta, rand);
    const topScorer  = projectTopScorer(roster, rand);
    const winPct     = projectedPoints / 164;
    const goalie     = projectGoalie(roster, winPct, rand);

    const topDefenseman = projectTopDefenseman(roster, rand);
    return {
      teamId: team.id, teamName: team.name, phase: team.phase,
      projectedPoints, topScorer, goalie, topDefenseman,
      madePlayoffs: false, divisionRank: 0, leagueRank: 0,
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
}

// ── Division/conference structure ─────────────────────────────
const DIVISIONS: Record<string, string[]> = {
  Atlantic:     ["BOS","BUF","DET","FLA","MTL","OTT","TBL","TOR"],
  Metropolitan: ["CAR","CBJ","NJD","NYI","NYR","PHI","PIT","WSH"],
  Central:      ["UTA","CHI","COL","DAL","MIN","NSH","STL","WPG"],
  Pacific:      ["ANA","CGY","EDM","LAK","SEA","SJS","VAN","VGK"],
};
const EASTERN = new Set([...DIVISIONS.Atlantic, ...DIVISIONS.Metropolitan]);
const WESTERN = new Set([...DIVISIONS.Central, ...DIVISIONS.Pacific]);

function assignPlayoffSeeds(results: SimTeamResult[]): SimTeamResult[] {
  const byId = new Map(results.map(r => [r.teamId, r]));

  // Sort each division, take top 3 → auto-qualify
  // Next 2 best records per conference → wildcards
  const autoQualifiers = new Set<string>();
  const conferenceNonDiv = new Map<string, SimTeamResult[]>();
  conferenceNonDiv.set("E", []);
  conferenceNonDiv.set("W", []);

  for (const [divName, teamIds] of Object.entries(DIVISIONS)) {
    const divTeams = teamIds
      .map(id => byId.get(id))
      .filter(Boolean) as SimTeamResult[];

    divTeams.sort((a, b) => b.projectedPoints - a.projectedPoints);

    divTeams.forEach((t, i) => {
      t.divisionRank = i + 1;
      if (i < 3) {
        autoQualifiers.add(t.teamId);
        t.madePlayoffs = true;
      }
    });

    const conf = EASTERN.has(teamIds[0]) ? "E" : "W";
    divTeams.slice(3).forEach(t => conferenceNonDiv.get(conf)!.push(t));
  }

  // Wildcards — top 2 non-div qualifiers per conference
  for (const conf of ["E", "W"]) {
    const remaining = conferenceNonDiv.get(conf)!
      .sort((a, b) => b.projectedPoints - a.projectedPoints);
    remaining.slice(0, 2).forEach(t => { t.madePlayoffs = true; });
  }

  // Overall league rank
  results.sort((a, b) => b.projectedPoints - a.projectedPoints);
  results.forEach((t, i) => { t.leagueRank = i + 1; });

  return results;
}

// ── Find league statistical leaders ──────────────────────────

// ── Simulate playoff bracket ──────────────────────────────────
// Runs full best-of-7 bracket from conference quarters to Cup Final.
// Higher seed wins with probability based on regular season point gap.
function simulateSeries(high: SimTeamResult, low: SimTeamResult, rand: () => number): PlayoffSeries {
  const gap = high.projectedPoints - low.projectedPoints;
  // Win probability: 50% base + 0.25% per point gap, capped 35-72%
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

function simulateConference(seeds: SimTeamResult[], rand: () => number): ConferenceBracket {
  if (seeds.length < 8) {
    // Pad with worst available if fewer than 8 made playoffs
    while (seeds.length < 8) seeds.push(seeds[seeds.length - 1]);
  }
  // Round 1: 1v8, 2v7, 3v6, 4v5
  const r1 = [
    simulateSeries(seeds[0], seeds[7], rand),
    simulateSeries(seeds[1], seeds[6], rand),
    simulateSeries(seeds[2], seeds[5], rand),
    simulateSeries(seeds[3], seeds[4], rand),
  ];
  // Round 2: winner(1v8) vs winner(2v7), winner(3v6) vs winner(4v5)
  const getWinner = (s: PlayoffSeries, all: SimTeamResult[]) =>
    all.find(t => t.teamId === s.winner.teamId)!;
  const r2 = [
    simulateSeries(getWinner(r1[0], seeds), getWinner(r1[1], seeds), rand),
    simulateSeries(getWinner(r1[2], seeds), getWinner(r1[3], seeds), rand),
  ];
  const cf = simulateSeries(getWinner(r2[0], seeds), getWinner(r2[1], seeds), rand);
  return { r1, r2, cf, champion: cf.winner };
}

function simulatePlayoffs(standings: SimTeamResult[], rand: () => number): PlayoffBracket {
  const playoffTeams = standings.filter(t => t.madePlayoffs);
  // Conference seeds sorted by projected points
  const eastern = playoffTeams
    .filter(t => EASTERN.has(t.teamId))
    .sort((a, b) => b.projectedPoints - a.projectedPoints);
  const western = playoffTeams
    .filter(t => !EASTERN.has(t.teamId))
    .sort((a, b) => b.projectedPoints - a.projectedPoints);

  const eastBracket = simulateConference(eastern, rand);
  const westBracket = simulateConference(western, rand);

  // Cup Final: Eastern champion vs Western champion
  const eastChamp = playoffTeams.find(t => t.teamId === eastBracket.champion.teamId)!;
  const westChamp = playoffTeams.find(t => t.teamId === westBracket.champion.teamId)!;
  const final = simulateSeries(
    eastChamp.projectedPoints >= westChamp.projectedPoints ? eastChamp : westChamp,
    eastChamp.projectedPoints >= westChamp.projectedPoints ? westChamp : eastChamp,
    rand
  );

  return {
    eastern: eastBracket,
    western: westBracket,
    final,
    champion: final.winner,
  };
}

function findLeagueLeaders(
  standings: SimTeamResult[],
  rand: () => number,
  cupChampionId: string,
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
  draftLottery: SimTeamResult;
} {
  const presidentsTrophy = standings[0];

  // Top scorer across all teams
  let topScorerResult: { name: string; team: string; pts: number } | null = null;
  for (const team of standings) {
    if (team.topScorer && (!topScorerResult || team.topScorer.projectedPts > topScorerResult.pts)) {
      topScorerResult = { name: team.topScorer.name, team: team.teamName, pts: team.topScorer.projectedPts };
    }
  }

  // ── GAA Leader — lowest GAA among starters (raw honest stat) ───────────────
  let topGoalieResult: { name: string; team: string; gaa: number; svp: number } | null = null;
  for (const team of standings) {
    if (team.goalie && team.goalie.gamesStarted >= 25 &&
        (!topGoalieResult || team.goalie.projectedGAA < topGoalieResult.gaa)) {
      topGoalieResult = { name: team.goalie.name, team: team.teamName,
                          gaa: team.goalie.projectedGAA, svp: team.goalie.projectedSVP };
    }
  }

  // ── Vezina Trophy — GSAX-based (team-quality-adjusted) ───────────────────
  // GSAX = goals saved above expected given shot quality faced.
  // Prevents dominant-team goalies (Wedgewood on Colorado) winning via shot
  // suppression alone — Sorokin/Swayman facing harder shots score higher.
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

  // ── Hart Trophy — MVP: points weighted by team playoff standing ───────────
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

  // ── Norris Trophy — best defenseman by projected pts ─────────────────────
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

  // ── Goals / Assists leaders ───────────────────────────────────────────────
  let goalsLeader:   { name: string; team: string; goals: number } | null = null;
  let assistsLeader: { name: string; team: string; assists: number } | null = null;
  for (const team of standings) {
    if (!team.topScorer) continue;
    const goals   = team.topScorer.projectedGoals ?? Math.round(team.topScorer.projectedPts * 0.40);
    const assists = team.topScorer.projectedPts - goals;
    if (!goalsLeader   || goals   > goalsLeader.goals)    goalsLeader   = { name: team.topScorer.name, team: team.teamName, goals };
    if (!assistsLeader || assists > assistsLeader.assists) assistsLeader = { name: team.topScorer.name, team: team.teamName, assists };
  }

  // ── Conn Smythe — Cup winner's top scorer ─────────────────────────────────
  const cupTeam          = standings.find(t => t.teamId === cupChampionId);
  const connSmytheResult = cupTeam?.topScorer
    ? { name: cupTeam.topScorer.name, team: cupTeam.teamName }
    : null;

  // ── Draft lottery winner — worst team ────────────────────────────────────
  const nonPlayoff  = standings.filter(t => !t.madePlayoffs)
    .sort((a, b) => a.projectedPoints - b.projectedPoints);
  const draftLottery = nonPlayoff[0];

  return {
    topScorer: topScorerResult, topGoalie: topGoalieResult,
    vezina: vezinaResult, hart: hartResult, norris: norrisResult,
    goalsLeader, assistsLeader, connSmythe: connSmytheResult,
    presidentsTrophy, draftLottery,
  };
}

// ── Main handler ──────────────────────────────────────────────
export async function POST(req: NextRequest) {
  try {
    const body: SimRequest = await req.json();
    const { homeTeamId, partnerTeamId, teams, players, trades } = body;

    // Generate or use provided seed
    const seed = body.seed ?? Math.floor(Math.random() * 100000);
    const rand = mulberry32(seed);

    // Build player roster map — apply trades
    const playersByTeam = new Map<string, SimPlayer[]>();
    for (const team of teams) playersByTeam.set(team.id, []);

    // Start with current rosters
    for (const p of players) {
      if (p.position === "Pick") continue;
      playersByTeam.get(p.teamId)?.push(p);
    }

    // Apply trades — move players between teams
    for (const trade of trades) {
      const outIds = new Set(trade.outgoing.map(p => p.id));
      const inIds  = new Set(trade.incoming.map(p => p.id));

      for (const [teamId, roster] of playersByTeam) {
        // Remove outgoing from home, add to partner and vice versa
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

    // Calculate NAV delta per team from all trades.
    // Uses navMap totals when provided (includes picks, defensive value, cap surplus).
    // Falls back to ptsPace * 2 as a rough NAV proxy for backwards compatibility.
    const navMap = body.navMap ?? {};
    const assetNav = (p: SimPlayer) =>
      navMap[p.id] ?? (p.position === "Pick" ? 30 : p.ptsPace * 2);

    const tradeNavDeltas = new Map<string, number>();
    for (const trade of trades) {
      const outNav = trade.outgoing.reduce((s, p) => s + assetNav(p), 0);
      const inNav  = trade.incoming.reduce((s, p) => s + assetNav(p), 0);
      const delta  = inNav - outNav;
      tradeNavDeltas.set(trade.homeTeamId,    (tradeNavDeltas.get(trade.homeTeamId)    ?? 0) + delta);
      tradeNavDeltas.set(trade.partnerTeamId, (tradeNavDeltas.get(trade.partnerTeamId) ?? 0) - delta);
    }

    // Fetch live standings for accurate team point projections
    const liveStandings = await fetchLiveStandings();

    // Run simulation
    const rawStandings = simulateLeague(teams, playersByTeam, tradeNavDeltas, liveStandings, rand);
    const standings = assignPlayoffSeeds(rawStandings);

    // Playoffs runs before findLeagueLeaders so connSmythe uses the actual bracket champion
    const playoffBracket = simulatePlayoffs(standings, rand);
    const cupWinner = standings.find(t => t.teamId === playoffBracket.champion.teamId) ?? standings[0];

    const leaders = findLeagueLeaders(standings, rand, playoffBracket.champion.teamId);

    // Extract home and partner team results
    const homeResult    = standings.find(t => t.teamId === homeTeamId);
    const partnerResult = standings.find(t => t.teamId === partnerTeamId);

    // Build division standings for context
    const divisionContext: Record<string, SimTeamResult[]> = {};
    for (const [div, teamIds] of Object.entries(DIVISIONS)) {
      divisionContext[div] = standings
        .filter(t => teamIds.includes(t.teamId))
        .sort((a, b) => b.projectedPoints - a.projectedPoints);
    }

    // Calder — best scorer among genuine rookies (age ≤ 22, < 14 NHL games played).
    // Falls back to youngest high-upside player on any roster; never hardcodes a name.
    const rookieCandidates = [...playersByTeam.entries()].flatMap(([teamId, roster]) =>
      roster
        .filter(p => p.age <= 22 && p.position !== "G" && p.ptsPace > 0 && (p.games ?? 0) < 14)
        .map(p => ({ ...p, teamId }))
    );
    const calderWinner = (() => {
      const pool = rookieCandidates.length > 0
        ? rookieCandidates
        : [...playersByTeam.entries()].flatMap(([teamId, roster]) =>
            roster
              .filter(p => p.age <= 21 && p.position !== "G" && p.ptsPace > 0)
              .map(p => ({ ...p, teamId }))
          );
      if (pool.length === 0) return { name: "TBD", team: "—", note: "No eligible candidates" };
      const sorted = pool
        .map(p => ({ p, score: p.ptsPace * (0.50 + rand() * 1.00) }))
        .sort((a, b) => b.score - a.score);
      const winner = sorted[0].p;
      const teamName = teams.find(t => t.id === winner.teamId)?.name ?? winner.teamId;
      return { name: winner.name, team: teamName, note: `${Math.round(winner.ptsPace * 0.9)}-${Math.round(winner.ptsPace * 0.9 * 0.55)} in projected first full season` };
    })();

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