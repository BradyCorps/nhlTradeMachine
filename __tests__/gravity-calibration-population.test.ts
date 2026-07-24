import { describe, expect, it } from "vitest";
import {
  GRAVITY_INPUT_SOURCE_MATRIX,
  buildExactCrosswalk,
  buildOfficialUniverse,
  cachedRerunMatches,
  collectPaginated,
  hasExplicitGravityInputs,
  parseMoneyPuckSeason,
  qualificationFor,
  sha256,
  stableStringify,
  validatePopulation,
  type NhlSkaterSummaryRow,
  type PopulationRecord,
} from "@/scripts/gravity-calibration/core";

const nhlRow = (
  playerId: number,
  gamesPlayed: number,
  positionCode = "C",
): NhlSkaterSummaryRow => ({
  playerId,
  skaterFullName: `Skater ${playerId}`,
  teamAbbrevs: "AAA",
  positionCode,
  gamesPlayed,
  goals: 1,
  assists: 2,
  plusMinus: 0,
  timeOnIcePerGame: 900,
  seasonId: 20252026,
});

const populationRecord = (
  playerId: number,
  gamesPlayed: number,
): PopulationRecord => ({
  playerId,
  playerName: `Skater ${playerId}`,
  position: "C",
  gamesPlayed,
  teamHistory: ["AAA"],
  qualification: qualificationFor(gamesPlayed, "C"),
  inputs: {
    games: gamesPlayed,
    avgTOI: 15,
    qocIndex: null,
    xgRelTM: null,
    baselineXgRel: 0,
    pairDriverScore: null,
    assistsPace: 0,
    baselineIxg82: null,
    goalsPace: 0,
    ppPtsPace82: 0,
    edgeOzPct: null,
    dzPct: null,
    edgeSpeedMaxMph: null,
    edgeBurstsOver20: null,
    xgaRelTM: null,
    dps: 0,
    pkTimeShare: 0,
  },
  sourceJoins: {
    nhlOfficialUniverse: { status: "present", reasonCode: null },
    moneyPuckCurrent: { status: "present", reasonCode: null },
    moneyPuckBaseline: { status: "present", reasonCode: null },
    nstBaseline: {
      status: "legitimately_unavailable",
      reasonCode: "NO_EXACT_QUALIFYING_NST_BASELINE",
    },
    nhlEdge: {
      status: "legitimately_unavailable",
      reasonCode: "NHL_EDGE_AGGREGATES_ABSENT",
    },
    nhlDerivedDps: { status: "present", reasonCode: null },
  },
});

