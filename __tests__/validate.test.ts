// ── validate.test.ts ─────────────────────────────────────────────
//
// The validation primitives decide whether the OZ well is a measurement, so a
// silent bug here would pass a gimmick. These pin the split (games stay whole,
// every stint placed once), the correlations (perfect ±1, zero-variance → 0, a
// monotone pair → ρ=1), the focal-excluded teammate target (a shooter is scored
// on his linemates, never himself), and the null transform (same shots, new
// pairing, totals conserved).

import { describe, it, expect } from "vitest";
import {
  assignFold, splitByGame, pearson, spearman, teammateXgRate, opponentXgRate, shuffleShots, mulberry32,
} from "@/scripts/gravity-v4/validate";
import type { PossessionObservation } from "@/scripts/gravity-v4/possession-states";

const obs = (o: Partial<PossessionObservation>): PossessionObservation => ({
  gameId: 1, stintIdx: 0, durationSec: 3600, homeTeamId: 10, awayTeamId: 20,
  homeSkaters: [1, 2, 3, 4, 5], awaySkaters: [6, 7, 8, 9, 10],
  scoreStateHome: 0, startZoneHome: "N", homeXg: 0, awayXg: 0, shots: [], ...o,
});

describe("assignFold / splitByGame", () => {
  it("is deterministic and in range", () => {
    for (const g of [1, 2, 500, 2025020123]) {
      expect(assignFold(g, 2)).toBe(assignFold(g, 2));
      expect([0, 1]).toContain(assignFold(g, 2));
    }
  });

  it("uses both folds across many games", () => {
    const seen = new Set<number>();
    for (let g = 1; g <= 200; g++) seen.add(assignFold(g, 2));
    expect(seen).toEqual(new Set([0, 1]));
  });

  it("keeps a game whole and places every stint exactly once", () => {
    const rows = [
      obs({ gameId: 1, stintIdx: 0 }), obs({ gameId: 1, stintIdx: 1 }),
      obs({ gameId: 2, stintIdx: 0 }), obs({ gameId: 3, stintIdx: 0 }),
    ];
    const [a, b] = splitByGame(rows, 2);
    expect(a.length + b.length).toBe(rows.length);
    // No game id spans both folds.
    const games = (f: PossessionObservation[]) => new Set(f.map(o => o.gameId));
    for (const g of games(a)) expect(games(b).has(g)).toBe(false);
    // Game 1's two stints land together.
    const g1Fold = assignFold(1, 2);
    expect([a, b][g1Fold].filter(o => o.gameId === 1)).toHaveLength(2);
  });
});

describe("pearson / spearman", () => {
  it("returns +1 / -1 for perfectly (anti)correlated series", () => {
    expect(pearson([1, 2, 3], [2, 4, 6])).toBeCloseTo(1, 6);
    expect(pearson([1, 2, 3], [3, 2, 1])).toBeCloseTo(-1, 6);
  });
  it("returns 0 for a zero-variance input instead of NaN", () => {
    expect(pearson([5, 5, 5], [1, 2, 3])).toBe(0);
  });
  it("spearman is 1 for a monotone non-linear pair pearson would understate", () => {
    const x = [1, 2, 3, 4], y = [1, 4, 9, 16];
    expect(spearman(x, y)).toBeCloseTo(1, 6);
    expect(pearson(x, y)).toBeLessThan(1);
  });
});

