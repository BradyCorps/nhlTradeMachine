import { describe, it, expect } from "vitest";
import {
  COVERAGE_FLOOR,
  coverageIsThin,
  coverageLabel,
  measured,
  node,
  norm,
  strandCoverage,
  type StrandTrait,
} from "@/app/lib/strand-traits";

const spec = (value: number | null | undefined) => ({
  label: "NOIV", value, min: -12, max: 12,
  title: (v: number) => `xG% vs teammates: ${v.toFixed(1)}`,
  raw: (v: number) => `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`,
  absent: "On-ice xG relative to teammates unavailable",
});

describe("strand-traits — presence", () => {
  it("counts zero as a measurement", () => {
    // The whole bug was treating a missing value as a real one. The mirror
    // mistake — treating a real zero as missing — is just as wrong.
    expect(measured(0)).toBe(true);
    expect(measured(-3.2)).toBe(true);
  });

  it("does not count absence, or a number that is not one", () => {
    for (const v of [null, undefined, NaN, Infinity, -Infinity]) {
      expect(measured(v as number), String(v)).toBe(false);
    }
  });
});

describe("strand-traits — a node either measures something or says it did not", () => {
  it("scales a present value onto the rail", () => {
    const t = node(spec(6));
    expect(t.unavailable).toBeUndefined();
    expect(t.val).toBeCloseTo(0.75);
    expect(t.raw).toBe("+6.0%");
    expect(t.title).toContain("6.0");
  });

  it("marks a missing value unavailable instead of rendering 50", () => {
    for (const v of [null, undefined, NaN]) {
      const t = node(spec(v as number));
      expect(t.unavailable, String(v)).toBe(true);
      expect(t.title, String(v)).toBe("On-ice xG relative to teammates unavailable");
      // No raw figure to print — there was no figure.
      expect(t.raw, String(v)).toBeUndefined();
    }
  });

  it("says what is missing rather than just that something is", () => {
    expect(node(spec(null)).title).toMatch(/unavailable/i);
    expect(node(spec(null)).title!.length).toBeGreaterThan("unavailable".length);
  });

  it("parks an unavailable node mid-rail so the helix still has a coordinate", () => {
    // 0.5 is geometry. The node greys out and prints "—"; it is not a reading.
    expect(node(spec(null)).val).toBe(0.5);
  });

  it("clamps rather than running off the rail", () => {
    expect(node(spec(500)).val).toBe(1);
    expect(node(spec(-500)).val).toBe(0);
  });

  it("inverts when a low raw value is the good one", () => {
    const gaa = node({
      label: "GAA", value: 2.0, min: 2.0, max: 3.6, invert: true,
      title: v => `GAA ${v}`, absent: "GAA unavailable",
    });
    expect(gaa.val).toBe(1);
  });

  it("still reports unavailable when the node is inverted", () => {
    const gaa = node({
      label: "GAA", value: null, min: 2.0, max: 3.6, invert: true,
      title: v => `GAA ${v}`, absent: "GAA unavailable",
    });
    expect(gaa.unavailable).toBe(true);
    // Not 1 — an inverted missing value must not read as best in league.
    expect(gaa.val).toBe(0.5);
  });

  it("is a pure function of its input", () => {
    expect(node(spec(4))).toEqual(node(spec(4)));
  });
});

describe("strand-traits — norm", () => {
  it("maps the range onto 0-1 and clamps outside it", () => {
    expect(norm(0, 0, 10)).toBe(0);
    expect(norm(5, 0, 10)).toBe(0.5);
    expect(norm(10, 0, 10)).toBe(1);
    expect(norm(-5, 0, 10)).toBe(0);
    expect(norm(50, 0, 10)).toBe(1);
  });
});

describe("strand-traits — coverage", () => {
  const t = (unavailable?: boolean): StrandTrait => ({ label: "x", val: 0.5, unavailable });

  it("counts how much of a profile is real", () => {
    expect(strandCoverage([t(), t()], [t(true), t()])).toEqual({ measured: 3, total: 4 });
  });

  it("distinguishes a three-input player from a ten-input one", () => {
    // The thing that was impossible before: these two rendered identically.
    const thin = strandCoverage([t(), t(true), t(true), t(true), t(true)]);
    const full = strandCoverage([t(), t(), t(), t(), t()]);
    expect(thin).not.toEqual(full);
    expect(coverageLabel(thin)).toBe("1 of 5 measured");
    expect(coverageLabel(full)).toBeNull();
  });

  it("stays silent on a complete profile", () => {
    // A badge that always shows is one nobody reads.
    expect(coverageLabel({ measured: 10, total: 10 })).toBeNull();
  });

  it("says so plainly when nothing was measured", () => {
    expect(coverageLabel({ measured: 0, total: 10 })).toBe("No data");
    expect(coverageLabel({ measured: 0, total: 0 })).toBe("No data");
  });

  it("flags a profile that is mostly placeholder", () => {
    expect(coverageIsThin({ measured: 4, total: 10 })).toBe(true);
    expect(coverageIsThin({ measured: 5, total: 10 })).toBe(false);
    expect(coverageIsThin({ measured: 10, total: 10 })).toBe(false);
    expect(coverageIsThin({ measured: 0, total: 0 })).toBe(false);
    expect(COVERAGE_FLOOR).toBe(0.5);
  });

  it("handles an empty profile without dividing by zero", () => {
    expect(strandCoverage([])).toEqual({ measured: 0, total: 0 });
    expect(strandCoverage()).toEqual({ measured: 0, total: 0 });
  });
});
