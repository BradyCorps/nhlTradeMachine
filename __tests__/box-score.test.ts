// ── Box-score line consistency (VAL2) ────────────────────────────
import { describe, it, expect } from "vitest";
import { boxScoreFromPace } from "@/app/lib/box-score";

describe("boxScoreFromPace — PTS is always G + A", () => {
  it("does not show 0 G / 0 A / 1 PTS on a thin sample (the Duehr line)", () => {
    // 3 GP with paces that each round to 0 goals and 0 assists but where an
    // independent ptsPace would have rounded to 1.
    const line = boxScoreFromPace({ games: 3, goalsPace: 10, assistsPace: 10 });
    expect(line).toEqual({ gp: 3, g: 0, a: 0, pts: 0 });
    expect(line.pts).toBe(line.g + line.a);
  });

  it("rounds a full-season line and keeps PTS = G + A", () => {
    const line = boxScoreFromPace({ games: 82, goalsPace: 40, assistsPace: 50 });
    expect(line).toEqual({ gp: 82, g: 40, a: 50, pts: 90 });
  });

  it("handles missing paces as zero", () => {
    expect(boxScoreFromPace({ games: 20 })).toEqual({ gp: 20, g: 0, a: 0, pts: 0 });
  });

  it("never returns a PTS that disagrees with its G and A", () => {
    for (let gp = 1; gp <= 82; gp++) {
      const line = boxScoreFromPace({ games: gp, goalsPace: 27, assistsPace: 33 });
      expect(line.pts).toBe(line.g + line.a);
    }
  });
});
