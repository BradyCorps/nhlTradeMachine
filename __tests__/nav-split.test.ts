import { describe, it, expect } from "vitest";
import { navSplit, navSplitNote, type NavStage } from "@/app/lib/nav-breakdown";
import { calcNAV } from "@/app/lib/xnav-engine";

const c = (key: string, value: number): NavStage =>
  ({ key, label: key, value, kind: "component" });
const a = (key: string, value: number): NavStage =>
  ({ key, label: key, value, kind: "adjustment" });

describe("navSplit — the identity", () => {
  it("always sums to the rounded headline", () => {
    // The whole reason this lives beside reconcileStages. Two numbers on screen
    // that do not add up to the third is the bug T0-1 existed to close, and a
    // second decomposition must not reopen it.
    const cases: [NavStage[], number][] = [
      [[c("off", 120.4), c("def", 30.2), c("cap", -40.7), a("positional", 18.3)], 128.2],
      [[c("off", 12), c("cap", 88)], 100],
      [[c("off", -5), c("cap", -20), a("credibility", 3.5)], -21.5],
      [[c("impact", 40), c("cap", 12), a("youngFloor", 0), a("roleCeiling", -7)], 45],
      [[c("off", 0), c("cap", 0)], 0],
    ];
    for (const [stages, total] of cases) {
      const s = navSplit(stages, total);
      expect(s.production + s.contract, JSON.stringify(stages)).toBe(Math.round(total));
      expect(s.total).toBe(Math.round(total));
    }
  });

  it("returns integers, never fractions", () => {
    const s = navSplit([c("off", 100.6), c("cap", -33.3), a("positional", 9.1)], 76.4);
    expect(Number.isInteger(s.production)).toBe(true);
    expect(Number.isInteger(s.contract)).toBe(true);
  });

  it("says so when there is no breakdown rather than inventing one", () => {
    const s = navSplit([], 42);
    expect(s.known).toBe(false);
    expect(s.production).toBe(42);
    expect(s.contract).toBe(0);
    expect(navSplitNote(s)).toMatch(/no breakdown/i);
    expect(navSplit(undefined, 0).known).toBe(false);
  });
});

describe("navSplit — which half is which", () => {
  it("puts on-ice stages in production and the contract in contract", () => {
    const s = navSplit([c("off", 80), c("def", 20), c("age", 10), c("grav", 5), c("cap", -30)], 85);
    expect(s.production).toBe(115);
    expect(s.contract).toBe(-30);
  });

  it("counts the goalie cost-controlled floor as contract, not production", () => {
    // "Cheap years on a capable goalie carry value the surplus model
    // understates" — that is a fact about the deal, not about the goalie.
    const withFloor = navSplit([c("impact", 50), c("cap", 10), a("youngFloor", 20)], 80);
    const withoutFloor = navSplit([c("impact", 50), c("cap", 10)], 60);
    expect(withFloor.production).toBe(withoutFloor.production);
    expect(withFloor.contract).toBe(withoutFloor.contract + 20);
  });

  it("shares an adjustment between the two in proportion to what it acted on", () => {
    // Scarcity, development risk and the floor apply to the on-ice value and
    // the contract together, so neither owns them outright.
    const s = navSplit([c("off", 75), c("cap", 25), a("positional", 20)], 120);
    expect(s.production).toBe(90);   // 75 + 20 × 0.75
    expect(s.contract).toBe(30);     // 25 + 20 × 0.25
  });

  it("apportions by size, so a large negative contract does not invert it", () => {
    // Signed weights would give this a negative denominator and flip the split
    // inside out. Absolute weights keep both shares positive.
    const s = navSplit([c("off", 60), c("cap", -60), a("development", -20)], -20);
    expect(s.production).toBeLessThan(60);
    expect(s.contract).toBeLessThan(-60);
    expect(s.production + s.contract).toBe(-20);
  });

  it("gives an adjustment entirely to production when there is no contract stage", () => {
    const s = navSplit([c("prospect", 40), a("development", -10)], 30);
    expect(s.production).toBe(30);
    expect(s.contract).toBe(0);
  });
});

describe("navSplit — on real valuations", () => {
  const star = calcNAV({
    id: "s", name: "Star", position: "C", age: 28, capHit: 8, yearsRemaining: 4,
    ptsPace: 95, xGPace: 30, defRate: 0.1, avgTOI: 20, games: 78,
    baselinePtsPace: 92, baselineToiPerGame: 20, ops: 6, dps: 2, hasLiveStats: true,
  } as never);

  it("decomposes an engine valuation without drift", () => {
    const s = navSplit(star.stages, star.total);
    expect(s.known).toBe(true);
    expect(s.production + s.contract).toBe(Math.round(star.total));
  });

  it("separates a bargain from an albatross on identical play", () => {
    const shape = {
      id: "x", name: "X", position: "W" as const, age: 30, capHit: 2, yearsRemaining: 3,
      ptsPace: 55, xGPace: 18, defRate: 0.02, avgTOI: 17, games: 78,
      baselinePtsPace: 55, baselineToiPerGame: 17, hasLiveStats: true,
    };
    const cheap = navSplit(...(x => [x.stages, x.total] as const)(calcNAV(shape as never)));
    const dear = navSplit(...(x => [x.stages, x.total] as const)(
      calcNAV({ ...shape, id: "y", capHit: 9 } as never)));

    // Same player, so the on-ice reading barely moves; the contract carries the
    // whole difference. That is the point of showing them apart.
    expect(Math.abs(cheap.production - dear.production)).toBeLessThan(
      Math.abs(cheap.contract - dear.contract));
    expect(cheap.contract).toBeGreaterThan(dear.contract);
  });

  it("writes a note that blames the deal, not the player", () => {
    const costly = navSplit([c("off", 100), c("cap", -40)], 60);
    expect(navSplitNote(costly)).toMatch(/gives back 40/);
    expect(navSplitNote(costly)).not.toMatch(/bad|poor|worse/i);
    expect(navSplitNote(navSplit([c("off", 50), c("cap", 20)], 70))).toMatch(/adds 20/);
    expect(navSplitNote(navSplit([c("off", 50), c("cap", 0)], 50))).toMatch(/neither adds/);
  });
});
