// ── AI cap compliance ────────────────────────────────────────────
//
// How a simulated club gets under the ceiling, and how much of its space it is
// willing to spend. Both were wrong in ways that compounded:
//
//   1. Cuts ranked purely on points-per-dollar. Defencemen score fewer points
//      than forwards by the nature of the position, so an elite D always looked
//      like worse value than a mediocre third-liner — and the league kept
//      waiving its best defencemen. (Cale Makar, Justin Faulk and John Carlson
//      all sitting in the FA pool was this, three for three.)
//
//   2. A club could only cut a forward while carrying 13+ forwards, or a D while
//      carrying 7+. Roster repair then refilled to exactly 12F/6D, so the next
//      compliance pass had no legal candidate at all and simply gave up — which
//      is how teams finished the rollover $12M over the cap.
//
//   3. The free-agent market spent every club down to nearly zero space, so
//      nobody could afford the stars that had just been cut. They were stranded
//      in the pool permanently.
//
// The fix is positional: rank value within a position group, protect the core a
// club is actually built around, and let a cut go through even when it drops the
// roster below minimum — repair refills with $0.8M depth immediately after, so
// swapping a $5M contract for a call-up is exactly the move a real club makes.

import { lineupContributionScore } from "./lineup-ranking";

export interface CapPlayer {
  id: string;
  name: string;
  position: string;
  capHit?: number;
  retainedPct?: number;
  ptsPace?: number;
  avgTOI?: number;
  games?: number;
  hasNMC?: boolean;
  teamId?: string;
}

/**
 * The core a club will not waive to get compliant — top pair, top line.
 *
 * Deliberately small. Protection is ranked by contribution, and contribution
 * rewards deployment, so a well-played but badly overpaid forward scores highly:
 * protect the top six and the club can never shed the one contract it most needs
 * to move. Two D and three forwards is the genuinely untouchable group; everyone
 * below that competes on value for money.
 */
export const PROTECTED_CORE = { D: 2, F: 3 } as const;

/**
 * Contracts below this are not worth cutting. A near-replacement body scores an
 * almost perfect cut-efficiency — he costs nothing to lose — but sheds $0.2M,
 * so without a floor the plan burns its cuts on players who free no room.
 */
const MIN_CUTTABLE_CAP_HIT = 2.0;

const isG = (p: CapPlayer) => p.position === "G";
const isD = (p: CapPlayer) => p.position === "D";
const isF = (p: CapPlayer) => !isD(p) && !isG(p);

export const cappedHit = (p: CapPlayer): number =>
  (p.capHit ?? 0) * (1 - (p.retainedPct ?? 0));

export const committedCapOf = (roster: CapPlayer[]): number =>
  roster.reduce((sum, p) => sum + cappedHit(p), 0);

/**
 * Value per cap dollar, using a scorer that already understands deployment.
 *
 * `lineupContributionScore` weights ice time and matchup role heavily, so a
 * 25-minute defenceman is not punished for scoring fewer points than a winger.
 * That alone is not enough — see `protectedCore` — but it stops the ranking
 * being nonsense for half the roster.
 */
export function valuePerDollar(p: CapPlayer): number {
  const hit = cappedHit(p);
  const score = lineupContributionScore(p);
  if (hit <= 0) return Number.POSITIVE_INFINITY; // free — never a cut candidate
  return score / hit;
}

/**
 * Value-for-money rank WITHIN a player's own position group, 0 (worst) to 1.
 *
 * Comparing a defenceman's value per dollar against a forward's is the original
 * bug in a subtler form: even with a deployment-aware score, blue-liners and
 * forwards sit on different scales. Ranking inside the position group asks the
 * only question a GM actually asks — "is he the worst value among my D?" — so
 * the club sheds its weakest defenceman rather than simply shedding defencemen.
 */
const positionalPeers = (roster: CapPlayer[], p: CapPlayer) =>
  roster.filter(q => isG(q) === isG(p) && isD(q) === isD(p));

/**
 * Replacement level for a position group: what the cheapest bodies actually
 * give you. Computed per position, because a replacement-level defenceman and a
 * replacement-level forward are not the same player.
 */
export function replacementScore(roster: CapPlayer[], p: CapPlayer): number {
  const peers = positionalPeers(roster, p);
  if (peers.length === 0) return 0;
  const cheapest = [...peers]
    .sort((a, b) => cappedHit(a) - cappedHit(b))
    .slice(0, Math.max(1, Math.floor(peers.length / 3)));
  return cheapest.reduce((s, q) => s + lineupContributionScore(q), 0) / cheapest.length;
}

/**
 * Contribution LOST per cap dollar SAVED by cutting a player. Lower is a better
 * cut.
 *
 * Value-per-dollar alone cannot answer this: a league-minimum body always beats
 * a star on that ratio, because the star costs more — so the metric that was
 * meant to find bad contracts structurally nominated the best players. Measuring
 * against the replacement you would actually dress instead asks the real
 * question: how much do you give up, for how much room?
 */
