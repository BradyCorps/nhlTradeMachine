import { describe, expect, it } from "vitest";
import {
  capUsedBefore, describeBreach, findCapBreaches,
  type CapLimits, type SidePayroll,
} from "../app/lib/cap-limits";

const LIMITS: CapLimits = { ceiling: 104, floor: 76.9 };

const side = (over: Partial<SidePayroll> = {}): SidePayroll => ({
  teamName: "Home", side: 0, capSpaceBefore: 10, capDelta: 0, ...over,
});

describe("capUsedBefore", () => {
  it("reads payroll off cap space against the ceiling", () => {
    expect(capUsedBefore(10, 104)).toBe(94);
    expect(capUsedBefore(0, 104)).toBe(104);
  });
});

describe("findCapBreaches — the ceiling", () => {
  it("flags a club taking on more than it can fit", () => {
    const [b] = findCapBreaches([side({ capSpaceBefore: 2, capDelta: 5 })], LIMITS);
    expect(b.kind).toBe("CEILING");
    expect(b.amount).toBeCloseTo(3);
    expect(b.causedByTrade).toBe(true);
  });

  it("clears a club that exactly fills its space", () => {
    expect(findCapBreaches([side({ capSpaceBefore: 5, capDelta: 5 })], LIMITS)).toEqual([]);
  });

  // The ceiling was already symmetric; this pins that it stays that way.
  it("checks the partner too", () => {
    const breaches = findCapBreaches([
      side({ capSpaceBefore: 10, capDelta: -10 }),                              // 94 -> 84, fine
      side({ teamName: "Partner", side: 1, capSpaceBefore: 1, capDelta: 10 }),  // 103 -> 113
    ], LIMITS);
    expect(breaches).toHaveLength(1);
    expect(breaches[0].side).toBe(1);
    expect(breaches[0].kind).toBe("CEILING");
  });
});

describe("findCapBreaches — the floor", () => {
  // The reported defect: the floor was checked for the home club only.
  it("flags a PARTNER dropped below the floor", () => {
    const breaches = findCapBreaches([
      side({ capSpaceBefore: 20, capDelta: 8 }),
      side({ teamName: "Partner", side: 1, capSpaceBefore: 26, capDelta: -8 }),
    ], LIMITS);
    expect(breaches).toHaveLength(1);
    expect(breaches[0].side).toBe(1);
    expect(breaches[0].kind).toBe("FLOOR");
  });

  // The old gate was `capDelta < -3`, so this club was cleared.
  it("flags a small shed that still crosses the floor", () => {
    // 78.0 used, sheds 2.0 -> 76.0, under a 76.9 floor.
    const [b] = findCapBreaches([side({ capSpaceBefore: 26, capDelta: -2 })], LIMITS);
    expect(b.kind).toBe("FLOOR");
    expect(b.amount).toBeCloseTo(0.9);
    expect(b.causedByTrade).toBe(true);
  });

  it("does not flag a big shed that stays above the floor", () => {
    // The $3M gate was never the question — crossing the floor is.
    expect(findCapBreaches([side({ capSpaceBefore: 0, capDelta: -20 })], LIMITS)).toEqual([]);
  });

  // A club under the floor for reasons of its own — LTIR, a thin roster, a data
  // gap — must not have every trade it makes flagged, including the ones that
  // add salary and climb back out.
  it("does not flag a club already below the floor that is adding salary", () => {
    expect(findCapBreaches([side({ capSpaceBefore: 34, capDelta: 5 })], LIMITS)).toEqual([]);
  });

  it("flags a club already below the floor that sheds more, and says so", () => {
    const [b] = findCapBreaches([side({ capSpaceBefore: 34, capDelta: -1 })], LIMITS);
    expect(b.kind).toBe("FLOOR");
    expect(b.causedByTrade).toBe(false);
    expect(describeBreach(b)).toContain("already under the cap floor");
  });

  it("cannot breach both ends at once", () => {
    for (const capDelta of [-30, -5, 0, 5, 30]) {
      for (const capSpaceBefore of [0, 5, 20, 30, 40]) {
        const breaches = findCapBreaches([side({ capSpaceBefore, capDelta })], LIMITS);
        expect(breaches.length, `space ${capSpaceBefore} delta ${capDelta}`).toBeLessThanOrEqual(1);
      }
    }
  });
});

describe("findCapBreaches — the limits are the ones passed in", () => {
  // The ceiling used the live admin value while the floor used a season
  // constant, so raising one for a what-if left the other describing a
  // different league.
  it("honours a raised floor", () => {
    const club = side({ capSpaceBefore: 20, capDelta: -2 });   // 82.0 after
    expect(findCapBreaches([club], LIMITS)).toEqual([]);
    const [b] = findCapBreaches([club], { ceiling: 104, floor: 85 });
    expect(b.kind).toBe("FLOOR");
    expect(b.amount).toBeCloseTo(3);
  });

  it("honours a raised ceiling", () => {
    // `capSpace` is measured AGAINST a ceiling — `buildTeamCapSpaceMap` computes
    // it as `ceiling - used` — so payroll is the invariant, not cap space. The
    // same club at $103M payroll has $1M of room under a 104 ceiling and $9M
    // under a 112 one; holding cap space fixed while moving the ceiling would
    // be describing a different club.
    expect(findCapBreaches([side({ capSpaceBefore: 1, capDelta: 5 })], LIMITS)[0].kind).toBe("CEILING");
    expect(findCapBreaches([side({ capSpaceBefore: 9, capDelta: 5 })], { ceiling: 112, floor: 76.9 }))
      .toEqual([]);
  });
});

describe("describeBreach", () => {
  it("distinguishes causing a breach from deepening one", () => {
    const caused = findCapBreaches([side({ capSpaceBefore: 2, capDelta: 5 })], LIMITS)[0];
    expect(describeBreach(caused)).toContain("puts Home");
    const deepened = findCapBreaches(
      [side({ capSpaceBefore: -2, capDelta: 3 })], LIMITS)[0];
    expect(describeBreach(deepened)).toContain("already over the ceiling");
  });

  it("quotes the amount past the limit", () => {
    const [b] = findCapBreaches([side({ capSpaceBefore: 2, capDelta: 5 })], LIMITS);
    expect(describeBreach(b)).toContain("$3.00M");
  });
});
