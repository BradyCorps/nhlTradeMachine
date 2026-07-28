import { NextRequest, NextResponse } from "next/server";
import { SEASON } from "@/app/lib/season-config";
import {
  ageDecay,
  hashString,
  mulberry32,
  scenarioSeed,
  stablePts,
} from "@/app/lib/sim-engine";
import { slotMultiplier } from "@/app/lib/lineup-context";
import { leadershipBonus } from "@/app/data/leadership";
import { opportunityPace } from "@/app/lib/young-opportunity";
import { computeBreakout } from "@/app/lib/breakout-model";
import { burstProfile } from "@/app/lib/burst-channel";
import { computeGravity, simOnIceDelta } from "@/app/lib/gravity";
import { derivePlayerRoles } from "@/app/lib/player-roles";
import { effectiveCapHit } from "@/app/lib/cap-delta";
import { simRequestSchema } from "@/app/lib/sim-request-schema";
import { teamWindow } from "@/app/lib/team-window";
import { splitGoalieStarts } from "@/app/lib/goalie-workload";
import {
  DIVISIONS,
  EASTERN,
  simulateSeries,
  simulatePlayoffs,
  type PlayoffSeries,
  type ConferenceBracket,
  type PlayoffBracket,
} from "@/app/lib/playoff-bracket";

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
  retainedPct?: number; // salary retained by the trading-away team (0–1)
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
  draftYear?: number | null;
  draftOverall?: number | null;
  hasLiveStats?: boolean;
  hdFinishingDelta?: number | null; // NHL EDGE high-danger finishing vs league
  goalsPace?: number;               // luck fallback (xG vs goals)
  edgeBurstsOver20?: number | null; // NHL EDGE explosiveness → breakout burst signal
  edgeSpeedMaxMph?: number | null;
  // G4 — gravity propagation. The client sends full Asset objects, so these
  // on-ice fields already arrive in the payload; declaring them lets the sim
  // compute each skater's gravity field instead of valuing rosters on
  // points pace alone. All optional — absent data degrades gracefully
  // inside computeGravity.
  xgRelTM?: number | null;          // on-off xG lift (NOIV family)
  xgaRelTM?: number | null;         // on-off suppression (DZ dome)
  baselineXgRel?: number;           // multi-season on-off baseline
  dps?: number | null;              // defensive point shares (DZ dome)
  ops?: number | null;
  edgeOzPct?: number | null;        // EDGE zone-time share (NZ displacement core)
  dzPct?: number | null;            // deployment zone starts
  assistsPace?: number;
  qocIndex?: number | null;         // deployment difficulty context
  ppPtsPace82?: number;
  baselineIxg82?: number;
}

interface SimTeam {
  id: string;
  name: string;
  /** Standings tier. Read the competitive window via `teamWindow()`. */
  phase: string;
  /** Live roster window from Armchair GM. See app/lib/team-window.ts. */
  rosterWindow?: string;
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
  projectedTOI: number;
  breakoutTag?: "BREAKOUT" | "REGRESSION" | "VETERAN_HOLD" | "CAREER_YEAR";
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
  lineup?: {
    startingGoalies?: Record<string, string | null | undefined>;
    orders?: Record<string, TeamLineupOrder | undefined>;
  };
  seed?: number;
  // Cup Run mode: apply lineup-slot weighting so where players slot in
  // the lineup changes team strength ("lines matter"). Off by default
  // to keep the classic single-season sim byte-identical.
  lineupContext?: boolean;
}

interface TeamLineupOrder {
  forwards?: string[];
  defense?: string[];
  goalies?: string[];
  scratches?: string[];
}

interface SkaterDeployment {
  active: boolean;
  slot: number;
  group: "F" | "D";
  multiplier: number;
  gamesFloor: number;
}

const safeIds = (ids: string[] | undefined): string[] =>
  Array.isArray(ids) ? ids.filter((id): id is string => typeof id === "string" && id.length > 0) : [];

const prospectNhlPace = (p: SimPlayer): number =>
  p.prospectPtsPace != null && p.prospectPtsPace > 0 ? p.prospectPtsPace * 0.72 : 0;

const skaterPace = (p: SimPlayer): number => {
  const nhlPace = p.ptsPace > 0 ? stablePts(p) : 0;
  return Math.max(nhlPace, prospectNhlPace(p));
};

const draftPedigreeBonus = (p: SimPlayer): number => {
  if (p.draftOverall == null || p.draftOverall <= 0 || p.draftOverall > 64) return 0;
  return Math.max(0, (65 - p.draftOverall) / 64) * 7;
};

