import { describe, expect, it } from "vitest";
import { auditContracts, auditNhlIdentity, normalizedName, priorSeasonForSigning } from "../scripts/backtest/nav-contract-target-audit";

const player = (id: string, name: string) => ({ playerId: id, name, situation: "all" });
const signing = (player: string, signDate = "2025-07-01") => ({ player, signDate, team: "EDM", capHit: "1000000", capPct: "0.01", term: "2yr", pos: "C", structure: "1-Way", level: "STD" });

describe("NAV-01 economic target join audit", () => {
  it("normalizes presentation differences but never calls a name canonical", () => {
    expect(normalizedName("Jérôme O'Neil-Smith")).toBe("jeromeoneilsmith");
    expect(priorSeasonForSigning("2025-07-01")).toBe(2024);
    expect(priorSeasonForSigning("2025-06-30")).toBe(2023);
    expect(priorSeasonForSigning("bad-date")).toBeNull();
  });
  it("counts only one unambiguous matching identity", () => {
    const report = auditContracts([signing("A. Player"), signing("B. Player"), signing("Missing")], [
      { season: 2024, row: player("1", "A Player") },
      { season: 2024, row: player("2", "B Player") }, { season: 2023, row: player("3", "B Player") },
    ]);
    expect(report.exactUniqueNameMatches).toBe(1);
    expect(report.ambiguousNameMatches).toBe(1);
    expect(report.noAccessibleNameMatch).toBe(1);
    expect(report.matchesWithPriorOnlyPerformance).toBe(1);
  });
  it("does not treat post-signing seasons as eligible performance", () => {
    const report = auditContracts([signing("Later", "2025-06-30")], [{ season: 2024, row: player("1", "Later") }]);
    expect(report.exactUniqueNameMatches).toBe(1);
    expect(report.matchesWithoutPriorPerformance).toBe(1);
  });
  it("reports missing fields and inaccessible dates without guessing", () => {
    const report = auditContracts([{ ...signing("Older", "2023-01-01"), capHit: "", capPct: "NaN", term: "two" }, signing("Bad", "not-date")], []);
    expect(report.validSigningDates).toBe(1);
    expect(report.validContractFields).toBe(0);
    expect(report.dateOutsideAccessiblePerformanceWindow).toBe(1);
  });
  it("requires NHL-ID agreement, while retaining the current-roster limitation", () => {
    const report = auditNhlIdentity([signing("A Player"), signing("Conflict")], [
      { season: 2024, row: player("1", "A Player") }, { season: 2024, row: player("2", "Conflict") },
    ], [
      { id: "1", firstName: "A", lastName: "Player", name: "A Player", position: "C", team: "EDM" },
      { id: "3", firstName: "Conflict", lastName: "", name: "Conflict", position: "C", team: "EDM" },
    ]);
    expect(report.corroboratedNhlIdMatches).toBe(1);
    expect(report.idConflicts).toBe(1);
    expect(report.signingNamePositionAndTeamMatches).toBe(2);
    expect(report.limitations[0]).toContain("no as-of timestamp");
  });
});
