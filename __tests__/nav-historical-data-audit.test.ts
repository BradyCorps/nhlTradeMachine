import { describe, expect, it } from "vitest";
import { auditHistoricalData } from "../scripts/backtest/nav-historical-data-audit";

const source = (playerId: string, name: string, season = 2024) => ({
  season, source: "moneyPuckSkater" as const, row: { playerId, name, situation: "all" },
});
const signing = (player: string, signDate = "2025-07-01") => ({ player, signDate, team: "EDM", pos: "C" });

describe("NAV-01 historical identity audit", () => {
  it("uses exact, normalized, and repository alias keys only when each gives one NHL ID", () => {
    const report = auditHistoricalData([
      signing("Exact Player"), signing("José Player"), signing("Alex Ovechkin"), signing("Twin Player"), signing("Missing"),
    ], [
      source("1", "Exact Player"), source("2", "Jose Player"), source("3", "Alexander Ovechkin"),
      source("4", "Twin Player"), source("5", "Twin Player"),
    ]);
    expect(report.identityCoverage).toMatchObject({ total: 5, exact: 1, normalized: 1, manual: 1, unmatched: 2, matchedWithPreSigningPerformance: 3 });
    expect(report.unresolved.map(row => row.reason)).toEqual(["ambiguous identity", "no ID-bearing name candidate"]);
  });

  it("only applies nickname variants within the signing team", () => {
    const report = auditHistoricalData([signing("Matt Savoie")], [{
      ...source("1", "Matthew Savoie"), row: { playerId: "1", name: "Matthew Savoie", team: "EDM", situation: "all" },
    }]);
    expect(report.identityCoverage.manual).toBe(1);
  });

  it("uses the recorded position to safely separate same-name NHL IDs", () => {
    const report = auditHistoricalData([signing("Elias Pettersson")], [
      { ...source("1", "Elias Pettersson"), row: { playerId: "1", name: "Elias Pettersson", position: "C", situation: "all" } },
      { ...source("2", "Elias Pettersson"), row: { playerId: "2", name: "Elias Pettersson", position: "D", situation: "all" } },
    ]);
    expect(report.identityCoverage).toMatchObject({ exact: 1, unmatched: 0 });
  });

  it("does not count a post-signing player season as pre-signing performance", () => {
    const report = auditHistoricalData([signing("Later", "2025-06-30")], [source("1", "Later", 2024)]);
    expect(report.identityCoverage.matchedWithoutPreSigningPerformance).toBe(1);
  });

  it("retains filesystem inventory results independently from match coverage", () => {
    const report = auditHistoricalData([signing("Bad", "invalid")], [], {
      signingWorkbookPresent: true, historicalGoalieFilePresent: true, historicalSkaterFilePresent: false, moneyPuckFilesPresent: 8,
    });
    expect(report.inventory).toMatchObject({ signingLedgerRows: 1, historicalSkaterFilePresent: false, moneyPuckFilesPresent: 8 });
    expect(report.unresolved[0]).toMatchObject({ contractRow: 2, reason: "invalid signing date" });
  });
});
