// ── nav-integrity.test.ts ─────────────────────────────────────────────
//
// Production-path integrity for F-NAV, D-NAV and G-NAV (Analytics Integrity
// sprint, Priority 3). These run the real engine entry points, not a
// re-implementation: path dispatch by position, the stage accounting
// identity, missing-vs-zero semantics, monotone directionality, step sizes
// across game counts, and exact reconciliation of positional sums to the
// team aggregate. See docs/analytics/MODEL_CARD_NAV.md.

import { describe, expect, it } from "vitest";
import { calculateAssetNAV } from "@/app/lib/asset-nav";
import { stageDrift } from "@/app/lib/nav-breakdown";
import { rosterNavByPosition } from "@/app/lib/team-nav-split";
import { calcDefenseNAV, calcForwardNAV, calcGoalieNAV, calcNAV, calcProspectNAV } from "@/app/lib/xnav-engine";

const base = { capCeiling: 104, hasLiveStats: true, yearsRemaining: 3, capHit: 5 };
const fwd = (o: Record<string, unknown> = {}) => ({ id: "f", name: "F", position: "W" as const, age: 27, ptsPace: 60, xGPace: 20, defRate: 0.04, avgTOI: 17, qocIndex: 55, games: 78, ops: 4, dps: 1, ...base, ...o });
const def = (o: Record<string, unknown> = {}) => ({ id: "d", name: "D", position: "D" as const, age: 27, ptsPace: 40, xGPace: 8, defRate: 0.06, avgTOI: 22, qocIndex: 60, games: 78, ops: 3, dps: 4, xgaRelTM: -0.2, corsiAgainstRel: -2, ...base, ...o });
const gol = (o: Record<string, unknown> = {}) => ({ id: "g", name: "G", position: "G" as const, age: 28, gsax: 12, gamesStarted: 55, games: 55, savePct: 0.915, ...base, ...o });
const keys = (r: ReturnType<typeof calcNAV>) => (r.stages ?? []).map(s => s.key);

describe("each position reaches only its intended model path", () => {
  it("C and W → calcForwardNAV, D → calcDefenseNAV, G → calcGoalieNAV, byte-for-byte", () => {
    expect(calcNAV(fwd())).toEqual(calcForwardNAV(fwd()));
    expect(calcNAV(fwd({ position: "C" }))).toEqual(calcForwardNAV(fwd({ position: "C" })));
    expect(calcNAV(def())).toEqual(calcDefenseNAV(def()));
    expect(calcNAV(gol())).toEqual(calcGoalieNAV(gol()));
  });

  it("skater and goalie paths emit disjoint stage vocabularies", () => {
    expect(keys(calcNAV(gol()))).toEqual(["impact", "cap", "youngFloor", "roleCeiling"]);
    expect(keys(calcNAV(fwd()))).toEqual(["off", "def", "age", "grav", "cap", "multiplier", "positional", "development", "franchiseFloor", "credibility"]);
    expect(keys(calcNAV(def()))).toEqual(keys(calcNAV(fwd())));
  });

  it("a defenseman is not a forward with a different label: the D path prices the same box score differently", () => {
    const asD = calcNAV(def()).total;
    const asW = calcNAV({ ...def(), position: "W" as const }).total;
    expect(asD).not.toBe(asW);
  });
});

