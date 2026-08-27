// ── Cup Run Challenge — run state machine (Phases 2 & 4) ──────
// Pick a team, win the Cup within three seasons. This module owns the
// run's state transitions, the cross-season retention ledger (the
// anti-abuse rule), difficulty rating, the year-over-year league
// rollover orchestration, and the share card. Pure — the armchair GM
// page owns persistence and rendering.

import type { Asset, Team } from "@/app/lib/trade-types";
import { advanceSeason, type RolloverEvent } from "./season-rollover";
import { generateSyntheticDraftClass } from "./synthetic-draft";
import { computeChangeOfScenery } from "./lineup-context";
import { hashString, mulberry32, stablePts } from "./sim-engine";
import { SEASON } from "./season-config";
import { planCapCompliance } from "./ai-cap";
import { activateMaturedExtension } from "./extensions";
import { teamWindow } from "@/app/lib/team-window";
import {
  auditOffseasonPlayerStates,
  type OffseasonStateDiagnostic,
  type OffseasonTransaction,
} from "@/app/lib/offseason-ledger";
// DATA-05: the retention rule is a CBA fact about a club, not something
// specific to Cup Run — see retention-ledger.ts. Re-exported here so every
// existing import of these names from cup-run.ts keeps working unchanged.
import {
  MAX_RETENTION_SLOTS,
  MAX_RETAINED_SHARE_OF_CAP,
  MAX_RETENTION_PCT,
  retentionCheck,
  addRetention,
  rollRetentionLedger,
  type RetentionEntry,
} from "@/app/lib/retention-ledger";
export {
  MAX_RETENTION_SLOTS,
  MAX_RETAINED_SHARE_OF_CAP,
  MAX_RETENTION_PCT,
  retentionCheck,
  addRetention,
  rollRetentionLedger,
  type RetentionEntry,
};

// ── Types ─────────────────────────────────────────────────────
export interface CupRunSeasonRecord {
  year: 1 | 2 | 3;
  seasonLabel: string;              // "2026-27"
  championTeamId: string;
  championTeamName: string;
  madePlayoffs: boolean;
  wonCup: boolean;
}

export type CupRunStatus = "ACTIVE" | "WON" | "FIRED";

export interface CupRunState {
  version: 1;
  teamId: string;
  teamName: string;
  difficulty: { stars: number; label: string };
  seed: number;
  currentYear: 1 | 2 | 3;
  seasons: CupRunSeasonRecord[];
  status: CupRunStatus;
  retentionLedger: RetentionEntry[]; // persists across rollovers
}

// ── Season labels ─────────────────────────────────────────────
// Year 1 is SEASON.label ("2026-27"); later years advance from it.
export function seasonLabelForYear(year: number): string {
  const startYear = parseInt(SEASON.label.slice(0, 4), 10) + (year - 1);
  return `${startYear}-${String((startYear + 1) % 100).padStart(2, "0")}`;
}

// ── Difficulty ────────────────────────────────────────────────
export function difficultyForTeam(team: Pick<Team, "phase" | "rosterWindow" | "standing">): { stars: number; label: string } {
  const phase = teamWindow(team);
  if (phase === "Contender") {
    return team.standing <= 4
      ? { stars: 1, label: "FRONT RUNNER" }
      : { stars: 2, label: "ON THE BEAT" };
  }
  if (phase === "Bubble") return { stars: 3, label: "DARK HORSE" };
  if (phase === "Retooling") return { stars: 4, label: "FIXER-UPPER" };
  return { stars: 5, label: "LONG SHOT" }; // Rebuilding / Tanking
}

// ── Run lifecycle ─────────────────────────────────────────────
export function startCupRun(team: Team): CupRunState {
  return {
    version: 1,
    teamId: team.id,
    teamName: team.name,
    difficulty: difficultyForTeam(team),
    seed: hashString(`cup-run:${team.id}:${SEASON.label}`),
    currentYear: 1,
    seasons: [],
    status: "ACTIVE",
    retentionLedger: [],
  };
}

