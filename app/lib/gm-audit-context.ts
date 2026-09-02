// ── gm-audit-context.ts — contextual reasoning for the GM Audit ──
// TM5/TM6: the audit layer must reason about the calibre and role of
// assets BOTH ways, and about what the receiving roster already has.
// Pure functions — the evaluate route supplies NAVs and rosters, this
// module returns structured judgments the route turns into flags.

export interface CalibreAsset {
  name: string;
  position: string;      // "C" | "W" | "D" | "G" | "Pick"
  nav: number;
  age?: number;
  yearsRemaining?: number;
  gamesStarted?: number;
  gsax?: number;
}

// G-NAV runs structurally lower than F-NAV/D-NAV (shorter primes,
// higher variance, no positional premium), so a single skater bar
// misjudges goalie calibre. A franchise goalie clears ~72% of the
// skater threshold.
export const GOALIE_FRANCHISE_FACTOR = 0.72;

export function isFranchiseCalibre(asset: CalibreAsset, franchiseThreshold: number): boolean {
  if (asset.position === "Pick") return false;
  const bar = asset.position === "G"
    ? franchiseThreshold * GOALIE_FRANCHISE_FACTOR
    : franchiseThreshold;
  return asset.nav >= bar;
}

export interface FranchiseReturnAssessment {
  qualifies: boolean;
  /** Highest-calibre incoming player (never a pick), if any. */
  headliner: CalibreAsset | null;
  /** Second-best incoming player when it matters to the judgment. */
  secondPiece: CalibreAsset | null;
  /** One-sentence reasoning, written for the flag explanation. */
  reason: string;
}

/**
 * Does the incoming package constitute a franchise-calibre return?
 * Two paths qualify:
 *  1. Any single incoming player is franchise-calibre (position-aware bar).
 *  2. A near-franchise headliner (≥80% of his positional bar) arrives WITH
 *     a legitimate top-of-lineup second piece (≥85 NAV) — the
 *     "franchise goalie + second-line defenceman" package the audit names.
 */
export function assessFranchiseReturn(
  incoming: CalibreAsset[],
  franchiseThreshold: number,
): FranchiseReturnAssessment {
  const players = incoming
    .filter(a => a.position !== "Pick")
    .sort((a, b) => b.nav - a.nav);
  const headliner = players[0] ?? null;
  const secondPiece = players[1] ?? null;

  if (!headliner) {
    return { qualifies: false, headliner: null, secondPiece: null, reason: "The return contains no roster player of consequence." };
  }

  if (isFranchiseCalibre(headliner, franchiseThreshold)) {
    const posNote = headliner.position === "G"
      ? " (judged on the goalie value scale — G-NAV runs lower than F-NAV/D-NAV)"
      : "";
    return {
      qualifies: true, headliner, secondPiece,
      reason: `${headliner.name} is a franchise-calibre return at ${Math.round(headliner.nav)} NAV${posNote}.`,
    };
  }

  const headlinerBar = (headliner.position === "G"
    ? franchiseThreshold * GOALIE_FRANCHISE_FACTOR
    : franchiseThreshold);
  const nearFranchise = headliner.nav >= headlinerBar * 0.8;
  const qualitySecond = secondPiece != null && secondPiece.nav >= 85;

  if (nearFranchise && qualitySecond) {
    return {
      qualifies: true, headliner, secondPiece,
      reason: `${headliner.name} (${Math.round(headliner.nav)} NAV) is near franchise calibre and arrives with ${secondPiece!.name} (${Math.round(secondPiece!.nav)} NAV) — the package, not one player, is the franchise return.`,
    };
  }

  return {
    qualifies: false, headliner, secondPiece,
    reason: nearFranchise
      ? `${headliner.name} approaches franchise calibre but arrives without a second piece of consequence.`
      : `${headliner.name} (${Math.round(headliner.nav)} NAV) headlines the return, well short of franchise calibre for his position.`,
  };
}

// ── Crease context (TM6) ─────────────────────────────────────────

export type CreaseVerdict = "LOGJAM" | "UPGRADE" | "NEUTRAL";

export interface CreaseContext {
  verdict: CreaseVerdict;
  incumbent: CalibreAsset | null;
  detail: string;
}

const isStarterCalibreG = (g: CalibreAsset): boolean =>
  g.position === "G" && ((g.gamesStarted ?? 0) >= 35 || (g.gsax ?? 0) >= 8 || g.nav >= 100);

/**
 * When a starter-calibre goalie is acquired, what does the receiving
 * crease already look like? An elite incumbent (the Swayman case) makes
 * the acquisition a logjam, not a need — the audit must say so instead
 * of silently pricing two number-ones.
 */
export function assessCreaseContext(
  incomingGoalie: CalibreAsset,
  remainingRosterGoalies: CalibreAsset[],
): CreaseContext {
  if (!isStarterCalibreG(incomingGoalie)) {
    return { verdict: "NEUTRAL", incumbent: null, detail: "" };
  }
  const incumbents = remainingRosterGoalies
    .filter(g => g.position === "G")
    .sort((a, b) => b.nav - a.nav);
  const incumbent = incumbents[0] ?? null;

  // A logjam requires a QUALITY incumbent — heavy starts with poor
  // results is a workload fact, not a reason to block an upgrade.
  const incumbentBlocks = incumbent != null
    && isStarterCalibreG(incumbent)
    && ((incumbent.gsax ?? 0) >= 3 || incumbent.nav >= 80);

  if (incumbent && incumbentBlocks) {
    return {
      verdict: "LOGJAM",
      incumbent,
      detail: `${incumbent.name} already owns the net (${Math.round(incumbent.nav)} NAV${incumbent.gsax != null ? `, ${incumbent.gsax > 0 ? "+" : ""}${incumbent.gsax.toFixed(1)} GSAx` : ""}). Adding ${incomingGoalie.name} converts a strength into a logjam — defensible only as a platform to flip one of the two, not as a roster need.`,
    };
  }

  return {
    verdict: "UPGRADE",
    incumbent,
    detail: incumbent
      ? `${incomingGoalie.name} is a clear upgrade on ${incumbent.name} — the crease was the roster's open need, which raises the on-ice value of this return beyond the raw numbers.`
      : `The roster has no established starter — ${incomingGoalie.name} fills the single most valuable hole a team can have.`,
  };
}
