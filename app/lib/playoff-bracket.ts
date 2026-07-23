// ── Playoff bracket (pure, tested) ───────────────────────────────
// Extracted from the sim route so seeding and — critically — advancement are
// unit-testable. The visual bracket (app/components/PlayoffBracket.tsx) stacks
// the four R1 series top-to-bottom and centers each R2 series over the two R1
// series directly above/below it. So advancement is by BRACKET ADJACENCY: the
// winners of the top two R1 series meet, and the winners of the bottom two
// meet. The old engine paired r1[0] with r1[2] and r1[1] with r1[3], which made
// the third series' winner visually "jump" into the top R2 slot (the reported
// Mammoth/Blackhawks → Wild–Blackhawks bug). Winners now feed the slot they sit
// next to.

export interface BracketTeam {
  teamId: string;
  teamName: string;
  projectedPoints: number;
  division: string;
  divisionRank: number;
  madePlayoffs: boolean;
}

export interface PlayoffSeries {
  home:     { teamId: string; teamName: string; pts: number };
  away:     { teamId: string; teamName: string; pts: number };
  winner:   { teamId: string; teamName: string };
  homeWins: number;
  awayWins: number;
}
export interface ConferenceBracket {
  r1:       PlayoffSeries[];
  r2:       PlayoffSeries[];
  cf:       PlayoffSeries;
  champion: { teamId: string; teamName: string };
}
export interface PlayoffBracket {
  eastern:  ConferenceBracket;
  western:  ConferenceBracket;
  final:    PlayoffSeries;
  champion: { teamId: string; teamName: string };
}

// ── Division/conference structure ─────────────────────────────
export const DIVISIONS: Record<string, string[]> = {
  Atlantic:     ["BOS","BUF","DET","FLA","MTL","OTT","TBL","TOR"],
  Metropolitan: ["CAR","CBJ","NJD","NYI","NYR","PHI","PIT","WSH"],
  Central:      ["UTA","CHI","COL","DAL","MIN","NSH","STL","WPG"],
  Pacific:      ["ANA","CGY","EDM","LAK","SEA","SJS","VAN","VGK"],
};
export const EASTERN = new Set([...DIVISIONS.Atlantic, ...DIVISIONS.Metropolitan]);

// ── Simulate a single playoff series ─────────────────────────
export function simulateSeries(high: BracketTeam, low: BracketTeam, rand: () => number): PlayoffSeries {
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

export function simulateSeriesByStrength(a: BracketTeam, b: BracketTeam, rand: () => number): PlayoffSeries {
  return a.projectedPoints >= b.projectedPoints
    ? simulateSeries(a, b, rand)
    : simulateSeries(b, a, rand);
}

// ── Simulate one conference (NHL divisional seeding) ──
// Round 1: Top div winner vs WC2 · Other div winner vs WC1 · each division's
//          2 vs 3. The four series are laid out so the two on each bracket half
//          are adjacent, and R2 pairs adjacent winners.
export function simulateConference(
  seeds: BracketTeam[],
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

  const usedSlots = new Set<string>();
  const takeFallback = (avoidTeamId?: string): BracketTeam => {
    const team = uniqueSeeds.find(t => t.teamId !== avoidTeamId && !usedSlots.has(t.teamId))
      ?? uniqueSeeds.find(t => t.teamId !== avoidTeamId)
      ?? uniqueSeeds[0];
    usedSlots.add(team.teamId);
    return team;
  };
  const takeSlot = (preferred: BracketTeam | undefined, avoidTeamId?: string): BracketTeam => {
    if (preferred && preferred.teamId !== avoidTeamId && !usedSlots.has(preferred.teamId)) {
      usedSlots.add(preferred.teamId);
      return preferred;
    }
    return takeFallback(avoidTeamId);
  };
  const find = (div: string, rank: number): BracketTeam | undefined =>
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

  // Round 1 — the four series in the order the bracket tree draws them,
  // top to bottom. R2 pairs adjacent winners (rows 0+1, rows 2+3), so the
  // slot a winner feeds is the one drawn directly beside it.
  const r1 = [
    simulateSeriesByStrength(topWin,    wc2,       rand), // top seed vs WC2
    simulateSeriesByStrength(otherWin,  wc1,       rand), // other div winner vs WC1
    simulateSeriesByStrength(topDiv2,   topDiv3,   rand), // top div's 2 vs 3
    simulateSeriesByStrength(otherDiv2, otherDiv3, rand), // other div's 2 vs 3
  ];

  const getW = (s: PlayoffSeries): BracketTeam => {
    const winner = uniqueSeeds.find(t => t.teamId === s.winner.teamId);
    if (!winner) throw new Error(`Playoff winner ${s.winner.teamId} was not found in conference seeds`);
    return winner;
  };

  // Round 2 — adjacent winners advance: the top pair meet, the bottom pair meet.
  const r2 = [
    simulateSeriesByStrength(getW(r1[0]), getW(r1[1]), rand),
    simulateSeriesByStrength(getW(r1[2]), getW(r1[3]), rand),
  ];

  const cf = simulateSeriesByStrength(getW(r2[0]), getW(r2[1]), rand);
  return { r1, r2, cf, champion: cf.winner };
}

export function simulatePlayoffs(standings: BracketTeam[], rand: () => number): PlayoffBracket {
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
