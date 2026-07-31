import { describe, it, expect } from "vitest";
import artifact from "@/app/data/goalie-fmv.json";
import {
  FULL_SEASON_SECONDS,
  FMV_VALIDATION,
  LEAGUE_MINIMUM_CAP_PCT,
  goalieFmvAav,
  goalieFmvCapPct,
  goalieFmvRange,
  isInDomain,
  type GoalieFmvInput,
} from "@/app/lib/goalie-fmv";

const CAP = 104;
const starter = (over: Partial<GoalieFmvInput> = {}): GoalieFmvInput => ({
  gsax: 0.10, iceTimeSeconds: FULL_SEASON_SECONDS * 0.85, age: 27, isUfa: true, ...over,
});

describe("goalie-fmv — the artifact", () => {
  it("carries no player rows and names its sources", () => {
    const json = JSON.stringify(artifact);
    expect(json).not.toMatch(/playerId/);
    expect(artifact.sources.length).toBeGreaterThan(0);
    for (const s of artifact.sources) expect((s as any).sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("was fitted on real one-way standard contracts", () => {
    expect(artifact.population.fitted).toBeGreaterThan(150);
    expect(artifact.population.filter).toMatch(/1-Way/);
    expect(artifact.population.filter).toMatch(/STD/);
  });

  it("was validated by walking forward, not by scoring its own training set", () => {
    // The classic way a contract model looks good and predicts nothing.
    expect(FMV_VALIDATION.trainN).toBeGreaterThan(100);
    expect(FMV_VALIDATION.testN).toBeGreaterThan(40);
    expect(FMV_VALIDATION.r2).toBeGreaterThan(0.35);
    expect(artifact.validation.inSample.r2).toBeGreaterThan(FMV_VALIDATION.r2);
  });

  it("records why term was left out", () => {
    // The strongest correlate in the data, deliberately excluded. If a future
    // change adds it, this note should have to be rewritten first.
    expect(artifact.excludedFeatures.term).toMatch(/endogenous/);
    expect(Object.keys(artifact.model.coefficients)).not.toContain("term");
  });

  it("has coefficients whose signs make hockey sense", () => {
    const c = artifact.model.coefficients;
    expect(c.gsax, "better goalies cost more").toBeGreaterThan(0);
    expect(c.workload, "starters cost more than backups").toBeGreaterThan(0);
    expect(c.age, "older goalies cost less").toBeLessThan(0);
    // The sign that broke when term was included.
    expect(c.ufa, "unrestricted costs more than restricted").toBeGreaterThan(0);
  });
});

describe("goalie-fmv — pricing", () => {
  it("prices a mid-market starter in a plausible band", () => {
    const aav = goalieFmvAav(starter(), CAP)!;
    // The number this replaces was $2.71M for roughly this profile.
    expect(aav).toBeGreaterThan(3);
    expect(aav).toBeLessThan(9);
  });

  it("pays more for a better goalie", () => {
    const good = goalieFmvAav(starter({ gsax: 0.30 }), CAP)!;
    const poor = goalieFmvAav(starter({ gsax: -0.20 }), CAP)!;
    expect(good).toBeGreaterThan(poor);
  });

  it("pays more for a starter than a backup on the same rate", () => {
    const s = goalieFmvAav(starter({ iceTimeSeconds: FULL_SEASON_SECONDS }), CAP)!;
    const b = goalieFmvAav(starter({ iceTimeSeconds: FULL_SEASON_SECONDS * 0.25 }), CAP)!;
    expect(s).toBeGreaterThan(b);
  });

  it("pays less as a goalie ages", () => {
    expect(goalieFmvAav(starter({ age: 25 }), CAP)!)
      .toBeGreaterThan(goalieFmvAav(starter({ age: 36 }), CAP)!);
  });

  it("pays more to an unrestricted free agent than a restricted one", () => {
    expect(goalieFmvAav(starter({ isUfa: true }), CAP)!)
      .toBeGreaterThan(goalieFmvAav(starter({ isUfa: false }), CAP)!);
  });

  it("is monotone in rate across the whole plausible range", () => {
    let prev = -Infinity;
    for (let g = -0.6; g <= 0.6; g += 0.05) {
      const v = goalieFmvCapPct(starter({ gsax: g }))!;
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
  });

  it("never prices a goalie below the league minimum", () => {
    // A linear fit extrapolates to negative dollars; a contract cannot.
    const awful = goalieFmvCapPct(starter({ gsax: -5, iceTimeSeconds: 0, age: 42, isUfa: false }))!;
    expect(awful).toBe(LEAGUE_MINIMUM_CAP_PCT);
    expect(goalieFmvAav(starter({ gsax: -5, age: 42 }), CAP)!).toBeGreaterThan(0.7);
  });

  it("scales with the cap ceiling rather than fixing dollars", () => {
    // The whole reason the target is a share: a Cup Run moves the ceiling.
    const at104 = goalieFmvAav(starter(), 104)!;
    const at123 = goalieFmvAav(starter(), 123)!;
    expect(at123 / at104).toBeCloseTo(123 / 104, 6);
  });

  it("returns null rather than guessing when an input is missing", () => {
    expect(goalieFmvCapPct(starter({ gsax: null }))).toBeNull();
    expect(goalieFmvCapPct(starter({ age: null }))).toBeNull();
    expect(goalieFmvCapPct(starter({ gsax: NaN }))).toBeNull();
    // Ice time is the one that degrades rather than fails — a goalie with no
    // recorded workload is priced as having none, which is true.
    expect(goalieFmvCapPct(starter({ iceTimeSeconds: null }))).not.toBeNull();
  });
});

describe("goalie-fmv — the range", () => {
  it("brackets the base price by what the fit is actually wrong by", () => {
    const r = goalieFmvRange(starter(), CAP)!;
    expect(r.low).toBeLessThan(r.base);
    expect(r.base).toBeLessThan(r.high);
    expect(r.high - r.base).toBeCloseTo(FMV_VALIDATION.maeCapPct * CAP, 6);
  });

  it("is wide enough to be honest — over a million either way", () => {
    // R² 0.55 means a lot of what a goalie signs for is not in four numbers.
    // A band narrower than the model's own error would be a lie.
    const r = goalieFmvRange(starter(), CAP)!;
    expect(r.high - r.low).toBeGreaterThan(2);
  });

  it("never drops the low end below the league minimum", () => {
    const r = goalieFmvRange(starter({ gsax: -0.5, iceTimeSeconds: 0, age: 39 }), CAP)!;
    expect(r.low).toBeGreaterThanOrEqual(LEAGUE_MINIMUM_CAP_PCT * CAP);
  });

  it("returns null when the price does", () => {
    expect(goalieFmvRange(starter({ gsax: null }), CAP)).toBeNull();
  });
});

describe("goalie-fmv — staying inside the fit", () => {
  it("publishes the range each feature was fitted over", () => {
    for (const f of ["gsax", "workload", "age"] as const) {
      expect(artifact.model.featureDomain[f].min).toBeLessThan(artifact.model.featureDomain[f].max);
    }
    // The regressed GSAx span is an order of magnitude tighter than a raw one.
    expect(artifact.model.featureDomain.gsax.max).toBeLessThan(0.3);
  });

  it("reports when an input is outside it", () => {
    expect(isInDomain(starter())).toBe(true);
    // A RAW GSAx/60 where a regressed one belongs — the mistake this guards.
    expect(isInDomain(starter({ gsax: 0.30 }))).toBe(false);
    expect(isInDomain(starter({ age: 55 }))).toBe(false);
    expect(isInDomain(starter({ gsax: null }))).toBe(false);
  });

  it("clamps rather than extrapolating into a confident absurdity", () => {
    const atMax = goalieFmvAav(starter({ gsax: artifact.model.featureDomain.gsax.max }), CAP)!;
    const beyond = goalieFmvAav(starter({ gsax: 5 }), CAP)!;
    expect(beyond).toBe(atMax);
    expect(beyond).toBeLessThan(15);
  });
});