// Stable GSAX on the same blend — baselineGsax is a weighted season-scale value
const stableGsax = (p: SimPlayer): number => {
  const cur = p.gsax ?? 0;
  return p.baselineGsax != null && p.baselineGsax !== 0
    ? cur * 0.4 + p.baselineGsax * 0.6
    : cur;
};

// G4 — the sim feels gravity. Points pace prices scoring; the zone-mass
// field adds what it misses (suppression, transition drive), so a shutdown
// defenseman or transition engine finally moves simulated standings, default
// lineup slots, and playoff odds. Memoized per player object: onIceValue
// runs inside sort comparators, and the payload objects are fresh each
// request, so a WeakMap can never serve stale cross-request values.
const gravityOnIce = new WeakMap<SimPlayer, number>();
const gravityDelta = (p: SimPlayer): number => {
  let delta = gravityOnIce.get(p);
  if (delta === undefined) {
    delta = simOnIceDelta(computeGravity(p as any));
    gravityOnIce.set(p, delta);
  }
  return delta;
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
  // Leadership steadier: letters carry small on-ice weight (room, matchups)
  return skaterPace(p) + draftPedigreeBonus(p) + driverBonus + pkBonus
    + gravityDelta(p) + leadershipBonus(p.name, { c: 3, a: 1.5 });
};

const isForward = (p: SimPlayer): boolean => p.position !== "Pick" && p.position !== "G" && p.position !== "D";
const isDefense = (p: SimPlayer): boolean => p.position === "D";

function orderedLineupPlayers(
  roster: SimPlayer[],
  ids: string[] | undefined,
  predicate: (p: SimPlayer) => boolean,
  activeLimit: number,
): SimPlayer[] {
  const byId = new Map(roster.map(p => [p.id, p]));
  const used = new Set<string>();
  const ordered = safeIds(ids)
    .map(id => byId.get(id))
    .filter((p): p is SimPlayer => Boolean(p))
    .filter(predicate)
    .filter(p => {
      if (used.has(p.id)) return false;
      used.add(p.id);
      return true;
    });

  if (ordered.length >= activeLimit) return ordered;

  const fallback = roster
    .filter(p => predicate(p) && !used.has(p.id))
    .sort((a, b) => onIceValue(b) - onIceValue(a));
  return [...ordered, ...fallback];
}

function buildDeploymentMap(order?: TeamLineupOrder): Map<string, SkaterDeployment> {
  const deployments = new Map<string, SkaterDeployment>();
  safeIds(order?.forwards).slice(0, 12).forEach((id, slot) => {
    const line = Math.floor(slot / 3);
    const multipliers = [1.10, 1.04, 0.98, 0.90];
    const floors = [74, 68, 60, 48];
    deployments.set(id, {
      active: true,
      slot,
      group: "F",
      multiplier: multipliers[line] ?? 0.90,
      gamesFloor: floors[line] ?? 48,
    });
  });
  safeIds(order?.defense).slice(0, 6).forEach((id, slot) => {
    const pair = Math.floor(slot / 2);
    const multipliers = [1.08, 1.00, 0.93];
    const floors = [74, 66, 56];
    deployments.set(id, {
      active: true,
      slot,
      group: "D",
      multiplier: multipliers[pair] ?? 0.93,
      gamesFloor: floors[pair] ?? 56,
    });
  });
  return deployments;
}

