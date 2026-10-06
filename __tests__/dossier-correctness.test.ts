import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  finiteOrNull, formatToi, percentileReading, pointsVsLeague, sampleNote, shootingReading, shootingText, vsLeagueText,
} from "../app/lib/edge-display";
import { EdgeShotView, type EdgePayload } from "../app/components/EdgeShotMap";
import { STRAND_TYPES, computeStrandType, strandTypeBasis } from "../app/lib/strand-type";
import { ROLE_DEFS, roleSupport } from "../app/lib/player-roles";
import { contractControlExplanation } from "../app/lib/valuation-copy";
import { navSplit, navSplitNote, navStagesForDisplay } from "../app/lib/nav-breakdown";
import { seasonReferenceRows, sectionSource } from "../app/lib/dossier-context";
import { compareEligibility, compareRows } from "../app/lib/strand-compare";
import { buildStrandPercentiles } from "../app/lib/strand-metrics";
import PlayerPicker from "../app/components/PlayerPicker";

const sel = { season: "20262027", gameType: 2 } as const;

describe("EDGE shooting percentages", () => {
  it("never prints NaN for a zero-attempt split", () => {
    const r = shootingReading({ shots: 0, goals: 0, shootingPctg: undefined });
    expect(r).toEqual({ value: null, reason: "no-attempts" });
    expect(shootingText(r)).toBe("n/a (no shots)");
    expect(vsLeagueText(pointsVsLeague(r, 0.05))).toBeNull();
  });
  it("treats NaN, Infinity and out-of-range figures as unavailable, not zero", () => {
    expect(shootingReading({ shots: 5, goals: 1, shootingPctg: NaN }).value).toBeCloseTo(0.2); // recomputed from counts
    expect(shootingReading({ shots: 5, goals: NaN, shootingPctg: Infinity }).value).toBeNull();
    expect(shootingReading({ shots: NaN }).reason).toBe("missing");
    expect(shootingReading({ shots: undefined }).reason).toBe("missing");
    expect(pointsVsLeague({ value: 0.1, reason: null }, NaN)).toBeNull();
    expect(pointsVsLeague({ value: 0.1, reason: null }, 7)).toBeNull();
  });
  it("keeps a genuine measured zero", () => {
    const r = shootingReading({ shots: 7, goals: 0, shootingPctg: 0 });
    expect(r.value).toBe(0);
    expect(shootingText(r)).toBe("0.0%");
    expect(vsLeagueText(pointsVsLeague(r, 0.08))).toBe("-8.0 pts vs league");
  });
});

describe("EDGE percentile gate", () => {
  it("withholds a percentile on a zero count and keeps the count", () => {
    expect(percentileReading(0, 0.97)).toEqual({ status: "zero-count", value: null });
  });
  it("shows EDGE's figure unchanged for non-zero counts, never reversed", () => {
    expect(percentileReading(12, 0.83)).toEqual({ status: "ranked", value: 0.83 });
  });
  it("rejects missing, non-finite and out-of-range values", () => {
    for (const p of [undefined, null, NaN, -0.1, 1.2]) expect(percentileReading(3, p).status).toBe("unavailable");
    expect(percentileReading(undefined, 0.5).status).toBe("unavailable");
  });
  it("flags small samples and a missing games figure", () => {
    expect(sampleNote(3)).toMatch(/Small sample: 3 GP/);
    expect(sampleNote(20)).toBeNull();
    expect(sampleNote(undefined)).toMatch(/not reported/);
  });
});

