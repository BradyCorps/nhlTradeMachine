import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  EMPTY_INPUTS, TRAIT_KEYS, TRAITS, UNAVAILABLE_STRAND_TRAITS, buildEvolutionView, buildProfile, checkpointLabel,
  compareProfiles, describeChange, planMilestone, sampleCaveat, traitValues,
  type CheckpointInputs, type StoredCheckpoint,
} from "../app/lib/strand-evolution";
import { buildReferenceCohort } from "../app/lib/strand-cohort-builder.server";

const inputs = (o: Partial<CheckpointInputs> = {}): CheckpointInputs => ({
  gp: 10, points: 6, toiSecondsPerGame: 1080, edgeGp: 10, edgeShotsAll: 31, edgeHdShots: 9, edgeOzPct: 0.52, ...o,
});

/** n skaters whose every rate rises with the index, so percentiles are easy to reason about. */
const field = (n: number, shift = 0): CheckpointInputs[] =>
  Array.from({ length: n }, (_, i) => inputs({
    gp: 30, points: 10 + i + shift, toiSecondsPerGame: 900 + i * 10 + shift * 10,
    edgeGp: 30, edgeShotsAll: 50 + i * 2 + shift, edgeHdShots: 10 + i + shift, edgeOzPct: 0.4 + i / 200,
  }));
/** Players whose games alternate between `lo` and `hi`, so a cohort built from them
 *  genuinely covers both exposures. Rates (not totals) rise with the index. */
const spanning = (n: number, shift = 0, lo = 10, hi = 40): CheckpointInputs[] =>
  Array.from({ length: n }, (_, i) => {
    const gp = i % 2 ? hi : lo, k = i + shift;
    return inputs({
      gp, points: Math.round((0.3 + k * 0.02) * gp), toiSecondsPerGame: 900 + k * 10,
      edgeGp: gp, edgeShotsAll: Math.round((1.5 + k * 0.05) * gp), edgeHdShots: Math.round((0.4 + k * 0.02) * gp), edgeOzPct: 0.4 + k / 200,
    });
  });
const cohortOf = (players: CheckpointInputs[], minGp = 20) => buildReferenceCohort({
  season: "20262027", gameType: 2, posGroup: "F", minGp, players, capturedAt: 1, source: "fixture",
});

describe("traits: real zero versus missing or invalid", () => {
  it("keeps a measured zero and treats null, NaN and Infinity as missing", () => {
    const zero = traitValues(inputs({ points: 0, edgeShotsAll: 0, edgeHdShots: 0 }));
    expect(zero.pts_gp.value).toBe(0);
    expect(zero.sog_gp.value).toBe(0);
    expect(zero.hd_sog_gp.value).toBe(0);
    const bad = traitValues(inputs({ points: null, toiSecondsPerGame: NaN, edgeShotsAll: Infinity, edgeOzPct: 1.4 }));
    expect(bad.pts_gp).toMatchObject({ value: null, missing: "points not reported" });
    expect(bad.toi_gp.value).toBeNull();
    expect(bad.sog_gp.value).toBeNull();
    expect(bad.oz_time.value).toBeNull();
  });
  it("states nothing for a player with no games, and nothing from a misaligned EDGE sample", () => {
    const none = traitValues(inputs({ gp: 0, edgeGp: 0 }));
    for (const k of TRAIT_KEYS) expect(none[k].value).toBeNull();
    const mismatch = traitValues(inputs({ edgeGp: 8 }));
    expect(mismatch.sog_gp.missing).toMatch(/EDGE sample is 8 GP but the NHL summary says 10 GP/);
    expect(mismatch.pts_gp.value).toBeCloseTo(0.6); // summary traits are unaffected
    expect(traitValues(EMPTY_INPUTS).oz_time.missing).toBe("no EDGE sample");
  });
});