describe("accounting identity and sign conventions", () => {
  it("stages sum to the headline for every position", () => {
    for (const a of [fwd(), def(), gol(), fwd({ age: 21, games: 30, draftOverall: 5 })]) {
      const r = calcNAV(a);
      expect(Math.abs(stageDrift(r.stages!, r.total))).toBeLessThan(0.5);
    }
  });

  it("better inputs never lower value (monotone directionality)", () => {
    const nondecreasing = (totals: number[]) => totals.every((t, i) => i === 0 || t >= totals[i - 1]);
    expect(nondecreasing([0, 40, 80, 100, 120, 150].map(v => calcNAV(fwd({ ptsPace: v, ops: v / 15 })).total))).toBe(true);
    expect(nondecreasing([0.6, 0.3, 0, -0.3, -0.6, -1.0].map(v => calcNAV(def({ xgaRelTM: v })).total))).toBe(true);
    expect(nondecreasing([10, 5, 0, -5, -10].map(v => calcNAV(def({ corsiAgainstRel: v })).total))).toBe(true);
    expect(nondecreasing([-20, -10, 0, 10, 20, 30, 40].map(v => calcNAV(gol({ gsax: v })).total))).toBe(true);
    expect(nondecreasing([14, 10, 7, 4, 1].map(v => calcNAV(fwd({ capHit: v })).total))).toBe(true);
  });

  it("positive DZ evidence is prevention: a suppressing defenseman out-values a leaky one at equal offence", () => {
    // Away from the shutdown-D floor (dps 1), the fitted signal drives the total.
    expect(calcNAV(def({ xgaRelTM: -0.5, dps: 1, ops: 1 })).total).toBeGreaterThan(calcNAV(def({ xgaRelTM: 0.5, dps: 1, ops: 1 })).total);
    expect(calcNAV(def({ xgaRelTM: -0.5 })).def).toBeGreaterThan(calcNAV(def({ xgaRelTM: 0.5 })).def);
  });

  it("(documented finding, not changed) the shutdown top-pair floor masks the fitted D signal at heavy usage", () => {
    // At dps 4 / 22 min / QoC 60 the `isShutdownTopPairD` floor binds, so a
    // defenseman allowing far MORE xGA than his teammates (+1.0) reads the
    // same headline as one suppressing it (-0.5). The floor is keyed on
    // deployment — the very signal NAV-02 removed from the model — and needs
    // its own evidence gate before it is changed. See MODEL_CARD_NAV.md.
    const leaky = calcNAV(def({ xgaRelTM: 1.0 }));
    const tight = calcNAV(def({ xgaRelTM: -0.5 }));
    expect(leaky.total).toBe(tight.total);
    expect(leaky.stages!.find(s => s.key === "franchiseFloor")!.value).toBeGreaterThan(30);
  });

  it("non-finite inputs are neutralised, never propagated", () => {
    expect(Number.isFinite(calcNAV(fwd({ ptsPace: NaN, xGPace: NaN })).total)).toBe(true);
    expect(Number.isFinite(calcNAV(gol({ gsax: NaN })).total)).toBe(true);
  });
});

describe("missing versus zero", () => {
  it("D-NAV: absent teammate-relative evidence takes the legacy path, not the fitted path fed zeros", () => {
    const missing = calcNAV(def({ xgaRelTM: null, corsiAgainstRel: null }));
    const zero = calcNAV(def({ xgaRelTM: 0, corsiAgainstRel: 0 }));
    // The two are different computations; a league-average fitted read is
    // not the same as no read. Pinned so a future change cannot quietly
    // conflate them.
    expect(missing.total).not.toBe(zero.total);
  });

  it("G-NAV: a goalie with no GSAX is priced as a zero-GSAX goalie (documented limitation, not a crash)", () => {
    expect(calcNAV(gol({ gsax: undefined })).total).toBe(calcNAV(gol({ gsax: 0 })).total);
  });

  it("goalie uncertainty is absent (undefined), never a zero-width band", () => {
    const r = calculateAssetNAV(gol());
    expect(r.fmvLow).toBeUndefined();
    expect(r.snapshot?.uncertainty).toBeNull();
  });
});

