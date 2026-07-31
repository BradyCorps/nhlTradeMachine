// ── The X-NAV accounting identity ────────────────────────────────
//
// The single test the codebase was missing. 1,600 tests and not one asserted
// that the components a reader is shown add up to the headline they are shown
// beside — which is exactly how the dossier came to print six numbers under a
// total they could not produce.
//
// `nav-breakdown.test.ts` proves the rounding never breaks the sum. This proves
// the ENGINE hands over stages that genuinely explain the total, across every
// asset kind and every branch that moves the headline. Those are different
// claims, and only the pair of them is worth anything: the reconciler alone
// would paper over an engine that lies.

import { describe, it, expect } from "vitest";
import { calcNAV, applyTradeRequestDiscount, type AssetInput } from "@/app/lib/xnav-engine";
import { navStagesForDisplay, stageDrift, stagesReconcile } from "@/app/lib/nav-breakdown";

const skater = (over: Partial<AssetInput> = {}): AssetInput => ({
  id: "p1", name: "Test Skater", position: "C", age: 27,
  games: 82, ptsPace: 60, defRate: 0.08, avgTOI: 18,
  capHit: 5, yearsRemaining: 3,
  ...over,
} as AssetInput);

/** Every stage sums to the total, and the drawn integers sum to the drawn total. */
const expectIdentity = (asset: AssetInput, note: string) => {
  const nav = calcNAV(asset);
  expect(nav.stages, `${note}: no stages emitted`).toBeDefined();
  // Sub-unit drift is rounding noise the display absorbs. Anything larger is
  // the engine failing to account for itself.
  expect(Math.abs(stageDrift(nav.stages!, nav.total)), `${note}: drift`).toBeLessThan(1);
  const drawn = navStagesForDisplay(nav.stages, nav.total);
  expect(stagesReconcile(drawn, nav.total), `${note}: drawn rows do not sum`).toBe(true);
  return nav;
};

describe("X-NAV identity — skaters", () => {
  it("holds for an ordinary middle-six forward", () => {
    expectIdentity(skater(), "baseline");
  });

  it("holds through every branch that moves the headline", () => {
    const cases: [string, Partial<AssetInput>][] = [
      // Positional scarcity
      ["centre premium",      { position: "C" }],
      ["top-pair D premium",  { position: "D", avgTOI: 24, ptsPace: 45 }],
      ["winger, no premium",  { position: "W" }],
      // Development discount, and each of its reliefs
      ["21yo ELC",            { age: 21, games: 30, capHit: 0.95, ptsPace: 35 }],
      ["23yo, games relief",  { age: 23, games: 170, ptsPace: 40, avgTOI: 16 }],
      ["24yo, generational",  { age: 24, ptsPace: 95 }],
      // Franchise floor, both qualifying shapes and the sample gate
      ["elite forward floor", { age: 29, ptsPace: 100, games: 80 }],
      ["young elite floor",   { age: 23, ptsPace: 105, games: 78 }],
      ["elite D floor",       { position: "D", age: 28, ptsPace: 70, avgTOI: 24, games: 80 }],
      ["floor gated by GP",   { age: 29, ptsPace: 100, games: 3 }],
      // Thin-sample credibility
      ["1 GP phantom",        { games: 1, ptsPace: 82 }],
      ["14 GP, no pedigree",  { games: 14, ptsPace: 60 }],
      ["14 GP, drafted",      { games: 14, ptsPace: 60, age: 21, draftOverall: 4 }],
      // Contract shapes
      ["negative surplus",    { capHit: 11.5, ptsPace: 30 }],
      ["expiring",            { yearsRemaining: 0 }],
      ["retention",           { capHit: 8, retainedPct: 0.5 } as Partial<AssetInput>],
      ["asset multiplier",    { multiplier: 1.3 } as Partial<AssetInput>],
      // Degenerate
      ["zero everything",     { ptsPace: 0, games: 0, avgTOI: 0, capHit: 0, yearsRemaining: 0 }],
      ["ancient depth",       { age: 39, ptsPace: 12, avgTOI: 9 }],
    ];
    for (const [note, over] of cases) expectIdentity(skater(over), note);
  });

  it("holds across a sweep of the whole plausible input space", () => {
    // Branch lists go stale as the engine grows; this does not.
    let seed = 11;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    const pick = <T,>(xs: T[]) => xs[Math.floor(rand() * xs.length)];
    for (let i = 0; i < 500; i++) {
      expectIdentity(skater({
        position: pick(["C", "W", "D"]),
        age: 18 + Math.floor(rand() * 22),
        games: Math.floor(rand() * 82),
        ptsPace: rand() * 120,
        avgTOI: rand() * 26,
        capHit: rand() * 14,
        yearsRemaining: Math.floor(rand() * 8),
        ops: rand() * 8,
        dps: rand() * 4,
        qocIndex: rand() * 100,
        xgRelTM: (rand() - 0.5) * 20,
      } as Partial<AssetInput>), `sweep ${i}`);
    }
  });
});

