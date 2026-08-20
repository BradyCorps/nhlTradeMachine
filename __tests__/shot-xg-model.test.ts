// ── shot-xg-model.test.ts ────────────────────────────────────────
//
// The v4 currency: a shot's location → P(goal). These pin the parts that must
// be right before any zone fit trusts it — the orientation-free geometry, that
// blocked shots are dropped, that the logistic recovers a known relationship,
// and that the fitted probabilities are calibrated (predicted ≈ observed).

import { describe, it, expect } from "vitest";
import {
  shotFeatures, featureVector, fitLogistic, predictXg, auc, calibration,
  type ShotInput,
} from "@/scripts/gravity-v4/shot-xg-model";

describe("shotFeatures", () => {
  it("is orientation-free — a slot shot reads the same at both ends", () => {
    const near = shotFeatures({ xCoord: 80, yCoord: 0, kind: "shot-on-goal" })!;
    const far = shotFeatures({ xCoord: -80, yCoord: 0, kind: "shot-on-goal" })!;
    expect(near.distance).toBeCloseTo(9, 6);   // |x|=80 → 9 ft from the goal line
    expect(near.distance).toBeCloseTo(far.distance, 6);
    expect(near.angle).toBeCloseTo(0, 6);      // dead centre
  });

  it("reads distance and angle sensibly", () => {
    const point = shotFeatures({ xCoord: 60, yCoord: 25, kind: "missed-shot" })!; // far, wide
    const slot = shotFeatures({ xCoord: 82, yCoord: 0, kind: "shot-on-goal" })!;  // close, dead centre
    expect(point.distance).toBeGreaterThan(slot.distance);   // 38 ft vs 7 ft
    expect(point.angle).toBeGreaterThan(slot.angle);         // 0.71 rad vs 0
    expect(slot.angle).toBeCloseTo(0, 6);
  });

  it("drops blocked shots and missing coordinates", () => {
    expect(shotFeatures({ xCoord: 80, yCoord: 0, kind: "blocked-shot" })).toBeNull();
    expect(shotFeatures({ xCoord: null, yCoord: 0, kind: "shot-on-goal" })).toBeNull();
  });
});

describe("fitLogistic + predictXg", () => {
  // Synthetic truth: closer shots score more. Fit must recover that ordering
  // and produce calibrated probabilities.
  const rng = (() => { let s = 42; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  const shots: ShotInput[] = [];
  const labels: number[] = [];
  for (let i = 0; i < 6000; i++) {
    const x = 40 + rng() * 49;        // |x| 40..89
    const y = (rng() - 0.5) * 60;     // -30..30
    const f = shotFeatures({ xCoord: x, yCoord: y, kind: "shot-on-goal" })!;
    const pGoal = 1 / (1 + Math.exp(-(2.2 - 0.14 * f.distance)));  // closer → higher
    const goal = rng() < pGoal;
    shots.push({ xCoord: x, yCoord: y, kind: goal ? "goal" : "shot-on-goal" });
    labels.push(goal ? 1 : 0);
  }
  const rows = shots.map(s => featureVector(shotFeatures(s)!));
  const model = fitLogistic(rows, labels);

  it("ranks a slot shot well above a point shot", () => {
    const slot = predictXg(model, { xCoord: 84, yCoord: 2, kind: "shot-on-goal" })!;
    const point = predictXg(model, { xCoord: 30, yCoord: 15, kind: "shot-on-goal" })!;
    expect(slot).toBeGreaterThan(point);
    expect(slot).toBeGreaterThan(0.12);
    expect(point).toBeLessThan(0.06);
  });

  it("returns probabilities in (0,1) and beats a coin flip on AUC", () => {
    const scores = shots.map(s => predictXg(model, s)!);
    expect(Math.min(...scores)).toBeGreaterThan(0);
    expect(Math.max(...scores)).toBeLessThan(1);
    expect(auc(scores, labels)).toBeGreaterThan(0.66);
  });

  it("is calibrated — predicted ≈ observed in every decile", () => {
    const scores = shots.map(s => predictXg(model, s)!);
    for (const bin of calibration(scores, labels)) {
      expect(Math.abs(bin.predicted - bin.observed)).toBeLessThan(0.05);
    }
  });

  it("recovers the overall base rate", () => {
    const scores = shots.map(s => predictXg(model, s)!);
    const meanPred = scores.reduce((a, b) => a + b, 0) / scores.length;
    const baseRate = labels.reduce((a, b) => a + b, 0) / labels.length;
    expect(meanPred).toBeCloseTo(baseRate, 1);
  });
});

describe("auc", () => {
  it("is 1.0 for a perfect ranker and ~0.5 for random", () => {
    expect(auc([0.1, 0.2, 0.3, 0.4], [0, 0, 1, 1])).toBe(1);
    expect(auc([0.5, 0.5, 0.5, 0.5], [0, 1, 0, 1])).toBeCloseTo(0.5, 6);
  });
});