describe("EdgeShotView with a zero-shot early-season payload", () => {
  const data: EdgePayload = {
    capturedAt: 1, source: "snapshot", season: "20262027", gameType: 2, gamesPlayed: 3,
    sogDetails: [
      { area: "Crease", shots: 0, shotsPercentile: 0.96 },
      { area: "Low Slot", shots: 4, shotsPercentile: 0.81 },
    ],
    sogSummary: [
      { locationCode: "long", shots: 0, goals: 0, shotsPercentile: 0.99, shotsLeagueAvg: 14.2, shootingPctgLeagueAvg: 0.03 },
      { locationCode: "high", shots: 4, goals: 0, shootingPctg: 0, shotsPercentile: 0.7, shotsLeagueAvg: 3, shootingPctgLeagueAvg: 0.12 },
    ],
    zoneTime: null, speedMax: null, burstsOver20: null, topShotSpeed: null,
  };
  const html = renderToStaticMarkup(React.createElement(EdgeShotView, { data, selection: sel }));
  it("has no NaN anywhere and states the sample size", () => {
    expect(html).not.toMatch(/NaN/);
    expect(html).toMatch(/3 games in this EDGE sample/);
    expect(html).toMatch(/Small sample: 3 GP/);
  });
  it("shows zero counts without a percentile and a measured 0.0% for real zeros", () => {
    expect(html).toMatch(/Crease: 0 shots; no percentile for a zero count/);
    expect(html).not.toMatch(/96th|99th/);
    expect(html).toMatch(/n\/a \(no shots\)/);
    expect(html).toMatch(/shooting 0\.0%/);
    expect(html).toMatch(/Low Slot: 4 shots; 81st percentile/);
  });
});

describe("STRAND type wording", () => {
  // The pre-change function, kept verbatim as an oracle: thresholds must not move.
  const legacy = (off: number[], def: number[], ops: number | null, dps: number | null) => {
    const offAvg = off.reduce((s, t) => s + t, 0) / off.length, defAvg = def.reduce((s, t) => s + t, 0) / def.length;
    const balance = Math.abs(offAvg - defAvg);
    const ps = ops != null && dps != null && (ops + dps) > 1 ? ops / (ops + dps) : null;
    return ps !== null && ps > 0.70 && offAvg > 0.60 ? "OFFENSIVE FORCE"
      : ps !== null && ps > 0.60 && offAvg > 0.50 ? "OFFENSIVE LEAN"
      : ps !== null && ps < 0.30 && defAvg > 0.55 ? "DEFENSIVE ANCHOR"
      : ps !== null && ps < 0.40 && defAvg > 0.45 ? "DEFENSIVE LEAN"
      : ps !== null && ps >= 0.40 && ps <= 0.60 && offAvg > 0.58 && defAvg > 0.52 ? "ELITE TWO-WAY"
      : ps !== null && ps >= 0.38 && ps <= 0.62 ? "COMPLETE PLAYER"
      : (offAvg > 0.72 && defAvg > 0.60 && balance < 0.20) ? "ELITE TWO-WAY"
      : offAvg > defAvg + 0.15 ? (offAvg > 0.65 ? "OFFENSIVE FORCE" : "OFFENSIVE LEAN")
      : defAvg > offAvg + 0.15 ? (defAvg > 0.65 ? "DEFENSIVE ANCHOR" : "DEFENSIVE LEAN")
      : offAvg > 0.52 && defAvg > 0.52 ? "COMPLETE PLAYER" : "BALANCED";
  };
  const rename: Record<string, string> = {
    "OFFENSIVE FORCE": STRAND_TYPES.offenseLed, "OFFENSIVE LEAN": STRAND_TYPES.offenseLeaning,
    "DEFENSIVE ANCHOR": STRAND_TYPES.defenseLed, "DEFENSIVE LEAN": STRAND_TYPES.defenseLeaning,
    "ELITE TWO-WAY": STRAND_TYPES.aboveAvgBoth, "BALANCED": STRAND_TYPES.balanced,
  };
  it("changes vocabulary only: same branch for every profile on a dense grid", () => {
    const steps = [0.2, 0.35, 0.45, 0.52, 0.55, 0.6, 0.65, 0.75, 0.9];
    const psCases: [number | null, number | null][] = [[null, null], [8, 1], [5, 3], [4, 4], [3, 5], [1, 8], [2.6, 3.2]];
    let n = 0;
    for (const o of steps) for (const d of steps) for (const [ops, dps] of psCases) {
      const before = legacy([o], [d], ops, dps);
      const after = computeStrandType([{ val: o }], [{ val: d }], ops, dps);
      const expected = before === "COMPLETE PLAYER"
        ? (after === STRAND_TYPES.evenSplit || after === STRAND_TYPES.aboveAvgBoth ? after : "MISMATCH")
        : rename[before];
      expect(after, `${o}/${d}/${ops}/${dps}`).toBe(expected);
      n++;
    }
    expect(n).toBe(9 * 9 * 7);
  });
  it("never labels a modest profile elite or complete", () => {
    // Average rails ~0.6 / 0.55 with an even split — the old "ELITE TWO-WAY".
    const label = computeStrandType([{ val: 0.6 }], [{ val: 0.55 }], 3, 3);
    expect(label).toBe(STRAND_TYPES.aboveAvgBoth);
    for (const v of Object.values(STRAND_TYPES)) expect(v).not.toMatch(/ELITE|COMPLETE|ANCHOR|FORCE/);
    expect(strandTypeBasis(label)).toMatch(/does not mean elite/);
    expect(strandTypeBasis(STRAND_TYPES.offenseLed)).toMatch(/not how well he defends/);
  });
  it("is independent of any named player: only rails and point shares are read", () => {
    expect(computeStrandType([], [], 1, 1)).toBe(STRAND_TYPES.unavailable);
  });
});

