// ── bootstrap.test.ts ────────────────────────────────────────────
//
// The bootstrap primitives turn a cloud of refits into an error bar, so a bug
// here would draw a confidently wrong interval. These pin the resample (right
// size, in range, reproducible, and actually with replacement), the quantile
// (endpoints and interpolation), the summary (mean/SE/percentile interval), and
// the two interval predicates the driver reads its verdicts from.

import { describe, it, expect } from "vitest";
import {
  resampleWithReplacement, quantile, populationSd, summarize, resolvedFromZero, intervalsOverlap,
} from "@/scripts/gravity-v4/bootstrap";
import { mulberry32 } from "@/scripts/gravity-v4/validate";

describe("resampleWithReplacement", () => {
  it("returns n indices in range, reproducible for a seed", () => {
    const a = resampleWithReplacement(50, mulberry32(1));
    const b = resampleWithReplacement(50, mulberry32(1));
    expect(a).toHaveLength(50);
    expect(a).toEqual(b);
    for (const i of a) expect(i).toBeGreaterThanOrEqual(0), expect(i).toBeLessThan(50);
  });

  it("draws with replacement (a value repeats across a long draw)", () => {
    const draw = resampleWithReplacement(10, mulberry32(3));
    expect(new Set(draw).size).toBeLessThan(draw.length);
  });
});

describe("quantile", () => {
  it("hits endpoints and the median", () => {
    const v = [1, 2, 3, 4, 5];
    expect(quantile(v, 0)).toBe(1);
    expect(quantile(v, 1)).toBe(5);
    expect(quantile(v, 0.5)).toBe(3);
  });
  it("interpolates between neighbours", () => {
    expect(quantile([0, 10], 0.25)).toBeCloseTo(2.5, 9);
    expect(quantile([1, 2, 3, 4], 0.5)).toBeCloseTo(2.5, 9);
  });
});

describe("summarize", () => {
  it("computes mean, sample SE and a percentile interval", () => {
    const s = summarize([1, 2, 3, 4, 5]);
    expect(s.mean).toBeCloseTo(3, 9);
    expect(s.se).toBeCloseTo(Math.sqrt(2.5), 9);   // sample sd (n−1)
    expect(s.lo).toBeCloseTo(quantile([1, 2, 3, 4, 5], 0.025), 9);
    expect(s.hi).toBeCloseTo(quantile([1, 2, 3, 4, 5], 0.975), 9);
    expect(s.n).toBe(5);
  });
  it("is safe on an empty sample", () => {
    const s = summarize([]);
    expect(s.n).toBe(0);
    expect(Number.isNaN(s.mean)).toBe(true);
  });
});

describe("populationSd", () => {
  it("reports the fitted point spread without a stale calibration constant", () => {
    expect(populationSd([1, 2, 3, 4, 5])).toBeCloseTo(Math.sqrt(2), 9);
    expect(Number.isNaN(populationSd([]))).toBe(true);
  });
});

describe("interval predicates", () => {
  it("resolvedFromZero requires both ends to share a sign", () => {
    expect(resolvedFromZero({ lo: 0.05, hi: 0.20 })).toBe(true);    // clearly positive
    expect(resolvedFromZero({ lo: -0.20, hi: -0.05 })).toBe(true);  // clearly negative
    expect(resolvedFromZero({ lo: -0.02, hi: 0.11 })).toBe(false);  // straddles zero
  });
  it("intervalsOverlap is true unless one lies entirely past the other", () => {
    expect(intervalsOverlap({ lo: 0.1, hi: 0.3 }, { lo: 0.2, hi: 0.4 })).toBe(true);
    expect(intervalsOverlap({ lo: 0.1, hi: 0.2 }, { lo: 0.3, hi: 0.4 })).toBe(false);
  });
});
