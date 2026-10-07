// ── outlook-copy.ts ──────────────────────────────────────────────
// Wording for the Outlook and Development panels. Copy only; no number changes.
//
// WHY THIS EXISTS
//
// Three figures on the Outlook read as more certain than they are:
//
//   "Confidence 99" / "99% SAMPLE CONF"
//       A hand-weighted evidence score:
//         clamp(30 + 0.38·experience + 7·seasonSnapshots + 8·international
//               − 0.15·volatility + durability(−4…+3))
//       It measures how much NHL history the projection rests on. It is not the
//       probability that the projection is right, and a percent sign made it
//       read like one. Nothing in the repo calibrates it against outcomes.
//
//   "Floor 125 · Ceiling 147"
//       median = 0.72·baseline + 0.28·current + 0.35·upside, then
//       high = median + spread + pedigree bonus and low = median − 0.8·spread,
//       where spread = 8 + 0.22·(100 − evidence) + 0.12·volatility. The constants
//       are hand-set. "Floor" and "ceiling" imply bounds a result will stay
//       inside; no test shows the range contains actual outcomes at any rate.
//
//   "Three peak years remaining"
//       clamp(peakEnd − age + 2 if the production score is 85+ and the trend is
//       not falling − 1 if falling, 0, 6) with an ASSUMED peak end of 30 for
//       forwards, 31 for defence and 33 for goalies. It is age arithmetic from
//       an assumption, not a forecast of how he will play.
//
// If any of these is later calibrated, change the note here and say how.

export const EVIDENCE_SCORE_LABEL = "Evidence score";
export const EVIDENCE_SCORE_SHORT = "SAMPLE EVIDENCE";
export const EVIDENCE_SCORE_NOTE =
  "A hand-weighted 0–100 score of how much NHL history the projection rests on (experience, seasons on record, volatility, durability). It is not a probability that the projection is right, and it has not been calibrated against outcomes.";

export const SCENARIO_RANGE_LABEL = "Next-season scenario range";
export const SCENARIO_LOW = "Low case";
export const SCENARIO_MEDIAN = "Median case";
export const SCENARIO_HIGH = "High case";
export const SCENARIO_NOTE =
  "A hand-built spread around the median case: it widens with less NHL history and more volatility. It is not a calibrated prediction interval and has not been tested to contain actual results.";

export const PEAK_YEARS_LABEL = "Assumed peak years left";
export const PEAK_YEARS_NOTE =
  "Age arithmetic from an assumed peak that ends near 30 for forwards, 31 for defence and 33 for goalies, plus two years for a top production score. It is an assumption, not a forecast of his play.";

/** "3 more peak-window years on the assumed age curve", pluralised. */
export const peakYearsPhrase = (n: number): string =>
  `${n} more peak-window year${n === 1 ? "" : "s"} on the assumed age curve`;
