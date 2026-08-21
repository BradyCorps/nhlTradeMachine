// ── export-profiles.test.ts ──────────────────────────────────────
//
// The export must emit profiles the SHIPPED validator accepts — otherwise the
// artifact the app loads is a lie. The headline test builds a profile from
// fitted coefficients and runs it through the real validateGravityProfileV4.
// The rest pin the conventions a sign or unit slip would corrupt: the DZ flip
// (negative defense → positive prevention, interval reversed), net = OZ + DZ,
// NZ marked missing, and the schema's refusal to tier an NZ-less profile.

import { describe, it, expect } from "vitest";
import { buildGravityProfileV4, percentileOf, type ProfileInput } from "@/scripts/gravity-v4/profile-builder";
import { validateGravityProfileV4 } from "@/app/lib/gravity-v4/validate-profile";

const input = (over: Partial<ProfileInput> = {}): ProfileInput => ({
  playerId: "8478402",
  playerName: "Test Skater",
  position: "D",
  season: "2025-26",
  gravity60: 0.10,
  defense60: -0.06,                                  // negative = suppresses
  toiMin: 800,
  gravityInterval60: { lo: 0.02, hi: 0.18 },
  defenseInterval60: { lo: -0.09, hi: -0.03 },       // raw (negative) CI
  ozPositionPct: 88,
  ozLeaguePct: 85,
  dzPositionPct: 91,
  dzLeaguePct: 90,
  reliability: "MEDIUM",
  scales: { zoneXg82: 2, netXg82: 3 },
  min82: 1000,
  trainedAt: "2026-08-21T00:00:00.000Z",
  trainingSeasons: ["2025-26"],
  sourceVersion: "unit-test",
  ...over,
});

describe("buildGravityProfileV4", () => {
  it("emits a profile the shipped validator accepts", () => {
    const profile = buildGravityProfileV4(input());
    const result = validateGravityProfileV4(profile, { playerId: "8478402", season: "2025-26" });
    expect(result.ok).toBe(true);
  });

  it("flips DZ to positive-for-prevention and reverses the interval", () => {
    const p = buildGravityProfileV4(input());
    const F = 1000 / 60;
    expect(p.zones.dz.xg60).toBeCloseTo(0.06, 9);             // −(−0.06)
    expect(p.zones.dz.xg82).toBeCloseTo(0.06 * F, 6);
    // Raw defense CI [−0.09, −0.03] flips to a positive, ordered prevention CI.
    expect(p.zones.dz.interval!.low).toBeCloseTo(0.03 * F, 6);
    expect(p.zones.dz.interval!.high).toBeCloseTo(0.09 * F, 6);
    expect(p.zones.dz.interval!.low).toBeLessThan(p.zones.dz.interval!.high);
  });

  it("nets the two measured wells unweighted (NZ = 0)", () => {
    const p = buildGravityProfileV4(input());
    expect(p.netXg60).toBeCloseTo(0.10 + 0.06, 9);
    expect(p.netXg82).toBeCloseTo(p.zones.oz.xg82 + p.zones.dz.xg82, 9);
    expect(p.zones.nz.xg82).toBe(0);
  });

  it("marks NZ missing and refuses a public tier", () => {
    const p = buildGravityProfileV4(input());
    expect(p.transitionDataQuality).toBe("missing");
    expect(p.zones.nz.dataQuality).toBe("insufficient");
    expect(p.zones.nz.sampleMinutes).toBe(0);
    expect(p.tier).toBeNull();
    // And the schema enforces it: forcing a tier onto this profile is rejected.
    const forced = { ...p, tier: "STAR" as const };
    const result = validateGravityProfileV4(forced);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.issues.some(i => i.path === "tier")).toBe(true);
  });

  it("derives displayForce from net and the stored scale (bounded)", () => {
    const p = buildGravityProfileV4(input());
    expect(p.displayForce).toBeCloseTo(Math.tanh(p.netXg82 / 3), 9);
    expect(Math.abs(p.displayForce)).toBeLessThan(1);
  });

  it("omits intervals when no bootstrap is supplied (still valid)", () => {
    const p = buildGravityProfileV4(input({ gravityInterval60: null, defenseInterval60: null }));
    expect(p.zones.oz.interval).toBeNull();
    expect(p.zones.dz.interval).toBeNull();
    expect(validateGravityProfileV4(p).ok).toBe(true);   // insufficient ⇒ intervals optional
  });
});

describe("percentileOf", () => {
  it("is the share of the population strictly below the value", () => {
    expect(percentileOf([1, 2, 3, 4], 3)).toBe(50);
    expect(percentileOf([1, 2, 3], 0.5)).toBe(0);
    expect(percentileOf([1, 2, 3], 5)).toBe(100);
    expect(percentileOf([], 1)).toBe(0);
  });
});
