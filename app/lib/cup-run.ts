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
import { hashString, mulberry32 } from "./sim-engine";
import { SEASON } from "./season-config";

// ── Types ─────────────────────────────────────────────────────
export interface CupRunSeasonRecord {
  year: 1 | 2 | 3;
  seasonLabel: string;              // "2026-27"
  championTeamId: string;
  championTeamName: string;
  madePlayoffs: boolean;
  wonCup: boolean;
}

export interface RetentionEntry {
  playerId: string;
  playerName: string;
  pct: number;                      // 0-0.5
  aavRetained: number;              // $M against the cap while active
  yearsRemaining: number;           // slot stays occupied this long
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
export function difficultyForTeam(team: Pick<Team, "phase" | "standing">): { stars: number; label: string } {
  const phase = team.phase ?? "";
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

// ── Retention ledger (anti-abuse) ─────────────────────────────
export const MAX_RETENTION_SLOTS = 3;                 // per team, CBA
export const MAX_RETAINED_SHARE_OF_CAP = 0.15;        // aggregate soft cap
export const MAX_RETENTION_PCT = 0.5;                 // 50% of AAV

export function retentionCheck(
  ledger: RetentionEntry[],
  proposed: { playerId: string; playerName: string; pct: number; capHit: number; yearsRemaining: number }[],
  capCeiling: number,
): { ok: boolean; reason?: string } {
  const active = ledger.filter((e) => e.yearsRemaining > 0);
  for (const p of proposed) {
    if (p.pct > MAX_RETENTION_PCT + 1e-9) {
      return { ok: false, reason: `Retention on ${p.playerName} exceeds the 50% maximum.` };
    }
  }
  if (active.length + proposed.length > MAX_RETENTION_SLOTS) {
    return {
      ok: false,
      reason: `Retention slots full — ${active.length} of ${MAX_RETENTION_SLOTS} in use, and slots stay occupied for the retained contract's full term.`,
    };
  }
  const activeDollars = active.reduce((s, e) => s + e.aavRetained, 0);
  const proposedDollars = proposed.reduce((s, p) => s + p.capHit * p.pct, 0);
  const limit = capCeiling * MAX_RETAINED_SHARE_OF_CAP;
  if (activeDollars + proposedDollars > limit + 1e-9) {
    return {
      ok: false,
      reason: `Aggregate retained salary would exceed ${Math.round(MAX_RETAINED_SHARE_OF_CAP * 100)}% of the cap ($${limit.toFixed(1)}M).`,
    };
  }
  return { ok: true };
}

export function addRetention(
  ledger: RetentionEntry[],
  proposed: { playerId: string; playerName: string; pct: number; capHit: number; yearsRemaining: number }[],
): RetentionEntry[] {
  return [
    ...ledger,
    ...proposed.map((p) => ({
      playerId: p.playerId,
      playerName: p.playerName,
      pct: p.pct,
      aavRetained: Math.round(p.capHit * p.pct * 100) / 100,
      yearsRemaining: Math.max(1, p.yearsRemaining),
    })),
  ];
}

// ── League rollover between run years ─────────────────────────
export interface RollForwardResult {
  players: Asset[];
  events: RolloverEvent[];
  retiredCount: number;
  rookieCount: number;
  draftedRookies: Asset[];
  depthAddedCount: number;
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

const fallbackSeasonToi = (p: Asset, ptsPace: number): number => {
  if ((p.avgTOI ?? 0) > 0) return p.avgTOI;
  if (p.position === "D") return ptsPace >= 40 ? 21 : ptsPace >= 25 ? 18 : 16;
  return ptsPace >= 55 ? 18 : ptsPace >= 35 ? 15 : 12;
};

function carryForwardSimSkaterStats(players: Asset[], seasons: CupRunSkaterSeason[] = []): Asset[] {
  if (seasons.length === 0) return players;
  const byId = new Map(seasons.map((s) => [s.playerId, s]));

  return players.map((p) => {
    if (p.position === "Pick" || p.position === "G") return p;
    const season = byId.get(p.id);
    if (!season || !Number.isFinite(season.gamesPlayed) || season.gamesPlayed <= 0) return p;

    const games = Math.max(1, Math.round(season.gamesPlayed));
    const ptsPace = seasonPace(season.projectedPts, games);
    const projectedTOI = Number.isFinite(season.projectedTOI) && (season.projectedTOI ?? 0) > 0
      ? season.projectedTOI!
      : fallbackSeasonToi(p, ptsPace);

    return {
      ...p,
      games,
      ptsPace,
      goalsPace: seasonPace(season.projectedGoals, games),
      assistsPace: seasonPace(season.projectedAssists, games),
      avgTOI: round1(projectedTOI),
      hasLiveStats: true,
    };
  });
}

export function reconcileAiTeamCapSpaces(teams: Team[], players: Asset[], capCeiling: number, userTeamId: string): Team[] {
  return teams.map((team) => {
    if (team.id === userTeamId) return team;
    const capSpace = Math.round((capCeiling - committedCap(players, team.id)) * 10) / 10;
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
  const skaters = carryForwardSimSkaterStats(skatersBeforeCarry, simSkaterSeasons);

  // 2. Age the league one offseason
  const rolled = advanceSeason(skaters, {
    seed: rolloverSeed,
    year: draftYear,
    changeOfScenery: scenery,
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

  // Flag every contract that has run out so resolveLeagueOffseason picks
  // it up on re-entry — including rows that were already at 0 years
  // (stale data would otherwise sit on a roster forever at full cap hit).
  const flagged = rolled.players.map((p) => {
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

  const enforceAiCap = () => {
    const rand = mulberry32(rolloverSeed + hashString("ai-cap-pass"));
    for (const team of teams) {
      if (team.id === state.teamId) continue;
      for (let guard = 0; guard < 8; guard++) {
        const roster = nextPlayers.filter((p) => p.teamId === team.id && isSkaterOrGoalie(p));
        const committed = roster.reduce((s, p) => s + (p.capHit ?? 0) * (1 - (p.retainedPct ?? 0)), 0);
        if (committed <= capCeiling) break;
        const fCount = countUnit(roster, "F");
        const dCount = countUnit(roster, "D");
        // Worst value per dollar among mid/large skater deals; NMC immovable.
        const candidates = roster
          .filter((p) => p.capHit >= 2.5 && !p.hasNMC && p.position !== "G")
          .filter((p) => (p.position === "D" ? dCount > 6 : fCount > 12))
          .sort((a, b) => (a.ptsPace / a.capHit) - (b.ptsPace / b.capHit));
        const cut = candidates[Math.floor(rand() * Math.min(2, candidates.length))] ?? candidates[0];
        if (!cut) break;
        nextPlayers = nextPlayers.map((p) =>
          p.id === cut.id ? { ...p, teamId: "FA_POOL", expiryStatus: "UFA" as const, expiresThisOffseason: true } : p
        );
      }
    }
  };

  // 4. AI cap-legality pass — user's team is exempt (their problem to
  // solve). Goalies are never walked (their value isn't in ptsPace),
  // and a cut may not push a team below a dressable lineup.
  enforceAiCap();

  // 5. Roster repair (after cuts) — every team must dress a lineup
  let depthAdded = 0;
  for (const team of teams) {
    const roster = nextPlayers.filter((p) => p.teamId === team.id && isSkaterOrGoalie(p));
    const need: Array<["C" | "W" | "D" | "G", number]> = [
      ["W", Math.max(0, 12 - countUnit(roster, "F"))],
      ["D", Math.max(0, 6 - countUnit(roster, "D"))],
      ["G", Math.max(0, 2 - countUnit(roster, "G"))],
    ];
    for (const [pos, missing] of need) {
      for (let i = 0; i < missing; i++) {
        nextPlayers.push(depthPlayer(team.id, pos, draftYear, i + 1));
        depthAdded++;
      }
    }
  }

  // Replacement depth can add cap back after the first cleanup. Run one more
  // pass so AI clubs do not carry illegal rosters into the next simulated year.
  enforceAiCap();

  return {
    players: [...nextPlayers, ...picks],
    events: rolled.events,
    retiredCount: rolled.retired.length,
    rookieCount: rookies.length,
    draftedRookies: rookies,
    depthAddedCount: depthAdded,
  };
}

/** Decrement retained-slot terms at each rollover; expired slots free up. */
export function rollRetentionLedger(ledger: RetentionEntry[]): RetentionEntry[] {
  return ledger
    .map((e) => ({ ...e, yearsRemaining: e.yearsRemaining - 1 }))
    .filter((e) => e.yearsRemaining > 0);
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
    "thehockeyledger.com/armchair-gm",
  ].join("\n");
}
