// ── Opportunity unlocks a young player's ceiling ─────────────────
// Season production is anchored to a player's established pace — right for
// veterans, but it traps a talented prospect at his thin NHL sample no matter
// how good his deployment is (a 20-yo on the 2nd line still projecting ~15
// pts). When a young upside player is handed a real scoring role, blend his
// pace UP toward what that role supports, gated by pedigree / prospect signal
// so a fringe AHLer doesn't get a star's minutes-driven line. It ONLY lifts —
// a young player buried in the bottom six is still handled by the separate
// deployment penalty, never dragged down here.
//
// Pure + deterministic so it can be unit-tested away from the sim route
// (Next.js route files can't export helpers).

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));

// Points-pace a given lineup role tends to support at even strength + PP.
const ROLE_TARGET_F = [66, 48, 30, 16]; // lines 1–4
const ROLE_TARGET_D = [44, 30, 18];     // pairs 1–3

export interface OpportunityInput {
  age: number;
  priorGames: number;
  stablePace: number;          // established NHL pace
  prospectPace: number;        // projected pace from prospect/NHLe data
  draftOverall?: number | null;
  isProspectProfile: boolean;  // ≤22 with a thin sample or a higher prospect pace
  isYoungRegular: boolean;     // ≤24 with a real sample
  deploymentActive: boolean;
  deploymentGroup?: "F" | "D";
  deploymentSlot?: number;     // 0-based lineup slot
}

// Returns the effective scoring pace to drive the season projection. Equals
// stablePace for anyone who isn't a young player in a scoring role, and is only
// ever ≥ stablePace.
export function opportunityPace(input: OpportunityInput): number {
  const { stablePace, prospectPace } = input;
  const isYoungUpside = input.isProspectProfile || input.isYoungRegular;
  if (!isYoungUpside || !input.deploymentActive || input.deploymentGroup === undefined || input.deploymentSlot === undefined) {
    return stablePace;
  }

  const line = input.deploymentGroup === "D"
    ? Math.floor(input.deploymentSlot / 2)
    : Math.floor(input.deploymentSlot / 3);
  const roleTargetPace = input.deploymentGroup === "D"
    ? (ROLE_TARGET_D[line] ?? 18)
    : (ROLE_TARGET_F[line] ?? 16);

  // Only unlock upward — a young player already producing above his role keeps
  // his pace (the deployment penalty handles a buried role separately).
  if (roleTargetPace <= stablePace) return stablePace;

  const pedigree = (input.draftOverall != null && input.draftOverall <= 10) ? 1.4
    : (input.draftOverall != null && input.draftOverall <= 32) ? 1.15
    : 1.0;
  const prospectSig = prospectPace > stablePace ? 1.2 : 1.0;
  const base = input.isProspectProfile ? 0.38 : 0.26;
  const w = clamp(base * pedigree * prospectSig, 0, 0.6);

  return stablePace + (roleTargetPace - stablePace) * w;
}
