// ============================================================
// FREE AGENCY — the off-season "logic gate"
// Deterministic, heuristic projection of what a pending free agent would sign
// for (AAV x term, UFA/RFA, re-sign odds), plus a league-wide resolver that
// auto-handles the other 31 teams and emits cap moves in the cap-delta shape.
//
// Pure functions only (no I/O) so they are unit-testable and reproducible:
// every random draw is seeded via the same mulberry32/hashString the season
// sim uses, so a given (roster, seed) always yields the same off-season.
// ============================================================

import type { Asset, Team } from "@/app/lib/trade-types";
import type { CapDeltaAsset, CapDeltaMoves } from "@/app/lib/cap-delta";
import { mulberry32, hashString } from "@/app/lib/sim-engine";
import { SEASON } from "@/app/lib/season-config";
import { marketBudgetFor } from "@/app/lib/ai-cap";

export type FaStatus = "UFA" | "RFA";
export type FaTier = "STAR" | "TOP" | "MIDDLE" | "DEPTH" | "FRINGE";

export interface ProjectedContract {
  aav: number;               // projected average annual value ($M)
  term: number;              // projected length (years)
  status: FaStatus;          // UFA or RFA
  resignProbability: number; // 0..1 — odds the player re-signs with his current team
  tier: FaTier;              // market band, for UI grouping
}

// ── Tunable model constants ──────────────────────────────────────────────────
// Co-located with the logic so the model is self-contained and testable.
export const FA = {
  capMin:        0.775,   // NHL CBA league-minimum AAV ($M)
  cbaMaxPct:     0.20,    // CBA hard max = 20% of the cap upper limit ($20.8M at $104M)

  // Forwards: $/point on stable pace, with progressive top-6 and star premiums
  // so elite producers reach the modern market (a ~90-pt UFA lands ~$13-14M).
  fwdPerPt:      0.105,
  fwdTopPace:    55,
  fwdTopBump:    0.07,
  fwdStarPace:   78,
  fwdStarBump:   0.14,

  // Defensemen: workload (TOI over a replacement floor) + scoring,
  // with progressive star premiums mirroring the forward curve.
  // A 90-point, 25-min D (Makar / Fox tier) should land $15-16M,
  // not the $12-13M the flat rate produced.
  dToiFloor:     12,
  dToiPerMin:    0.42,
  dPerPt:        0.085,
  dStarPace:     55,      // elite offensive-D threshold (pts pace)
  dStarBump:     0.08,    // premium per point above threshold

  // Goalies: base + GSAX + save% over league average + workload.
  gBase:         3.5,
  gPerGsax:      0.20,
  gSvpAnchor:    0.905,
  gPerSvpPoint:  50,      // per 0.01 of save% over anchor
  gWorkloadDiv:  30,
  gWorkloadMax:  2,
  gBackupStarts: 25,      // below this many starts → a backup, priced down
  gBackupFactor: 0.6,
  gMaxTerm:      6,       // goalies rarely sign beyond six years

  rfaDiscount:   0.82,    // RFA team control suppresses AAV vs open market
  // Superseded by marketReserveFor() in ai-cap.ts — a flat league-minimum
  // reserve left every club spending down to $0.8M. Kept for the offer-sheet
  // path, which is a single transaction rather than a spending spree.
  aiMarketCapReserve: 0.775,

  // Ascending-star projection: the market pays young stars for their
  // prime, not their current pace (Carlsson's 5x$90M offer sheet reset
  // this — Bedard-tier RFAs now ask Kaprizov money). Below 24, scoring
  // pace projects forward per year to the paid-for level, capped.
  youngGrowthPerYr: 0.12,
  youngGrowthCap:   1.45,
} as const;

const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

const isForward = (pos: string) => pos === "C" || pos === "W" || pos === "L" || pos === "R";

// Stable scoring pace — same 40/60 current/baseline blend the sim uses.
const stablePace = (a: Asset): number => {
  const cur = Number.isFinite(a.ptsPace) ? a.ptsPace : 0;
  const base = Number.isFinite(a.baselinePtsPace) ? a.baselinePtsPace ?? 0 : 0;
  return base > 0 ? cur * 0.4 + base * 0.6 : cur;
};