// Best-lines lineup for a team the user hasn't hand-set — every AI club (and
// the user's own team before they touch the sheet) fields its top players by
// on-ice value: top 12 F, top 6 D, best goalie. This gives every team a proper
// starter/bench deployment in the projection instead of a flat, lineup-agnostic
// season where depth plays like top-sixers.
function defaultLineupOrder(roster: SimPlayer[]): TeamLineupOrder {
  const byValue = (a: SimPlayer, b: SimPlayer) => onIceValue(b) - onIceValue(a);
  return {
    forwards: roster.filter(isForward).sort(byValue).slice(0, 12).map(p => p.id),
    defense:  roster.filter(isDefense).sort(byValue).slice(0, 6).map(p => p.id),
    goalies:  roster.filter(p => p.position === "G").sort(byValue).map(p => p.id),
  };
}

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
  startingGoalieId?: string | null,
  lineupOrder?: TeamLineupOrder,
  lineupContext?: boolean,
): number {
  const phaseBaseline = PHASE_BASELINE[teamWindow(team)] ?? 88;

  const skaters = roster.filter(p => p.position !== "Pick" && p.position !== "G");
  const forwards = lineupOrder
    ? orderedLineupPlayers(roster, lineupOrder.forwards, isForward, 12)
    : skaters
        .filter(p => p.position !== "D")
        .sort((a, b) => onIceValue(b) - onIceValue(a));
  const dmen = lineupOrder
    ? orderedLineupPlayers(roster, lineupOrder.defense, isDefense, 6)
    : skaters
        .filter(p => p.position === "D")
        .sort((a, b) => onIceValue(b) - onIceValue(a));
  const goalies = roster
    .filter(p => p.position === "G")
    .sort((a, b) => onIceValue(b) - onIceValue(a));
  const startingGoalie = startingGoalieId
    ? goalies.find(g => g.id === startingGoalieId)
    : null;
  const projectedStarter = startingGoalie ?? goalies[0] ?? null;

  // Cup Run "lines matter": weight each slot by its multiplier so a
  // star buried on L4 contributes like a fourth-liner and vice versa.
  const avg = (arr: SimPlayer[], n: number, unit?: "F" | "D") => {
    if (arr.length === 0) return 0;
    const slice = arr.slice(0, n);
    if (!lineupContext || !unit) {
      return slice.reduce((s, p) => s + onIceValue(p), 0) / slice.length;
    }
    return slice.reduce((s, p, i) => s + onIceValue(p) * slotMultiplier(i, unit), 0) / slice.length;
  };

  const topSixF = avg(forwards, 6, "F");
  const topNineF = avg(forwards, 9, "F");
  const topFourD = avg(dmen, 4, "D");
  const starterG = projectedStarter ? onIceValue(projectedStarter) : -4;
  const depthPenalty = forwards.length < 10 ? (10 - forwards.length) * 1.4 : 0;
  const dPenalty = dmen.length < 6 ? (6 - dmen.length) * 1.2 : 0;

  // Season projection: roster quality nudges phase baseline. Trade delta is
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
  const phase = teamWindow(team);
  let varianceMid = 0;
  if (phase === "Rebuilding" || phase === "Tanking") varianceMid = -3;
  if (phase === "Contender") varianceMid = 2;
  const variance = varianceMid + (rand() * varianceRange - varianceRange / 2);

  return Math.round(Math.max(55, Math.min(135, phaseBaseline + rosterStrength + tradeContext + variance - capPenalty)));
}

// ── Project one goaltender's season ───────────────────────────
// Extracted so the backup is projected by the SAME model as the starter (RL7).
// A separate, simpler formula for the backup would drift from this one on the
// next tuning pass, and the difference between the two would stop meaning
// "these are different goalies" and start meaning "these use different math".
function projectOneGoalie(
  g: SimPlayer,
  teamWinPct: number,
  rand: () => number,
  gamesStarted: number,
): GoalieProjection {
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

  return {
    name: g.name,
    projectedGAA: Math.round(projectedGAA * 100) / 100,
    projectedSVP: Math.round(projectedSVP * 1000) / 1000,
    gamesStarted,
    gsax: g.gsax ?? 0,
  };
}

// ── Project the goaltending tandem ────────────────────────────
function projectGoalies(
  roster: SimPlayer[],
  teamWinPct: number,
  rand: () => number,
  startingGoalieId?: string | null,
): { starter: GoalieProjection | null; backup: GoalieProjection | null } {
  const goalies = roster
    .filter(p => p.position === "G")
    .sort((a, b) => (b.gamesStarted ?? 0) - (a.gamesStarted ?? 0));

  if (goalies.length === 0) return { starter: null, backup: null };

  const starter = (startingGoalieId ? goalies.find(p => p.id === startingGoalieId) : null) ?? goalies[0];
  const backup  = goalies.find(g => g.id !== starter.id) ?? null;

  // Drawn BEFORE either projection so the starter consumes the same rand()
  // sequence position it always did — adding the backup must not change any
  // starter projection an existing seed already produced.
  const drawnStarts = Math.round(48 + rand() * 20);
  const workload = splitGoalieStarts(drawnStarts, backup != null);

  return {
    starter: projectOneGoalie(starter, teamWinPct, rand, workload.starterStarts),
    backup: backup
      ? projectOneGoalie(backup, teamWinPct, rand, workload.backupStarts)
      : null,
  };
}

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