export function recordSeason(
  state: CupRunState,
  result: { championTeamId: string; championTeamName: string; madePlayoffs: boolean },
): CupRunState {
  if (state.status !== "ACTIVE") return state;
  const wonCup = result.championTeamId === state.teamId;
  const record: CupRunSeasonRecord = {
    year: state.currentYear,
    seasonLabel: seasonLabelForYear(state.currentYear),
    championTeamId: result.championTeamId,
    championTeamName: result.championTeamName,
    madePlayoffs: result.madePlayoffs,
    wonCup,
  };
  const seasons = [...state.seasons, record];
  if (wonCup) return { ...state, seasons, status: "WON" };
  if (state.currentYear >= 3) return { ...state, seasons, status: "FIRED" };
  return { ...state, seasons, currentYear: (state.currentYear + 1) as 2 | 3 };
}


// ── League rollover between run years ─────────────────────────
export interface RollForwardResult {
  players: Asset[];
  events: RolloverEvent[];
  retiredCount: number;
  rookieCount: number;
  draftedRookies: Asset[];
  depthAddedCount: number;
  transactions: OffseasonTransaction[];
  stateDiagnostic: OffseasonStateDiagnostic;
}

export interface CupRunSkaterSeason {
  playerId: string;
  projectedPts: number;
  projectedGoals: number;
  projectedAssists: number;
  gamesPlayed: number;
  projectedTOI?: number;
}

export type CupRunOffseasonEntry = "DRAFT_NIGHT" | "DRAFT_SUMMARY" | "RESIGN";

export function cupRunOffseasonEntry(
  state: CupRunState | null | undefined,
  hasDraftSummary: boolean,
): CupRunOffseasonEntry {
  if (state?.status === "ACTIVE" && state.currentYear > 1) {
    return hasDraftSummary ? "DRAFT_SUMMARY" : "RESIGN";
  }
  return "DRAFT_NIGHT";
}

const isSkaterOrGoalie = (p: Asset) => p.position !== "Pick";

const committedCap = (players: Asset[], teamId: string): number =>
  players
    .filter((p) => p.teamId === teamId && isSkaterOrGoalie(p))
    .reduce((sum, p) => sum + (p.capHit ?? 0) * (1 - (p.retainedPct ?? 0)), 0);

const round1 = (value: number): number => Math.round(value * 10) / 10;

const seasonPace = (count: number, games: number): number =>
  round1((Math.max(0, count) / Math.max(1, games)) * 82);

// Cup Run scoring carry is intentionally more conservative than one simulated
// season's upside tail. The credibility backtest (3,371 spike seasons) supports
// a 40/60 observed-season/career-anchor blend (9.5 pts/82 MAE; the dynamic form
// is 9.4), while the MoneyPuck baseline represents about 2.7 effective seasons.
// Giving one new season 25% of the updated career mean approximates adding it to
// that history (1 / 3.7 ~= 27%) without letting one ceiling result become the
// new career. A +20 pts/82 banked-offseason cap is roughly two validation MAEs:
// room for a real leap, but not enough for the route's 1.9x young-player ceiling
// to become next year's input and stack again.
const CARRIED_SEASON_WEIGHT = 0.40;
const CAREER_MEAN_SEASON_WEIGHT = 0.25;
const MAX_OFFSEASON_PACE_GAIN = 20;

interface CarriedSkaterGuard {
  baselinePtsPace: number;
  maxPtsPace: number;
  goalShare: number;
}

const fallbackSeasonToi = (p: Asset, ptsPace: number): number => {
  if ((p.avgTOI ?? 0) > 0) return p.avgTOI;
  if (p.position === "D") return ptsPace >= 40 ? 21 : ptsPace >= 25 ? 18 : 16;
  return ptsPace >= 55 ? 18 : ptsPace >= 35 ? 15 : 12;
};

