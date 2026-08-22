// ── possession-states.test.ts ────────────────────────────────────
//
// valueStint prices a stint's shots in expected goals and packages the
// regression row. These pin the parts a wrong turn would corrupt silently:
// home/away attribution by team id, blocked/coordinate-less shots dropped,
// per-shooter detail preserved for the focal-excluded OZ target, and the
// score-state control clamped.

import { describe, it, expect } from "vitest";
import { valueStint } from "@/scripts/gravity-v4/possession-states";
import { fitLogistic, featureVector, shotFeatures } from "@/scripts/gravity-v4/shot-xg-model";
import type { StintRow, StintShot } from "@/scripts/gravity-v4/core";

// A small but real fitted model so xG values are monotone in danger.
const model = (() => {
  const rng = (() => { let s = 7; return () => (s = (s * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff; })();
  const rows: number[][] = [], labels: number[] = [];
  for (let i = 0; i < 4000; i++) {
    const x = 40 + rng() * 49, y = (rng() - 0.5) * 60;
    const f = shotFeatures({ xCoord: x, yCoord: y, kind: "shot-on-goal" })!;
    const goal = rng() < 1 / (1 + Math.exp(-(2.2 - 0.14 * f.distance)));
    rows.push(featureVector(f)); labels.push(goal ? 1 : 0);
  }
  return fitLogistic(rows, labels);
})();

const shot = (teamId: number, kind: StintShot["kind"], x: number | null, y: number | null, shooterId = 1): StintShot =>
  ({ teamId, shooterId, kind, sec: 0, xCoord: x, yCoord: y, rush: false });

const baseRow = (shots: StintShot[], over: Partial<StintRow> = {}): StintRow => ({
  season: "20252026", gameId: 1, stintIdx: 0, period: 1, startSec: 0, endSec: 40, durationSec: 40,
  gameStartSec: 0, homeTeamId: 10, awayTeamId: 20, homeSkaters: [1, 2, 3, 4, 5], awaySkaters: [6, 7, 8, 9, 11],
  homeGoalie: 30, awayGoalie: 31, strength: "5v5", isEven5v5: true, homeScore: 0, awayScore: 0,
  startZoneHome: "N", startedOnFaceoff: true, shots, homeCorsi: 0, awayCorsi: 0, homeGoals: 0, awayGoals: 0,
  ...over,
});

describe("valueStint", () => {
  it("attributes xG to the shooting team and sums per side", () => {
    const obs = valueStint(baseRow([
      shot(10, "shot-on-goal", 85, 2),   // home slot shot — high xG
      shot(20, "missed-shot", 40, 18),   // away point shot — low xG
    ]), model);
    expect(obs.shots).toHaveLength(2);
    expect(obs.shots[0].team).toBe("H");
    expect(obs.shots[1].team).toBe("A");
    expect(obs.homeXg).toBeGreaterThan(obs.awayXg);
    expect(obs.homeXg).toBeGreaterThan(0);
    expect(obs.awayXg).toBeGreaterThan(0);
    // Totals equal the sum of the per-shot values.
    expect(obs.homeXg).toBeCloseTo(obs.shots[0].xg, 10);
    expect(obs.awayXg).toBeCloseTo(obs.shots[1].xg, 10);
  });

  it("drops blocked shots and coordinate-less shots", () => {
    const obs = valueStint(baseRow([
      shot(10, "blocked-shot", 85, 2),   // blocked — owned by blocker, excluded
      shot(10, "shot-on-goal", null, 2), // no coordinates — excluded
      shot(10, "goal", 84, 0),           // counts
    ]), model);
    expect(obs.shots).toHaveLength(1);
    expect(obs.homeXg).toBeCloseTo(obs.shots[0].xg, 10);
    expect(obs.awayXg).toBe(0);
  });

  it("keeps per-shooter detail for the focal-excluded OZ target", () => {
    const obs = valueStint(baseRow([
      shot(10, "shot-on-goal", 80, 0, /*shooter*/ 3),
      shot(10, "shot-on-goal", 78, 5, /*shooter*/ 5),
    ]), model);
    expect(obs.shots.map(s => s.shooterId).sort()).toEqual([3, 5]);
    // Teammate-only xG for player 3 = total home xG minus his own shots.
    const own3 = obs.shots.filter(s => s.shooterId === 3).reduce((a, s) => a + s.xg, 0);
    expect(obs.homeXg - own3).toBeCloseTo(obs.shots.find(s => s.shooterId === 5)!.xg, 10);
  });

  it("carries the lineups and clamps the score state", () => {
    const obs = valueStint(baseRow([], { homeScore: 5, awayScore: 0 }), model);
    expect(obs.scoreStateHome).toBe(3);              // clamped from +5
    expect(obs.homeSkaters).toEqual([1, 2, 3, 4, 5]);
    expect(obs.awaySkaters).toEqual([6, 7, 8, 9, 11]);
    expect(valueStint(baseRow([], { homeScore: 0, awayScore: 9 }), model).scoreStateHome).toBe(-3);
  });
});
