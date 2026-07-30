// ── Partner Finder fit tiers (CXH5) ──────────────────────────────
//
// The tier ladder tested cap fit in the middle of a score ladder:
//
//     capFit === "OVER"   -> BLOCKED
//     finalScore >= 60    -> LEAD
//     capFit === "FITS"   -> CAP_CLEAR     <- before any further score test
//     finalScore >= 35    -> LONG_SHOT
//                            BLOCKED
//
// Two things follow from that third line, and both are wrong.
//
// A club with a score of ZERO landed in CAP_CLEAR purely for having cap room,
// and was filed beside a club scoring 59 — "they can absorb the money" and
// "they might actually want this" collapsed into one folder. Cap room is not
// interest; a rebuilding club has plenty of room and no reason to help you.
//
// And LONG_SHOT became unreachable for any club whose cap FITS, because FITS
// was caught one line above. The only way down there was a TIGHT cap with a
// middling score, so the folder labelled "long shot" actually meant "tight cap"
// — the tier was reporting a different axis than its name claimed.
//
// The two axes are independent and both already travel on the result: `capFit`
// answers whether the money works, `fitTier` answers how interested the club
// is. BLOCKED is reserved for the cap making it impossible; everything else is
// a monotone ladder on the score alone.

export type MatchFitTier = "LEAD" | "POSSIBLE" | "LONG_SHOT" | "BLOCKED";
export type MatchCapFit = "FITS" | "TIGHT" | "OVER";

export const FIT_THRESHOLDS = {
  /** A club with a real reason to make this call. */
  LEAD: 60,
  /** Worth a call, but you are asking them a favour. */
  POSSIBLE: 35,
} as const;

/**
 * Which folder a scanned club belongs in.
 *
 * `capFit` decides only whether the trade is possible at all. Interest is read
 * off the score, and off nothing else — so a club is never promoted for having
 * cap space, and never demoted below LONG_SHOT for lacking it.
 */
export function classifyMatch(score: number, capFit: MatchCapFit): MatchFitTier {
  if (capFit === "OVER") return "BLOCKED";
  if (score >= FIT_THRESHOLDS.LEAD) return "LEAD";
  if (score >= FIT_THRESHOLDS.POSSIBLE) return "POSSIBLE";
  return "LONG_SHOT";
}

/**
 * One line saying what the tier means, since the folder name alone reads as a
 * verdict on the trade rather than on the club's interest in it.
 */
export const TIER_MEANING: Record<MatchFitTier, string> = {
  LEAD: "Strong fit — a club with its own reason to make this call",
  POSSIBLE: "Plausible fit — worth a call, but you are asking a favour",
  LONG_SHOT: "Weak fit — little reason for them to engage",
  BLOCKED: "Cannot absorb the cap hit — the money does not work",
};
