import { describe, expect, it } from "vitest";
import { calculateAssetNAV, toAssetInput, type AssetNavSource } from "@/app/lib/asset-nav";
import { calcNAV } from "@/app/lib/xnav-engine";
import { calcPlayerTimeline } from "@/app/lib/player-timeline";
import { marketAavDefinition } from "@/app/lib/valuation-copy";
import { SKATER_FMV_VALIDATION } from "@/app/lib/skater-fmv";
import * as outlook from "@/app/lib/outlook-copy";

// Fixture inputs, NOT live McDavid data. These pin how the surfaces behave for
// identical inputs; they do not prove what Production feeds each surface.
const star = (o: Partial<AssetNavSource> = {}): AssetNavSource => ({
  id: "star", name: "Star C", position: "C", age: 28, games: 60,
  ptsPace: 125, xGPace: 40, defRate: 0.1, avgTOI: 22,
  baselinePtsPace: 125, baselineToiPerGame: 22.5, baselineSeasonsWeighted: 3,
  capHit: 12.5, yearsRemaining: 3, hasLiveStats: true, retainedPct: 0, multiplier: 1,
  ...o,
});

describe("cross-surface parity for identical inputs", () => {
  it("boundary, raw engine and timeline Year 1 agree on a deal of six years or less", () => {
    const p = star();
    const viaBoundary = calculateAssetNAV(p, 104);
    const input = toAssetInput(p, 104);
    expect(calcNAV(input).total).toBe(viaBoundary.total);
    expect(calcPlayerTimeline(input)[0].nav).toBe(Math.round(viaBoundary.total));
  });

  it("a different cap ceiling is a different valuation (static vs live is a lead only)", () => {
    const a = calculateAssetNAV(star(), 104).total;
    const b = calculateAssetNAV(star(), 108.5).total;
    expect(b).not.toBe(a);
  });

  it("omitting baseline context changes the number (the /players Contract tab subset)", () => {
    const full = calculateAssetNAV(star({ avgTOI: 20 }), 104).total;
    const subset = calculateAssetNAV(
      star({ avgTOI: 20, baselineToiPerGame: undefined, baselineSeasonsWeighted: undefined }), 104,
    ).total;
    expect(subset).not.toBe(full);
  });

  it("timeline projects at most six contract years", () => {
    const years = calcPlayerTimeline(toAssetInput(star({ yearsRemaining: 8 }), 104));
    expect(years).toHaveLength(6);
  });
});

describe("certainty wording", () => {
  it("score and range notes say hand-built, not a probability or calibrated interval", () => {
    expect(outlook.EVIDENCE_SCORE_NOTE).toMatch(/not a probability/);
    expect(outlook.EVIDENCE_SCORE_NOTE).toMatch(/not been calibrated/);
    expect(outlook.SCENARIO_NOTE).toMatch(/not a calibrated prediction interval/);
    expect(outlook.PEAK_YEARS_NOTE).toMatch(/assumption/);
    for (const label of [outlook.EVIDENCE_SCORE_LABEL, outlook.SCENARIO_LOW, outlook.SCENARIO_HIGH, outlook.SCENARIO_RANGE_LABEL]) {
      expect(label).not.toMatch(/confidence|floor|ceiling/i);
    }
  });
});

describe("market AAV definition", () => {
  it("describes the metric, cohort, cap basis and limits without presenting an interval", () => {
    const v = SKATER_FMV_VALIDATION.F;
    const text = marketAavDefinition(v, 104);
    expect(text).toMatch(/typical signing value/);
    expect(text).toMatch(/share of the salary cap/);
    expect(text).toContain(`${v.testN} later contracts`);
    expect(text).toContain(`$${(v.maeCapPct * 104).toFixed(1)}M`);
    expect(text).toContain(`${v.richestN} richest`);
    expect(text).toContain(`$${(v.richestAbsMissCapPct * 104).toFixed(1)}M`);
    expect(text).toMatch(/not an error range for this player/);
    expect(text).toMatch(/nothing is added to or subtracted/);
    expect(text).not.toMatch(/bias/i);
  });
});