// The pace a contract actually pays for: current for established players,
// projected-prime for under-24s (per-year growth, capped) — an ascending
// 75-pt 21-year-old is priced as the ~100-pt player he's becoming.
const paidForPace = (asset: Asset, age: number): number => {
  const pace = stablePace(asset);
  if (age >= 24) return pace;
  const growth = Math.min(FA.youngGrowthCap, 1 + FA.youngGrowthPerYr * (24 - age));
  return pace * growth;
};

const faStatusOf = (asset: Asset): FaStatus => {
  if (asset.contractStatus === "RFA") return "RFA";
  if (asset.contractStatus === "UFA") return "UFA";
  // Fallback when expiry status is unknown: younger players are typically RFA.
  return (asset.age ?? 27) <= 25 ? "RFA" : "UFA";
};

const tierOf = (aav: number): FaTier =>
  aav >= 8 ? "STAR" : aav >= 5 ? "TOP" : aav >= 2.5 ? "MIDDLE" : aav >= 1.2 ? "DEPTH" : "FRINGE";

function projectTerm(age: number, status: FaStatus, aav: number, rand: () => number): number {
  let base: number;
  if (age <= 23) base = status === "RFA" ? 3 : 6;
  else if (age <= 26) base = status === "RFA" ? 4 : 6;
  else if (age <= 29) base = 6;
  else if (age <= 32) base = 4;
  else if (age <= 35) base = 2;
  else base = 1;

  if (aav < 1.5) base = Math.min(base, 2);        // depth deals stay short
  else if (aav >= 8) base = Math.min(8, base + 1); // stars push for max term
  if (status === "RFA" && aav >= 10) base = 8;     // elite RFAs lock in max term (Carlsson precedent)

  const jitter = rand() < 0.3 ? -1 : rand() > 0.85 ? 1 : 0;
  // Own-team re-signings can reach 8; the open market caps at 7 (applied by caller).
  return clamp(base + jitter, 1, 8);
}

function projectResignProbability(status: FaStatus, aav: number, age: number): number {
  if (status === "RFA") return 0.92; // team holds rights — almost always retained
  let p = 0.6;
  if (aav >= 8) p = 0.5;          // stars test the market
  else if (aav >= 5) p = 0.58;
  else if (aav < 2) p = 0.7;      // depth pieces tend to re-sign
  if (age >= 33) p += 0.1;        // veterans lean toward staying
  return clamp(p, 0.2, 0.95);
}

export interface ProjectContext {
  seed?: number;
  capCeiling?: number;
}