describe("milestones: actual games, regular season only, nothing manufactured", () => {
  const plan = (gp: number, extra: object = {}) => planMilestone({ gp, gameType: 2, captured: new Set(), ...extra });
  it("accepts the first capture inside a window and labels it with the real GP", () => {
    expect(plan(10).milestone).toBe("10");
    const p = plan(12);
    expect(p.milestone).toBe("10");
    expect(checkpointLabel("10", 12)).toBe("12 GP (first capture after the 10-GP target)");
    expect(checkpointLabel("10", 10)).toBe("10 GP");
    expect(checkpointLabel("END", 82)).toBe("Season end · 82 GP");
  });
  it("leaves a missed milestone unavailable rather than relabelling a later sample", () => {
    for (const gp of [3, 9, 16, 19, 26, 39, 46, 59, 66]) expect(plan(gp).milestone, String(gp)).toBeNull();
    expect(plan(25).milestone).toBe("20");
  });
  it("does not capture a target twice, and isolates the playoffs", () => {
    expect(plan(12, { captured: new Set(["10"]) }).milestone).toBeNull();
    expect(plan(12, { gameType: 3 }).milestone).toBeNull();
    expect(plan(82, { seasonComplete: true }).milestone).toBe("END");
    expect(plan(82, { seasonComplete: true, captured: new Set(["END"]) }).milestone).toBeNull();
    expect(plan(82, { seasonComplete: true, gameType: 3 }).milestone).toBeNull();
  });
});

describe("comparable calculations", () => {
  it("compares rates with their exposure, never cumulative totals", () => {
    const early = buildProfile({ kind: "checkpoint", label: "10 GP", season: "20262027", gameType: 2, inputs: inputs({ gp: 10, points: 5 }) });
    const late = buildProfile({ kind: "latest", label: "Latest", season: "20262027", gameType: 2, inputs: inputs({ gp: 82, points: 40, edgeGp: 82, edgeShotsAll: 250, edgeHdShots: 70 }) });
    const { rows } = compareProfiles(early, late, null, null);
    const pts = rows.find(r => r.key === "pts_gp")!;
    expect(pts.delta).toBeCloseTo(40 / 82 - 0.5);            // -0.012, not +35
    expect(pts.earlier.exposure).toBe("5 pts in 10 GP");
    expect(pts.later.exposure).toBe("40 pts in 82 GP");
    expect(pts.summary).toMatch(/^Lower scoring rate/);
  });
  it("is deterministic: identical inputs give identical profiles and rows", () => {
    const run = () => {
      const c = cohortOf(field(25));
      const a = buildProfile({ kind: "checkpoint", label: "10 GP", season: "20262027", gameType: 2, inputs: inputs() });
      const b = buildProfile({ kind: "latest", label: "Latest", season: "20262027", gameType: 2, inputs: inputs({ gp: 30, points: 21, edgeGp: 30, edgeShotsAll: 90, edgeHdShots: 20 }) });
      return { c, rows: compareProfiles(a, b, c, c).rows };
    };
    expect(run()).toEqual(run());
  });
  it("describes change neutrally, with values, and says 'same' when the shown numbers are equal", () => {
    expect(describeChange("sog_gp", 2.5, 3.1, "the 10 GP checkpoint")).toBe("Higher shots-on-goal rate than the 10 GP checkpoint (2.50 → 3.10).");
    expect(describeChange("toi_gp", 18.04, 18.01, "x")).toMatch(/^Same ice time per game/);
    expect(describeChange("sog_gp", null, 3, "x")).toBeNull();
    for (const k of TRAIT_KEYS) {
      const s = describeChange(k, 1, 2, "earlier") ?? "";
      expect(s).not.toMatch(/improv|elite|better|worse|breakout|ability|talent/i);
    }
  });
  it("adds the small-sample caveat under 20 games and not otherwise", () => {
    expect(sampleCaveat(10, 3)).toMatch(/does not show a lasting change in ability/);
    expect(sampleCaveat(40, 60)).toBeNull();
  });
});

