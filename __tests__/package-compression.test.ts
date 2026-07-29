import { describe, expect, it } from "vitest";
import { calcPickNAV, compressPackage } from "../app/lib/xnav-engine";
import { buildTradeQueryString, parseTradeQueryState } from "../app/lib/trade-share";
import { ageDecayRate, ageSlotPenalty } from "../app/lib/season-config";

/**
 * The reimplementation the Armchair GM bench used to carry (CX8).
 *
 * Kept here, and only here, to prove the defect it caused. It sums decay and
 * slot penalties separately and clamps the difference ONCE; the engine clamps
 * each marginal asset at zero. The two agree until a secondary asset's
 * marginal value goes negative, at which point the copy lets that asset's
 * penalty eat into the value of the players around it.
 */
function legacyCompressBlock(assets: { nav: number; isPick?: boolean; age?: number }[]): number {
  if (assets.length === 0) return 0;
  const picks = assets.filter(a => a.isPick);
  const players = assets.filter(a => !a.isPick);
  const pickValue = picks.reduce((s, a) => s + a.nav, 0);
  if (players.length === 0) return pickValue;
  const sorted = [...players]
    .map(a => ({ nav: a.nav, age: a.age ?? 27 }))
    .sort((a, b) => b.nav - a.nav);
  let decaySum = 0, penaltySum = 0;
  sorted.forEach((a, i) => {
    decaySum += a.nav * Math.pow(ageDecayRate(a.age), i);
    if (i > 0) penaltySum += ageSlotPenalty(a.age);
  });
  return pickValue + Math.max(0, decaySum - penaltySum);
}

const p = (nav: number, age = 27) => ({ nav, age, isPick: false });
const pick = (nav: number) => ({ nav, isPick: true });

describe("compressPackage is the one canonical model", () => {
  it("clamps each marginal asset rather than the package total", () => {
    // A low-value veteran's slot penalty exceeds his decayed value. The engine
    // drops him to zero; he must not reduce the package below the star alone.
    const star = p(140, 26);
    const filler = p(4, 35);
    expect(compressPackage([star, filler])).toBeGreaterThanOrEqual(compressPackage([star]));
  });

  // This is the divergence the audit reported: the TugBar and the verdict
  // quoted different numbers for the same trade.
  it("differs from the old bench copy on exactly that case", () => {
    const assets = [p(140, 26), p(4, 35)];
    expect(legacyCompressBlock(assets)).toBeLessThan(compressPackage(assets));
  });

  it("agrees with the old copy when every asset carries positive margin", () => {
    // Which is why the drift went unnoticed — the common case matched.
    const assets = [p(120, 25), p(90, 26)];
    expect(legacyCompressBlock(assets)).toBeCloseTo(compressPackage(assets), 6);
  });

  it("never lets adding a player reduce a package's value", () => {
    const base = [p(100, 27)];
    for (const extra of [p(1, 38), p(0, 35), p(-20, 33), p(60, 24)]) {
      expect(compressPackage([...base, extra]), `${extra.nav}@${extra.age}`)
        .toBeGreaterThanOrEqual(compressPackage(base));
    }
  });

  it("passes picks through undecayed — they occupy no roster slot", () => {
    expect(compressPackage([pick(30), pick(20)])).toBe(50);
  });

  it("adds pick value on top of the compressed player value", () => {
    const players = [p(100, 27), p(50, 27)];
    expect(compressPackage([...players, pick(25)]))
      .toBeCloseTo(compressPackage(players) + 25, 6);
  });

  it("leaves a single player uncompressed", () => {
    expect(compressPackage([p(87, 31)])).toBe(87);
  });

  it("returns zero for an empty package", () => {
    expect(compressPackage([])).toBe(0);
  });

  it("never returns a negative package value", () => {
    expect(compressPackage([p(-50, 36), p(-30, 37)])).toBeGreaterThanOrEqual(0);
  });

  it("is order-independent — the sort is internal", () => {
    const assets = [p(30, 33), p(120, 25), p(70, 28)];
    expect(compressPackage(assets)).toBe(compressPackage([...assets].reverse()));
  });
});

// ── Pick protection (CX8) ────────────────────────────────────────
// Protection was a visible toggle that changed nothing: not the valuation,
// not the shared URL, not execution. It read as a term of the deal and was
// decoration.
describe("pick protection changes the pick's value", () => {
  const basePick = { position: "Pick" as const, round: 1, year: 2027 };
  const nav = (over: Record<string, unknown>) =>
    calcPickNAV({ ...basePick, ...over } as any).total;

  it("discounts a protected pick for the club acquiring it", () => {
    expect(nav({ teamStanding: 30, isProtected: true }))
      .toBeLessThan(nav({ teamStanding: 30 }));
  });

  it("discounts a lottery pick hardest — protection removes what he was buying", () => {
    const lotteryLoss = 1 - nav({ teamStanding: 31, isProtected: true }) / nav({ teamStanding: 31 });
    const lateLoss = 1 - nav({ teamStanding: 3, isProtected: true }) / nav({ teamStanding: 3 });
    expect(lotteryLoss).toBeGreaterThan(lateLoss);
  });

  it("leaves an unprotected pick exactly as it was", () => {
    expect(nav({ teamStanding: 20, isProtected: false })).toBe(nav({ teamStanding: 20 }));
    expect(nav({ teamStanding: 20, isProtected: undefined })).toBe(nav({ teamStanding: 20 }));
  });

  it("never drives a pick below the floor", () => {
    expect(nav({ teamStanding: 1, round: 1, isProtected: true })).toBeGreaterThanOrEqual(5);
    expect(nav({ teamStanding: 1, round: 4, isProtected: true })).toBeGreaterThanOrEqual(1);
  });

  it("applies to later rounds too", () => {
    expect(nav({ teamStanding: 28, round: 2, isProtected: true }))
      .toBeLessThan(nav({ teamStanding: 28, round: 2 }));
  });
});

describe("protection survives a shared link", () => {
  it("round-trips through the query string", () => {
    const query = buildTradeQueryString({
      homeTeamId: "WPG", partnerTeamId: "CGY",
      outgoing: [{ id: "pick-1", retainedPct: 0, isProtected: true }],
      incoming: [],
    });
    expect(parseTradeQueryState(query).outgoing[0].isProtected).toBe(true);
  });

  it("round-trips alongside retention", () => {
    const query = buildTradeQueryString({
      homeTeamId: "WPG", partnerTeamId: "CGY",
      outgoing: [{ id: "p1", retainedPct: 0.5, isProtected: true }],
      incoming: [],
    });
    const [ref] = parseTradeQueryState(query).outgoing;
    expect(ref.retainedPct).toBe(0.5);
    expect(ref.isProtected).toBe(true);
  });

  // Links written before CX8 must keep working, and must not become protected.
  it("reads a pre-CX8 link as unprotected", () => {
    expect(parseTradeQueryState("out=abc").outgoing[0].isProtected).toBeFalsy();
    expect(parseTradeQueryState("out=abc:25").outgoing[0].retainedPct).toBe(0.25);
    expect(parseTradeQueryState("out=abc:25").outgoing[0].isProtected).toBeFalsy();
  });

  it("does not lengthen the link for an unprotected asset", () => {
    const query = buildTradeQueryString({
      homeTeamId: null, partnerTeamId: null,
      outgoing: [{ id: "abc", retainedPct: 0 }], incoming: [],
    });
    expect(query).toContain("out=abc");
    expect(query).not.toContain("abc%3A");
  });
});
