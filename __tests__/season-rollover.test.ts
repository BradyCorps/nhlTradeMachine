import { describe, expect, it } from "vitest";
import {
  advanceSeason,
  breakoutOdds,
  retirementChance,
  type RolloverPlayer,
} from "../app/lib/season-rollover";

const player = (id: string, over: Partial<RolloverPlayer> = {}): RolloverPlayer => ({
  id,
  name: id,
  position: "C",
  age: 25,
  capHit: 5,
  yearsRemaining: 3,
  ptsPace: 60,
  baselinePtsPace: 60,
  ...over,
});

describe("retirementChance", () => {
  it("is zero for skaters under 35 and forced at 45", () => {
    expect(retirementChance(player("a", { age: 30 }))).toBe(0);
    expect(retirementChance(player("a", { age: 34 }))).toBe(0);
    expect(retirementChance(player("a", { age: 45 }))).toBe(1);
  });

  it("ramps monotonically with age", () => {
    let prev = 0;
    for (let age = 35; age <= 44; age++) {
      const c = retirementChance(player("a", { age, ptsPace: 40, capHit: 5 }));
      expect(c).toBeGreaterThanOrEqual(prev);
      prev = c;
    }
  });

  it("gives goalies a ~2-year-later clock", () => {
    const skater = retirementChance(player("a", { age: 36, position: "D", ptsPace: 40 }));
    const goalie = retirementChance(player("a", { age: 36, position: "G", ptsPace: 40 }));
    expect(goalie).toBeLessThan(skater);
  });

  it("lets stars linger and pushes fringe veterans out", () => {
    const star = retirementChance(player("a", { age: 38, ptsPace: 90, capHit: 10 }));
    const mid = retirementChance(player("a", { age: 38, ptsPace: 40, capHit: 4 }));
    const fringe = retirementChance(player("a", { age: 38, ptsPace: 10, capHit: 0.8 }));
    expect(star).toBeLessThan(mid);
    expect(fringe).toBeGreaterThan(mid);
  });
});

describe("breakoutOdds", () => {
  it("biases young players toward breakouts and older toward regression", () => {
    const young = breakoutOdds({ age: 21 }, false);
    const old = breakoutOdds({ age: 32 }, false);
    expect(young.breakout).toBeGreaterThan(old.breakout);
    expect(old.regression).toBeGreaterThan(young.regression);
  });

  it("boosts breakout odds for unlucky finishers (goals well under xG)", () => {
    const neutral = breakoutOdds({ age: 26, xGPace: 20, goalsPace: 20 }, false);
    const unlucky = breakoutOdds({ age: 26, xGPace: 20, goalsPace: 12 }, false);
    const hot = breakoutOdds({ age: 26, xGPace: 20, goalsPace: 28 }, false);
    expect(unlucky.breakout).toBeGreaterThan(neutral.breakout);
    expect(hot.regression).toBeGreaterThan(neutral.regression);
  });

  it("prefers the EDGE high-danger finishing delta over the xG heuristic", () => {
    // Unlucky by EDGE but hot by xG: EDGE wins — breakout boosted, not regression
    const edgeUnlucky = breakoutOdds({ age: 26, hdFinishingDelta: -0.04, xGPace: 20, goalsPace: 28 }, false);
    const xgOnlyHot = breakoutOdds({ age: 26, xGPace: 20, goalsPace: 28 }, false);
    expect(edgeUnlucky.breakout).toBeGreaterThan(xgOnlyHot.breakout);
    expect(edgeUnlucky.regression).toBeLessThan(xgOnlyHot.regression);
    // Running hot by EDGE → regression boosted
    const edgeHot = breakoutOdds({ age: 26, hdFinishingDelta: 0.05 }, false);
    expect(edgeHot.regression).toBeGreaterThan(breakoutOdds({ age: 26 }, false).regression);
  });

  it("doubles breakout odds on a change of scenery", () => {
    const stay = breakoutOdds({ age: 26 }, false);
    const moved = breakoutOdds({ age: 26 }, true);
    expect(moved.breakout).toBeCloseTo(stay.breakout * 2, 5);
  });
});