function carryForwardSimSkaterStats(
  players: Asset[],
  seasons: CupRunSkaterSeason[] = [],
): { players: Asset[]; guards: Map<string, CarriedSkaterGuard> } {
  const guards = new Map<string, CarriedSkaterGuard>();
  if (seasons.length === 0) return { players, guards };
  const byId = new Map(seasons.map((s) => [s.playerId, s]));

  const carried = players.map((p) => {
    if (p.position === "Pick" || p.position === "G") return p;
    const season = byId.get(p.id);
    if (
      !season
      || !Number.isFinite(season.gamesPlayed)
      || season.gamesPlayed <= 0
      || season.gamesPlayed > 82
      || !Number.isFinite(season.projectedPts)
      || !Number.isFinite(season.projectedGoals)
      || !Number.isFinite(season.projectedAssists)
      || season.projectedPts < 0
      || season.projectedGoals < 0
      || season.projectedAssists < 0
      || season.projectedGoals + season.projectedAssists !== season.projectedPts
    ) return p;

    const games = Math.max(1, Math.round(season.gamesPlayed));
    const observedPtsPace = seasonPace(season.projectedPts, games);
    const currentPtsPace = Number.isFinite(p.ptsPace) ? Math.max(0, p.ptsPace) : 0;
    const baselinePtsPace = Number.isFinite(p.baselinePtsPace) && (p.baselinePtsPace ?? 0) > 0
      ? p.baselinePtsPace!
      : 0;
    const prospectPtsPace = Number.isFinite(p.prospectPtsPace) && (p.prospectPtsPace ?? 0) > 0
      ? p.prospectPtsPace! * 0.72
      : 0;

    // Existing NHL pace is first regressed by the same stablePts blend used by
    // the season route. A debutant instead starts from his NHLe translation;
    // with neither signal, his first simulated season becomes the initial
    // career anchor rather than leaving baselinePtsPace absent forever.
    const stablePrior = currentPtsPace > 0 ? stablePts(p) : 0;
    const priorLevel = Math.max(stablePrior, prospectPtsPace);
    const careerAnchor = baselinePtsPace > 0
      ? baselinePtsPace
      : priorLevel > 0 ? priorLevel : observedPtsPace;
    // The step limit is truly year over year: compare with the pace stored on
    // last season's roster. A never-dressed prospect uses his NHLe translation
    // until he has an NHL pace of his own.
    const growthReference = currentPtsPace > 0
      ? currentPtsPace
      : prospectPtsPace > 0 ? prospectPtsPace : careerAnchor;
    const maxPtsPace = round1(growthReference + MAX_OFFSEASON_PACE_GAIN);
    const maxBaselinePtsPace = round1(careerAnchor + MAX_OFFSEASON_PACE_GAIN);
    const updatedBaseline = round1(Math.min(
      careerAnchor * (1 - CAREER_MEAN_SEASON_WEIGHT)
        + observedPtsPace * CAREER_MEAN_SEASON_WEIGHT,
      maxBaselinePtsPace,
    ));
    const ptsPace = round1(Math.min(
      observedPtsPace * CARRIED_SEASON_WEIGHT
        + updatedBaseline * (1 - CARRIED_SEASON_WEIGHT),
      maxPtsPace,
    ));

    const observedGoalShare = season.projectedPts > 0
      ? Math.max(0, Math.min(1, season.projectedGoals / season.projectedPts))
      : 0;
    const priorGoalShare = currentPtsPace > 0 && Number.isFinite(p.goalsPace)
      ? Math.max(0, Math.min(1, (p.goalsPace ?? 0) / currentPtsPace))
      : observedGoalShare;
    const goalShare = priorGoalShare * (1 - CARRIED_SEASON_WEIGHT)
      + observedGoalShare * CARRIED_SEASON_WEIGHT;
    const projectedTOI = Number.isFinite(season.projectedTOI) && (season.projectedTOI ?? 0) > 0
      ? season.projectedTOI!
      : fallbackSeasonToi(p, ptsPace);
    const goalsPace = round1(ptsPace * goalShare);

    guards.set(p.id, { baselinePtsPace: updatedBaseline, maxPtsPace, goalShare });

    return {
      ...p,
      games,
      ptsPace,
      goalsPace,
      assistsPace: round1(ptsPace - goalsPace),
      baselinePtsPace: updatedBaseline,
      avgTOI: round1(projectedTOI),
      hasLiveStats: true,
    };
  });

  return { players: carried, guards };
}

