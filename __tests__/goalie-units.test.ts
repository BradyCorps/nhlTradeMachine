import { describe, it, expect } from "vitest";
import {
  SECONDS_PER_HOUR,
  goalsAgainstAverage,
  resolveWorkload,
  workloadLabel,
  workloadTitle,
} from "@/app/lib/goalie-units";

describe("goalie-units — GAA is per sixty minutes", () => {
  it("computes the real thing from goals and ice time", () => {
    // 60 starts × ~58 min = 208,800s; 150 against → 2.59.
    expect(goalsAgainstAverage(150, 208_800)).toBeCloseTo(2.586, 3);
    // Exactly one hour, exactly three goals.
    expect(goalsAgainstAverage(3, SECONDS_PER_HOUR)).toBe(3);
  });

  it("differs from goals-per-appearance whenever outings are short", () => {
    // The defect: `(1 - svPct) * shotsPerGame` is per APPEARANCE. A goalie
    // pulled often, or used in relief, plays far less than 60 minutes a game,
    // so the old figure understated his rate. Here: 40 appearances averaging
    // 40 minutes, 100 goals against.
    const perAppearance = 100 / 40;                       // 2.50 — the old number
    const perSixty = goalsAgainstAverage(100, 40 * 40 * 60)!;
    expect(perSixty).toBeCloseTo(3.75, 2);
    expect(perSixty).toBeGreaterThan(perAppearance);
  });

  it("agrees with goals-per-appearance only when every outing is a full game", () => {
    const games = 50, ga = 125;
    expect(goalsAgainstAverage(ga, games * 60 * 60)).toBeCloseTo(ga / games, 6);
  });

  it("treats a shutout season as zero, not as missing", () => {
    expect(goalsAgainstAverage(0, 100_000)).toBe(0);
  });

  it("refuses to invent a figure instead of returning a plausible one", () => {
    // The old code did `(1 - svPct) * (spg ?? 30)` — a fabricated shot rate
    // rendered to two decimals. Absence must produce absence.
    for (const [ga, ice] of [
      [null, 200_000], [150, null], [null, null],
      [150, 0], [150, -5], [-1, 200_000],
      [NaN, 200_000], [150, NaN], [150, Infinity],
    ] as [number | null, number | null][]) {
      expect(goalsAgainstAverage(ga, ice), `${ga}/${ice}`).toBeNull();
    }
  });

  it("is monotone in both arguments", () => {
    expect(goalsAgainstAverage(160, 200_000)!).toBeGreaterThan(goalsAgainstAverage(150, 200_000)!);
    expect(goalsAgainstAverage(150, 190_000)!).toBeGreaterThan(goalsAgainstAverage(150, 200_000)!);
  });
});

describe("goalie-units — starts are not appearances", () => {
  it("prefers a real starts count", () => {
    expect(resolveWorkload({ gamesStarted: 52, gamesPlayed: 55 }))
      .toEqual({ games: 52, startsKnown: true });
  });

  it("falls back to appearances and says that is what it did", () => {
    // MoneyPuck publishes no starts column, so this is the common case. The
    // bug was doing exactly this silently and calling the result "GS".
    expect(resolveWorkload({ gamesPlayed: 55 }))
      .toEqual({ games: 55, startsKnown: false });
    expect(resolveWorkload({ gamesStarted: null, gamesPlayed: 55 }).startsKnown).toBe(false);
  });

  it("never reports zero or nonsense as a known starts count", () => {
    for (const input of [
      { gamesStarted: 0, gamesPlayed: 12 },
      { gamesStarted: NaN, gamesPlayed: 12 },
      { gamesStarted: -3, gamesPlayed: 12 },
    ]) {
      const w = resolveWorkload(input);
      expect(w.startsKnown, JSON.stringify(input)).toBe(false);
      expect(w.games).toBe(12);
    }
  });

  it("returns an honest zero when there is nothing at all", () => {
    for (const input of [{}, { gamesStarted: null, gamesPlayed: null }, { gamesPlayed: 0 }]) {
      expect(resolveWorkload(input), JSON.stringify(input)).toEqual({ games: 0, startsKnown: false });
    }
  });

  it("rounds a fractional count rather than printing 52.4 starts", () => {
    expect(resolveWorkload({ gamesStarted: 52.4 }).games).toBe(52);
    expect(resolveWorkload({ gamesPlayed: 54.6 }).games).toBe(55);
  });

  it("never silently upgrades appearances into starts", () => {
    // The property that matters: startsKnown is true only when a starts number
    // was actually supplied.
    const fromAppearances = resolveWorkload({ gamesPlayed: 60 });
    expect(fromAppearances.startsKnown).toBe(false);
    expect(workloadLabel(fromAppearances)).toBe("60 GP");
  });
});

describe("goalie-units — labels claim only what the source supports", () => {
  it("says GS for starts and GP for appearances", () => {
    expect(workloadLabel({ games: 52, startsKnown: true })).toBe("52 GS");
    expect(workloadLabel({ games: 55, startsKnown: false })).toBe("55 GP");
  });

  it("spells out the caveat in the long form", () => {
    expect(workloadTitle({ games: 52, startsKnown: true })).toBe("Games started: 52");
    const appearance = workloadTitle({ games: 55, startsKnown: false });
    expect(appearance).toContain("55");
    expect(appearance).toMatch(/relief/i);
    expect(appearance).not.toMatch(/games started/i);
  });
});
