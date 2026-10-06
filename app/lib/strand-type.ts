// ── strand-type.ts ───────────────────────────────────────────────
//
// The one-line label printed on a STRAND ("what shape is this profile").
//
// WHY THE WORDS CHANGED, NOT THE RULES
//
// The label used to read "ELITE TWO-WAY" for any player whose OPS:DPS split was
// roughly even and whose average rail percentiles cleared 58 / 52 — modest
// numbers — and "COMPLETE PLAYER" for any even split regardless of level. Those
// are claims about ability. The rules only ever measured the SHAPE of a profile
// against a same-position field, and half of the defence rail is deployment
// (quality of competition, offensive-zone starts) rather than defensive
// performance. A label may describe what was measured; it may not promote it.
//
// The branch order and every threshold below are unchanged from the previous
// `computeStrandType`, deliberately: this is a vocabulary change and must not be
// tuned toward any player's preferred answer. It is also independent of NAV —
// it reads rail percentiles and OPS/DPS only.

export interface RailLike { val: number }

export const STRAND_TYPES = {
  offenseLed:      "OFFENSE-LED",
  offenseLeaning:  "OFFENSE-LEANING",
  defenseLed:      "DEFENSE-RAIL LED",
  defenseLeaning:  "DEFENSE-RAIL LEANING",
  aboveAvgBoth:    "ABOVE AVG BOTH",
  evenSplit:       "EVEN OPS/DPS",
  balanced:        "BALANCED",
  unavailable:     "UNAVAILABLE",
} as const;

export type StrandTypeLabel = (typeof STRAND_TYPES)[keyof typeof STRAND_TYPES];

export function computeStrandType(
  offTraits: RailLike[], defTraits: RailLike[],
  ops: number | null, dps: number | null,
): StrandTypeLabel {
  if (offTraits.length === 0 || defTraits.length === 0) return STRAND_TYPES.unavailable;
  const offAvg = offTraits.reduce((s, t) => s + t.val, 0) / offTraits.length;
  const defAvg = defTraits.reduce((s, t) => s + t.val, 0) / defTraits.length;
  const balance = Math.abs(offAvg - defAvg);
  const psRatio = ops != null && dps != null && (ops + dps) > 1
    ? ops / (ops + dps) : null;
  const T = STRAND_TYPES;

  return psRatio !== null && psRatio > 0.70 && offAvg > 0.60              ? T.offenseLed
    : psRatio !== null && psRatio > 0.60 && offAvg > 0.50                 ? T.offenseLeaning
    : psRatio !== null && psRatio < 0.30 && defAvg > 0.55                 ? T.defenseLed
    : psRatio !== null && psRatio < 0.40 && defAvg > 0.45                 ? T.defenseLeaning
    : psRatio !== null && psRatio >= 0.40 && psRatio <= 0.60
        && offAvg > 0.58 && defAvg > 0.52                                 ? T.aboveAvgBoth
    : psRatio !== null && psRatio >= 0.38 && psRatio <= 0.62              ? T.evenSplit
    : (offAvg > 0.72 && defAvg > 0.60 && balance < 0.20)                 ? T.aboveAvgBoth
    : offAvg > defAvg + 0.15
      ? offAvg > 0.65 ? T.offenseLed : T.offenseLeaning
    : defAvg > offAvg + 0.15
      ? defAvg > 0.65 ? T.defenseLed : T.defenseLeaning
    : offAvg > 0.52 && defAvg > 0.52 ? T.aboveAvgBoth
    : T.balanced;
}

/** What a label rests on, in words a reader can check against the rails. */
export function strandTypeBasis(label: string): string {
  const base =
    "Describes the shape of the profile: the average cohort percentile of the offence rail (OPS, xG, NOIV, TOI) against the defence rail (DPS, SUPP, QoC, OZ starts), plus the OPS:DPS split. ";
  const caveat =
    "TOI, QoC and OZ starts describe how a player is used, not how well he defends, and the label says nothing about NAV.";
  switch (label) {
    case STRAND_TYPES.aboveAvgBoth:
      return `${base}"Above avg both" means both rail averages sit above the middle of the field (or an even OPS:DPS split with the offence average above about 58 and the defence average above about 52). It does not mean elite. ${caveat}`;
    case STRAND_TYPES.evenSplit:
      return `${base}"Even OPS/DPS" means offensive and defensive point shares are close to equal; it says nothing about their level. ${caveat}`;
    default:
      return `${base}${caveat}`;
  }
}

/** Colour family for a label — descriptive tone only, no "good" green for a shape. */
export function strandTypeTone(label: string): "both" | "offense" | "defense" | "neutral" {
  if (label === STRAND_TYPES.aboveAvgBoth) return "both";
  if (label === STRAND_TYPES.offenseLed || label === STRAND_TYPES.offenseLeaning) return "offense";
  if (label === STRAND_TYPES.defenseLed || label === STRAND_TYPES.defenseLeaning) return "defense";
  return "neutral";
}
