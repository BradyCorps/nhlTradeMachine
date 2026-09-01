// ── team-nav-split.test.ts ───────────────────────────────────────
//
// The League X-NAV chart lets the reader toggle a team's combined value into
// forwards / defense / goaltending. The load-bearing claim is that the three
// splits ARE the total — so the identity f + d + g === xnav is the thing most
// worth pinning, alongside the clamp and the position fold that make it hold.

import { describe, it, expect } from "vitest";
import { rosterNavByPosition } from "@/app/lib/team-nav-split";

describe("rosterNavByPosition", () => {
  it("splits by position and sums back to the total", () => {
    const split = rosterNavByPosition([
      { position: "C", nav: 100 },
      { position: "L", nav: 80 },
      { position: "R", nav: 60 },
      { position: "D", nav: 120 },
      { position: "D", nav: 40 },
      { position: "G", nav: 200 },
    ]);
    expect(split.f).toBe(240);
    expect(split.d).toBe(160);
    expect(split.g).toBe(200);
    expect(split.xnav).toBe(600);
    expect(split.f + split.d + split.g).toBe(split.xnav);
    // No negatives in this fixture, so the signed total agrees with X-NAV+.
    expect(split.signed).toEqual({ f: 240, d: 160, g: 200, total: 600 });
  });

  // A below-replacement player subtracts nothing from X-NAV+, matching the
  // chart's convention. Without the clamp, F+D+G would undershoot a total
  // that itself clamped — the two numbers would disagree on screen. `signed`
  // is the counterpart that does NOT clamp — the real total a below-
  // replacement contract actually drags down, for surfaces that aren't a bar
  // chart (NAV-01's "signed and positive-only totals must never share the
  // same label").
  it("clamps X-NAV+ to zero but keeps the real signed total negative", () => {
    const split = rosterNavByPosition([
      { position: "C", nav: 50 },
      { position: "C", nav: -30 },
      { position: "D", nav: -10 },
    ]);
    expect(split.f).toBe(50);
    expect(split.d).toBe(0);
    expect(split.xnav).toBe(50);
    expect(split.signed).toEqual({ f: 20, d: -10, g: 0, total: 10 });
  });

  // Wingers spelled "W", and any unexpected code, fold into forwards so no
  // rostered skater silently vanishes from the total.
  it("folds W and unknown codes into forwards", () => {
    const split = rosterNavByPosition([
      { position: "W", nav: 20 },
      { position: "F", nav: 10 },
      { position: "", nav: 5 },
    ]);
    expect(split.f).toBe(35);
    expect(split.d).toBe(0);
    expect(split.g).toBe(0);
    expect(split.xnav).toBe(35);
    expect(split.signed).toEqual({ f: 35, d: 0, g: 0, total: 35 });
  });

  it("treats null, undefined and NaN NAV as zero", () => {
    const split = rosterNavByPosition([
      { position: "C", nav: null },
      { position: "D", nav: undefined },
      { position: "G", nav: Number.NaN },
      { position: "C", nav: 12 },
    ]);
    expect(split).toEqual({
      xnav: 12, f: 12, d: 0, g: 0,
      signed: { f: 12, d: 0, g: 0, total: 12 },
    });
  });

  it("is all zeros for an empty roster", () => {
    expect(rosterNavByPosition([])).toEqual({
      xnav: 0, f: 0, d: 0, g: 0,
      signed: { f: 0, d: 0, g: 0, total: 0 },
    });
  });

  // The property that has to hold for any roster the page throws at it.
  it("keeps both identities across a randomized roster with real negatives", () => {
    const positions = ["C", "L", "R", "W", "D", "G", "F", "?"];
    const roster = Array.from({ length: 200 }, () => ({
      position: positions[Math.floor(Math.random() * positions.length)],
      nav: Math.round((Math.random() - 0.4) * 400),
    }));
    const split = rosterNavByPosition(roster);
    expect(split.f + split.d + split.g).toBe(split.xnav);
    expect(split.f).toBeGreaterThanOrEqual(0);
    expect(split.d).toBeGreaterThanOrEqual(0);
    expect(split.g).toBeGreaterThanOrEqual(0);
    // Signed total is its own independent sum — never clamped, and can (with
    // a (Math.random() - 0.4) skew toward negative NAV) legitimately go below
    // the always-nonnegative X-NAV+ total.
    expect(split.signed.f + split.signed.d + split.signed.g).toBe(split.signed.total);
    expect(split.signed.total).toBeLessThanOrEqual(split.xnav);
  });
});
