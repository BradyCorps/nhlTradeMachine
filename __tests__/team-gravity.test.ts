// ── team-gravity.test.ts ─────────────────────────────────────────
//
// The team gravity contour is only honest if its field is the mean of the
// roster's qualified skaters — unqualified profiles excluded, not counted as
// zeros that would drag the shape toward the middle of the rink.

import { describe, it, expect } from "vitest";
import { aggregateTeamGravity, type TeamGravityInput } from "@/app/lib/team-gravity";

const p = (oz: number, nz: number, dz: number, force: number, qualified = true): TeamGravityInput =>
  ({ masses: { oz, nz, dz }, force, qualified });

describe("aggregateTeamGravity", () => {
  it("averages masses and force across qualified skaters", () => {
    const agg = aggregateTeamGravity([
      p(0.4, 0.2, 0.1, 0.30),
      p(0.2, 0.0, 0.3, 0.10),
    ])!;
    expect(agg.masses.oz).toBeCloseTo(0.3, 6);
    expect(agg.masses.nz).toBeCloseTo(0.1, 6);
    expect(agg.masses.dz).toBeCloseTo(0.2, 6);
    expect(agg.force).toBeCloseTo(0.2, 6);
    expect(agg.count).toBe(2);
  });

  // An unqualified player is missing evidence, not a zero-gravity player;
  // folding it in as a zero would flatten every team toward the origin.
  it("excludes unqualified profiles from the mean and the count", () => {
    const agg = aggregateTeamGravity([
      p(0.6, 0.4, 0.2, 0.40),
      p(0.0, 0.0, 0.0, 0.00, false),
    ])!;
    expect(agg.masses).toEqual({ oz: 0.6, nz: 0.4, dz: 0.2 });
    expect(agg.count).toBe(1);
  });

  it("returns null when no skater qualifies", () => {
    expect(aggregateTeamGravity([])).toBeNull();
    expect(aggregateTeamGravity([p(0.5, 0.5, 0.5, 0.5, false)])).toBeNull();
  });

  it("preserves sign — a suppression-heavy roster stays negative", () => {
    const agg = aggregateTeamGravity([
      p(-0.3, -0.1, 0.5, -0.10),
      p(-0.1, -0.3, 0.4, -0.20),
    ])!;
    expect(agg.masses.oz).toBeLessThan(0);
    expect(agg.masses.dz).toBeGreaterThan(0);
    expect(agg.force).toBeCloseTo(-0.15, 6);
  });
});
