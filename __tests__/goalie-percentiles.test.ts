import { describe, it, expect } from "vitest";
import artifact from "@/app/data/goalie-percentiles.json";
import {
  FULL_SEASON_SECONDS,
  GOALIE_METRIC_KEYS,
  PERCENTILE_WINDOW,
  goalieMetric,
  goaliePercentile,
  regressedValue,
  reliability,
  stabilityLabel,
} from "@/app/lib/goalie-percentiles";

describe("goalie-percentiles — the artifact", () => {
  it("is aggregate only, with no player rows", () => {
    // It ships in the repo, so it must carry nothing identifiable.
    const json = JSON.stringify(artifact);
    expect(json).not.toMatch(/playerId/);
    expect(json).not.toMatch(/"name"/);
    for (const key of GOALIE_METRIC_KEYS) {
      expect(Object.keys(goalieMetric(key)!)).not.toContain("values");
    }
  });

  it("records where its numbers came from", () => {
    expect(artifact.schemaVersion).toBe("goalie-percentiles-v1");
    expect(artifact.sources.length).toBeGreaterThan(0);
    for (const s of artifact.sources) {
      expect(s.sha256).toMatch(/^[0-9a-f]{64}$/);
      expect(s.rowsAtSituationAll).toBeGreaterThan(0);
    }
    expect(artifact.eligibility.minIcetimeMinutes).toBeGreaterThan(0);
  });

  it("draws percentiles from a recent window, not from 2008", () => {
    // Goaltending drifts; ranking a 2026 goalie against 2008 flatters him for
    // reasons unrelated to him.
    expect(PERCENTILE_WINDOW.count).toBeGreaterThanOrEqual(3);
    expect(PERCENTILE_WINDOW.goalieSeasons).toBeGreaterThan(100);
    expect(artifact.stabilityPanel.goalieSeasons).toBeGreaterThan(PERCENTILE_WINDOW.goalieSeasons);
  });

  it("has a monotone quantile table for every metric", () => {
    for (const key of GOALIE_METRIC_KEYS) {
      const q = Object.entries(goalieMetric(key)!.quantiles)
        .map(([p, v]) => [Number(p), v] as const)
        .sort((a, b) => a[0] - b[0]);
      for (let i = 1; i < q.length; i++) {
        expect(q[i][1], `${key} p${q[i][0]}`).toBeGreaterThanOrEqual(q[i - 1][1]);
      }
    }
  });

  it("lands each metric where hockey says it should", () => {
    const median = (k: string) => goalieMetric(k)!.quantiles["50"];
    expect(median("savePct")).toBeGreaterThan(0.895);
    expect(median("savePct")).toBeLessThan(0.925);
    expect(median("gaa")).toBeGreaterThan(2.2);
    expect(median("gaa")).toBeLessThan(3.2);
    // GSAx is a residual against expected goals, so its centre must be ~0.
    expect(Math.abs(median("gsaxPer60"))).toBeLessThan(0.15);
    // Danger tiers have to order correctly or the split is wrong.
    expect(median("highDangerSvPct")).toBeLessThan(median("mediumDangerSvPct"));
    expect(median("mediumDangerSvPct")).toBeLessThan(median("lowDangerSvPct"));
  });
});

describe("goalie-percentiles — percentile lookup", () => {
  it("puts the median at the 50th", () => {
    for (const key of GOALIE_METRIC_KEYS) {
      const p = goaliePercentile(key, goalieMetric(key)!.quantiles["50"]);
      expect(p, key).toBeCloseTo(50, 5);
    }
  });

  it("orients every metric so 100 is the good end", () => {
    // GAA runs the other way. A 1.90 must read high, not low — a rail where
    // half the nodes mean the opposite of the other half is the confusion this
    // work exists to remove.
    expect(goalieMetric("gaa")!.higherIsBetter).toBe(false);
    const stingy = goaliePercentile("gaa", 1.90)!;
    const leaky = goaliePercentile("gaa", 3.60)!;
    expect(stingy).toBeGreaterThan(leaky);
    expect(stingy).toBeGreaterThan(80);

    const elite = goaliePercentile("savePct", 0.930)!;
    const poor = goaliePercentile("savePct", 0.880)!;
    expect(elite).toBeGreaterThan(poor);
  });

  it("orients rebound control, where fewer than expected is better", () => {
    expect(goalieMetric("reboundsVsExpectedPer60")!.higherIsBetter).toBe(false);
    const clean = goaliePercentile("reboundsVsExpectedPer60", -1.0)!;
    const messy = goaliePercentile("reboundsVsExpectedPer60", 2.0)!;
    expect(clean).toBeGreaterThan(messy);
  });

  it("is monotone across the whole range", () => {
    for (const key of GOALIE_METRIC_KEYS) {
      const m = goalieMetric(key)!;
      const lo = m.quantiles["1"], hi = m.quantiles["99"];
      let prev = -Infinity;
      for (let i = 0; i <= 20; i++) {
        const v = lo + ((hi - lo) * i) / 20;
        const p = goaliePercentile(key, v)!;
        const oriented = m.higherIsBetter ? p : -p;
        expect(oriented, `${key} at ${v}`).toBeGreaterThanOrEqual(prev - 1e-9);
        prev = oriented;
      }
    }
  });

  it("clamps outside the tails rather than running past 100", () => {
    for (const key of GOALIE_METRIC_KEYS) {
      for (const v of [-1e6, 1e6]) {
        const p = goaliePercentile(key, v)!;
        expect(p, `${key} at ${v}`).toBeGreaterThanOrEqual(0);
        expect(p, `${key} at ${v}`).toBeLessThanOrEqual(100);
      }
    }
  });

  it("returns null rather than a confident 50 for anything it cannot rank", () => {
    expect(goaliePercentile("gsaxPer60", null)).toBeNull();
    expect(goaliePercentile("gsaxPer60", undefined)).toBeNull();
    expect(goaliePercentile("gsaxPer60", NaN)).toBeNull();
    expect(goaliePercentile("notAMetric", 5)).toBeNull();
  });
});