// Project the contract a single pending free agent would command.
export function projectFreeAgentContract(asset: Asset, ctx: ProjectContext = {}): ProjectedContract {
  const capCeiling = ctx.capCeiling ?? SEASON.capCeiling;
  const ceiling = Math.floor(capCeiling * FA.cbaMaxPct * 20) / 20; // CBA max, snapped onto the $0.05M grid
  const rand = mulberry32((ctx.seed ?? 1) + hashString(`fa:${asset.id || asset.name}`));

  const pos = asset.position;
  const age = asset.age ?? 27;
  const status = faStatusOf(asset);

  let baseAav: number;
  if (pos === "G") {
    baseAav = FA.gBase
      + (asset.gsax ?? 0) * FA.gPerGsax
      + ((asset.savePct ?? FA.gSvpAnchor) - FA.gSvpAnchor) * 100 * (FA.gPerSvpPoint / 100)
      + Math.min(FA.gWorkloadMax, (asset.gamesStarted ?? 0) / FA.gWorkloadDiv);
  } else if (pos === "D") {
    const dPace = paidForPace(asset, age);
    baseAav = Math.max(0, (asset.avgTOI ?? 0) - FA.dToiFloor) * FA.dToiPerMin
      + dPace * FA.dPerPt
      + Math.max(0, dPace - FA.dStarPace) * FA.dStarBump;
  } else if (isForward(pos)) {
    const pace = paidForPace(asset, age);
    baseAav = pace * FA.fwdPerPt
      + Math.max(0, pace - FA.fwdTopPace) * FA.fwdTopBump
      + Math.max(0, pace - FA.fwdStarPace) * FA.fwdStarBump;
  } else {
    // Unknown position (data gap): a producing skater still prices off
    // his pace via the forward curve rather than collapsing to league min.
    const pace = paidForPace(asset, age);
    baseAav = pace > 0
      ? pace * FA.fwdPerPt
        + Math.max(0, pace - FA.fwdTopPace) * FA.fwdTopBump
        + Math.max(0, pace - FA.fwdStarPace) * FA.fwdStarBump
      : FA.capMin;
  }

  // Backup goalies (few starts) are paid well below a starter's base.
  if (pos === "G" && (asset.gamesStarted ?? 0) < FA.gBackupStarts) {
    baseAav *= FA.gBackupFactor;
  }

  // Age: a small premium in the early-prime, a discount as production decays.
  const ageFactor = clamp(1.0 - Math.max(0, age - 30) * 0.05 + (age <= 24 ? 0.03 : 0), 0.65, 1.08);
  const preDiscountAav = baseAav * ageFactor;
  const statusFactor = status === "RFA"
    ? (preDiscountAav >= 10 ? 0.92 : preDiscountAav >= 6 ? 0.88 : FA.rfaDiscount)
    : 1.0;
  const variance = 0.92 + rand() * 0.16; // seeded market noise (+/- ~8%)

  let aav = baseAav * ageFactor * statusFactor * variance;
  aav = Math.round(aav * 20) / 20;       // snap to the nearest $0.05M
  aav = clamp(aav, FA.capMin, ceiling);  // then hold within the CBA min and star ceiling

  let term = projectTerm(age, status, aav, rand);
  // Scale term to value: depth deals stay short, only top contracts run long.
  term = Math.min(term, aav < 2.5 ? 2 : aav < 5 ? 4 : aav < 8 ? 6 : 8);
  if (pos === "G") term = Math.min(term, FA.gMaxTerm);

  return {
    aav,
    term,
    status,
    resignProbability: projectResignProbability(status, aav, age),
    tier: tierOf(aav),
  };
}

// ── RFA offer-sheet compensation (CBA Article 10.3) ─────────────────────────
// When a team signs another team's RFA to an offer sheet, the original team has
// 7 days to match. If they don't, they receive draft pick compensation.
// Thresholds updated for the 2025-26 CBA escalation.

export interface OfferSheetTier {
  ceiling: number;
  compensation: string[];
  label: string;
}

export const OFFER_SHEET_TIERS: OfferSheetTier[] = [
  { ceiling:  1_575_969, compensation: [],                                  label: "$1,575,969 or less" },
  { ceiling:  2_387_832, compensation: ["3rd"],                             label: "$1,575,969 – $2,387,832" },
  { ceiling:  4_775_666, compensation: ["2nd"],                             label: "$2,387,832 – $4,775,666" },
  { ceiling:  7_163_498, compensation: ["1st", "3rd"],                      label: "$4,775,666 – $7,163,498" },
  { ceiling:  9_551_332, compensation: ["1st", "2nd", "3rd"],               label: "$7,163,498 – $9,551,332" },
  { ceiling: 11_939_166, compensation: ["1st", "1st", "2nd", "3rd"],        label: "$9,551,332 – $11,939,166" },
  { ceiling:   Infinity, compensation: ["1st", "1st", "1st", "1st"],        label: "$11,939,166 or more" },
];

export function getOfferSheetCompensation(aavMillions: number): string[] {
  const aav = aavMillions * 1_000_000;
  for (const tier of OFFER_SHEET_TIERS) {
    if (aav <= tier.ceiling) return tier.compensation;
  }
  return ["1st", "1st", "1st", "1st"];
}