describe("Gravity calibration population", () => {
  it("paginates through the declared official universe without join filtering", async () => {
    const pages = new Map([
      [0, { total: 5, data: [nhlRow(5, 1), nhlRow(2, 20)] }],
      [2, { total: 5, data: [nhlRow(4, 9), nhlRow(1, 10)] }],
      [4, { total: 5, data: [nhlRow(3, 19)] }],
    ]);
    const fetchedStarts: number[] = [];
    const result = await collectPaginated(async (start) => {
      fetchedStarts.push(start);
      return pages.get(start)!;
    }, 2);
    const universe = buildOfficialUniverse(result.rows, result.total);

    expect(fetchedStarts).toEqual([0, 2, 4]);
    expect(universe).toHaveLength(5);
    expect(universe.map((row) => row.playerId)).toEqual([1, 2, 3, 4, 5]);
  });

  it("joins MoneyPuck by stable player ID even when display names differ", () => {
    const csv = [
      "playerId,season,name,team,position,situation,games_played,icetime",
      "100,2025,Source Display,AAA,C,all,20,18000",
      "100,2025,Source Display,AAA,C,5on5,20,16000",
    ].join("\n");
    const parsed = parseMoneyPuckSeason(csv, "2025");

    expect(parsed.get(100)?.playerName).toBe("Source Display");
    expect(parsed.has(101)).toBe(false);
  });

  it("rejects duplicate NHL IDs instead of silently dropping a record", () => {
    expect(() => buildOfficialUniverse(
      [nhlRow(100, 20), nhlRow(100, 21)],
      2,
    )).toThrow(/Duplicate NHL player ID/);
  });

  it("preserves explicit missing values separately from observed zero", () => {
    const record = populationRecord(100, 20);
    const json = stableStringify(record);
    const parsed = JSON.parse(json);

    expect(hasExplicitGravityInputs(record.inputs)).toBe(true);
    expect(parsed.inputs.xgRelTM).toBeNull();
    expect(parsed.inputs.baselineXgRel).toBe(0);
    expect(parsed.inputs.assistsPace).toBe(0);
    expect(json).not.toContain("undefined");

    const incomplete = { ...record.inputs } as Partial<PopulationRecord["inputs"]>;
    delete incomplete.xgRelTM;
    expect(hasExplicitGravityInputs(incomplete)).toBe(false);
    expect(hasExplicitGravityInputs({ ...record.inputs, dps: Number.NaN })).toBe(false);
  });

  it("does not fuzzy-match accents, nicknames, or approximate identities", () => {
    const universe = buildOfficialUniverse([
      {
        ...nhlRow(100, 20),
        skaterFullName: "José Example",
      },
      {
        ...nhlRow(101, 20),
        skaterFullName: "Alexander Example",
      },
    ], 2);
    const crosswalk = buildExactCrosswalk([
      {
        sourceKey: "accent",
        sourceName: "Jose Example",
        sourcePosition: "C",
        sourceTeams: ["AAA"],
      },
      {
        sourceKey: "nickname",
        sourceName: "Alex Example",
        sourcePosition: "C",
        sourceTeams: ["AAA"],
      },
    ], universe);

    expect(crosswalk.normalization.fuzzyMatching).toBe(false);
    expect(crosswalk.entries.map((entry) => entry.status)).toEqual([
      "out_of_universe",
      "out_of_universe",
    ]);
    expect(crosswalk.entries.every((entry) => entry.playerId === null)).toBe(true);
  });

  it("separates 10-game calculation eligibility from 20-game public-tier eligibility", () => {
    expect(qualificationFor(9, "C")).toMatchObject({
      status: "GRAVITY_INELIGIBLE",
      gravityCalculationEligible: false,
      publicTierEligible: false,
    });
    expect(qualificationFor(10, "C")).toMatchObject({
      status: "PROVISIONAL_NO_PUBLIC_TIER",
      gravityCalculationEligible: true,
      publicTierEligible: false,
    });
    expect(qualificationFor(19, "D").publicTierEligible).toBe(false);
    expect(qualificationFor(20, "D")).toMatchObject({
      status: "PUBLIC_TIER_ELIGIBLE",
      gravityCalculationEligible: true,
      publicTierEligible: true,
      reasonCode: null,
    });
  });

  it("orders and fingerprints normalized output deterministically", () => {
    const first = stableStringify(buildOfficialUniverse(
      [nhlRow(300, 20), nhlRow(100, 20), nhlRow(200, 20)],
      3,
    ));
    const second = stableStringify(buildOfficialUniverse(
      [nhlRow(200, 20), nhlRow(300, 20), nhlRow(100, 20)],
      3,
    ));

    expect(second).toBe(first);
    expect(sha256(second)).toBe(sha256(first));
  });

  it("accounts for every exclusion with a machine-readable reason", () => {
    const records = [
      populationRecord(100, 9),
      populationRecord(101, 10),
      populationRecord(102, 20),
    ];

    expect(validatePopulation(records, 3)).toEqual([]);
    expect(records[0].qualification.reasonCode)
      .toBe("BELOW_GRAVITY_CALCULATION_MINIMUM_GAMES");
    expect(records[1].qualification.reasonCode)
      .toBe("BELOW_PUBLIC_TIER_MINIMUM_GAMES");
    expect(records[2].qualification.reasonCode).toBeNull();
  });

  it("detects whether a cached rerun reproduced both normalized artifacts", () => {
    const population = stableStringify({ records: [populationRecord(100, 20)] });
    const crosswalk = stableStringify({ entries: [] });

    expect(cachedRerunMatches(null, null, population, crosswalk)).toBeNull();
    expect(cachedRerunMatches(population, crosswalk, population, crosswalk)).toBe(true);
    expect(cachedRerunMatches(
      population,
      crosswalk,
      stableStringify({ records: [] }),
      crosswalk,
    )).toBe(false);
  });

  it("documents a source and missing-data rule for every computeGravity input", () => {
    const inputKeys = Object.keys(populationRecord(100, 20).inputs).sort();
    const matrixKeys = GRAVITY_INPUT_SOURCE_MATRIX
      .map((entry) => entry.input)
      .sort();

    expect(matrixKeys).toEqual(inputKeys);
    expect(new Set(matrixKeys).size).toBe(matrixKeys.length);
    expect(GRAVITY_INPUT_SOURCE_MATRIX.every((entry) =>
      entry.sourceIds.length > 0
      && entry.rawEvidence.length > 0
      && entry.productionMissingRule.length > 0)).toBe(true);
  });
});
