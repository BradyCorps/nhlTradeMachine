// ── transition.test.ts ───────────────────────────────────────────
//
// The rush/sustained partition is what keeps the NZ well from double-counting
// the OZ well, so the split has to be exact: rush-only and sustained-only must
// carry disjoint shots that recombine to the whole, each with its per-side xG
// recomputed. A shot with no rush flag counts as sustained.

import { describe, it, expect } from "vitest";
import { filterShots, rushOnly, sustainedOnly, rushXgShare } from "@/scripts/gravity-v4/transition";
import type { PossessionObservation } from "@/scripts/gravity-v4/possession-states";

const obs = (shots: PossessionObservation["shots"]): PossessionObservation => ({
  gameId: 1, stintIdx: 0, durationSec: 60, homeTeamId: 10, awayTeamId: 20,
  homeSkaters: [1, 2, 3, 4, 5], awaySkaters: [6, 7, 8, 9, 10],
  scoreStateHome: 0, startZoneHome: "N", homeXg: 0, awayXg: 0, shots,
});

const sample = [obs([
  { team: "H", shooterId: 1, xg: 0.3, rush: true },
  { team: "H", shooterId: 2, xg: 0.2, rush: false },
  { team: "A", shooterId: 6, xg: 0.4, rush: true },
  { team: "H", shooterId: 3, xg: 0.1 },              // no flag → sustained
])];

describe("rush / sustained partition", () => {
  it("rushOnly keeps rush shots and recomputes per-side xG", () => {
    const [o] = rushOnly(sample);
    expect(o.shots.map(s => s.shooterId)).toEqual([1, 6]);
    expect(o.homeXg).toBeCloseTo(0.3, 9);
    expect(o.awayXg).toBeCloseTo(0.4, 9);
  });

  it("sustainedOnly keeps non-rush shots (including unflagged) and recomputes", () => {
    const [o] = sustainedOnly(sample);
    expect(o.shots.map(s => s.shooterId)).toEqual([2, 3]);
    expect(o.homeXg).toBeCloseTo(0.3, 9);   // 0.2 + 0.1
    expect(o.awayXg).toBe(0);
  });

  it("the two views partition the whole — every shot lands in exactly one", () => {
    const r = rushOnly(sample)[0].shots.length;
    const s = sustainedOnly(sample)[0].shots.length;
    expect(r + s).toBe(sample[0].shots.length);
  });

  it("rushXgShare is rush xG over total xG", () => {
    expect(rushXgShare(sample)).toBeCloseTo((0.3 + 0.4) / (0.3 + 0.2 + 0.4 + 0.1), 9);
    expect(rushXgShare([obs([])])).toBe(0);
  });

  it("filterShots leaves lineups and durations untouched", () => {
    const [o] = filterShots(sample, () => false);
    expect(o.shots).toHaveLength(0);
    expect(o.homeXg).toBe(0);
    expect(o.homeSkaters).toEqual([1, 2, 3, 4, 5]);
    expect(o.durationSec).toBe(60);
  });
});