function projectedSkaterToi(p: SimPlayer, deployment?: SkaterDeployment, benched?: boolean): number {
  if (deployment?.active) {
    if (deployment.group === "D") {
      const pair = Math.floor(deployment.slot / 2);
      return [22.8, 19.4, 16.2][pair] ?? 16.2;
    }
    const line = Math.floor(deployment.slot / 3);
    return [18.4, 15.8, 13.2, 10.8][line] ?? 10.8;
  }

  if (benched) return Math.max(6, Math.min(p.avgTOI || 8, 9.5));
  return Math.max(0, Math.round((p.avgTOI ?? 0) * 10) / 10);
}

// ── Project skater seasons across a full roster ───────────────
// This keeps last-season scoring as the anchor, but lets age, prospect NHLe,
// prior usage, and controlled variance create believable breakouts/regressions.
function projectSkaterOutcome(
  p: SimPlayer,
  teamId: string,
  seed: number,
  deployment?: SkaterDeployment,
  benched?: boolean,
): ProjectedSkaterSeason {
  const rand = mulberry32(seed + hashString(`${teamId}:${p.id}:skater-season`));
  const priorGames = p.games ?? 82;
  const prospectPace = prospectNhlPace(p);
  const stablePace = skaterPace(p);

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
  // Shared, multi-signal breakout model — opportunity (TOI), pedigree (draft /
  // NHLe), finishing luck (EDGE), and burst (EDGE explosiveness) — so a young
  // player pops for reasons tied to his real-life profile, not a coin flip.
  const odds = computeBreakout({
    age: p.age,
    position: p.position,
    ptsPace: p.ptsPace,
    stablePace,
    priorGames,
    avgTOI: p.avgTOI,
    xGPace: p.xGPace,
    goalsPace: p.goalsPace,
    hdFinishingDelta: p.hdFinishingDelta,
    prospectPtsPace: p.prospectPtsPace,
    draftOverall: p.draftOverall,
    edgeBurstsOver20: p.edgeBurstsOver20,
    edgeSpeedMaxMph: p.edgeSpeedMaxMph,
  });
  let breakoutChance = odds.breakout;
  let regressionChance = odds.regression;

  const eventRoll = rand();
  if (eventRoll < breakoutChance) {
    development *= 1.14 + rand() * (isProspectProfile ? 0.24 : 0.16);
    // A young player leaping is a breakout; an established vet posting the same
    // over-pace is a career year, not a "breakout".
    breakoutTag = p.age <= 26 ? "BREAKOUT" : "CAREER_YEAR";
  } else if (eventRoll > 1 - regressionChance) {
    development *= 0.78 + rand() * 0.14;
    breakoutTag = "REGRESSION";
  } else if (isAgingWell && eventRoll > 0.55) {
    development *= 1.02 + rand() * 0.08;
    breakoutTag = "VETERAN_HOLD";
  }

  let gamesPlayed = Math.round(70 + rand() * 12);
  if (isProspectProfile) gamesPlayed = Math.round(55 + rand() * 27);
  if (deployment?.active) {
    gamesPlayed = Math.max(gamesPlayed, Math.round(deployment.gamesFloor + rand() * 8));
  } else if (benched) {
    // Not in the set lineup: press-box/AHL depth — call-up minutes only.
    gamesPlayed = Math.min(gamesPlayed, Math.round(18 + rand() * 24));
  }
  if (rand() < (isAgingWell ? 0.04 : isDeclineRisk ? 0.10 : 0.055)) {
    gamesPlayed = Math.max(8, gamesPlayed - Math.round((isAgingWell ? 10 : 18) + rand() * (isAgingWell ? 18 : 38)));
  }

  // Opportunity unlocks a young player's ceiling — a prospect handed a real
  // scoring role produces toward what that role supports, not just his thin NHL
  // sample (see young-opportunity.ts). Only ever lifts; veterans are untouched.
  const effectivePace = opportunityPace({
    age: p.age, priorGames, stablePace, prospectPace,
    draftOverall: p.draftOverall, isProspectProfile, isYoungRegular,
    deploymentActive: deployment?.active ?? false,
    deploymentGroup: deployment?.group,
    deploymentSlot: deployment?.slot,
  });

  // Burst channel: explosive skaters carry a fatter upside tail (variance kick
  // adds only to the ceiling) and a small steady rush-offence lift on scoring.
  const burst = burstProfile(p);
  const paceVariance = (isAgingWell ? 0.98 + rand() * 0.14 : 0.91 + rand() * 0.18) + rand() * burst.varianceKick;
  const deploymentMultiplier = deployment?.active ? deployment.multiplier : benched ? 0.85 : 1;
  const rawProjectedPts = (effectivePace / 82) * gamesPlayed * development * paceVariance * deploymentMultiplier * burst.rushLift;
  // Believable-season ceiling: the breakout/variance/deployment/burst multipliers
  // can stack to ~1.7x, which let a 33-yo post 156 off a ~95 pace. A season can be
  // great but not physics-defying — cap it at a role-appropriate multiple of the
  // player's demonstrated level (generous for young breakouts, tight for vets who
  // top out near their peak). Prospects still keep a high ceiling for real leaps.
  const demonstratedLevel = Math.max(effectivePace, stablePace, p.baselinePtsPace ?? 0, prospectPace);
  const ceilingMult = p.age <= 23 ? 1.9 : p.age <= 26 ? 1.6 : p.age <= 29 ? 1.42 : p.age <= 32 ? 1.3 : 1.22;
  const ptsCeiling = (demonstratedLevel / 82) * gamesPlayed * ceilingMult;
  const projectedPts = Math.max(0, Math.round(Math.min(rawProjectedPts, ptsCeiling)));
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
    projectedTOI: projectedSkaterToi(p, deployment, benched),
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
  lineup?: SimRequest["lineup"],
  lineupContext?: boolean,
): SimTeamResult[] {
  return teams.map(team => {
    const roster     = playersByTeam.get(team.id) ?? [];
    const navDelta   = tradeNavDeltas.get(team.id) ?? 0;
    const capDelta   = capDeltas.get(team.id) ?? 0;
    const capSpaceAfterTrade = team.capSpace - capDelta;
    const teamSeed = seed + hashString(`team:${team.id}`);
    // Fall back to a best-lines order when the user hasn't hand-set this team,
    // so every club — AI and the user's own before they edit — fields its best
    // lineup by default rather than a flat, deployment-less roster.
    const lineupOrder = lineup?.orders?.[team.id] ?? defaultLineupOrder(roster);
    const startingGoalieId = lineup?.startingGoalies?.[team.id] ?? lineupOrder?.goalies?.[0] ?? null;
    const deploymentByPlayer = buildDeploymentMap(lineupOrder);
    const projectedPoints = projectTeamPoints(
      team,
      roster,
      navDelta,
      capSpaceAfterTrade,
      mulberry32(teamSeed + hashString("points")),
      startingGoalieId,
      lineupOrder,
      lineupContext,
    );
    // Every skater on the team projects a season — lineup players are
    // starters (deployment floors/multipliers), everyone else is depth.
    const hasSetLineup = deploymentByPlayer.size > 0;
    const projectedSkaters = roster
      .filter(p => p.position !== "Pick" && p.position !== "G")
      .map(p => projectSkaterOutcome(
        p, team.id, seed, deploymentByPlayer.get(p.id),
        hasSetLineup && !deploymentByPlayer.has(p.id),
      ))
      .sort((a, b) =>
        b.projectedPts !== a.projectedPts
          ? b.projectedPts - a.projectedPts
          : a.name.localeCompare(b.name)
      );
    const topScorer  = projectedSkaters[0] ?? null;
    const winPct     = projectedPoints / 164;
    const { starter: goalie, backup: backupGoalie } =
      projectGoalies(roster, winPct, mulberry32(teamSeed + hashString("goalie")), startingGoalieId);
    const topDefenseman = projectedSkaters
      .filter(p => p.position === "D")
      .sort((a, b) =>
        b.projectedPts !== a.projectedPts
          ? b.projectedPts - a.projectedPts
          : a.name.localeCompare(b.name)
      )[0] ?? null;
    return {
      teamId: team.id, teamName: team.name, phase: teamWindow(team),
      projectedPoints, topScorer, projectedSkaters, goalie, backupGoalie, topDefenseman,
      madePlayoffs: false, divisionRank: 0, leagueRank: 0, division: "",
    };
  });
}