describe("teammateXgRate", () => {
  it("credits a shooter's linemates, never himself (focal-excluded)", () => {
    const r = teammateXgRate([obs({
      shots: [{ team: "H", shooterId: 3, xg: 0.6 }, { team: "H", shooterId: 1, xg: 0.2 }],
    })]);
    const per60 = (id: number) => { const t = r.get(id)!; return (t.xg / t.sec) * 3600; };
    // Home total own xG is 0.8; each player sees it minus his own.
    expect(per60(1)).toBeCloseTo(0.6, 6);   // 0.8 − his 0.2
    expect(per60(3)).toBeCloseTo(0.2, 6);   // 0.8 − his 0.6
    expect(per60(2)).toBeCloseTo(0.8, 6);   // non-shooter sees the whole 0.8
    // Away players saw no away offence.
    expect(per60(6)).toBe(0);
  });

  it("accumulates exposure across stints", () => {
    const r = teammateXgRate([
      obs({ durationSec: 1800, shots: [{ team: "H", shooterId: 2, xg: 0.5 }] }),
      obs({ durationSec: 1800, shots: [{ team: "H", shooterId: 2, xg: 0.5 }] }),
    ]);
    expect(r.get(1)!.sec).toBe(3600);
    expect(r.get(1)!.xg).toBeCloseTo(1.0, 6);   // 0.5 + 0.5, both from teammate 2
  });
});

describe("opponentXgRate", () => {
  it("charges each player the OTHER team's xG, whole (no focal-exclusion)", () => {
    const r = opponentXgRate([obs({
      shots: [{ team: "H", shooterId: 3, xg: 0.6 }, { team: "A", shooterId: 6, xg: 0.2 }],
    })]);
    const per60 = (id: number) => { const t = r.get(id)!; return (t.xg / t.sec) * 3600; };
    // Home skaters defend against the away team → they face awayTot = 0.2.
    expect(per60(1)).toBeCloseTo(0.2, 6);
    // Even the home shooter is charged the full opposing total, not his own side.
    expect(per60(3)).toBeCloseTo(0.2, 6);
    // Away skaters face the home team → homeTot = 0.6.
    expect(per60(6)).toBeCloseTo(0.6, 6);
  });
});

describe("shuffleShots (null control)", () => {
  it("preserves the multiset of shot lists, durations and lineups; conserves total xG", () => {
    const rows = [
      obs({ gameId: 1, stintIdx: 0, durationSec: 100, shots: [{ team: "H", shooterId: 1, xg: 0.3 }] }),
      obs({ gameId: 1, stintIdx: 1, durationSec: 200, shots: [{ team: "A", shooterId: 6, xg: 0.9 }] }),
      obs({ gameId: 2, stintIdx: 0, durationSec: 300, shots: [] }),
    ];
    const totalShotXg = rows.flatMap(o => o.shots).reduce((s, x) => s + x.xg, 0);
    const shuffled = shuffleShots(rows, mulberry32(42));

    // Same count, durations and lineups preserved row-for-row.
    expect(shuffled).toHaveLength(3);
    shuffled.forEach((o, i) => {
      expect(o.durationSec).toBe(rows[i].durationSec);
      expect(o.homeSkaters).toBe(rows[i].homeSkaters);
    });
    // Each row's recomputed xG matches its (reattached) shots.
    for (const o of shuffled) {
      const h = o.shots.filter(s => s.team === "H").reduce((s, x) => s + x.xg, 0);
      const a = o.shots.filter(s => s.team === "A").reduce((s, x) => s + x.xg, 0);
      expect(o.homeXg).toBeCloseTo(h, 9);
      expect(o.awayXg).toBeCloseTo(a, 9);
    }
    // Total production is conserved — only its pairing to lineups is destroyed.
    const after = shuffled.reduce((s, o) => s + o.homeXg + o.awayXg, 0);
    expect(after).toBeCloseTo(totalShotXg, 9);
    expect(after).toBeCloseTo(0.3 + 0.9, 9);
  });

  it("is reproducible for a fixed seed", () => {
    const rows = Array.from({ length: 8 }, (_, i) =>
      obs({ stintIdx: i, shots: [{ team: "H", shooterId: 1, xg: (i + 1) / 10 }] }));
    const one = shuffleShots(rows, mulberry32(7)).map(o => o.homeXg);
    const two = shuffleShots(rows, mulberry32(7)).map(o => o.homeXg);
    expect(one).toEqual(two);
  });
});
