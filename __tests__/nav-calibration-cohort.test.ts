import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { CALIBRATION_SAMPLE_GATES, ageBand, auditCalibrationCohort, auditMarketCalibrationCohort, compareDistributions, freezePeriod, unitForPosition } from "../scripts/backtest/nav-calibration-cohort";

const resolved = (contractRow: number, playerId: string, signDate: string, pos = "C") => ({
  contractRow, playerId, resolution: "exact" as const, priorSeason: Number(signDate.slice(0, 4)) - 1,
  signing: { player: playerId, signDate, pos, signAge: "25", capPct: "0.04", level: "STD", signStatus: "UFA", team: "EDM" },
});

describe("NAV-01 calibration cohort audit", () => {
  it("keeps the calendar split forward-only and classifies contract dimensions", () => {
    expect(freezePeriod("2023-07-01")).toBe("train");
    expect(freezePeriod("2024-07-01")).toBe("validation");
    expect(freezePeriod("2025-07-01")).toBe("holdout");
    expect(freezePeriod("2023-06-30")).toBe("outside");
    expect(unitForPosition("RW")).toBe("F");
    expect(ageBand("31")).toBe("31+");
  });

  it("reports resolution bias without treating an unavailable player season as usable", () => {
    const report = auditCalibrationCohort([
      resolved(2, "1", "2023-07-01", "C"), resolved(3, "2", "2024-07-01", "D"), resolved(4, "3", "2025-07-01", "G"),
    ], [{ player: "missing", signDate: "2025-07-01", pos: "C", signAge: "25", capPct: "0.04", level: "STD", signStatus: "UFA", team: "EDM" }], [
      { season: 2022, row: { playerId: "1", situation: "all", games_played: "50", icetime: "1000" } },
      { season: 2025, row: { playerId: "2", situation: "all", games_played: "50", icetime: "1000" } },
    ]);
    expect(report.moneyPuckJoin).toMatchObject({ resolvedContractsWithPreSigningSeason: 1, distinctJoinedPlayerSeasons: 1 });
    expect(report.moneyPuckJoin.byPeriod.train.contractRows).toBe(1);
    expect(report.moneyPuckJoin.byPeriod.validation.contractRows).toBe(0);
    expect(report.moneyPuckJoin.byPeriod.holdout.contractRows).toBe(0);
  });

  it("computes comparable percentage-point distributions", () => {
    const rows = compareDistributions([{ pos: "C" }], [{ pos: "D" }], "position");
    expect(rows).toEqual(expect.arrayContaining([
      expect.objectContaining({ value: "F", resolvedPct: 100, unresolvedPct: 0, differencePp: 100 }),
      expect.objectContaining({ value: "D", resolvedPct: 0, unresolvedPct: 100, differencePp: -100 }),
    ]));
  });

  it("keeps the machine-readable protocol aligned with the executable sample gates", () => {
    const protocol = JSON.parse(readFileSync("docs/analytics/nav01-contract-calibration-protocol.json", "utf8"));
    expect(protocol.sampleGates).toEqual({
      train: CALIBRATION_SAMPLE_GATES.train,
      validation: CALIBRATION_SAMPLE_GATES.validation,
      holdout: CALIBRATION_SAMPLE_GATES.holdout,
    });
    expect(protocol.status).toBe("proceed_market_calibration");
    expect(protocol.marketReferenceGate.referencePopulation).toBe("market_calibration_eligible");
    expect(protocol.performanceGates).toMatchObject({
      aggregateMaeImprovementCapSharePp: 0.1,
      maxPositionMaeRegressionCapSharePp: 0.05,
      calibrationSlope: [0.7, 1.3],
      maxSignedBiasCapSharePp: 0.25,
      bootstrapImprovementLowerBoundCapSharePp: 0,
    });
  });

  it("keeps regulated ELCs and missing NHL histories out of market-price fitting", () => {
    const standard = { ...resolved(2, "1", "2023-07-01"), signing: { ...resolved(2, "1", "2023-07-01").signing, level: "STD" } };
    const elc = { ...resolved(3, "2", "2023-07-01"), signing: { ...resolved(3, "2", "2023-07-01").signing, level: "ELC" } };
    const noHistory = { ...resolved(4, "3", "2023-07-01"), signing: { ...resolved(4, "3", "2023-07-01").signing, level: "STD" } };
    const missingIdentity = { ...standard.signing, player: "missing", level: "STD" };
    const report = auditMarketCalibrationCohort([standard.signing, elc.signing, noHistory.signing, missingIdentity], [standard, elc, noHistory], [
      { season: 2022, row: { playerId: "1", situation: "all", games_played: "50", icetime: "1000" } },
    ]);
    expect(report.universe).toMatchObject({
      market_calibration_eligible: { contractRows: 1 },
      elc_policy_constrained: { contractRows: 1, resolvedIdentityRows: 1 },
      no_pre_signing_nhl_sample: { contractRows: 1 },
      identity_unresolved: { contractRows: 1 },
    });
    expect(report.proposedElcResolutionsWithCurrentlyProvablePreSigningFeatures).toBe(0);
  });
});
