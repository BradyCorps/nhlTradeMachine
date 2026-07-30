import { describe, expect, it } from "vitest";
import { simSeasonIdentity, startYearOf } from "../app/lib/sim-season";
import { SEASON } from "../app/lib/season-config";

describe("simSeasonIdentity", () => {
  // The guarantee that makes this change safe: ordinary single-season play is
  // Year 1, and Year 1 must reproduce the configured constants exactly.
  it("reproduces every configured constant at Year 1", () => {
    const y1 = simSeasonIdentity(1);
    expect(y1.season).toBe(SEASON.label);
    expect(y1.simulationMode).toBe(SEASON.simulationMode);
    expect(y1.replaySeason).toBe(SEASON.replaySeason);
    expect(y1.rosterMoveWindow).toBe(SEASON.rosterMoveWindow);
  });

  it("defaults to Year 1 when no year is given", () => {
    expect(simSeasonIdentity()).toEqual(simSeasonIdentity(1));
  });

  // The reported defect: Year 3 of a Cup Run came back stamped with Year 1's
  // season, so the recap prompt asked for a recap of the wrong year.
  it("advances the season with the run year", () => {
    expect(simSeasonIdentity(2).season).toBe("2027-28");
    expect(simSeasonIdentity(3).season).toBe("2028-29");
  });

  it("describes the season it is actually playing", () => {
    expect(simSeasonIdentity(3).simulationMode).toBe("2028-29 season projection");
  });

  // Year 2's baseline is Year 1 of the run, not the real-world 2025-26.
  it("points the stats baseline at the season immediately before", () => {
    expect(simSeasonIdentity(2).replaySeason).toBe("2026-27");
    expect(simSeasonIdentity(3).replaySeason).toBe("2027-28");
  });

  it("keeps the real baseline for Year 1, which is not a simulated season", () => {
    expect(simSeasonIdentity(1).replaySeason).toBe(SEASON.replaySeason);
  });

  it("moves the roster-move window with the year", () => {
    expect(simSeasonIdentity(2).rosterMoveWindow).toBe("2027 offseason/opening-night");
    expect(simSeasonIdentity(3).rosterMoveWindow).toBe("2028 offseason/opening-night");
  });

  it("keeps each year's identity internally consistent", () => {
    for (const year of [1, 2, 3, 4, 5]) {
      const id = simSeasonIdentity(year);
      expect(id.simulationMode).toContain(id.season);
      expect(id.rosterMoveWindow).toContain(String(startYearOf(id.season)));
      // Every year but the first replays the year before it.
      if (year > 1) expect(id.replaySeason).toBe(simSeasonIdentity(year - 1).season);
    }
  });

  it("never reports two run years as the same season", () => {
    const labels = [1, 2, 3, 4, 5].map(y => simSeasonIdentity(y).season);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("falls back to Year 1 rather than producing a nonsense season", () => {
    for (const bad of [0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(simSeasonIdentity(bad).season, String(bad)).toBe(SEASON.label);
    }
  });

  it("floors a fractional year", () => {
    expect(simSeasonIdentity(2.7).season).toBe(simSeasonIdentity(2).season);
  });
});

describe("startYearOf", () => {
  it("reads the opening calendar year off a label", () => {
    expect(startYearOf("2026-27")).toBe(2026);
    expect(startYearOf("2099-00")).toBe(2099);
  });
});
