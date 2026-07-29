import { describe, expect, it } from "vitest";
import {
  CONTENTION_THRESHOLDS,
  classifyContention,
  computeContention,
  PICK_FUTURE_WEIGHT,
} from "../app/armchair-gm/contention";
import type { Asset, XNAVResult } from "../app/lib/trade-types";

const nav = (total: number, upside = total * 0.4): XNAVResult =>
  ({ total, off: 0, def: 0, age: 0, cap: 0, upside }) as XNAVResult;

const player = (over: Partial<Asset> & { id: string }): Asset => ({
  teamId: "WPG", name: over.id, position: "C", age: 27, games: 82,
  ptsPace: 0, xGPace: 0, defRate: 0, avgTOI: 18, capHit: 4, yearsRemaining: 2,
  capCeiling: 95.5, hasNMC: false, hasNTC: false, canRetain: true, retainedPct: 0,
  multiplier: 1, round: 0, year: 0, teamStanding: 16, gsax: 0, savePct: 0,
  gamesStarted: 0, baselinePtsPace: 0, pkTimeShare: 0,
  ...over,
} as Asset);

/** A serviceable NHL roster so `present` is non-zero and stable. */
const baseRoster = (): Asset[] => [
  ...Array.from({ length: 8 }, (_, i) => player({ id: `f${i}`, position: "C" })),
  ...Array.from({ length: 5 }, (_, i) => player({ id: `d${i}`, position: "D" })),
  player({ id: "g0", position: "G" }),
];
const baseNav = (roster: Asset[]) =>
  Object.fromEntries(roster.map(p => [p.id, nav(120)])) as Record<string, XNAVResult>;

describe("classifyContention is the single source", () => {
  const T = CONTENTION_THRESHOLDS;

  it("calls a strong present with a future a contender", () => {
    expect(classifyContention(T.presentContender, T.futureOpen)).toBe("WIN_NOW");
  });

  it("calls a playoff present with a future an open window", () => {
    expect(classifyContention(T.presentPlayoff, T.futureOpen)).toBe("WINDOW_OPEN");
  });

  it("calls a strong present with a thin future win-now", () => {
    expect(classifyContention(T.presentPlayoff, T.futureOpen - 0.1)).toBe("WIN_NOW");
  });

  it("calls a weak present with a strong future a window opening", () => {
    expect(classifyContention(T.presentPlayoff - 0.1, T.futureOpening)).toBe("WINDOW_OPENING");
  });

  it("calls a weak present with a thin future a rebuild", () => {
    expect(classifyContention(0, 0)).toBe("REBUILDING");
  });

  // The chart used to draw its crosshair at 5.0/5.0 while the model split at
  // 6.5 and 5.5 — a club could sit in the "win now" half and be captioned
  // "Window Open". The thresholds must not be 5.0 across the board, or the
  // old crosshair was accidentally right and this test proves nothing.
  it("does not split at a single midpoint", () => {
    expect(T.presentContender).not.toBe(T.presentPlayoff);
    expect(T.futureOpening).not.toBe(T.futureOpen);
  });

  it("agrees with what computeContention reports", () => {
    const roster = baseRoster();
    const result = computeContention(roster, baseNav(roster));
    expect(result.quadrant).toBe(classifyContention(result.present, result.future));
  });
});

describe("future strength counts the assets that are the future", () => {
  it("credits draft picks", () => {
    const roster = baseRoster();
    const navMap = baseNav(roster);
    const withPicks = [
      ...roster,
      player({ id: "pick1", position: "Pick", round: 1, year: 2027 }),
      player({ id: "pick2", position: "Pick", round: 1, year: 2028 }),
    ];
    const navWithPicks = { ...navMap, pick1: nav(300), pick2: nav(300) };

    expect(computeContention(withPicks, navWithPicks).future)
      .toBeGreaterThan(computeContention(roster, navMap).future);
  });

  it("credits unproven youth the present rating cannot count", () => {
    const roster = baseRoster();
    const navMap = baseNav(roster);
    const withProspect = [...roster, player({ id: "kid", age: 20, games: 3 })];
    const navWithProspect = { ...navMap, kid: nav(60, 200) };

    const before = computeContention(roster, navMap);
    const after = computeContention(withProspect, navWithProspect);

    expect(after.future).toBeGreaterThan(before.future);
    // He has three games — he cannot help you win now.
    expect(after.present).toBe(before.present);
  });

  it("discounts a pick against a roster player, since he does not exist yet", () => {
    expect(PICK_FUTURE_WEIGHT).toBeGreaterThan(0);
    expect(PICK_FUTURE_WEIGHT).toBeLessThan(1);
  });

  it("leaves present strength untouched by picks", () => {
    const roster = baseRoster();
    const navMap = baseNav(roster);
    const withPick = [...roster, player({ id: "pick1", position: "Pick" })];
    expect(computeContention(withPick, { ...navMap, pick1: nav(400) }).present)
      .toBe(computeContention(roster, navMap).present);
  });

  it("still reports no data for an empty roster", () => {
    expect(computeContention([], {}).quadrant).toBe("REBUILDING");
  });
});