describe("role explanation", () => {
  it("Ceiling Raiser makes no scouting claim and lists its measured inputs", () => {
    expect(ROLE_DEFS.CEILING_RAISER.blurb).not.toMatch(/elite|great line|greater|forecheck/i);
    expect(ROLE_DEFS.CEILING_RAISER.blurb).toMatch(/not a scouting judgement/);
    const lines = roleSupport("CEILING_RAISER", {
      position: "C", games: 80, xgRelTM: 6.2, xgaRelTM: -0.3, goalsPace: 25, assistsPace: 35, qocIndex: 61, baselineIxg82: 14,
    });
    const by = Object.fromEntries(lines.map(l => [l.label, l.value]));
    expect(by["On-ice xG% vs teammates"]).toBe("+6.2 pts");
    expect(by["Assists as share of goals + assists"]).toBe("58%");
    expect(lines.length).toBe(5);
  });
  it("says 'not reported' rather than inventing a value", () => {
    const lines = roleSupport("CEILING_RAISER", { position: "C", games: 80 });
    expect(lines.every(l => l.value === "not reported")).toBe(true);
  });
});

describe("valuation wording", () => {
  it("explains positive contract NAV beside negative annual surplus", () => {
    const t = contractControlExplanation({ contractNav: 14, annualSurplus: -0.6, yearsRemaining: 5 });
    expect(t).toMatch(/opposite directions/);
    expect(t).toMatch(/5 contract years/);
    expect(contractControlExplanation({ contractNav: -4, annualSurplus: 1.2 })).toMatch(/negative because/);
    expect(contractControlExplanation({ contractNav: 3, annualSurplus: 1 })).not.toMatch(/opposite/);
    expect(contractControlExplanation({ contractNav: 3, annualSurplus: null })).toMatch(/market AAV minus this season/);
  });
  it("split note no longer calls adjusted value 'on the ice' and still reconciles", () => {
    const stages = [
      { key: "off", label: "", value: 20.4, kind: "component" as const },
      { key: "def", label: "", value: 5.4, kind: "component" as const },
      { key: "positional", label: "", value: 4.1, kind: "adjustment" as const },
      { key: "cap", label: "", value: -3.6, kind: "component" as const },
    ];
    const total = 26.3;
    const split = navSplit(stages, total);
    expect(navSplitNote(split)).not.toMatch(/on the ice/i);
    expect(navSplitNote(split)).toMatch(/adjustments/);
    expect(split.production + split.contract).toBe(Math.round(total));
    expect(navStagesForDisplay(stages, total).reduce((s, x) => s + x.value, 0)).toBe(Math.round(total));
  });
});

