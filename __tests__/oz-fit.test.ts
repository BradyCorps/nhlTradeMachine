// ── oz-fit.test.ts ───────────────────────────────────────────────
//
// fitOzWell is the single fit path production and the validator share. This pins
// it to the manual buildOzDesign → solveRidgeCG pipeline it replaced, so a
// split-half or bootstrap refit is provably the same model the leaderboard reads
// — and so the penalty only ever touches the player blocks, never context.

import { describe, it, expect } from "vitest";
import { fitOzWell, OZ_RIDGE_LAMBDA } from "@/scripts/gravity-v4/oz-fit";
import { buildOzDesign } from "@/scripts/gravity-v4/oz-design";
import { solveRidgeCG } from "@/scripts/gravity-v4/rapm";
import type { PossessionObservation } from "@/scripts/gravity-v4/possession-states";

const isForward = (id: number): boolean => id !== 5 && id !== 11;

const sample: PossessionObservation[] = [
  { gameId: 1, stintIdx: 0, durationSec: 3600, homeTeamId: 10, awayTeamId: 20,
    homeSkaters: [1, 2, 3, 4, 5], awaySkaters: [6, 7, 8, 9, 11],
    scoreStateHome: 1, startZoneHome: "O", homeXg: 0.6, awayXg: 0.2,
    shots: [{ team: "H", shooterId: 3, xg: 0.6 }, { team: "A", shooterId: 6, xg: 0.2 }] },
  { gameId: 2, stintIdx: 0, durationSec: 1200, homeTeamId: 10, awayTeamId: 30,
    homeSkaters: [1, 2, 3, 12, 5], awaySkaters: [13, 14, 15, 16, 17],
    scoreStateHome: -1, startZoneHome: "D", homeXg: 0, awayXg: 0.4,
    shots: [{ team: "A", shooterId: 13, xg: 0.4 }] },
];

describe("fitOzWell", () => {
  it("pins the held-out-selected production penalty", () => {
    expect(OZ_RIDGE_LAMBDA).toBe(100_000);
  });

  it("reproduces the manual buildOzDesign → solveRidgeCG fit exactly", () => {
    const lambda = 100;
    const { design, beta, byPlayer, context } = fitOzWell(sample, isForward, { lambda });

    // Manual path with the same penalty layout.
    const d2 = buildOzDesign(sample, isForward);
    const penalty = new Float64Array(d2.nFeatures);
    for (let j = 0; j < d2.contextOffset; j++) penalty[j] = lambda;
    const beta2 = solveRidgeCG(d2.rows, d2.nFeatures, penalty, { maxIter: 800 });

    expect(Array.from(beta)).toEqual(Array.from(beta2));

    // byPlayer reads the coefficient at each block's offset.
    design.players.forEach((id, i) => {
      const f = byPlayer.get(id)!;
      expect(f.gravity).toBe(beta[design.gravityOffset + i]);
      expect(f.finish).toBe(beta[design.finishOffset + i]);
      expect(f.defense).toBe(beta[design.defenseOffset + i]);
      expect(f.toiSec).toBe(design.toiSec[i]);
    });
    // context map reads the context tail.
    design.contextNames.forEach((n, k) => expect(context[n]).toBe(beta[design.contextOffset + k]));
  });

  it("leaves context columns unpenalized", () => {
    // With a huge λ the player blocks shrink toward 0, but the intercept — which
    // must absorb the mean response — stays clearly non-zero.
    const { byPlayer, context } = fitOzWell(sample, isForward, { lambda: 1e9 });
    for (const f of byPlayer.values()) {
      expect(Math.abs(f.gravity)).toBeLessThan(1e-3);
    }
    expect(Math.abs(context.intercept)).toBeGreaterThan(1e-3);
  });
});