// The original owner is baked into a pick id: `pick-{origTeam}-{year}-{round}`.
const pickOriginalOwner = (id: string): string | null => {
  const m = /^pick-([A-Za-z0-9]+)-\d+-\d+$/.exec(id);
  return m ? m[1] : null;
};

const compRoundNumber = (label: string): number =>
  label === "1st" ? 1 : label === "2nd" ? 2 : label === "3rd" ? 3 : parseInt(label, 10) || 0;

export interface OfferSheetCompResult {
  transferPickIds: string[]; // the signing team's OWN picks that convey to the original club
  shortfall: string[];       // required rounds the signing team can't cover with its own picks
}

// Pick the compensation an offer-sheeting team must surrender (CBA Art. 10.3).
// Per the CBA these must be the SIGNING team's OWN draft picks — current owner
// AND original owner — one per required round, soonest year first. They are
// returned for TRANSFER to the original club, never deletion (CX6). Picks the
// team merely acquired in trades don't qualify and are left alone.
export function resolveOfferSheetCompensation(
  signingTeamId: string,
  picks: Asset[],
  compRounds: string[],
): OfferSheetCompResult {
  const own = picks
    .filter((p) =>
      p.position === "Pick" &&
      p.teamId === signingTeamId &&
      pickOriginalOwner(p.id) === signingTeamId)
    .sort((a, b) => (a.year ?? 0) - (b.year ?? 0)); // soonest picks convey first

  const used = new Set<string>();
  const transferPickIds: string[] = [];
  const shortfall: string[] = [];
  for (const label of compRounds) {
    const round = compRoundNumber(label);
    const pick = own.find((p) => p.round === round && !used.has(p.id));
    if (pick) {
      used.add(pick.id);
      transferPickIds.push(pick.id);
    } else {
      shortfall.push(label);
    }
  }
  return { transferPickIds, shortfall };
}

// ── RFA offer-sheet acceptance logic ─────────────────────────────────────────
// Models whether an RFA would accept an offer sheet from a given team and
// whether the original team matches. Top players prefer contenders; rebuilders
// struggle to land elite RFAs.

export type OfferSheetOutcome =
  | { result: "signed" }
  | { result: "matched"; reason: string }
  | { result: "declined"; reason: string };

export interface OfferSheetContext {
  seed: number;
  signingTeamPhase?: string;
  signingTeamStanding?: number;
  originalTeamPhase?: string;
}

export function resolveOfferSheet(
  player: Asset,
  contract: ProjectedContract,
  ctx: OfferSheetContext,
): OfferSheetOutcome {
  const rand = mulberry32(ctx.seed + hashString(`offer:${player.id}`));
  const phase = ctx.signingTeamPhase ?? "Retooling";
  const standing = ctx.signingTeamStanding ?? 16;
  const origPhase = ctx.originalTeamPhase ?? "Contending";

  // Player willingness — top players don't want to go to bad teams
  const isRebuilding = phase === "Rebuilding" || phase === "Deep Rebuild";
  const isBottom = standing >= 26;
  const isElite = contract.tier === "STAR" || contract.tier === "TOP";

  let acceptChance = 0.85; // baseline: most RFAs take the money
  if (isElite && isRebuilding) acceptChance = 0.15;
  else if (isElite && isBottom) acceptChance = 0.30;
  else if (isElite && phase === "Retooling") acceptChance = 0.55;
  else if (contract.tier === "MIDDLE" && isRebuilding) acceptChance = 0.50;
  else if (contract.tier === "MIDDLE" && isBottom) acceptChance = 0.65;

  // Young players are slightly more willing — they want opportunity
  if ((player.age ?? 25) <= 22) acceptChance = Math.min(1, acceptChance + 0.10);

  if (rand() > acceptChance) {
    return {
      result: "declined",
      reason: isElite
        ? `${player.name} prefers a contending team`
        : `${player.name} isn't interested in the situation`,
    };
  }

  // Original team matching — based on how much they value the player
  // Contending teams match more often; rebuilders let RFAs walk for picks
  let matchChance = 0.50;
  if (origPhase === "Contending" || origPhase === "Win-Now") {
    matchChance = isElite ? 0.85 : contract.tier === "MIDDLE" ? 0.60 : 0.30;
  } else if (origPhase === "Rebuilding" || origPhase === "Deep Rebuild") {
    matchChance = isElite ? 0.35 : 0.10;
  } else {
    matchChance = isElite ? 0.65 : contract.tier === "MIDDLE" ? 0.40 : 0.20;
  }

  if (rand() < matchChance) {
    return {
      result: "matched",
      reason: `${player.teamId} matched the offer sheet`,
    };
  }

  return { result: "signed" };
}