describe("sample-size handling has no cliffs on the audited thresholds", () => {
  const worstStep = (mk: (g: number) => Record<string, unknown>, lo: number, hi: number) => {
    let prev = calcNAV(mk(lo) as any).total, worst = 0;
    for (let g = lo + 1; g <= hi; g++) { const t = calcNAV(mk(g) as any).total; worst = Math.max(worst, Math.abs(t - prev)); prev = t; }
    return worst;
  };

  it("G-NAV: one appearance never moves a goalie more than ~25 points at a constant per-game rate", () => {
    expect(worstStep(g => gol({ games: g, gamesStarted: g, gsax: 0.25 * g }), 1, 82)).toBeLessThan(26);
    expect(worstStep(g => gol({ games: g, gamesStarted: g, gsax: 0.5 * g }), 1, 82)).toBeLessThan(26);
  });

  it("D-NAV: the fitted model shrinks by n/(n+k) with no 20-game step", () => {
    expect(worstStep(g => def({ games: g, ops: 3 * g / 82, dps: 4 * g / 82 }), 1, 82)).toBeLessThan(20);
  });

  it("prospect transition: a drafted rookie with a MoneyPuck row does not jump ~200 points at his 14th game", () => {
    // Before the fix: 13 GP → skater path (36), 14 GP → pure pedigree (240).
    const rookie = (games: number) => fwd({ age: 19, games, draftOverall: 3, capHit: 0.95, ptsPace: 30, xGPace: 8, ops: 0.5, dps: 0.1, avgTOI: 14, hasLiveStats: true });
    const g13 = calcNAV(rookie(13)).total;
    const g14 = calcNAV(rookie(14)).total;
    expect(Math.abs(g14 - g13)).toBeLessThan(5);
    // Below 14 games the valuation IS the pedigree valuation, matching the
    // blend's own weight of 0 at 14 games.
    expect(g13).toBe(calcProspectNAV(rookie(13)).total);
    // And the blend still hands over smoothly through 60 games.
    expect(worstStep(g => rookie(g), 1, 70)).toBeLessThan(15);
  });

  it("(documented, not a defect) the franchise floor is a threshold product rule and steps at its qualification bar", () => {
    // A forward crossing ops 5.0 at ≥40 GP becomes floor-eligible. The floor
    // is a deliberate "blockbuster required" guardrail, recorded in the model
    // card as the one remaining discontinuity in F-NAV/D-NAV.
    const below = calcNAV(fwd({ ops: 4.99, ptsPace: 60 })).total;
    const above = calcNAV(fwd({ ops: 5.01, ptsPace: 60 })).total;
    expect(above).toBeGreaterThanOrEqual(below);
  });
});

describe("positional sums reconcile exactly to the team aggregate", () => {
  it("Σ F + Σ D + Σ G of real engine output equals the signed roster total; X-NAV+ is the separate positive-only total", () => {
    const roster = [
      fwd({ id: "1" }), fwd({ id: "2", position: "C", ptsPace: 10, capHit: 9, ops: 0.5 }),
      def({ id: "3" }), def({ id: "4", capHit: 11, ptsPace: 5, ops: 0.3 }),
      gol({ id: "5" }), gol({ id: "6", gsax: -15, games: 20, gamesStarted: 20, capHit: 6 }),
    ];
    const navs = roster.map(a => ({ position: a.position, nav: calculateAssetNAV(a as any).total }));
    const split = rosterNavByPosition(navs);
    const sum = (pred: (p: string) => boolean) => navs.filter(n => pred(n.position)).reduce((s, n) => s + n.nav, 0);
    expect(split.signed.f).toBeCloseTo(sum(p => p !== "D" && p !== "G"), 9);
    expect(split.signed.d).toBeCloseTo(sum(p => p === "D"), 9);
    expect(split.signed.g).toBeCloseTo(sum(p => p === "G"), 9);
    expect(split.signed.total).toBeCloseTo(navs.reduce((s, n) => s + n.nav, 0), 9);
    expect(split.signed.total).toBeCloseTo(split.signed.f + split.signed.d + split.signed.g, 9);
    expect(split.xnav).toBeCloseTo(split.f + split.d + split.g, 9);
    // The roster carries a real negative contract, so the two totals differ —
    // and must never share a label.
    expect(navs.some(n => n.nav < 0)).toBe(true);
    expect(split.xnav).toBeGreaterThan(split.signed.total);
  });
});