describe("X-NAV identity — goalies, picks, prospects", () => {
  const goalie = (over: Partial<AssetInput> = {}): AssetInput => ({
    id: "g1", name: "Test Goalie", position: "G", age: 27,
    games: 55, gamesStarted: 55, defRate: 0, avgTOI: 60, ptsPace: 0,
    capHit: 5, yearsRemaining: 3, savePct: 0.912, gsax: 8, shotsPerGame: 29,
    ...over,
  } as AssetInput);

  it("holds for starters, tandems and backups", () => {
    for (const [note, over] of [
      ["starter",          { gamesStarted: 60 }],
      ["tandem",           { gamesStarted: 42 }],
      ["backup",           { gamesStarted: 20 }],
      ["ascending young",  { age: 24, gamesStarted: 40, capHit: 2.0, gsax: 14 }],
      ["cost-controlled",  { age: 23, gamesStarted: 52, capHit: 1.0 }],
      ["no NHL signal",    { games: 0, gamesStarted: 0, savePct: undefined, gsax: undefined }],
    ] as [string, Partial<AssetInput>][]) {
      expectIdentity(goalie(over), `goalie ${note}`);
    }
  });

  it("states the role ceiling as a row instead of hiding it in the headline", () => {
    // An elite starter clamped to 250 must show WHY he stopped there — this is
    // the line that makes two tied goalies explicable.
    const elite = calcNAV(goalie({ gamesStarted: 62, gsax: 32, savePct: 0.930, capHit: 1.0, age: 25 }));
    const ceiling = elite.stages?.find(s => s.key === "roleCeiling");
    expect(ceiling).toBeDefined();
    if (elite.total >= 250) expect(ceiling!.value).toBeLessThan(0);
  });

  it("holds for draft picks at every round and horizon", () => {
    for (const round of [1, 2, 3, 4, 5, 6, 7]) {
      for (const year of [2027, 2028, 2029]) {
        expectIdentity(
          { id: `pk-${round}-${year}`, name: "Pick", position: "Pick", round, year, teamStanding: 16 } as AssetInput,
          `pick r${round} ${year}`,
        );
      }
    }
  });

  it("holds for a prospect valued off draft pedigree", () => {
    expectIdentity(skater({ age: 19, games: 2, draftOverall: 3, prospectPtsPace: 55, capHit: 0.95 }), "prospect");
  });
});

describe("X-NAV identity — adjustments applied after the engine", () => {
  it("survives the trade-request discount", () => {
    const asset = skater({ ptsPace: 85, games: 80, tradeBlockStatus: "requested" } as Partial<AssetInput>);
    const discounted = applyTradeRequestDiscount(calcNAV(asset), asset);
    expect(Math.abs(stageDrift(discounted.stages!, discounted.total))).toBeLessThan(1);
    expect(stagesReconcile(navStagesForDisplay(discounted.stages, discounted.total), discounted.total)).toBe(true);
  });

  it("charges the discount to leverage, not to the player's contract", () => {
    // It used to be subtracted from `cap`, which said the contract got worse
    // because the player asked out. It did not.
    const asset = skater({ ptsPace: 85, games: 80, tradeBlockStatus: "requested" } as Partial<AssetInput>);
    const before = calcNAV(asset);
    const after = applyTradeRequestDiscount(before, asset);
    expect(after.total).toBeLessThan(before.total);
    expect(after.cap).toBe(before.cap);
    expect(after.stages!.find(s => s.key === "leverage")!.value).toBeLessThan(0);
  });

  it("leaves a player nobody has asked to move untouched", () => {
    const asset = skater({ ptsPace: 85, games: 80 });
    const nav = calcNAV(asset);
    expect(applyTradeRequestDiscount(nav, asset)).toBe(nav);
  });
});

describe("X-NAV identity — the specific defects this closes", () => {
  const elite = skater({ age: 28, ptsPace: 105, games: 80, capHit: 12.5, avgTOI: 21 });

  it("no longer double-counts the age curve as upside", () => {
    // `upside` was `max(0, ageTotal) + teamControlValue`, and the panel printed
    // AGE beside it. It carries only team control now, and is not a stage.
    const nav = calcNAV(skater({ age: 22, games: 70, ptsPace: 55, capHit: 0.95 }));
    expect(nav.stages!.some(s => s.key === "upside")).toBe(false);
    const age = nav.stages!.find(s => s.key === "age")!.value;
    if (age > 0) expect(nav.upside).not.toBe(Math.round(age + nav.upside));
  });

  it("puts the defensive value the total used in the breakdown, not the rating", () => {
    const nav = calcNAV(skater({ position: "D", avgTOI: 23, ptsPace: 50, games: 78, xgaRelTM: -1.2, dps: 3.5 } as Partial<AssetInput>));
    const stageDef = nav.stages!.find(s => s.key === "def")!.value;
    // They are allowed to coincide; what matters is that the stage tracks the
    // total. Swapping in `nav.def` must break the identity or the two are the
    // same number and nothing is at stake.
    const swapped = nav.stages!.map(s => s.key === "def" ? { ...s, value: nav.def } : s);
    if (Math.round(stageDef) !== Math.round(nav.def)) {
      expect(Math.abs(stageDrift(swapped, nav.total))).toBeGreaterThanOrEqual(1);
    }
  });

  it("names the hidden transformations rather than leaving a plug row", () => {
    const nav = calcNAV(elite);
    const keys = new Set(nav.stages!.map(s => s.key));
    for (const k of ["positional", "development", "franchiseFloor", "credibility"]) {
      expect(keys, k).toContain(k);
    }
  });

  it("explains a franchise-floored player's headline entirely", () => {
    // The floor was the largest single unexplained jump in the old panel.
    const nav = expectIdentity(skater({ age: 29, ptsPace: 110, games: 80, capHit: 13.5 }), "floored");
    const floor = nav.stages!.find(s => s.key === "franchiseFloor")!;
    expect(floor.value).toBeGreaterThanOrEqual(0);
  });
});