interface GoalieProjection {
  name: string;
  projectedGAA: number;
  projectedSVP: number;
  gamesStarted: number;
  gsax: number;
}

interface SimTeamResult {
  teamId: string;
  teamName: string;
  phase: string;
  projectedPoints: number;
  topScorer: ProjectedSkaterSeason | null;
  projectedSkaters: ProjectedSkaterSeason[];
  goalie: GoalieProjection | null;
  /** RL7 — the tandem's other half. Null when the roster carries one goalie. */
  backupGoalie: GoalieProjection | null;
  topDefenseman: ProjectedSkaterSeason | null;
  madePlayoffs: boolean;
  divisionRank: number;
  leagueRank: number;
  division: string;
}

// Division/conference structure + bracket sim live in app/lib/playoff-bracket.ts.

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
      ?? PHASE_BASELINE[teamWindow(teams.find(t => t.id === id)) || "Retooling"]
      ?? 88) / 164;
  const outcomes: TradedPlayerOutcome[] = [];

  // G4 — modern roles propagate into sim output: a moved player is labeled
  // by the same evidence-gated role system the analytics pages use
  // ("Floor Raiser", "Perimeter Lockdown"), not a generic position word.
  // Falls back to the old generic strings when the data can't derive one.
  const modernRole = (p: SimPlayer, fallback: string): string =>
    derivePlayerRoles(p as any)?.primary.label ?? fallback;

  const addOutcome = (p: SimPlayer, oldTeamId: string, newTeamId: string) => {
    if (p.position === "Pick") return;
    if (p.position === "G") {
      const winPctAnchor = teamWinPct(newTeamId);
      const goalie = projectGoalies([p], winPctAnchor, mulberry32(seed + hashString(`${newTeamId}:${p.id}:goalie-outcome`))).starter;
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
        role: modernRole(p, (p.gamesStarted ?? p.games ?? 0) >= 45 ? "starter goalie" : "goalie"),
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
      role: modernRole(p, p.position === "D" ? "defenceman" : "skater"),
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
    const rawBody = await req.json();

    // Validate structure and bounds before any work runs (audit #4). Fields on
    // players/teams pass through untouched; only the shape, sizes, finite seed,
    // and id invariants are enforced.
    const parsed = simRequestSchema.safeParse(rawBody);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Invalid simulation request", details: parsed.error.format() },
        { status: 400 },
      );
    }
    const body = parsed.data as unknown as SimRequest;
    const { homeTeamId, partnerTeamId, teams, players, trades, lineup, lineupContext } = body;

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
    // Independent named RNG streams so awards, Calder voting, and playoffs are
    // each deterministic and never reroll one another. One shared stream meant
    // adding an award-eligible rookie (more Calder draws) rerolled unrelated
    // playoff series (audit #2). simulateLeague derives its own per-team streams
    // from `seed` and is unaffected.
    const awardsRand  = mulberry32(seed + hashString("awards"));
    const calderRand  = mulberry32(seed + hashString("calder"));
    const playoffRand = mulberry32(seed + hashString("playoffs"));

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
      // Retention-aware: a retained-salary player only moves his post-retention
      // cap hit, matching cap-delta.ts so the SIM and the trade UI never diverge.
      const outCap = skaters(trade.outgoing).reduce((s, p) => s + effectiveCapHit(p), 0);
      const inCap  = skaters(trade.incoming).reduce((s, p) => s + effectiveCapHit(p), 0);
      const valDelta = inVal  - outVal;
      const capDelta = inCap  - outCap;
      tradeNavDeltas.set(trade.homeTeamId,    (tradeNavDeltas.get(trade.homeTeamId)    ?? 0) + valDelta);
      tradeNavDeltas.set(trade.partnerTeamId, (tradeNavDeltas.get(trade.partnerTeamId) ?? 0) - valDelta);
      capDeltas.set(trade.homeTeamId,         (capDeltas.get(trade.homeTeamId)         ?? 0) + capDelta);
      capDeltas.set(trade.partnerTeamId,      (capDeltas.get(trade.partnerTeamId)      ?? 0) - capDelta);
    }

    const rawStandings = simulateLeague(teams, playersByTeam, tradeNavDeltas, capDeltas, seed, lineup, lineupContext);
    const standings    = assignPlayoffSeeds(rawStandings);
    const leaders      = findLeagueLeaders(standings, awardsRand);

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
        .map(p => ({ p, score: p.projectedPts + (p.breakoutTag === "BREAKOUT" ? 8 : 0) + calderRand() * 10 }))
        .sort((a, b) => b.score - a.score);
      const winner = sorted[0].p;
      return {
        name: winner.name,
        team: winner.teamName,
        note: `${winner.projectedGoals}-${winner.projectedAssists}-${winner.projectedPts} in projected rookie season`,
      };
    })();

    const playoffBracket = simulatePlayoffs(standings, playoffRand);
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
      season: SEASON.label,
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