// Recompute every team's cap space against the season the league is entering:
// the new ceiling minus committed roster salary. The user's team is reconciled
// too — it must receive cap-ceiling growth and its rolled roster's commitment
// changes (aging, drafted rookies, retirements), not stay frozen at last
// season's number (CX5). The user's active retained-salary obligations (paid on
// players they traded away — off-roster, so committedCap can't see them) are
// subtracted on top.
export function reconcileTeamCapSpaces(
  teams: Team[],
  players: Asset[],
  capCeiling: number,
  userTeamId: string,
  userRetainedAav = 0,
): Team[] {
  return teams.map((team) => {
    const committed = committedCap(players, team.id);
    const retention = team.id === userTeamId ? userRetainedAav : 0;
    const capSpace = Math.round((capCeiling - committed - retention) * 10) / 10;
    return { ...team, capSpace };
  });
}

// Replacement-level depth so retirement can't leave a team unable to
// dress a lineup. Cheap one-year deals, deterministic ids.
function depthPlayer(teamId: string, pos: "C" | "W" | "D" | "G", year: number, n: number): Asset {
  return {
    id: `depth-${year}-${teamId}-${pos}-${n}`.toLowerCase(),
    teamId,
    name: `${teamId} Call-Up ${pos}${n}`,
    position: pos,
    age: 24,
    games: 30,
    ptsPace: pos === "G" ? 0 : pos === "D" ? 14 : 20,
    defRate: 0.08,
    avgTOI: pos === "D" ? 16 : 11,
    capHit: 0.8,
    lastCapHit: 0.8,
    yearsRemaining: 1,
    hasNMC: false,
    hasNTC: false,
    canRetain: false,
    retainedPct: 0,
    multiplier: 1.0,
    contractStatus: "SIGNED",
    expiresThisOffseason: false,
    hasLiveStats: false,
  };
}

/**
 * Advance the whole league one offseason for a Cup Run:
 *  1. change-of-scenery detection (season-start rosters vs post-trade)
 *  2. advanceSeason — aging, retirement, stat regen, breakout rolls
 *  3. synthetic first-round draft class (worst teams pick first)
 *  4. roster repair — replacement-level depth for gutted positions
 *  5. AI cap-legality pass — over-cap AI teams walk their worst-value
 *     veteran contract to the FA pool
 * FA resolution itself stays with resolveLeagueOffseason on re-entry.
 */
