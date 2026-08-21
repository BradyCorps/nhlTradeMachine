// ── rapm.test.ts ─────────────────────────────────────────────────
//
// The RAPM ridge solver is the engine under every v4 zone fit, so it has to be
// right before we trust a coefficient. These recover known truths: a plain
// weighted ridge on a small dense problem, and — the real test — a sparse
// hockey-shaped design where each observation is a sum of on-ice player effects
// plus noise, which the solver must disentangle back to the per-player truth.

import { describe, it, expect } from "vitest";
import { solveRidgeCG, type SparseObs } from "@/scripts/gravity-v4/rapm";

const pearson = (a: number[], b: number[]): number => {
  const n = a.length, ma = a.reduce((s, v) => s + v, 0) / n, mb = b.reduce((s, v) => s + v, 0) / n;
  let sxy = 0, sxx = 0, syy = 0;
  for (let i = 0; i < n; i++) { const dx = a[i] - ma, dy = b[i] - mb; sxy += dx * dy; sxx += dx * dx; syy += dy * dy; }
  return sxy / Math.sqrt(sxx * syy);
};

describe("solveRidgeCG", () => {
  it("recovers a simple weighted linear fit", () => {
    // y = 3·x0 + b, features [x0, intercept]. Tiny penalty so it barely shrinks.
    const obs: SparseObs[] = [];
    for (let i = 0; i < 200; i++) {
      const x0 = (i / 200) * 4 - 2;
      obs.push({ idx: [0, 1], val: [x0, 1], y: 3 * x0 + 1.5, w: 1 });
    }
    const beta = solveRidgeCG(obs, 2, new Float64Array([1e-6, 0]));
    expect(beta[0]).toBeCloseTo(3, 1);
    expect(beta[1]).toBeCloseTo(1.5, 1);
  });

  it("disentangles overlapping player effects from a hockey-shaped design", () => {
    // 60 players, each with a true offensive effect. Every observation is a
    // random 5-man unit; response = sum of their effects + noise. Ridge must
    // recover the per-player truth despite players never appearing alone.
    const P = 60;
    const truth = Array.from({ length: P }, (_, j) => Math.sin(j) * 0.5);   // deterministic spread
    const rng = (() => { let s = 123; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();

    const obs: SparseObs[] = [];
    for (let i = 0; i < 8000; i++) {
      const unit = new Set<number>();
      while (unit.size < 5) unit.add(Math.floor(rng() * P));
      const idx = [...unit];
      const y = idx.reduce((s, j) => s + truth[j], 0) + (rng() - 0.5) * 0.4;
      obs.push({ idx, val: idx.map(() => 1), y, w: 1 });
    }

    const penalty = new Float64Array(P).fill(2);   // ridge shrinkage
    const beta = solveRidgeCG(obs, P, penalty);
    const fitted = Array.from(beta);

    // Ridge shrinks magnitudes, so correlation with truth is the right check.
    expect(pearson(fitted, truth)).toBeGreaterThan(0.9);
    // The best and worst players by truth should rank the same way when fitted.
    const bestTrue = truth.indexOf(Math.max(...truth));
    const worstTrue = truth.indexOf(Math.min(...truth));
    expect(fitted[bestTrue]).toBeGreaterThan(fitted[worstTrue]);
  });

  it("shrinks harder toward zero as the penalty grows", () => {
    const obs: SparseObs[] = [];
    for (let i = 0; i < 500; i++) obs.push({ idx: [0], val: [1], y: 2, w: 1 });
    const light = solveRidgeCG(obs, 1, new Float64Array([1]))[0];
    const heavy = solveRidgeCG(obs, 1, new Float64Array([1000]))[0];
    expect(light).toBeGreaterThan(heavy);
    expect(heavy).toBeGreaterThan(0);
    expect(heavy).toBeLessThan(light);
  });
});