// ── League-wide resolution ───────────────────────────────────────────────────

export interface OffseasonPending {
  player: Asset;
  contract: ProjectedContract;
}

/**
 * Order pending free agents the way the NHL offseason actually runs: restricted
 * business first, then unrestricted.
 *
 * A club qualifies and re-signs its RFAs before the UFA market opens, and RFA
 * decisions are the ones with real consequences here — walk an RFA and you give
 * up team control, where a UFA was leaving anyway. Presenting them mixed asks
 * the user to re-derive that priority from a status chip on every row.
 *
 * Within each group the biggest cap commitments come first, since those are the
 * decisions that determine what room is left for everything below them.
 */
export function sortPendingByRights(pending: OffseasonPending[]): OffseasonPending[] {
  const rank = (p: OffseasonPending) => (p.contract.status === "RFA" ? 0 : 1);
  return [...pending].sort((a, b) =>
    rank(a) - rank(b) || b.contract.aav - a.contract.aav || a.player.name.localeCompare(b.player.name));
}

export interface LeagueOffseasonResult {
  expiringCount: number;
  userPending: OffseasonPending[];   // the user's team — returned for manual handling, NOT auto-applied
  resignings: Array<{ playerId: string; teamId: string; contract: ProjectedContract }>;
  walkAways: Array<{ playerId: string; fromTeamId: string; contract: ProjectedContract }>;
  marketSignings: Array<{ playerId: string; fromTeamId: string | null; teamId: string; contract: ProjectedContract }>;
  market: OffseasonPending[];        // UFA players who hit the open market (signable)
  rfaMarket: OffseasonPending[];     // other teams' RFAs available for offer sheets
  teamCapMoves: Record<string, CapDeltaMoves>; // ready for applyTeamCapDeltas()
}

export interface ResolveContext {
  seed?: number;
  userTeamId?: string | null;
  capCeiling?: number;
  teams?: Pick<Team, "id" | "phase" | "standing" | "capSpace">[];
}

const MARKET_TERM_CAP = 7; // open-market deals cap a year below own-team max