export function rollLeagueForward(opts: {
  players: Asset[];               // post-trade league (picks included)
  seasonStartPlayers: Asset[];    // rosters as the season began (scenery baseline)
  state: CupRunState;
  teams: Team[];
  standings?: { teamId: string; standing: number }[]; // worst-first draft order source
  capCeiling: number;
  simSkaterSeasons?: CupRunSkaterSeason[];
}): RollForwardResult {
  const { players, seasonStartPlayers, state, teams, standings, capCeiling, simSkaterSeasons } = opts;
  const nextYear = state.currentYear;          // call AFTER recordSeason advanced it
  // The base draft (SEASON.draftYear, e.g. 2026) is played before Year 1.
  // Rolling INTO Year N drafts the class 2026 + (N-1): Year 2 → 2027,
  // Year 3 → 2028. The old `+ nextYear` was off by one (Year 2 drafted 2028).
  const draftYear = SEASON.draftYear + nextYear - 1;
  const rolloverSeed = state.seed + nextYear * 7919;

  const picks = players.filter((p) => p.position === "Pick");
  const skatersBeforeCarry = players.filter(isSkaterOrGoalie);

  // 1. Scenery: changed teams into a better slot during the season just played
  const scenery = computeChangeOfScenery(
    seasonStartPlayers.filter(isSkaterOrGoalie),
    skatersBeforeCarry,
  );
  const carried = carryForwardSimSkaterStats(skatersBeforeCarry, simSkaterSeasons);

  // 2. Age the league one offseason
  const rolled = advanceSeason(carried.players, {
    seed: rolloverSeed,
    year: draftYear,
    changeOfScenery: scenery,
  });
  // advanceSeason still supplies the seeded age/breakout/regression roll, but a
  // second upside roll in the same offseason may not punch through the carry
  // cap or update the career mean again. Scale G/A to the final guarded pace so
  // their identity remains goals + assists = points pace.
  const rolledPlayers = rolled.players.map((p) => {
    const guard = carried.guards.get(p.id);
    if (!guard) return p;
    const ptsPace = round1(Math.min(Math.max(0, p.ptsPace), guard.maxPtsPace));
    const goalsPace = round1(ptsPace * guard.goalShare);
    return {
      ...p,
      ptsPace,
      goalsPace,
      assistsPace: round1(ptsPace - goalsPace),
      baselinePtsPace: guard.baselinePtsPace,
    };
  });

  // 3. Synthetic draft class, worst teams first
  const order = (standings && standings.length > 0
    ? [...standings].sort((a, b) => b.standing - a.standing).map((s) => s.teamId)
    : teams.map((t) => t.id)
  ).filter((id) => teams.some((t) => t.id === id));
  const draftedBySlot = generateSyntheticDraftClass(draftYear, rolloverSeed, order);
  // A first-round rookie belongs to whoever OWNS the pick now, not the
  // team whose standing created the slot — a traded first must convey.
  // Pick ids are `pick-{origTeam}-{year}-{round}`; teamId is the owner.
  const firstRoundOwner = new Map(
    picks
      .filter((p) => p.round === 1 && p.year === draftYear)
      .map((p) => [String(p.id).split("-")[1], p.teamId] as const),
  );
  const rookies = draftedBySlot.map((r) => {
    const owner = firstRoundOwner.get(r.teamId);
    return owner && owner !== r.teamId ? { ...r, teamId: owner } : r;
  });
  const transactions: OffseasonTransaction[] = [
    ...rolled.retired.map((player): OffseasonTransaction => ({
      playerId: player.id,
      playerName: player.name,
      kind: "RETIRED",
      state: "RETIRED",
      fromTeamId: player.teamId,
      detail: `Retired at age ${player.age}`,
    })),
    ...rookies.map((player): OffseasonTransaction => ({
      playerId: player.id,
      playerName: player.name,
      kind: "DRAFTED",
      state: "ROSTER",
      toTeamId: player.teamId,
      detail: `Drafted by ${player.teamId}${player.draftOverall ? ` at #${player.draftOverall}` : ""}`,
    })),
  ];

  // Flag every contract that has run out so resolveLeagueOffseason picks
  // it up on re-entry — including rows that were already at 0 years
  // (stale data would otherwise sit on a roster forever at full cap hit).
  const flagged = rolledPlayers.map((raw) => {
    // An extension signed a year early matures exactly here. Activate it before
    // the expiry check, or the contract it was meant to replace flags him as a
    // pending free agent and he reaches the market anyway (OFF5).
    const p = activateMaturedExtension(raw);
    if (p.yearsRemaining > 0 || p.position === "Pick") return p;
    const expiryStatus: "UFA" | "RFA" = p.expiryStatus === "UFA" || p.expiryStatus === "RFA"
      ? p.expiryStatus
      : p.age >= 27 ? "UFA" : "RFA";
    return {
      ...p,
      expiryStatus,
      expiresThisOffseason: true,
      contractStatus: expiryStatus,
      lastCapHit: p.lastCapHit ?? p.capHit,
    };
  });

  let nextPlayers: Asset[] = [...flagged, ...rookies];

  const countUnit = (roster: Asset[], unit: "F" | "D" | "G") =>
    roster.filter((p) =>
      unit === "G" ? p.position === "G" : unit === "D" ? p.position === "D" : p.position !== "D" && p.position !== "G"
    ).length;

  // Clubs that could not reach the ceiling by cutting — surfaced rather than
  // silently left over the cap.
  const capNonCompliant: string[] = [];
  const capCutIds = new Set<string>();

  const enforceAiCap = () => {
    capNonCompliant.length = 0;
    for (const team of teams) {
      if (team.id === state.teamId) continue;
      const roster = nextPlayers.filter((p) => p.teamId === team.id && isSkaterOrGoalie(p));
      // Positional ranking with a protected core, and cuts allowed to drop the
      // roster below minimum because repair refills at $0.8M straight after.
      // The old pass ranked on points-per-dollar (so elite D always looked like
      // the worst contract) and refused to cut at 12F/6D (so a repaired roster
      // had no legal candidate and the club stayed over the cap).
      const plan = planCapCompliance(roster, { ceiling: capCeiling });
      if (plan.cuts.length === 0 && !plan.compliant) capNonCompliant.push(team.id);
      if (plan.cuts.length === 0) continue;
      const cutIds = new Set(plan.cuts.map((c: { id: string }) => c.id));
      for (const cut of plan.cuts) {
        if (capCutIds.has(cut.id)) continue;
        capCutIds.add(cut.id);
        transactions.push({
          playerId: cut.id,
          playerName: cut.name,
          kind: "RELEASED",
          state: "UFA",
          fromTeamId: team.id,
          toTeamId: "FA_POOL",
          detail: `Released by ${team.id} for cap compliance`,
        });
      }
      nextPlayers = nextPlayers.map((p) =>
        cutIds.has(p.id)
          ? { ...p, teamId: "FA_POOL", expiryStatus: "UFA" as const, expiresThisOffseason: true }
          : p
      );
      if (!plan.compliant) capNonCompliant.push(team.id);
    }
  };

  // 4. AI cap-legality pass — user's team is exempt (their problem to
  // solve). Goalies are never walked (their value isn't in ptsPace),
  // and a cut may not push a team below a dressable lineup.
  enforceAiCap();

  // 5. Roster repair (after cuts) — every team must dress a lineup
  let depthAdded = 0;
  const generatedDepth: Asset[] = [];
  for (const team of teams) {
    const roster = nextPlayers.filter((p) => p.teamId === team.id && isSkaterOrGoalie(p));
    const need: Array<["C" | "W" | "D" | "G", number]> = [
      ["W", Math.max(0, 12 - countUnit(roster, "F"))],
      ["D", Math.max(0, 6 - countUnit(roster, "D"))],
      ["G", Math.max(0, 2 - countUnit(roster, "G"))],
    ];
    for (const [pos, missing] of need) {
      for (let i = 0; i < missing; i++) {
        const player = depthPlayer(team.id, pos, draftYear, i + 1);
        nextPlayers.push(player);
        generatedDepth.push(player);
        transactions.push({
          playerId: player.id,
          playerName: player.name,
          kind: "DEPTH_ADDED",
          state: "ROSTER",
          toTeamId: team.id,
          detail: `Generated replacement-depth signing by ${team.id}`,
        });
        depthAdded++;
      }
    }
  }

  // Replacement depth can add cap back after the first cleanup. Run one more
  // pass so AI clubs do not carry illegal rosters into the next simulated year.
  enforceAiCap();

  const generatedDepthIds = new Set(generatedDepth.map((player) => player.id));
  const stateDiagnostic = auditOffseasonPlayerStates({
    previous: skatersBeforeCarry,
    current: nextPlayers,
    drafted: rookies,
    retired: rolled.retired,
    ufaIds: [...capCutIds].filter((playerId) => !generatedDepthIds.has(playerId)),
    excludedSyntheticDepthIds: [...generatedDepthIds],
  });

  return {
    players: [...nextPlayers, ...picks],
    events: rolled.events,
    retiredCount: rolled.retired.length,
    rookieCount: rookies.length,
    draftedRookies: rookies,
    depthAddedCount: depthAdded,
    transactions,
    stateDiagnostic,
  };
}

// ── Share card ────────────────────────────────────────────────
export function cupRunShareText(state: CupRunState): string {
  const stars = "★".repeat(state.difficulty.stars) + "☆".repeat(5 - state.difficulty.stars);
  const header = state.status === "WON"
    ? `🏆 Won the Cup with ${state.teamName} in Year ${state.seasons.findIndex((s) => s.wonCup) + 1}`
    : `📰 Fired after 3 seasons with ${state.teamName}`;
  const seasonLines = state.seasons.map((s) =>
    `${s.seasonLabel}: ${s.wonCup ? "🏆 STANLEY CUP" : s.madePlayoffs ? "made playoffs" : "missed playoffs"} (Cup: ${s.championTeamName})`
  );
  return [
    header,
    `Difficulty: ${stars} ${state.difficulty.label}`,
    ...seasonLines,
    "capandcrease.com/armchair-gm",
  ].join("\n");
}
