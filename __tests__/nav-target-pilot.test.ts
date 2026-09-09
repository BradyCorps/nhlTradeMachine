import { describe, expect, it } from "vitest";
import { parseCsv, summarizeSource } from "../scripts/backtest/nav-target-pilot";

const skater = { playerId: "1", season: "2025", team: "EDM", position: "C", situation: "all", games_played: "1", icetime: "600",
  I_F_points: "0", I_F_xGoals: "0", OnIce_F_xGoals: "0", OnIce_A_xGoals: "0", OffIce_A_xGoals: "0", timeOnBench: "600" };

describe("NAV target construction pilot", () => {
  it("parses quoted commas, escaped quotes, BOM, CRLF and embedded newlines", () => {
    expect(parseCsv('\uFEFFid,name\r\n1,"A, ""B""\nC"\r\n')).toEqual([{ id: "1", name: 'A, "B"\nC' }]);
    expect(() => parseCsv('id,name\n1,"open')).toThrow();
    expect(() => parseCsv('id,name\n1')).toThrow();
  });
  it("keeps real zeros but excludes blank, nonfinite and negative measurement inputs", () => {
    expect(summarizeSource([skater], 2025, false).summary.usable.relativeXgaRate).toBe(1);
    const report = summarizeSource([{ ...skater, I_F_points: "", I_F_xGoals: "NaN", OnIce_A_xGoals: "-1" }], 2025, false);
    expect(Object.values(report.summary.usable)).toEqual([0, 0, 0, 0, 0]);
  });
  it("does not double count situations or traded-player rows", () => {
    expect(summarizeSource([skater, { ...skater, situation: "5on5" }], 2025, false).summary.eligibleDiagnosticRows).toBe(1);
    const report = summarizeSource([skater, { ...skater, team: "TOR" }], 2025, false);
    expect(report.summary.duplicateRows).toBe(2);
    expect(report.validIds).toEqual([]);
  });
  it("rejects wrong-season identities and absent workload", () => {
    expect(summarizeSource([skater], 2024, false).summary.invalidIdentity).toBe(1);
    expect(summarizeSource([{ ...skater, icetime: "" }], 2025, false).summary.invalidExposure).toBe(1);
    expect(summarizeSource([{ ...skater, playerId: "" }], 2025, false).summary.invalidIdentity).toBe(1);
  });
  it("reports goalie GSAx ingredients without claiming a replacement target", () => {
    const report = summarizeSource([{ ...skater, position: "G", xGoals: "1.2", goals: "2" }], 2025, true);
    expect(report.summary.usable.goalieGsax).toBe(1);
    expect(report.summary.units).toEqual({ F: 0, D: 0, G: 1 });
  });
});