describe("advanceSeason", () => {
  const ctx = { seed: 42, year: 2027 };

  it("ages everyone one year and decrements contracts", () => {
    const res = advanceSeason([player("a", { age: 24, yearsRemaining: 3 })], ctx);
    expect(res.players[0].age).toBe(25);
    expect(res.players[0].yearsRemaining).toBe(2);
    expect(res.retired).toHaveLength(0);
    expect(res.expiring).toHaveLength(0);
  });

  it("flags just-expired deals as UFA at 27+, RFA younger", () => {
    const res = advanceSeason(
      [
        player("vet", { age: 28, yearsRemaining: 1 }),
        player("kid", { age: 22, yearsRemaining: 1 }),
        player("signed", { age: 28, yearsRemaining: 2 }),
      ],
      ctx,
    );
    const vet = res.players.find((p) => p.id === "vet")!;
    const kid = res.players.find((p) => p.id === "kid")!;
    const signed = res.players.find((p) => p.id === "signed")!;
    expect(vet.expiryStatus).toBe("UFA");
    expect(kid.expiryStatus).toBe("RFA");
    expect(signed.expiryStatus).toBeNull();
    expect(res.expiring.map((p) => p.id).sort()).toEqual(["kid", "vet"]);
  });

  it("is deterministic for the same seed and diverges for a different one", () => {
    const pool = Array.from({ length: 200 }, (_, i) =>
      player(`p${i}`, { age: 20 + (i % 20), ptsPace: 20 + (i % 60) }),
    );
    const a = advanceSeason(pool, { seed: 7, year: 2027 });
    const b = advanceSeason(pool, { seed: 7, year: 2027 });
    const c = advanceSeason(pool, { seed: 8, year: 2027 });
    expect(a).toEqual(b);
    expect(JSON.stringify(a.players)).not.toEqual(JSON.stringify(c.players));
  });

  it("retires a realistic share of an old cohort and none of a young one", () => {
    const olds = Array.from({ length: 300 }, (_, i) => player(`o${i}`, { age: 38, ptsPace: 30 }));
    const youngs = Array.from({ length: 300 }, (_, i) => player(`y${i}`, { age: 25 }));
    const oldRes = advanceSeason(olds, ctx);
    const youngRes = advanceSeason(youngs, ctx);
    expect(youngRes.retired).toHaveLength(0);
    // age becomes 39 pre-roll → ~45% chance each
    expect(oldRes.retired.length).toBeGreaterThan(80);
    expect(oldRes.retired.length).toBeLessThan(220);
  });

  it("rolls breakouts near the configured frequency for young skaters", () => {
    const pool = Array.from({ length: 2000 }, (_, i) => player(`p${i}`, { age: 21, ptsPace: 40 }));
    const res = advanceSeason(pool, ctx);
    const breakouts = res.events.filter((e) => e.type === "breakout").length;
    const regressions = res.events.filter((e) => e.type === "regression").length;
    // age 22 at roll time → 16% breakout / 6% regression
    expect(breakouts / 2000).toBeGreaterThan(0.11);
    expect(breakouts / 2000).toBeLessThan(0.21);
    expect(regressions / 2000).toBeGreaterThan(0.03);
    expect(regressions / 2000).toBeLessThan(0.10);
  });

  it("declines an aging scorer's pace on average and never goes negative", () => {
    const pool = Array.from({ length: 500 }, (_, i) => player(`p${i}`, { age: 35, ptsPace: 70, baselinePtsPace: 70 }));
    const res = advanceSeason(pool, ctx);
    const avg = res.players.reduce((s, p) => s + p.ptsPace, 0) / res.players.length;
    expect(avg).toBeLessThan(70);
    for (const p of res.players) expect(p.ptsPace).toBeGreaterThanOrEqual(0);
  });

  it("leaves goalies and paceless prospects untouched by pace regen", () => {
    const res = advanceSeason(
      [
        player("g", { position: "G", age: 28, ptsPace: 0 }),
        player("prospect", { age: 19, ptsPace: 0, prospectPtsPace: 55 }),
      ],
      ctx,
    );
    expect(res.players.find((p) => p.id === "g")!.ptsPace).toBe(0);
    const prospect = res.players.find((p) => p.id === "prospect")!;
    expect(prospect.ptsPace).toBe(0);
    expect(prospect.prospectPtsPace).toBe(55);
  });

  it("change-of-scenery players break out more often than stay-put twins", () => {
    const pool = Array.from({ length: 1500 }, (_, i) => player(`p${i}`, { age: 26, ptsPace: 45 }));
    const stay = advanceSeason(pool, { seed: 11, year: 2027 });
    const moved = advanceSeason(pool, { seed: 11, year: 2027, changeOfScenery: new Set(pool.map((p) => p.id)) });
    const stayBreakouts = stay.events.filter((e) => e.type === "breakout").length;
    const movedBreakouts = moved.events.filter((e) => e.type === "breakout").length;
    expect(movedBreakouts).toBeGreaterThan(stayBreakouts * 1.5);
  });
});

describe("progression ratchet — developing players compound a good season", () => {
  // Average the resulting baseline across seeds to wash out the breakout roll.
  const avgBaseline = (over: Parameters<typeof player>[1]) => {
    let sum = 0, n = 0;
    for (let s = 0; s < 300; s++) {
      const res = advanceSeason([player("p", over)], { seed: s, year: 2027 });
      if (res.players[0]) { sum += res.players[0].baselinePtsPace ?? 0; n++; }
    }
    return n ? sum / n : 0;
  };

  it("banks a developing riser's baseline UP toward his demonstrated pace", () => {
    // 20-yo proving a level above his baseline (45 pace vs 30 baseline).
    const young = avgBaseline({ age: 20, ptsPace: 45, baselinePtsPace: 30, yearsRemaining: 3 });
    expect(young).toBeGreaterThan(33); // ratchets clearly above the old 30 baseline
  });

  it("a developing riser banks more than an established vet with the same line", () => {
    const young = avgBaseline({ age: 20, ptsPace: 45, baselinePtsPace: 30, yearsRemaining: 3 });
    const vet   = avgBaseline({ age: 30, ptsPace: 45, baselinePtsPace: 30, yearsRemaining: 3 });
    expect(young).toBeGreaterThan(vet);
  });
});
