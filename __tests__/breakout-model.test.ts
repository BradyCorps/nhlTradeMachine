import { describe, expect, it } from "vitest";
import { computeBreakout, type BreakoutSignals } from "../app/lib/breakout-model";

const base = (over: Partial<BreakoutSignals> = {}): BreakoutSignals => ({
  age: 22, position: "C", ptsPace: 30, stablePace: 30, priorGames: 60, avgTOI: 14,
  ...over,
});

describe("computeBreakout — multi-signal model", () => {
  it("rewards real opportunity and suppresses buried usage", () => {
    const minutes = computeBreakout(base({ age: 23, avgTOI: 18 }));
    const flat    = computeBreakout(base({ age: 23, avgTOI: 13 }));
    const buried  = computeBreakout(base({ age: 23, avgTOI: 8 }));
    expect(minutes.breakout).toBeGreaterThan(flat.breakout);
    expect(buried.breakout).toBeLessThan(flat.breakout); // can't break out from the press box
  });

  it("credits draft/NHLe pedigree for young players", () => {
    const bluechip = computeBreakout(base({ age: 21, draftOverall: 4, prospectPtsPace: 60 }));
    const undrafted = computeBreakout(base({ age: 21 }));
    expect(bluechip.breakout).toBeGreaterThan(undrafted.breakout);
    expect(bluechip.driver === "PEDIGREE" || bluechip.driver === "OPPORTUNITY").toBe(true);
  });

  it("uses EDGE burst as an upside signal only where the sample exists", () => {
    const explosive = computeBreakout(base({ age: 23, edgeBurstsOver20: 45, edgeSpeedMaxMph: 23 }));
    const cruiser   = computeBreakout(base({ age: 23, edgeBurstsOver20: 5, edgeSpeedMaxMph: 19 }));
    const noSample  = computeBreakout(base({ age: 23 }));
    expect(explosive.breakout).toBeGreaterThan(cruiser.breakout);
    expect(explosive.hasEdgeSignal).toBe(true);
    expect(noSample.hasEdgeSignal).toBe(false); // never invented
  });

  it("does not apply burst to a player without an EDGE sample", () => {
    const withoutEdge = computeBreakout(base({ age: 22 }));
    const withEdge    = computeBreakout(base({ age: 22, edgeBurstsOver20: 45 }));
    expect(withEdge.breakout).toBeGreaterThan(withoutEdge.breakout);
  });

  it("lets a productive, heavily-deployed veteran decline slower than a washed one", () => {
    const agingWell = computeBreakout(base({ age: 36, ptsPace: 90, stablePace: 90, avgTOI: 19, priorGames: 78 }));
    const fading    = computeBreakout(base({ age: 36, ptsPace: 28, stablePace: 28, avgTOI: 12, priorGames: 60 }));
    expect(agingWell.regression).toBeLessThan(fading.regression);
  });

  it("keeps goalies out of the scoring breakout model", () => {
    const g = computeBreakout(base({ position: "G", age: 24 }));
    expect(g.breakout).toBe(0);
    expect(g.regression).toBe(0);
    expect(g.driver).toBe("NONE");
  });

  it("still doubles breakout on a change of scenery", () => {
    const stay  = computeBreakout(base({ age: 26, avgTOI: undefined }));
    const moved = computeBreakout(base({ age: 26, avgTOI: undefined, changedScenery: true }));
    expect(moved.breakout).toBeCloseTo(stay.breakout * 2, 5);
  });
});
