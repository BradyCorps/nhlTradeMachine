import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  RADAR_AXES, RADAR_DOMAIN, RADAR_REFERENCE, USAGE_KEYS, axisDetail, buildRadarModel, canDrawPolygon,
  radarChartData, type CardPercentileRow,
} from "../app/lib/percentile-radar";

const row = (key: string, pct: number | null, extra: Partial<CardPercentileRow> = {}): CardPercentileRow => ({
  key, label: key.toUpperCase(), value: pct == null ? null : pct / 10, pct, formatted: pct == null ? "—" : (pct / 10).toFixed(1), median: "4.0", ...extra,
});
const KEYS_F = ["pts", "goals", "assists", "xg", "toi", "ops", "dps", "xgrel", "supp"]; // card order, not radar order
const KEYS_D = ["pts", "toi", "ops", "dps", "xgrel", "supp", "qoc", "oz"];
const rowsFor = (keys: string[], pcts: Record<string, number | null> = {}) => keys.map((k, i) => row(k, k in pcts ? pcts[k] : 20 + i * 7));

describe("radar model", () => {
  it("uses a fixed axis order regardless of the card's row order", () => {
    const f = buildRadarModel("F", rowsFor(KEYS_F))!;
    expect(f.axes.map(a => a.key)).toEqual([...RADAR_AXES.F]);
    expect(buildRadarModel("F", [...rowsFor(KEYS_F)].reverse())!.axes.map(a => a.key)).toEqual([...RADAR_AXES.F]);
    expect(buildRadarModel("D", rowsFor(KEYS_D))!.axes.map(a => a.key)).toEqual([...RADAR_AXES.D]);
  });
  it("keeps usage and context metrics off the radar and in their own group", () => {
    const f = buildRadarModel("F", rowsFor(KEYS_F))!, d = buildRadarModel("D", rowsFor(KEYS_D))!;
    for (const m of [...f.axes, ...d.axes]) expect(["production", "impact"]).toContain(m.group);
    expect(f.usage.map(u => u.key)).toEqual([...USAGE_KEYS.F]);
    expect(d.usage.map(u => u.key)).toEqual([...USAGE_KEYS.D]);
    for (const u of [...f.usage, ...d.usage]) expect(u.group).toBe("usage");
    expect(f.axes.find(a => a.key === "toi")).toBeUndefined();
  });
  it("offers no radar for goalies", () => {
    expect(buildRadarModel("G", [row("gsax", 50), row("svpct", 60), row("gp", 70)])).toBeNull();
  });
  it("keeps a missing percentile null: not zero, not the 50 ring", () => {
    const m = buildRadarModel("F", rowsFor(KEYS_F, { xg: null, supp: null }))!;
    expect(m.axes.find(a => a.key === "xg")!.player.pct).toBeNull();
    expect(m.axes.find(a => a.key === "supp")!.player.pct).toBeNull();
    expect(m.playerComplete).toBe(false);
    const data = radarChartData(m);
    expect(data.find(d => d.key === "xg")!.player).toBeNull();
    expect(data.find(d => d.key === "supp")!.player).toBeNull();
    expect(data.find(d => d.key === "pts")!.player).not.toBeNull();
    // A genuine 0th percentile is a value, not missing.
    const zero = buildRadarModel("D", rowsFor(KEYS_D, { pts: 0 }))!;
    expect(zero.axes[0].player.pct).toBe(0);
    expect(radarChartData(zero)[0].player).toBe(0);
  });
  it("never allows a polygon across a gap", () => {
    const gap = buildRadarModel("F", rowsFor(KEYS_F, { dps: null }), rowsFor(KEYS_F))!;
    expect(canDrawPolygon(gap, "player")).toBe(false);
    expect(canDrawPolygon(gap, "compare")).toBe(true);
    const full = buildRadarModel("F", rowsFor(KEYS_F))!;
    expect(canDrawPolygon(full, "player")).toBe(true);
    expect(canDrawPolygon(full, "compare")).toBe(false);          // no comparison selected
    const compareGap = buildRadarModel("F", rowsFor(KEYS_F), rowsFor(KEYS_F, { ops: null }))!;
    expect(compareGap.compareComplete).toBe(false);
    expect(canDrawPolygon(compareGap, "compare")).toBe(false);
  });
  it("has a fixed 0-100 scale and a constant 50 reference on every axis", () => {
    expect(RADAR_DOMAIN).toEqual([0, 100]);
    expect(RADAR_REFERENCE).toBe(50);
    const data = radarChartData(buildRadarModel("F", rowsFor(KEYS_F, { xg: null }))!);
    expect(data.every(d => d.ref === 50)).toBe(true);
    expect(data).toHaveLength(RADAR_AXES.F.length);
  });
  it("clamps out-of-range inputs rather than bending the scale", () => {
    const m = buildRadarModel("D", rowsFor(KEYS_D, { pts: 140 }))!;
    expect(m.axes[0].player.pct).toBe(100);
  });
  it("takes one comparison at most and reads values from the same rows", () => {
    const m = buildRadarModel("F", rowsFor(KEYS_F), rowsFor(KEYS_F, { pts: 90 }))!;
    expect(m.axes[0].compare).toMatchObject({ pct: 90 });
    expect(Object.keys(m.axes[0]).filter(k => k.startsWith("compare"))).toEqual(["compare"]);
  });
  it("describes an axis without a verdict, and says when a value is unavailable", () => {
    const m = buildRadarModel("F", rowsFor(KEYS_F, { xg: null }), rowsFor(KEYS_F, { xg: 83 }))!;
    const text = axisDetail(m.axes.find(a => a.key === "xg")!, "Cole Perfetti", "Aleksander Barkov");
    expect(text).toMatch(/Cole Perfetti: unavailable/);
    expect(text).toMatch(/Aleksander Barkov: 83rd percentile/);
    for (const a of m.axes) expect(axisDetail(a, "A", "B")).not.toMatch(/elite|poor|average player|rating of|score/i);
  });
});

describe("the card: no averaged quality verdict, bars retained", () => {
  const card = readFileSync("app/components/PercentileCard.tsx", "utf-8");
  it("no longer computes or prints an average percentile verdict", () => {
    expect(card).not.toMatch(/avgPercentile\s*=/);
    expect(card).not.toMatch(/function percentileLabel/);
    expect(card).not.toMatch(/"ELITE"|"ABOVE AVG"|"BELOW AVG"|"POOR"/);
    expect(card).not.toMatch(/avg \$\{ordinal/);
    expect(card).toMatch(/not combined into one rating/);
    expect(card).toMatch(/avgPercentile: null/);                       // PNG footer carries no average either
  });
  it("keeps the bars as Detailed values beside the radar, and shares the existing comparison", () => {
    expect(card).toMatch(/Detailed values/);
    expect(card).toMatch(/Radar \(prototype\)/);
    expect(card).toMatch(/className="pcard-table"/);
    expect(card).toMatch(/metricPercentile\(raw, sorted, stat\.invert \?\? false\)/);
    expect(card).not.toMatch(/PlayerPicker/);                           // no second picker
  });
  it("leaves the percentile definitions themselves untouched", () => {
    for (const k of ["pts", "goals", "assists", "xg", "toi", "ops", "dps", "xgrel", "supp", "qoc", "oz"]) {
      expect(card).toContain(`key: "${k}"`);
    }
    expect(card).toMatch(/\.filter\(\(v\): v is number => v !== null\)/);
  });
});