describe("reference cohorts: a changing field is not player improvement", () => {
  const earlier = buildProfile({ kind: "checkpoint", label: "10 GP", season: "20262027", gameType: 2, inputs: inputs({ gp: 10, points: 8 }) });
  const sameRates = buildProfile({ kind: "latest", label: "Latest", season: "20262027", gameType: 2, inputs: inputs({ gp: 40, points: 32, edgeGp: 40, edgeShotsAll: 124, edgeHdShots: 36 }) });
  it("ranks both profiles in one pinned cohort, so identical rates show no percentile change", () => {
    const c = cohortOf(spanning(40), 5);
    expect(c).toMatchObject({ gpMin: 10, gpMax: 40 });
    const { rows, sameCohort } = compareProfiles(earlier, sameRates, c, c);
    expect(sameCohort).toBe(true);
    expect(rows.find(r => r.key === "pts_gp")!.pctDelta).toBe(0);
    expect(rows.find(r => r.key === "pts_gp")!.cohortMedian).not.toBeNull();
  });
  it("refuses to difference percentiles taken from two different fields", () => {
    const a = cohortOf(spanning(40), 5), b = cohortOf(spanning(40, 8), 5); // a stronger league later
    expect(a.id).not.toBe(b.id);
    const { rows, sameCohort } = compareProfiles(earlier, sameRates, a, b);
    expect(sameCohort).toBe(false);
    for (const r of rows) { expect(r.pctDelta).toBeNull(); expect(r.cohortMedian).toBeNull(); }
    // The percentiles themselves differ because the field moved — which is exactly why they are not differenced.
    expect(rows[0].earlier.pct).not.toBe(rows[0].later.pct);
  });
  it("a pinned comparison does not move when other cohorts exist or later grow", () => {
    const pinned = cohortOf(spanning(40), 5);
    const before = compareProfiles(earlier, sameRates, pinned, pinned);
    cohortOf(spanning(80, 5), 5); // a later, bigger cohort elsewhere
    expect(compareProfiles(earlier, sameRates, pinned, pinned)).toEqual(before);
  });
  it("hashes content: identical populations share an id, and a thin cohort gives no percentile", () => {
    expect(cohortOf(field(30)).id).toBe(cohortOf(field(30)).id);
    const thin = cohortOf(field(6));
    const { rows } = compareProfiles(earlier, sameRates, thin, thin);
    for (const r of rows) { expect(r.earlier.pct).toBeNull(); expect(r.later.pct).toBeNull(); }
  });
  it("applies the games floor to who is ranked", () => {
    const players = [...field(12), inputs({ gp: 3, points: 30 })];
    expect(cohortOf(players, 20).n).toBe(12);
    expect(cohortOf(players, 1).n).toBe(13);
  });
});

describe("the page payload", () => {
  const latest = inputs({ gp: 30, points: 21, edgeGp: 30, edgeShotsAll: 90, edgeHdShots: 20 });
  const cohort = cohortOf(spanning(40), 5);
  const stored = (milestone: StoredCheckpoint["milestone"], observedGp: number, revision = 0, over: Partial<CheckpointInputs> = {}): StoredCheckpoint => ({
    milestone, revision, status: "observed", observedGp, capturedAt: Date.UTC(2026, 10, 1), sourceAsOf: null,
    inputs: inputs({ gp: observedGp, edgeGp: observedGp, ...over }), cohort, provenance: {},
  });
  const view = (checkpoints: StoredCheckpoint[], extra: object = {}) => buildEvolutionView({
    season: "20262027", gameType: 2, latestInputs: latest, latestCapturedAt: 5, latestCohort: cohort,
    baselineSeason: "20252026", baselineInputs: inputs({ gp: 82, points: 60, edgeGp: 82, edgeShotsAll: 240, edgeHdShots: 70 }),
    baselineCohort: cohortOf(field(40, -3)), checkpoints, storeUnavailable: false, ...extra,
  });

  it("offers only checkpoints that exist and says which targets are missing", () => {
    const v = view([stored("10", 12)]);
    expect(v.options.filter(o => o.kind === "checkpoint").map(o => o.label)).toEqual(["12 GP (first capture after the 10-GP target)"]);
    expect(v.missingMilestones).toEqual(["20", "40", "60"]);
    expect(view([]).missingMilestones).toEqual(["10", "20", "40", "60"]);
    expect(view([]).options.map(o => o.kind)).toEqual(["baseline"]);
  });
  it("keeps the baseline separate from this season and never differences its percentiles", () => {
    const b = view([]).options[0];
    expect(b.kind).toBe("baseline");
    expect(b.sameCohort).toBe(false);
    expect(b.rows.every(r => r.pctDelta === null)).toBe(true);
    expect(b.cohortNote).toMatch(/Historical rankings, each against its own season/);
    expect(b.provenanceNote).toMatch(/not a stored checkpoint/);
  });
  it("shows a partial current profile when EDGE is missing, without borrowing last season's values", () => {
    const v = view([], { latestInputs: inputs({ gp: 30, points: 21, edgeGp: null, edgeShotsAll: null, edgeHdShots: null, edgeOzPct: null }) });
    const row = v.options[0].rows.find(r => r.key === "sog_gp")!;
    expect(row.earlier.value).toBeCloseTo(240 / 82);   // the baseline's own value, in the baseline column
    expect(row.later.value).toBeNull();                 // current stays missing
    expect(row.later.missing).toBe("no EDGE sample");
    expect(row.summary).toBeNull();
    expect(v.latest!.traits.pts_gp.value).toBeCloseTo(0.7);
  });
  it("uses the highest revision and discloses the correction", () => {
    const v = view([stored("10", 12, 0), stored("10", 12, 1, { points: 7 })]);
    const o = v.options.find(x => x.kind === "checkpoint")!;
    expect(o.earlier.traits.pts_gp.value).toBeCloseTo(7 / 12);
    expect(o.revisionNote).toMatch(/revision 1.*original capture is retained/);
  });
  it("pins both profiles of a checkpoint comparison to the checkpoint's cohort", () => {
    const o = view([stored("10", 10)]).options.find(x => x.kind === "checkpoint")!;
    expect(o.sameCohort).toBe(true);
    expect(o.cohortNote).toMatch(/one pinned reference cohort/);
    expect(o.rows.some(r => r.pctDelta !== null)).toBe(true);
    expect(o.caveat).toMatch(/Based on 10 and 30 games/);
  });
  it("is regular-season only, and reports an unreadable store", () => {
    const v = view([stored("10", 10)], { gameType: 3 });
    expect(v).toMatchObject({ supported: false, options: [], latest: null });
    expect(view([], { storeUnavailable: true }).storeUnavailable).toBe(true);
  });
  it("names every STRAND trait it cannot supply this season", () => {
    expect(UNAVAILABLE_STRAND_TRAITS.map(t => t.label)).toEqual(["OPS", "DPS", "xG", "NOIV", "SUPP", "QoC", "OZ Starts"]);
    expect(view([]).unavailableTraits).toBe(UNAVAILABLE_STRAND_TRAITS);
    expect(TRAITS.oz_time.strandCounterpart).toMatch(/different measurement/);
  });
});

