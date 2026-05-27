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

  // Trade impact: roughly 7 NAV equivalent pts delta = 1 win = 2 standings pts
  const tradeImpact = tradeNavDelta / 3.5;

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
): { name: string; projectedPts: number; position: string } | null {
  const skaters = roster
    .filter(p => p.position !== "Pick" && p.position !== "G"
      && p.ptsPace > 0
      && (p as any).games >= 20)  // minimum games threshold — kills Oliver Bonk problem
    .sort((a, b) => b.ptsPace - a.ptsPace);

  if (skaters.length === 0) return null;

  const top = skaters[0];
  const decay = ageDecay(top.age, top.position);
  const gamesPlayed = Math.round(72 + rand() * 10);
  const rawPts = (top.ptsPace / 82) * gamesPlayed * decay;
  const variance = 0.88 + rand() * 0.24; // ±12% variance
  const projectedPts = Math.round(rawPts * variance);

  return { name: top.name, projectedPts, position: top.position };
}

// ── Project starting goalie ───────────────────────────────────
function projectGoalie(
  roster: SimPlayer[],
  teamWinPct: number,
  rand: () => number,
): { name: string; projectedGAA: number; projectedSVP: number; gamesStarted: number } | null {
  const goalies = roster
    .filter(p => p.position === "G")
    .sort((a, b) => (b.gamesStarted ?? 0) - (a.gamesStarted ?? 0));

  if (goalies.length === 0) return null;

  const g = goalies[0];

  // Base save% from current stats, adjusted for team defense
  const baseSVP = g.savePct ?? 0.910;
  // Team defense context: better teams = better save% (goalie faces fewer dangerous shots)
  const teamContext = (teamWinPct - 0.5) * 0.008;
  const svpVariance = (rand() - 0.5) * 0.012;
  const projectedSVP = Math.max(0.895, Math.min(0.940, baseSVP + teamContext + svpVariance));

  // GAA from save% and shots faced (approximate ~30 shots/game)
  const shotsPerGame = 30;
  const projectedGAA = Math.round(shotsPerGame * (1 - projectedSVP) * 100) / 100;

  const gamesStarted = Math.round(45 + rand() * 20);

  return {
    name: g.name,
    projectedGAA: Math.round(projectedGAA * 100) / 100,
    projectedSVP: Math.round(projectedSVP * 10000) / 10000,
    gamesStarted,
  };
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

    return {
      teamId: team.id, teamName: team.name, phase: team.phase,
      projectedPoints, topScorer, goalie,
      madePlayoffs: false, divisionRank: 0, leagueRank: 0,
    };
  });
}

interface SimTeamResult {
  teamId: string;
  teamName: string;
  phase: string;
  projectedPoints: number;
  topScorer: { name: string; projectedPts: number; position: string } | null;
  goalie: { name: string; projectedGAA: number; projectedSVP: number; gamesStarted: number } | null;
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
function findLeagueLeaders(
  standings: SimTeamResult[],
  rand: () => number,
): {
  topScorer: { name: string; team: string; pts: number } | null;
  topGoalie: { name: string; team: string; gaa: number; svp: number } | null;
  presidentsTrophy: SimTeamResult;
  cupWinner: SimTeamResult;
  draftLottery: SimTeamResult;
} {
  const presidentsTrophy = standings[0];
  const playoffTeams = standings.filter(t => t.madePlayoffs);
  const sortedPlayoff = [...playoffTeams].sort((a, b) => b.projectedPoints - a.projectedPoints);

  // Top team wins ~25% of time, weighted by finish position
  const cupIndex = Math.min(
    sortedPlayoff.length - 1,
    Math.floor(Math.pow(rand(), 1.8) * sortedPlayoff.length)
  );
  const rawCupWinner = sortedPlayoff[cupIndex];
  const cupWinner = rawCupWinner?.teamId === "FLA"
    ? sortedPlayoff.find(t => t.teamId !== "FLA") ?? rawCupWinner
    : rawCupWinner;

  // Top scorer across all teams
  let topScorerResult: { name: string; team: string; pts: number } | null = null;
  for (const team of standings) {
    if (team.topScorer && (!topScorerResult || team.topScorer.projectedPts > topScorerResult.pts)) {
      topScorerResult = { name: team.topScorer.name, team: team.teamName, pts: team.topScorer.projectedPts };
    }
  }

  // Top goalie — best GAA among starters on playoff teams (goalie quality reflects team quality)
  let topGoalieResult: { name: string; team: string; gaa: number; svp: number } | null = null;
  for (const team of standings.filter(t => t.madePlayoffs)) {
    if (team.goalie) {
      if (!topGoalieResult || team.goalie.projectedSVP > topGoalieResult.svp) {
        topGoalieResult = {
          name: team.goalie.name, team: team.teamName,
          gaa: team.goalie.projectedGAA, svp: team.goalie.projectedSVP,
        };
      }
    }
  }

  // Draft lottery winner — worst team
  const nonPlayoff = standings.filter(t => !t.madePlayoffs)
    .sort((a, b) => a.projectedPoints - b.projectedPoints);
  const draftLottery = nonPlayoff[0];

  return { topScorer: topScorerResult, topGoalie: topGoalieResult, presidentsTrophy, cupWinner, draftLottery };
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

    // Calculate NAV delta per team from all trades
    // Positive = team gained NAV, negative = gave up NAV
    const tradeNavDeltas = new Map<string, number>();
    for (const trade of trades) {
      // Simple approximation: sum ptsPace differential as proxy for NAV delta
      const outPts = trade.outgoing.filter(p => p.position !== "Pick")
        .reduce((s, p) => s + p.ptsPace, 0);
      const inPts = trade.incoming.filter(p => p.position !== "Pick")
        .reduce((s, p) => s + p.ptsPace, 0);
      const delta = inPts - outPts;
      tradeNavDeltas.set(trade.homeTeamId, (tradeNavDeltas.get(trade.homeTeamId) ?? 0) + delta);
      tradeNavDeltas.set(trade.partnerTeamId, (tradeNavDeltas.get(trade.partnerTeamId) ?? 0) - delta);
    }

    // Fetch live standings for accurate team point projections
    const liveStandings = await fetchLiveStandings();

    // Run simulation
    const rawStandings = simulateLeague(teams, playersByTeam, tradeNavDeltas, liveStandings, rand);
    const standings = assignPlayoffSeeds(rawStandings);
    const leaders = findLeagueLeaders(standings, rand);

    // Extract home and partner team results
    const homeResult   = standings.find(t => t.teamId === homeTeamId);
    const partnerResult = standings.find(t => t.teamId === partnerTeamId);

    // Build division standings for context
    const divisionContext: Record<string, SimTeamResult[]> = {};
    for (const [div, teamIds] of Object.entries(DIVISIONS)) {
      divisionContext[div] = standings
        .filter(t => teamIds.includes(t.teamId))
        .sort((a, b) => b.projectedPoints - a.projectedPoints);
    }

    // Calder — always Matthew Schaefer (locked fact)
    const calderWinner = { name: "Matthew Schaefer", team: "New York Islanders", note: "Unanimous (198 first-place votes)" };

    return NextResponse.json({
      seed,
      homeTeam:    homeResult,
      partnerTeam: partnerResult,
      standings:   standings.slice(0, 32),
      divisions:   divisionContext,
      leaders: {
        ...leaders,
        calder: calderWinner,
      },
      playoffTeams: standings.filter(t => t.madePlayoffs).map(t => t.teamId),
      generatedAt: new Date().toISOString(),
    });

  } catch (e: any) {
    console.error("[simulate]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}