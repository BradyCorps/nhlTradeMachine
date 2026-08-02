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
  skaterFmvDomainReport,
  skaterFmvRange,
  domainNote,
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

describe("skater-fmv — what the clamp cost", () => {
  const F = (over: Partial<SkaterFmvInput> = {}): SkaterFmvInput =>
    ({ pts60: 2.2, minutesPerGame: 18, age: 27, isUfa: true, unit: "F", ...over });

  it("says nothing when nothing needed clamping", () => {
    const r = skaterFmvDomainReport(F());
    expect(r.inDomain).toBe(true);
    expect(r.priceable).toBe(true);
    expect(r.findings).toHaveLength(0);
    expect(r.withheldCapPct).toBe(0);
    expect(domainNote(F(), CAP)).toBeNull();
  });

  it("names the feature that was clamped, and which way", () => {
    const r = skaterFmvDomainReport(F({ age: 18 }));
    expect(r.findings).toHaveLength(1);
    expect(r.findings[0].feature).toBe("age");
    expect(r.findings[0].direction).toBe("below");
    expect(r.findings[0].value).toBe(18);
    expect(r.findings[0].clampedTo).toBe(skaterFmvDomain("F").age.min);
  });

  it("reports deployment in minutes, not in the ratio the model uses", () => {
    // The `toi` feature is minutes ÷ 20. A reader shown 1.39 learns nothing.
    const r = skaterFmvDomainReport(F({ minutesPerGame: 40 }));
    const toi = r.findings.find(f => f.feature === "toi")!;
    expect(toi.value).toBeGreaterThan(20);
    expect(toi.clampedTo).toBeCloseTo(skaterFmvDomain("F").toi.max * 20, 6);
  });

  it("treats an eighteen-year-old as a footnote rather than an alarm", () => {
    // The case that was called a blocker. Clamping age 18 to the fitted floor
    // of 20 withholds about $0.3M — a fifth of the model's own error.
    const r = skaterFmvDomainReport(F({ age: 18, unit: "D" }));
    expect(r.inDomain).toBe(false);
    expect(r.material).toBe(false);
    expect(Math.abs(r.withheldCapPct) * CAP).toBeLessThan(0.5);
  });

  it("treats a mis-scaled production input as an alarm", () => {
    // A per-82 pace where a per-sixty rate belongs — the unit trap that clamped
    // every goalie to the domain ceiling before it was caught.
    const r = skaterFmvDomainReport(F({ pts60: 85 }));
    expect(r.material).toBe(true);
    expect(Math.abs(r.withheldCapPct) * CAP).toBeGreaterThan(50);
  });

  it("draws the line at the model's own walk-forward error", () => {
    for (const unit of UNITS) {
      const mae = SKATER_FMV_VALIDATION[unit].maeCapPct;
      const d = skaterFmvDomain(unit);
      const coef = artifact.model.byPosition[unit].coefficients.pts60;
      // Just inside the error, then just outside it.
      const small = skaterFmvDomainReport({ ...F({ unit }), pts60: d.pts60.max + (mae * 0.5) / coef });
      const large = skaterFmvDomainReport({ ...F({ unit }), pts60: d.pts60.max + (mae * 2) / coef });
      expect(small.material, unit).toBe(false);
      expect(large.material, unit).toBe(true);
    }
  });

  it("adds up several clamps rather than reporting only the first", () => {
    const r = skaterFmvDomainReport(F({ pts60: 85, age: 18, minutesPerGame: 40 }));
    expect(r.findings.map(f => f.feature).sort()).toEqual(["age", "pts60", "toi"]);
    expect(r.withheldCapPct).toBeCloseTo(r.findings.reduce((s, f) => s + f.withheldCapPct, 0), 12);
  });

  it("agrees with the price it is describing", () => {
    // Report and pricing share one clamp. If they ever diverge, a caption would
    // vouch for a number that was computed some other way.
    const clamped = F({ pts60: 85 });
    const atMax = F({ pts60: skaterFmvDomain("F").pts60.max });
    expect(skaterFmvAav(clamped, CAP)).toBe(skaterFmvAav(atMax, CAP));
    expect(skaterFmvDomainReport(atMax).inDomain).toBe(true);
  });

  it("distinguishes 'clamped' from 'cannot price at all'", () => {
    const missing = skaterFmvDomainReport(F({ pts60: null }));
    expect(missing.priceable).toBe(false);
    expect(missing.inDomain).toBe(false);
    expect(skaterFmvCapPct(F({ pts60: null }))).toBeNull();
    expect(domainNote(F({ pts60: null }), CAP)).toMatch(/[Nn]ot enough/);
  });

  it("writes a caption a reader can act on, in both registers", () => {
    const footnote = domainNote(F({ age: 18 }), CAP)!;
    expect(footnote).toMatch(/age/i);
    expect(footnote).toMatch(/\$0\.\d\dM/);
    expect(footnote).not.toMatch(/domain/i);

    const alarm = domainNote(F({ pts60: 85 }), CAP)!;
    expect(alarm).toMatch(/bound rather than a read/);
  });

  it("keeps the boolean honest for callers that only want one", () => {
    expect(isInDomain(F())).toBe(true);
    expect(isInDomain(F({ age: 18 }))).toBe(false);
    expect(isInDomain(F({ pts60: null }))).toBe(false);
  });
});
