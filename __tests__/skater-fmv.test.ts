import { describe, it, expect } from "vitest";
import artifact from "@/app/data/skater-fmv.json";
import {
  LEAGUE_MINIMUM_CAP_PCT,
  SKATER_FMV_VALIDATION,
  TOI_CAP,
  isInDomain,
  skaterFmvAav,
  skaterFmvCapPct,
  skaterFmvDomain,
  skaterFmvRange,
  unitForPosition,
  type SkaterFmvInput,
  type SkaterUnit,
} from "@/app/lib/skater-fmv";

const CAP = 104;
const UNITS: SkaterUnit[] = ["F", "D"];

/** A median-ish player of each unit, from the published domain. */
const typical = (unit: SkaterUnit, over: Partial<SkaterFmvInput> = {}): SkaterFmvInput => {
  const d = skaterFmvDomain(unit);
  return {
    pts60: d.pts60.p50,
    minutesPerGame: d.toi.p50 * 20,
    age: 27,
    isUfa: true,
    unit,
    ...over,
  };
};

describe("skater-fmv — the artifact", () => {
  it("carries no player rows and names its sources", () => {
    expect(JSON.stringify(artifact)).not.toMatch(/playerId/);
    for (const s of artifact.sources) expect((s as any).sha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("fitted forwards and defencemen separately, with real sample behind each", () => {
    for (const unit of UNITS) {
      expect(artifact.model.byPosition[unit].n, unit).toBeGreaterThan(400);
    }
  });

  it("walked forward rather than scoring its own training set", () => {
    for (const unit of UNITS) {
      const v = SKATER_FMV_VALIDATION[unit];
      expect(v.trainN, unit).toBeGreaterThan(300);
      expect(v.testN, unit).toBeGreaterThan(150);
      expect(v.r2, unit).toBeGreaterThan(0.35);
      expect(artifact.model.byPosition[unit].validation.inSample.r2, unit)
        .toBeGreaterThanOrEqual(v.r2);
    }
  });

  it("keeps the structural difference that justified splitting by position", () => {
    // A defenceman is paid more for minutes and less for points. If this ever
    // stops being true, the split has no reason to exist.
    const F = artifact.model.byPosition.F.coefficients;
    const D = artifact.model.byPosition.D.coefficients;
    expect(D.toi).toBeGreaterThan(F.toi);
    expect(D.pts60).toBeLessThan(F.pts60);
  });

  it("has coefficients whose signs make hockey sense, in both models", () => {
    for (const unit of UNITS) {
      const c = artifact.model.byPosition[unit].coefficients;
      expect(c.pts60, `${unit} production`).toBeGreaterThan(0);
      expect(c.toi, `${unit} deployment`).toBeGreaterThan(0);
      expect(c.age, `${unit} age`).toBeLessThan(0);
      // The sign that term broke — in the goalie fit and again here.
      expect(c.ufa, `${unit} unrestricted`).toBeGreaterThan(0);
    }
  });

  it("records that term was excluded, and that the reason replicated", () => {
    expect(artifact.excludedFeatures.term).toMatch(/endogenous/);
    expect(artifact.excludedFeatures.term).toMatch(/replicates|Two independent/i);
    for (const unit of UNITS) {
      expect(Object.keys(artifact.model.byPosition[unit].coefficients)).not.toContain("term");
    }
  });
});

describe("skater-fmv — pricing", () => {
  it("routes a position string to the right model", () => {
    expect(unitForPosition("D")).toBe("D");
    expect(unitForPosition("LD")).toBe("D");
    expect(unitForPosition("RD")).toBe("D");
    expect(unitForPosition(" d ")).toBe("D");
    expect(unitForPosition("C")).toBe("F");
    expect(unitForPosition("LW")).toBe("F");
    expect(unitForPosition(null)).toBe("F");
  });

  it("prices a median skater of each unit in a plausible band", () => {
    for (const unit of UNITS) {
      const aav = skaterFmvAav(typical(unit), CAP)!;
      expect(aav, unit).toBeGreaterThan(1);
      expect(aav, unit).toBeLessThan(6);
    }
  });

  it("puts a star well above a depth player", () => {
    for (const unit of UNITS) {
      const d = skaterFmvDomain(unit);
      const star = skaterFmvAav(typical(unit, { pts60: d.pts60.p95, minutesPerGame: d.toi.p95 * 20, age: 26 }), CAP)!;
      const depth = skaterFmvAav(typical(unit, { pts60: d.pts60.p5, minutesPerGame: d.toi.p5 * 20, age: 32 }), CAP)!;
      expect(star, unit).toBeGreaterThan(depth + 4);
    }
  });

  it("pays more for production, more for minutes, less for age", () => {
    for (const unit of UNITS) {
      const d = skaterFmvDomain(unit);
      expect(skaterFmvAav(typical(unit, { pts60: d.pts60.p95 }), CAP)!)
        .toBeGreaterThan(skaterFmvAav(typical(unit, { pts60: d.pts60.p5 }), CAP)!);
      expect(skaterFmvAav(typical(unit, { minutesPerGame: 22 }), CAP)!)
        .toBeGreaterThan(skaterFmvAav(typical(unit, { minutesPerGame: 12 }), CAP)!);
      expect(skaterFmvAav(typical(unit, { age: 24 }), CAP)!)
        .toBeGreaterThan(skaterFmvAav(typical(unit, { age: 35 }), CAP)!);
      expect(skaterFmvAav(typical(unit, { isUfa: true }), CAP)!)
        .toBeGreaterThan(skaterFmvAav(typical(unit, { isUfa: false }), CAP)!);
    }
  });

  it("is monotone in production across the fitted range", () => {
    for (const unit of UNITS) {
      const d = skaterFmvDomain(unit);
      let prev = -Infinity;
      for (let i = 0; i <= 20; i++) {
        const v = skaterFmvCapPct(typical(unit, {
          pts60: d.pts60.min + ((d.pts60.max - d.pts60.min) * i) / 20,
        }))!;
        expect(v, unit).toBeGreaterThanOrEqual(prev);
        prev = v;
      }
    }
  });

  it("never prices a skater below the league minimum", () => {
    // Linear extrapolation takes a depth forward negative; a contract cannot.
    for (const unit of UNITS) {
      const floorCase = typical(unit, { pts60: -50, minutesPerGame: 0, age: 40, isUfa: false });
      expect(skaterFmvCapPct(floorCase), unit).toBe(LEAGUE_MINIMUM_CAP_PCT);
      expect(skaterFmvAav(floorCase, CAP)!, unit).toBeGreaterThan(0.7);
    }
  });

  it("scales with the cap ceiling rather than fixing dollars", () => {
    const at104 = skaterFmvAav(typical("F"), 104)!;
    const at123 = skaterFmvAav(typical("F"), 123)!;
    expect(at123 / at104).toBeCloseTo(123 / 104, 6);
  });

  it("caps deployment so one outlier shift chart is not an outlier price", () => {
    const at32 = skaterFmvCapPct(typical("D", { minutesPerGame: 32 }))!;
    const atCap = skaterFmvCapPct(typical("D", { minutesPerGame: TOI_CAP * 20 }))!;
    expect(at32).toBe(atCap);
  });

  it("returns null rather than guessing when a required input is missing", () => {
    expect(skaterFmvCapPct(typical("F", { pts60: null }))).toBeNull();
    expect(skaterFmvCapPct(typical("F", { age: null }))).toBeNull();
    expect(skaterFmvCapPct(typical("F", { pts60: NaN }))).toBeNull();
    // Minutes degrade rather than fail — no recorded deployment is a fact.
    expect(skaterFmvCapPct(typical("F", { minutesPerGame: null }))).not.toBeNull();
  });
});

describe("skater-fmv — staying inside the fit", () => {
  it("publishes a sane domain, in the units the features are actually in", () => {
    // pts60 is per SIXTY MINUTES, not per 82 games. A forward median near 1.7
    // is the tell; anything near 80 means someone passed a season pace.
    const F = skaterFmvDomain("F");
    expect(F.pts60.p50).toBeGreaterThan(0.5);
    expect(F.pts60.p50).toBeLessThan(4);
    expect(F.pts60.max).toBeLessThan(10);
  });

  it("reports when an input is outside the fitted range", () => {
    expect(isInDomain(typical("F"))).toBe(true);
    // A per-82 points pace where a per-60 rate belongs.
    expect(isInDomain(typical("F", { pts60: 85 }))).toBe(false);
    expect(isInDomain(typical("F", { age: 60 }))).toBe(false);
    expect(isInDomain(typical("F", { pts60: null }))).toBe(false);
  });

  it("clamps rather than extrapolating into a confident absurdity", () => {
    const d = skaterFmvDomain("F");
    const atMax = skaterFmvAav(typical("F", { pts60: d.pts60.max }), CAP)!;
    const beyond = skaterFmvAav(typical("F", { pts60: 85 }), CAP)!;
    expect(beyond).toBe(atMax);
    expect(beyond).toBeLessThan(20);
  });
});

describe("skater-fmv — the range", () => {
  it("brackets the base price by what each model is actually wrong by", () => {
    for (const unit of UNITS) {
      const r = skaterFmvRange(typical(unit), CAP)!;
      expect(r.low).toBeLessThan(r.base);
      expect(r.base).toBeLessThan(r.high);
      expect(r.high - r.base).toBeCloseTo(SKATER_FMV_VALIDATION[unit].maeCapPct * CAP, 6);
    }
  });

  it("is wide enough to be honest", () => {
    // R² ~0.6 means a third of what a skater signs for is not in four numbers.
    const r = skaterFmvRange(typical("F"), CAP)!;
    expect(r.high - r.low).toBeGreaterThan(2);
  });

  it("never drops the low end below the league minimum", () => {
    const r = skaterFmvRange(typical("F", { pts60: 0.2, minutesPerGame: 8, age: 35 }), CAP)!;
    expect(r.low).toBeGreaterThanOrEqual(LEAGUE_MINIMUM_CAP_PCT * CAP);
  });

  it("returns null when the price does", () => {
    expect(skaterFmvRange(typical("F", { pts60: null }), CAP)).toBeNull();
  });
});