describe("season context", () => {
  it("keeps selected observations apart from the model's 0-GP assumption", () => {
    const rows = seasonReferenceRows({
      selection: sel, observedGames: 3, modelProjectedSeason: "2026-27", modelGames: 0,
      statsSeason: "2025-26", contractSeason: "2026-27", modelVersion: "X-NAV", computedOn: "2026-10-06",
    });
    const by = Object.fromEntries(rows.map(r => [r.label, r.value]));
    expect(by["Selected observations"]).toBe("2026–27 regular season · 3 GP");
    expect(by["Model assumption"]).toMatch(/0 GP in model inputs/);
    expect(by["Valuation computed"]).toMatch(/not how fresh the data is/);
    expect(rows.some(r => /Struck|observed$/.test(r.label))).toBe(false);
  });
  it("labels the source season on analytical sections and the playoff selection", () => {
    expect(sectionSource("strand", sel, 3)).toMatch(/2025–26 regular season.*Not the selected season.*2026–27 regular season · 3 GP/);
    expect(sectionSource("value", { season: "20262027", gameType: 3 }, null)).toMatch(/2026–27 playoffs · games not available/);
  });
});

describe("comparison picker and table", () => {
  const roster = [
    { id: 1, name: "Cole Perfetti", position: "C", games: 82, teamId: "WPG" },
    { id: 2, name: "Aleksander Barkov", position: "C", games: 70, teamId: "FLA" },
    { id: 3, name: "Rookie Wing", position: "LW", games: 4, teamId: "FLA" },
    { id: 4, name: "Some Defender", position: "D", games: 80, teamId: "FLA" },
    { id: 5, name: "Draft Pick", position: "Pick" },
  ];
  it("lists eligible same-group players and says why others are excluded", () => {
    const { eligible, excluded } = compareEligibility(roster, roster[0]);
    expect(eligible.map(p => p.name)).toEqual(["Aleksander Barkov"]);
    expect(excluded).toEqual([expect.objectContaining({ name: "Rookie Wing", reason: "4 GP in 2025–26; needs 20" })]);
  });
  it("renders a labelled combobox with the eligibility rule", () => {
    const { eligible, excluded } = compareEligibility(roster, roster[0]);
    const html = renderToStaticMarkup(React.createElement(PlayerPicker, {
      label: "Compare with", options: eligible, excluded, value: "", onChange: () => {}, rule: "Only forwards with at least 20 games.",
    }));
    expect(html).toMatch(/role="combobox"/);
    expect(html).toMatch(/<label[^>]*>Compare with<\/label>/);
    expect(html).toMatch(/Only forwards with at least 20 games\. 1 eligible/);
  });
  it("keeps raw values beside percentiles and marks unmeasured traits", () => {
    const cohort = Array.from({ length: 12 }, (_, i) => ({ ops: i, dps: i, xGPace: i, xgRelTM: i, avgTOI: 10 + i, xgaRelTM: -i, qocIndex: 40 + i, dzPct: 0.4 }));
    const a = buildStrandPercentiles({ ops: 6, dps: 3, xGPace: 5, xgRelTM: 2, avgTOI: 17, xgaRelTM: null, qocIndex: 50, dzPct: 0.4 }, cohort, false);
    const b = buildStrandPercentiles({ ops: 9, dps: 8, xGPace: 9, xgRelTM: 9, avgTOI: 19, xgaRelTM: -2, qocIndex: 55, dzPct: 0.4 }, cohort, false);
    const rows = compareRows([...a.off, ...a.def], [...b.off, ...b.def]);
    const ops = rows.find(r => r.label === "OPS")!;
    expect(ops.rawA).toBe("6.0");
    expect(ops.pctA).not.toBeNull();
    const supp = rows.find(r => r.label === "SUPP")!;
    expect(supp).toMatchObject({ rawA: "—", pctA: null });
    expect(supp.pctB).not.toBeNull();
  });
});

describe("ice time units", () => {
  it("formats whole seconds as m:ss and rejects invalid values", () => {
    expect(formatToi(1122 / 60)).toBe("18:42");
    expect(formatToi(0)).toBe("0:00");
    expect(formatToi(null)).toBe("—");
    expect(formatToi(NaN)).toBe("—");
    expect(finiteOrNull(0)).toBe(0);
  });
});
