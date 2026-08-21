// ── Gravity v4 — bootstrap primitives (pure) ─────────────────────
//
// The split-half validation showed the OZ well is a real, moderately reliable
// coefficient — which means individual player values carry genuine uncertainty.
// A point estimate of +0.167 is only a measurement if we can say how wide it is.
// These primitives support a BLOCK bootstrap over whole games (a game is the
// correlation block — stints within it share score, matchup and fatigue), so the
// resampling respects the dependence structure instead of treating 274k stints
// as independent draws.
//
// Resample games with replacement → refit the well → repeat. The spread of a
// player's gravity across replicates is his standard error; the 2.5/97.5
// percentiles are his interval; an interval clear of zero means the sign is
// resolved, not noise.

/** Draw n indices in [0, n) with replacement (a bootstrap resample of n items). */
export function resampleWithReplacement(n: number, rng: () => number): number[] {
  const out = new Array<number>(n);
  for (let i = 0; i < n; i++) out[i] = Math.floor(rng() * n);
  return out;
}

/** Linear-interpolated quantile of an ascending-sorted array. */
export function quantile(sortedAsc: number[], q: number): number {
  const n = sortedAsc.length;
  if (n === 0) return NaN;
  if (n === 1) return sortedAsc[0];
  const pos = (n - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos), hi = Math.ceil(pos);
  if (lo === hi) return sortedAsc[lo];
  return sortedAsc[lo] * (hi - pos) + sortedAsc[hi] * (pos - lo);
}

export interface Summary {
  /** Bootstrap mean of the replicates. */
  mean: number;
  /** Standard error = sample sd of the replicates. */
  se: number;
  /** Lower percentile bound (default 2.5%). */
  lo: number;
  /** Upper percentile bound (default 97.5%). */
  hi: number;
  /** Number of replicates that contributed a value. */
  n: number;
}

/** Summarize bootstrap replicates into mean, SE, and a percentile interval. */
export function summarize(samples: number[], loQ = 0.025, hiQ = 0.975): Summary {
  const n = samples.length;
  if (n === 0) return { mean: NaN, se: NaN, lo: NaN, hi: NaN, n };
  const mean = samples.reduce((s, v) => s + v, 0) / n;
  const variance = n > 1 ? samples.reduce((s, v) => s + (v - mean) ** 2, 0) / (n - 1) : 0;
  const sorted = [...samples].sort((a, b) => a - b);
  return { mean, se: Math.sqrt(variance), lo: quantile(sorted, loQ), hi: quantile(sorted, hiQ), n };
}

/** An interval is resolved from zero when both ends share a sign. */
export function resolvedFromZero(s: Pick<Summary, "lo" | "hi">): boolean {
  return (s.lo > 0 && s.hi > 0) || (s.lo < 0 && s.hi < 0);
}

/** Two intervals overlap unless one lies entirely above the other. */
export function intervalsOverlap(a: Pick<Summary, "lo" | "hi">, b: Pick<Summary, "lo" | "hi">): boolean {
  return !(a.lo > b.hi || b.lo > a.hi);
}