describe("goalie-percentiles — reliability", () => {
  it("reproduces the published stability at a full season, by construction", () => {
    for (const key of GOALIE_METRIC_KEYS) {
      const r = goalieMetric(key)!.stability.r;
      if (r <= 0) continue;
      expect(reliability(key, FULL_SEASON_SECONDS), key).toBeCloseTo(r, 6);
    }
  });

  it("says a full season of GSAx is mostly not signal", () => {
    // The headline finding: the metric G-NAV is built on carries about a
    // seventh of itself into the next year.
    expect(reliability("gsaxPer60", FULL_SEASON_SECONDS)).toBeLessThan(0.2);
    // While puck control repeats.
    expect(reliability("reboundsVsExpectedPer60", FULL_SEASON_SECONDS)).toBeGreaterThan(0.6);
  });

  it("rises with sample and never leaves 0-1", () => {
    for (const key of GOALIE_METRIC_KEYS) {
      let prev = -1;
      for (const mins of [0, 200, 600, 1200, 2400, 3500, 6000]) {
        const w = reliability(key, mins * 60);
        expect(w, key).toBeGreaterThanOrEqual(0);
        expect(w, key).toBeLessThanOrEqual(1);
        expect(w, `${key} @ ${mins}`).toBeGreaterThanOrEqual(prev);
        prev = w;
      }
    }
  });

  it("gives no weight to a metric with no recoverable signal", () => {
    // "We measured nothing" must not round up to "we measured a little".
    expect(reliability("gsaxPer60", 0)).toBe(0);
    expect(reliability("gsaxPer60", -5)).toBe(0);
    expect(reliability("gsaxPer60", null)).toBe(0);
    expect(reliability("notAMetric", FULL_SEASON_SECONDS)).toBe(0);
  });
});

describe("goalie-percentiles — regression toward the mean", () => {
  const ICE = FULL_SEASON_SECONDS;

  it("pulls an outlier season most of the way back for a noisy metric", () => {
    const m = goalieMetric("gsaxPer60")!;
    const hot = m.mean + 10 * m.sd;
    const out = regressedValue("gsaxPer60", hot, ICE)!;
    expect(out).toBeLessThan(hot);
    // r ≈ 0.13, so roughly seven-eighths of the excess should come off.
    expect(out - m.mean).toBeCloseTo((hot - m.mean) * m.stability.r, 4);
  });

  it("leaves a repeatable metric largely alone", () => {
    const m = goalieMetric("reboundsVsExpectedPer60")!;
    const good = m.mean - 2 * m.sd;
    const out = regressedValue("reboundsVsExpectedPer60", good, ICE)!;
    expect(Math.abs(out - m.mean)).toBeGreaterThan(Math.abs(good - m.mean) * 0.5);
  });

  it("collapses a tiny sample onto the population mean", () => {
    const m = goalieMetric("savePct")!;
    const out = regressedValue("savePct", 0.960, 60 * 60)!;
    expect(Math.abs(out - m.mean)).toBeLessThan(Math.abs(0.960 - m.mean) * 0.15);
  });

  it("never invents a value where there was none", () => {
    expect(regressedValue("savePct", null, ICE)).toBeNull();
    expect(regressedValue("notAMetric", 0.9, ICE)).toBeNull();
  });
});

describe("goalie-percentiles — plain language", () => {
  it("describes stability without printing a correlation", () => {
    expect(stabilityLabel("gsaxPer60")).toMatch(/barely repeats/);
    expect(stabilityLabel("reboundsVsExpectedPer60")).toMatch(/repeats strongly/);
    expect(stabilityLabel("notAMetric")).toBeNull();
  });

  it("has a label, unit and note for every metric", () => {
    for (const key of GOALIE_METRIC_KEYS) {
      const m = goalieMetric(key)!;
      expect(m.label, key).toBeTruthy();
      expect(m.unit, key).toBeTruthy();
      expect(m.note.length, key).toBeGreaterThan(20);
      expect(m.stability.pairs, key).toBeGreaterThan(50);
    }
  });
});