describe("independence from NAV and production selection", () => {
  const files = ["app/lib/strand-evolution.ts", "app/lib/strand-checkpoints.server.ts", "app/lib/strand-cohort-builder.server.ts",
    "app/lib/strand-evolution.server.ts", "app/components/StrandEvolution.tsx"];
  it("imports no valuation, gravity, snapshot-batch or flag module", () => {
    for (const f of files) {
      const imports = readFileSync(f, "utf8").split("\n").filter(l => /^\s*(import|export) .* from /.test(l)).join("\n");
      expect(imports, f).not.toMatch(/xnav|asset-nav|calcNAV|valuation|gravity|season-snapshot|labs|feature-flag|roster-assembly|cached-roster/i);
    }
  });
});

describe("checkpoint comparability", () => {
  const early = buildProfile({ kind: "checkpoint", label: "12 GP", season: "20262027", gameType: 2, inputs: inputs({ gp: 12, points: 7, edgeGp: 12 }) });
  const late = buildProfile({ kind: "latest", label: "Latest", season: "20262027", gameType: 2, inputs: inputs({ gp: 40, points: 28, edgeGp: 40, edgeShotsAll: 120, edgeHdShots: 30 }) });
  const narrow = cohortOf(field(30).map(p => ({ ...p, gp: 12, edgeGp: 12 })), 5); // ranked players had 12 GP

  it("does not rank a 40-game rate in a field of 12-game rates", () => {
    const { rows, sameCohort, withheld } = compareProfiles(early, late, narrow, narrow);
    expect(sameCohort).toBe(false);
    expect(rows.every(r => r.later.pct === null && r.pctDelta === null)).toBe(true);
    expect(rows.some(r => r.earlier.pct !== null)).toBe(true);       // the in-range side is still ranked
    expect(withheld.join(" ")).toMatch(/Latest: percentiles withheld; 40 GP is outside the cohort's 12–12 GP range/);
    expect(rows.find(r => r.key === "pts_gp")!.delta).not.toBeNull(); // raw rates are still compared
  });
  it("surfaces the withholding reason in the page payload", () => {
    const v = buildEvolutionView({
      season: "20262027", gameType: 2, latestInputs: inputs({ gp: 40, points: 28, edgeGp: 40 }), latestCapturedAt: 1, latestCohort: null,
      baselineSeason: null, baselineInputs: null, baselineCohort: null, storeUnavailable: false,
      checkpoints: [{
        milestone: "10" as const, revision: 0, status: "observed" as const, observedGp: 12, capturedAt: 1, sourceAsOf: null,
        inputs: inputs({ gp: 12, edgeGp: 12 }), cohort: narrow, provenance: {},
      }],
    });
    expect(v.options[0].withheldNotes.join(" ")).toMatch(/outside the cohort's 12–12 GP range/);
    expect(v.options[0].rows.every(r => r.pctDelta === null)).toBe(true);
  });
  it("refuses a cohort from another season, competition or metric definition", () => {
    const wide = cohortOf(spanning(40), 5);
    const otherSeason = { ...wide, season: "20252026" }, playoffs = { ...wide, gameType: 3 }, oldDef = { ...wide, definitionVersion: "strand-evo-v0" };
    for (const c of [otherSeason, playoffs, oldDef]) {
      const { rows } = compareProfiles(early, late, c, c);
      expect(rows.every(r => r.earlier.pct === null && r.later.pct === null)).toBe(true);
    }
  });
  it("computes no change at all between profiles built from different definitions", () => {
    const old = { ...early, definitionVersion: "strand-evo-v0" };
    const { rows, compatible, withheld } = compareProfiles(old, late, null, null);
    expect(compatible).toBe(false);
    expect(rows.every(r => r.delta === null && r.summary === null && r.pctDelta === null)).toBe(true);
    expect(withheld[0]).toMatch(/different metric definitions/);
  });
  it("does not rank a trait measured for only a minority of the cohort", () => {
    // 30 ranked players, but only 12 have an aligned EDGE sample (the clubs captured tonight).
    const partial = cohortOf(spanning(30).map((p, i) => i < 12 ? p : { ...p, edgeGp: null, edgeShotsAll: null, edgeHdShots: null, edgeOzPct: null }), 5);
    expect(partial.values.sog_gp).toHaveLength(12);
    const { rows } = compareProfiles(early, buildProfile({ kind: "latest", label: "Latest", season: "20262027", gameType: 2, inputs: inputs({ gp: 12, edgeGp: 12 }) }), partial, partial);
    expect(rows.find(r => r.key === "sog_gp")!.earlier.pct).toBeNull();
    expect(rows.find(r => r.key === "pts_gp")!.earlier.pct).not.toBeNull();
  });
});

describe("source units and mixed timestamps cannot manufacture a rate", () => {
  it("rejects a unit mistake instead of printing it", () => {
    expect(traitValues(inputs({ toiSecondsPerGame: 18.4 })).toi_gp.missing).toMatch(/unit check failed/);   // minutes, not seconds
    expect(traitValues(inputs({ toiSecondsPerGame: 7200 })).toi_gp.value).toBeNull();
    expect(traitValues(inputs({ edgeOzPct: 52 })).oz_time.value).toBeNull();                                 // percent, not fraction
    expect(traitValues(inputs({ edgeShotsAll: 400 })).sog_gp.missing).toMatch(/unit check failed/);          // 40 shots/GP
    expect(traitValues(inputs({ edgeShotsAll: 5, edgeHdShots: 9 })).hd_sog_gp.missing).toMatch(/exceed all shots/);
    expect(traitValues(inputs({ points: 80 })).pts_gp.missing).toMatch(/unit check failed/);
    expect(traitValues(inputs()).toi_gp.value).toBeCloseTo(18);                                              // sane input unaffected
  });
  it("never divides EDGE totals by a different games count, in either direction", () => {
    const stale = traitValues(inputs({ gp: 12, edgeGp: 9, edgeShotsAll: 31 }));    // EDGE row from before the last games
    const ahead = traitValues(inputs({ gp: 12, edgeGp: 13, edgeShotsAll: 40 }));   // EDGE row from after the summary
    for (const t of [stale, ahead]) { expect(t.sog_gp.value).toBeNull(); expect(t.hd_sog_gp.value).toBeNull(); expect(t.oz_time.value).toBeNull(); }
    expect(stale.pts_gp.value).toBeCloseTo(0.5); // the summary-only traits stand
  });
  it("accepts an older EDGE row only when the games are identical, and says nothing else changed", () => {
    expect(traitValues(inputs({ gp: 12, edgeGp: 12, edgeShotsAll: 36 })).sog_gp.value).toBeCloseTo(3);
  });
});
