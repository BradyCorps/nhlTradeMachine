import { describe, expect, it } from "vitest";
import {
  splitGoalieStarts,
  SEASON_GAMES,
  MAX_STARTER_STARTS,
  MIN_BACKUP_STARTS,
} from "../app/lib/goalie-workload";

describe("splitGoalieStarts", () => {
  it("accounts for all 82 games", () => {
    for (const drawn of [48, 55, 62, 68]) {
      const { starterStarts, backupStarts } = splitGoalieStarts(drawn);
      expect(starterStarts + backupStarts).toBe(SEASON_GAMES);
    }
  });

  it("gives the backup what the starter does not take", () => {
    expect(splitGoalieStarts(55)).toEqual({ starterStarts: 55, backupStarts: 27 });
  });

  // Before RL7 the sim projected a starter at 48-68 starts and stopped, so
  // every recap silently left up to 34 games unaccounted for.
  it("always leaves the backup a real workload", () => {
    for (const drawn of [70, 80, 200]) {
      expect(splitGoalieStarts(drawn).backupStarts).toBeGreaterThanOrEqual(MIN_BACKUP_STARTS);
    }
  });

  it("never lets a starter exceed the workhorse ceiling", () => {
    expect(splitGoalieStarts(999).starterStarts).toBeLessThanOrEqual(MAX_STARTER_STARTS);
  });

  it("never inverts the tandem on an implausibly low draw", () => {
    const { starterStarts, backupStarts } = splitGoalieStarts(0);
    expect(starterStarts).toBeGreaterThanOrEqual(backupStarts);
  });

  // The one case where the ceiling is deliberately ignored: inventing a
  // backup the roster does not carry would be worse than a full workload.
  it("gives every start to a lone goaltender", () => {
    expect(splitGoalieStarts(55, false)).toEqual({
      starterStarts: SEASON_GAMES,
      backupStarts: 0,
    });
  });

  it("survives a non-finite draw rather than emitting NaN starts", () => {
    const { starterStarts, backupStarts } = splitGoalieStarts(Number.NaN);
    expect(Number.isFinite(starterStarts)).toBe(true);
    expect(starterStarts + backupStarts).toBe(SEASON_GAMES);
  });

  it("is a pure function of its inputs", () => {
    expect(splitGoalieStarts(58)).toEqual(splitGoalieStarts(58));
  });
});