export function cutEfficiency(roster: CapPlayer[], p: CapPlayer): number {
  const saving = cappedHit(p) - REPLACEMENT_CAP_HIT;
  if (saving <= 0) return Number.POSITIVE_INFINITY;  // frees nothing — never cut
  const lost = Math.max(0, lineupContributionScore(p) - replacementScore(roster, p));
  return lost / saving;
}

const REPLACEMENT_CAP_HIT = 0.8;

/** The ids a club will not cut: its best D and forwards by contribution. */
export function protectedCore(
  roster: CapPlayer[],
  limits: { D: number; F: number } = PROTECTED_CORE,
): Set<string> {
  const best = (group: CapPlayer[], n: number) =>
    [...group]
      .sort((a, b) => lineupContributionScore(b) - lineupContributionScore(a))
      .slice(0, n)
      .map(p => p.id);

  return new Set([
    ...best(roster.filter(isD), limits.D),
    ...best(roster.filter(isF), limits.F),
  ]);
}

export interface CapCompliancePlan {
  cuts: CapPlayer[];
  committedBefore: number;
  committedAfter: number;
  /** False when the club could not reach the ceiling by cutting alone. */
  compliant: boolean;
}

/**
 * Which contracts a club sheds to reach the ceiling.
 *
 * Cutting is allowed to drop the roster below a dressable lineup on purpose:
 * the caller refills with replacement-level depth immediately afterwards, and
 * that swap ($5M out, $0.8M in) is the entire point. Blocking it was what left
 * clubs permanently over the cap.
 */
export function planCapCompliance(
  roster: CapPlayer[],
  opts: {
    ceiling: number;
    protect?: { D: number; F: number };
    /** Replacement cost assumed for each cut, so the plan converges honestly. */
    replacementCapHit?: number;
    maxCuts?: number;
  },
): CapCompliancePlan {
  const {
    ceiling,
    protect = PROTECTED_CORE,
    replacementCapHit = 0.8,
    maxCuts = 15,
  } = opts;

  const committedBefore = committedCapOf(roster);
  if (committedBefore <= ceiling) {
    return { cuts: [], committedBefore, committedAfter: committedBefore, compliant: true };
  }

  const keep = protectedCore(roster, protect);
  // Rank within the position group, then by raw value as a tiebreak. A club
  // sheds its weakest defenceman, not simply its defencemen.
  const candidates = roster
    .filter(p => !isG(p))
    .filter(p => !keep.has(p.id))
    .filter(p => !p.hasNMC)
    .filter(p => cappedHit(p) >= MIN_CUTTABLE_CAP_HIT)
    // Position-awareness lives in the replacement baseline, not in a percentile
    // on top of it: normalising within a group let eight near-replacement
    // forwards drag the forward scale until a $1.2M third-pair D outranked a
    // $6.5M albatross as "worst in his group".
    .sort((a, b) => cutEfficiency(roster, a) - cutEfficiency(roster, b));

  const cuts: CapPlayer[] = [];
  let committed = committedBefore;
  for (const p of candidates) {
    if (committed <= ceiling || cuts.length >= maxCuts) break;
    // Each cut swaps a real contract for a replacement-level one, so the net
    // saving is the difference — not the whole cap hit.
    const saving = cappedHit(p) - replacementCapHit;
    if (saving <= 0) continue;
    cuts.push(p);
    committed -= saving;
  }

  return {
    cuts,
    committedBefore,
    committedAfter: committed,
    compliant: committed <= ceiling,
  };
}

// ── How much space a club will actually spend ────────────────────

/**
 * Share of its cap space a club holds back rather than spending in free agency.
 *
 * Proportional, not a flat floor. A flat league-minimum reserve meant every club
 * spent down to $0.8M, so the whole league finished the offseason capped out
 * with nowhere to put anyone cut later — which is exactly how an elite
 * defenceman ends up stranded in the free-agent pool. A flat *large* reserve
 * would be no better: it would stop a club with $3M in space from signing
 * anybody at all. Scaling with space lets a contender push its chips in while a
 * rebuild keeps most of its powder dry.
 */
export function marketReserveShare(phase: string | undefined | null): number {
  switch (phase) {
    case "Contender": return 0.05;
    case "Bubble": return 0.15;
    case "Retooling": return 0.30;
    case "Rebuilding": return 0.50;
    case "Deep Rebuild": return 0.65;
    default: return 0.25;
  }
}

/** Never spend the last league-minimum slot, whatever the phase says. */
const MIN_RESERVE = 0.775;

/** Spendable free-agent budget for a club, never negative. */
export function marketBudgetFor(capSpace: number, phase?: string | null): number {
  if (capSpace <= MIN_RESERVE) return 0;
  const byShare = capSpace * (1 - marketReserveShare(phase));
  const byFloor = capSpace - MIN_RESERVE;
  return Math.max(0, Math.min(byShare, byFloor));
}