// Resolve every team's pending free agents. The user's team is set aside for
// manual one-click handling; the other teams are auto-resolved (RFAs re-sign;
// UFAs re-sign or walk by seeded odds). Emits per-team cap moves that
// applyTeamCapDeltas() can apply directly.
export function resolveLeagueOffseason(players: Asset[], ctx: ResolveContext = {}): LeagueOffseasonResult {
  const seed = ctx.seed ?? 1;
  const expiring = players.filter((p) => p.expiresThisOffseason && p.position !== "Pick");

  const userPending: OffseasonPending[] = [];
  const resignings: LeagueOffseasonResult["resignings"] = [];
  const walkAways: LeagueOffseasonResult["walkAways"] = [];
  const marketSignings: LeagueOffseasonResult["marketSignings"] = [];
  const market: OffseasonPending[] = [];
  const rfaMarket: OffseasonPending[] = [];
  const teamCapMoves: Record<string, CapDeltaMoves> = {};
  const mutableCap = ctx.teams
    ? new Map(ctx.teams.map((t) => [t.id, t.capSpace ?? 0]))
    : null;
  const marketCandidates: OffseasonPending[] = [];

  const addMove = (teamId: string, side: "incoming" | "outgoing", asset: CapDeltaAsset) => {
    const moves = teamCapMoves[teamId] ?? {};
    moves[side] = [...(moves[side] ?? []), asset];
    teamCapMoves[teamId] = moves;
    if (mutableCap) {
      const delta = (asset.capHit ?? 0) * (1 - (asset.retainedPct ?? 0));
      mutableCap.set(teamId, (mutableCap.get(teamId) ?? 0) + (side === "outgoing" ? delta : -delta));
    }
  };

  const wouldFit = (teamId: string, aav: number): boolean =>
    !mutableCap || (mutableCap.get(teamId) ?? 0) >= aav;

  const addMarketCandidate = (pending: OffseasonPending) => {
    marketCandidates.push(pending);
    market.push(pending);
  };

  for (const player of expiring) {
    const contract = projectFreeAgentContract(player, { seed, capCeiling: ctx.capCeiling });
    const expiringCapHit = player.lastCapHit ?? player.capHit;

    if (ctx.userTeamId && player.teamId === ctx.userTeamId) {
      userPending.push({ player, contract });
      continue;
    }

    // Teamless FA pool entries are the open UFA market (real free agents +
    // limbo contracts pushed to FA). They are AI-signable like any market UFA
    // so contenders work through the board realistically — the AI's cap room
    // and positional need (below) naturally leave plenty unsigned for the user
    // rather than vacuuming the pool. The seasonal cap escalation is what keeps
    // teams solvent enough to actually sign them.
    if (!player.teamId || player.teamId === "FA_POOL") {
      const marketContract = { ...contract, term: Math.min(contract.term, MARKET_TERM_CAP) };
      if (contract.status === "RFA") {
        rfaMarket.push({ player, contract: marketContract });
      } else {
        addMarketCandidate({ player, contract: marketContract });
      }
      continue;
    }

    const rand = mulberry32(seed + hashString(`resolve:${player.id}`));

    if (contract.status === "RFA") {
      // RFAs carry team control and are ALWAYS retained — a foundational RFA is
      // never left to walk for nothing, nor dropped from the sim (AI1/AI3). And
      // because his raise is booked here, the UFA-market pass below sees the
      // reduced budget, so a team can't sign an external UFA at its own RFA's
      // expense (AI2: no Kucherov at Celebrini's expense). Reserving the cap can
      // push a team tight, exactly as re-signing a young core does in reality.
      addMove(player.teamId, "outgoing", { capHit: expiringCapHit });
      addMove(player.teamId, "incoming", { capHit: contract.aav });
      resignings.push({ playerId: player.id, teamId: player.teamId, contract });
      rfaMarket.push({ player, contract });
    } else {
      const resign = rand() < contract.resignProbability;
      if (resign && wouldFit(player.teamId, contract.aav - expiringCapHit)) {
        addMove(player.teamId, "outgoing", { capHit: expiringCapHit });
        addMove(player.teamId, "incoming", { capHit: contract.aav });
        resignings.push({ playerId: player.id, teamId: player.teamId, contract });
      } else {
        addMove(player.teamId, "outgoing", { capHit: expiringCapHit });
        const marketContract = { ...contract, term: Math.min(contract.term, MARKET_TERM_CAP) };
        walkAways.push({ playerId: player.id, fromTeamId: player.teamId, contract: marketContract });
        addMarketCandidate({ player, contract: marketContract });
      }
    }
  }

  if (mutableCap && ctx.teams) {
    const signedMarketIds = new Set<string>();
    const aiTeams = ctx.teams.filter((t) => t.id !== ctx.userTeamId);
    // Phase-shaped reserve. A flat one-league-minimum reserve meant every club
    // — contender and rebuild alike — spent down to $0.8M, so the whole league
    // finished the offseason capped out with no room to absorb anyone cut later.
    const phaseById = new Map(aiTeams.map((t) => [t.id, t.phase]));
    const marketBudget = (teamId: string) =>
      marketBudgetFor(mutableCap.get(teamId) ?? 0, phaseById.get(teamId));
    const phaseScore = (phase?: string) =>
      phase === "Contender" ? 18 :
      phase === "Bubble" ? 12 :
      phase === "Retooling" ? 7 :
      phase === "Rebuilding" ? 3 :
      0;
    const positionNeedScore = (teamId: string, pos: string): number => {
      const roster = players.filter((p) =>
        p.teamId === teamId && p.position !== "Pick" && !p.expiresThisOffseason
      );
      const f = roster.filter((p) => isForward(p.position)).length;
      const d = roster.filter((p) => p.position === "D").length;
      const g = roster.filter((p) => p.position === "G").length;
      if (pos === "G") return g < 2 ? 20 : 0;
      if (pos === "D") return d < 6 ? 16 : d < 8 ? 5 : 0;
      return f < 12 ? 16 : f < 14 ? 5 : 0;
    };

    for (const pending of [...marketCandidates].sort((a, b) =>
      b.contract.aav !== a.contract.aav
        ? b.contract.aav - a.contract.aav
        : a.player.name.localeCompare(b.player.name)
    )) {
      const candidates = aiTeams
        .filter((team) => marketBudget(team.id) + 1e-9 >= pending.contract.aav)
        .map((team) => {
          const rand = mulberry32(seed + hashString(`market:${pending.player.id}:${team.id}`));
          return {
            team,
            score:
              marketBudget(team.id) * 0.6 +
              phaseScore(team.phase) +
              positionNeedScore(team.id, pending.player.position) +
              (33 - (team.standing ?? 16)) * 0.15 +
              rand() * 3,
          };
        })
        .sort((a, b) => b.score - a.score);
      const winner = candidates[0]?.team;
      if (!winner) continue;

      addMove(winner.id, "incoming", { capHit: pending.contract.aav });
      marketSignings.push({
        playerId: pending.player.id,
        fromTeamId: pending.player.teamId && pending.player.teamId !== "FA_POOL" ? pending.player.teamId : null,
        teamId: winner.id,
        contract: pending.contract,
      });
      signedMarketIds.add(pending.player.id);
    }

    for (let i = market.length - 1; i >= 0; i--) {
      if (signedMarketIds.has(market[i].player.id)) market.splice(i, 1);
    }
  }

  return { expiringCount: expiring.length, userPending, resignings, walkAways, marketSignings, market, rfaMarket, teamCapMoves };
}

