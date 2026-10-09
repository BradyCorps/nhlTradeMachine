import { describe, expect, it } from "vitest";
import { balanceDifference, balanceValue, buildTeamBalance, gameBalanceSelection, type TeamBalanceInput } from "@/app/lib/team-balance";

const selection = { season: "20262027", gameType: 2 } as const;
const team: TeamBalanceInput = { id: "WPG", name: "Winnipeg Jets", observedSelection: selection, observedCoverage: "available",
  record: { gamesPlayed: 4, goalsFor: 12, goalsAgainst: 10, shotsForPerGame: 28.5, shotsAgainstPerGame: 32.75 } };

describe("selected-season team balance", () => {
  it("divides goal totals by games and preserves already-normalized NHL shot rates", () => {
    expect(buildTeamBalance(team, selection)).toMatchObject({ games: 4, goalsFor: 3, goalsAgainst: 2.5, shotsFor: 28.5, shotsAgainst: 32.75, reason: null });
  });
  it("does not borrow a different season or competition, even when numbers exist", () => {
    for (const observedSelection of [{ season: "20252026", gameType: 2 }, { season: "20262027", gameType: 3 }] as const) {
      expect(buildTeamBalance({ ...team, observedSelection }, selection)).toMatchObject({ games: null, goalsFor: null, shotsFor: null });
    }
  });
  it("does not interpret missing coverage, missing records or model-only records as observations", () => {
    for (const candidate of [{ ...team, observedCoverage: "missing" }, { ...team, observedCoverage: "unavailable" }, { ...team, record: null }, { ...team, observedSelection: undefined }]) {
      expect(buildTeamBalance(candidate, selection)).toMatchObject({ games: null, goalsFor: null, shotsAgainst: null });
    }
  });
  it("shows zero games without inventing zero per-game averages", () => {
    const result = buildTeamBalance({ ...team, observedCoverage: "zero-games", record: { ...team.record!, gamesPlayed: 0, goalsFor: 0, goalsAgainst: 0 } }, selection);
    expect(result).toMatchObject({ games: 0, goalsFor: null, goalsAgainst: null, shotsFor: null, shotsAgainst: null });
    expect(result.reason).toContain("No games recorded");
  });
  it("keeps actual measured zeros when games have been played", () => {
    expect(buildTeamBalance({ ...team, record: { ...team.record!, goalsFor: 0, shotsForPerGame: 0 } }, selection)).toMatchObject({ goalsFor: 0, shotsFor: 0 });
  });
  it("keeps partial coverage partial, without dropping the other measured rates", () => {
    expect(buildTeamBalance({ ...team, record: { ...team.record!, goalsAgainst: null, shotsForPerGame: null } }, selection)).toMatchObject({ goalsFor: 3, goalsAgainst: null, shotsFor: null, shotsAgainst: 32.75 });
    expect(balanceDifference(3, null)).toBeNull();
    expect(balanceDifference(null, 3)).toBeNull();
  });
  it("rejects invalid denominators and negative or non-finite measurements", () => {
    for (const gamesPlayed of [null, -1, 1.5, NaN, Infinity]) {
      expect(buildTeamBalance({ ...team, record: { ...team.record!, gamesPlayed } }, selection).goalsFor).toBeNull();
    }
    expect(buildTeamBalance({ ...team, record: { ...team.record!, goalsFor: -1, shotsForPerGame: Infinity } }, selection)).toMatchObject({ goalsFor: null, shotsFor: null, goalsAgainst: 2.5 });
  });
  it("formats signs and precision without changing the values used for plotting", () => {
    expect(balanceDifference(28.5, 32.75)).toBe(-4.25);
    expect(balanceValue(-4.25, true)).toBe("-4.25");
    expect(balanceValue(.5, true)).toBe("+0.50");
    expect(balanceValue(0, true)).toBe("0.00");
    expect(balanceValue(null)).toBe("Unavailable");
    expect(balanceValue(NaN)).toBe("Unavailable");
    expect(buildTeamBalance({ ...team, record: { ...team.record!, gamesPlayed: 3, goalsFor: 10 } }, selection).goalsFor).toBe(10 / 3);
  });
});

describe("daily matchup statistics identity", () => {
  it("takes the season and competition from the actual game", () => {
    expect(gameBalanceSelection({ season: 20252026, gameType: 3 })).toEqual({ season: "20252026", gameType: 3 });
    expect(gameBalanceSelection({ season: 20262027, gameType: 2 })).toEqual(selection);
  });
  it("does not silently substitute regular-season data for preseason or unsupported seasons", () => {
    expect(gameBalanceSelection({ season: 20262027, gameType: 1 })).toBeNull();
    expect(gameBalanceSelection({ season: 20242025, gameType: 2 })).toBeNull();
    expect(gameBalanceSelection({ season: 20262027, gameType: 4 })).toBeNull();
  });
});
