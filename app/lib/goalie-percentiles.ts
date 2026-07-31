// ── goalie-percentiles.ts ────────────────────────────────────────
//
// Reading a goalie against the goalie population instead of against a guess.
//
// WHAT THIS REPLACES
//
// Every goalie rail was scaled by a hand-picked range — `norm(gsax, -15, 25)`,
// `norm(savePct, 0.890, 0.935)`, `norm(hdsv, 0.780, 0.880)`. Those were
// invented because there was no population to measure against. There is one
// now: `app/data/goalie-percentiles.json`, built from 1,031 qualifying
// goalie-seasons (2008-2025) by `scripts/goalie-percentiles/build.ts`.
//
// THE OTHER HALF, WHICH MATTERS MORE
//
// The artifact also carries how much of a goalie's season survives into the
// next one, measured over consecutive-season pairs. The answer is uncomfortable
// and worth stating plainly:
//
//   Freeze rate           r = 0.72
//   Rebound control       r = 0.69
//   High-danger SV%       r = 0.40
//   GAA                   r = 0.34
//   SV%                   r = 0.30
//   GSAx/60               r = 0.13   ← what G-NAV is built on
//   Medium-danger SV%     r = 0.06   ← indistinguishable from noise
//
// A full season of GSAx carries about a seventh of itself into next year. The
// things that repeat are puck control — freezes and rebounds — which the
// valuation does not look at.
//
// That is what `reliability()` encodes: a season's worth of a metric is worth
// exactly its stability, and a partial season proportionally less. It is the
// honest basis for regressing a goalie toward the mean, and for admitting how
// wide the interval around him really is.
//
// The runtime only ever reads this artifact. It never fits anything.

import artifact from "@/app/data/goalie-percentiles.json";

export interface GoalieMetric {
  label: string;
  unit: string;
  higherIsBetter: boolean;
  note: string;
  n: number;
  mean: number;
  sd: number;
  quantiles: Record<string, number>;
  stability: { pairs: number; r: number };
}

const METRICS = artifact.metrics as unknown as Record<string, GoalieMetric>;

export type GoalieMetricKey = keyof typeof artifact.metrics & string;

export const GOALIE_METRIC_KEYS = Object.keys(METRICS) as GoalieMetricKey[];

export const goalieMetric = (key: string): GoalieMetric | null => METRICS[key] ?? null;

/** Where the percentile scale comes from, for a caption that has to say. */
export const PERCENTILE_WINDOW = artifact.percentileWindow;
export const STABILITY_PANEL = artifact.stabilityPanel;

/**
 * Ice time in a full modern season, in seconds.
 *
 * A 60-start starter plays roughly 3,500 minutes. This is the anchor
 * `reliability` is calibrated against, not a threshold anyone must reach.
 */
export const FULL_SEASON_SECONDS = 3500 * 60;

/**
 * Percentile of a raw value against the goalie population, 0-100.
 *
 * ORIENTED, always: 100 is the good end whichever direction the raw metric
 * runs. A 1.90 GAA is the 99th percentile even though 1.90 is a low number,
 * because the alternative is a rail where half the nodes mean the opposite of
 * the other half — which is the exact confusion this work exists to remove.
 *
 * Interpolates between published quantiles; clamps outside the tails. Returns
 * null for an unknown metric or a value that is not a number, so a caller can
 * grey the node rather than draw a confident 50.
 */
export function goaliePercentile(key: string, value: number | null | undefined): number | null {
  const metric = METRICS[key];
  if (!metric || value == null || !isFinite(value)) return null;

  const points = Object.entries(metric.quantiles)
    .map(([p, v]) => ({ p: Number(p), v }))
    .sort((a, b) => a.p - b.p);
  if (points.length === 0) return null;

  let pct: number;
  if (value <= points[0].v) pct = points[0].p;
  else if (value >= points[points.length - 1].v) pct = points[points.length - 1].p;
  else {
    pct = points[points.length - 1].p;
    for (let i = 1; i < points.length; i++) {
      if (value <= points[i].v) {
        const lo = points[i - 1], hi = points[i];
        const span = hi.v - lo.v;
        pct = span === 0 ? hi.p : lo.p + ((value - lo.v) / span) * (hi.p - lo.p);
        break;
      }
    }
  }

  return metric.higherIsBetter ? pct : 100 - pct;
}

/**
 * How much of this metric, at this sample size, is signal.
 *
 * The published `r` is the year-over-year correlation at roughly a full
 * season's ice time, which is the fraction of a full season that carries
 * forward. So reliability follows the standard `n / (n + k)` form with `k`
 * chosen to reproduce exactly that at a full season:
 *
 *     k = FULL_SEASON × (1 − r) / r      ⟹    reliability(FULL_SEASON) = r
 *
 * A metric with r ≤ 0 has no recoverable signal at any sample size and returns
 * 0 rather than a small positive number, because "we measured nothing" should
 * not round up to "we measured a little".
 */
export function reliability(key: string, iceTimeSeconds: number | null | undefined): number {
  const metric = METRICS[key];
  if (!metric || iceTimeSeconds == null || !isFinite(iceTimeSeconds) || iceTimeSeconds <= 0) return 0;
  const r = metric.stability.r;
  if (!isFinite(r) || r <= 0) return 0;
  if (r >= 1) return 1;
  const k = (FULL_SEASON_SECONDS * (1 - r)) / r;
  return iceTimeSeconds / (iceTimeSeconds + k);
}

/**
 * A metric's observed value regressed toward the population mean by how much
 * of it is actually signal.
 *
 * This is the number a valuation should use. The raw season is what happened;
 * this is what it implies about the goalie.
 */
export function regressedValue(
  key: string,
  value: number | null | undefined,
  iceTimeSeconds: number | null | undefined,
): number | null {
  const metric = METRICS[key];
  if (!metric || value == null || !isFinite(value)) return null;
  const w = reliability(key, iceTimeSeconds);
  return value * w + metric.mean * (1 - w);
}

/** Plain-language stability, for a tooltip that should not print an r. */
export function stabilityLabel(key: string): string | null {
  const metric = METRICS[key];
  if (!metric) return null;
  const r = metric.stability.r;
  if (!isFinite(r)) return null;
  if (r >= 0.60) return "repeats strongly year to year";
  if (r >= 0.35) return "repeats moderately year to year";
  if (r >= 0.20) return "repeats weakly year to year";
  return "barely repeats year to year — read one season with caution";
}