// Apply a resolved offseason to the league roster. Re-signings take their new
// deal; AI market signings move teams; and players who walked to the OPEN
// market are relocated to the FA pool — NEVER deleted. Deleting them dropped
// them out of `db.players`, so the NAV map (rebuilt from db.players) had no
// entry and they displayed/sorted as NAV 0, and by Year 3 they had vanished
// from the sim entirely (CXH3 / AI3). Keeping them as FA_POOL preserves their
// NAV and existence; signMarketPlayer filters by id before re-adding, so a
// later signing can't duplicate them.
export function applyOffseasonToRoster(
  players: Asset[],
  res: Pick<LeagueOffseasonResult, "resignings" | "marketSignings" | "walkAways">,
): Asset[] {
  const resignById = new Map(res.resignings.map((r) => [r.playerId, r.contract]));
  const marketSigningById = new Map(res.marketSignings.map((s) => [s.playerId, s]));
  const walkedIds = new Set(
    res.walkAways.filter((w) => !marketSigningById.has(w.playerId)).map((w) => w.playerId),
  );

  return players.map((p) => {
    const resign = resignById.get(p.id);
    if (resign) {
      return { ...p, capHit: resign.aav, yearsRemaining: resign.term, expiresThisOffseason: false, contractStatus: "SIGNED" as const };
    }
    const marketSigning = marketSigningById.get(p.id);
    if (marketSigning) {
      return {
        ...p,
        teamId: marketSigning.teamId,
        capHit: marketSigning.contract.aav,
        yearsRemaining: marketSigning.contract.term,
        retainedPct: 0,
        expiresThisOffseason: false,
        contractStatus: "SIGNED" as const,
      };
    }
    if (walkedIds.has(p.id)) {
      return { ...p, teamId: "FA_POOL", retainedPct: 0, expiresThisOffseason: false, contractStatus: "UFA" as const };
    }
    return p;
  });
}
