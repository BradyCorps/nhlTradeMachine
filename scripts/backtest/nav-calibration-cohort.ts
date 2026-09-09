/** NAV-01 contract-price calibration cohort coverage. Does not fit or alter NAV. */
import { readFileSync } from "node:fs";
import path from "node:path";
import {
  loadLocalIdentitySources,
  runHistoricalDataAudit,
  type ResolvedContractRecord,
  type Row,
} from "./nav-historical-data-audit";
import { parseCsv } from "./nav-target-pilot";

type Unit = "F" | "D" | "G" | "unknown";
type FreezePeriod = "train" | "validation" | "holdout" | "outside";
type Distribution = Array<{ value: string; resolved: number; unresolved: number; resolvedPct: number; unresolvedPct: number; differencePp: number }>;

const FREEZE_PERIODS: Array<{ name: Exclude<FreezePeriod, "outside">; start: string; end: string }> = [
  { name: "train", start: "2023-07-01", end: "2024-07-01" },
  { name: "validation", start: "2024-07-01", end: "2025-07-01" },
  { name: "holdout", start: "2025-07-01", end: "2026-08-01" },
];

export const CALIBRATION_SAMPLE_GATES = {
  train: { contracts: 250, players: 175, F: 100, D: 60, G: 25 },
  validation: { contracts: 120, players: 90, F: 50, D: 30, G: 15 },
  holdout: { contracts: 120, players: 90, F: 50, D: 30, G: 15 },
  representativeness: { categoryDifferencePp: 15, teamTotalVariation: 20 },
} as const;

export function unitForPosition(position: string | undefined): Unit {
  const value = position?.trim().toUpperCase() ?? "";
  if (value === "D") return "D";
  if (value === "G") return "G";
  return ["C", "L", "R", "LW", "RW", "W"].includes(value) ? "F" : "unknown";
}

export function ageBand(age: string | undefined): string {
  const value = Number(age);
  if (!Number.isFinite(value)) return "missing";
  if (value <= 21) return "18-21";
  if (value <= 24) return "22-24";
  if (value <= 27) return "25-27";
  if (value <= 30) return "28-30";
  return "31+";
}

export function freezePeriod(signDate: string | undefined): FreezePeriod {
  const date = signDate ?? "";
  return FREEZE_PERIODS.find(period => date >= period.start && date < period.end)?.name ?? "outside";
}

function category(row: Row, field: "year" | "position" | "age" | "level" | "status" | "team"): string {
  if (field === "year") return /^\d{4}/.test(row.signDate ?? "") ? row.signDate.slice(0, 4) : "missing";
  if (field === "position") return unitForPosition(row.pos);
  if (field === "age") return ageBand(row.signAge);
  if (field === "level") return row.level?.trim() || "missing";
  if (field === "status") return row.signStatus?.trim() || "missing";
  return row.team?.trim().toUpperCase() || "missing";
}

export function compareDistributions(resolved: Row[], unresolved: Row[], field: "year" | "position" | "age" | "level" | "status" | "team"): Distribution {
  const counts = (rows: Row[]) => rows.reduce((all, row) => {
    const key = category(row, field); all.set(key, (all.get(key) ?? 0) + 1); return all;
  }, new Map<string, number>());
  const a = counts(resolved), b = counts(unresolved);
  return [...new Set([...a.keys(), ...b.keys()])].sort().map(value => {
    const left = a.get(value) ?? 0, right = b.get(value) ?? 0;
    const resolvedPct = resolved.length ? left / resolved.length * 100 : 0;
    const unresolvedPct = unresolved.length ? right / unresolved.length * 100 : 0;
    return { value, resolved: left, unresolved: right, resolvedPct, unresolvedPct, differencePp: resolvedPct - unresolvedPct };
  });
}

function sumUnits(rows: Array<{ signing: Row }>) {
  const units = { F: 0, D: 0, G: 0, unknown: 0 };
  for (const row of rows) units[unitForPosition(row.signing.pos)]++;
  return units;
}

function validTarget(row: Row) {
  return Number(row.capPct) > 0 && Number.isFinite(Number(row.signAge)) && unitForPosition(row.pos) !== "unknown";
}

function recordsForPeriod(records: ResolvedContractRecord[], period: FreezePeriod, preSigningIds: Set<number>) {
  return records.filter(record => freezePeriod(record.signing.signDate) === period && validTarget(record.signing) && preSigningIds.has(record.contractRow));
}

function totalVariation(distribution: Distribution): number {
  return distribution.reduce((sum, row) => sum + Math.abs(row.differencePp), 0) / 2;
}

function categoryGate(distribution: Distribution) {
  const failed = distribution.filter(row => Math.abs(row.differencePp) > CALIBRATION_SAMPLE_GATES.representativeness.categoryDifferencePp)
    .map(row => ({ value: row.value, differencePp: row.differencePp }));
  return { pass: failed.length === 0, failed };
}

/**
 * A field-level lower bound: how many rows from one underrepresented category
 * would have to resolve before that field alone passes. It does not claim that
 * the same rows clear the other fields.
 */
function fieldLevelMinimum(resolved: Row[], unresolved: Row[], field: "age" | "level" | "status") {
  const distribution = compareDistributions(resolved, unresolved, field);
  return distribution.filter(row => row.differencePp < -CALIBRATION_SAMPLE_GATES.representativeness.categoryDifferencePp).map(row => {
    for (let moved = 1; moved <= row.unresolved; moved++) {
      const adjusted = distribution.map(candidate => {
        const resolvedCount = candidate.resolved + (candidate.value === row.value ? moved : 0);
        const unresolvedCount = candidate.unresolved - (candidate.value === row.value ? moved : 0);
        const resolvedPct = resolvedCount / (resolved.length + moved) * 100;
        const unresolvedPct = unresolvedCount / (unresolved.length - moved) * 100;
        return { ...candidate, differencePp: resolvedPct - unresolvedPct };
      });
      if (adjusted.every(candidate => Math.abs(candidate.differencePp) <= CALIBRATION_SAMPLE_GATES.representativeness.categoryDifferencePp)) {
        return { value: row.value, minimumAdditionalResolvedRows: moved };
      }
    }
    return { value: row.value, minimumAdditionalResolvedRows: null };
  });
}

export function auditCalibrationCohort(
  resolved: ResolvedContractRecord[],
  unresolved: Row[],
  moneyPuckRows: Array<{ season: number; row: Row }>,
) {
  const seasonsById = new Map<string, Set<number>>();
  for (const { season, row } of moneyPuckRows) {
    if (row.situation !== "all" || !/^\d+$/.test(row.playerId ?? "") || Number(row.games_played) <= 0 || Number(row.icetime) <= 0) continue;
    const seasons = seasonsById.get(row.playerId) ?? new Set<number>();
    seasons.add(season); seasonsById.set(row.playerId, seasons);
  }
  const preSigningIds = new Set<number>();
  const joinedPlayerSeasons = new Set<string>();
  for (const record of resolved) {
    for (const season of seasonsById.get(record.playerId) ?? []) {
      if (season <= record.priorSeason) {
        preSigningIds.add(record.contractRow);
        joinedPlayerSeasons.add(`${record.playerId}:${season}`);
      }
    }
  }
  const byPeriod = Object.fromEntries(([...FREEZE_PERIODS, { name: "outside" as const }]).map(period => {
    const rows = recordsForPeriod(resolved, period.name, preSigningIds);
    return [period.name, {
      contractRows: rows.length,
      distinctPlayers: new Set(rows.map(row => row.playerId)).size,
      units: sumUnits(rows),
      sampleGate: period.name === "outside" ? "not evaluated" : {
        contracts: rows.length >= CALIBRATION_SAMPLE_GATES[period.name].contracts,
        players: new Set(rows.map(row => row.playerId)).size >= CALIBRATION_SAMPLE_GATES[period.name].players,
        F: sumUnits(rows).F >= CALIBRATION_SAMPLE_GATES[period.name].F,
        D: sumUnits(rows).D >= CALIBRATION_SAMPLE_GATES[period.name].D,
        G: sumUnits(rows).G >= CALIBRATION_SAMPLE_GATES[period.name].G,
      },
    }];
  }));
  const resolvedRows = resolved.map(record => record.signing);
  const bySigningYear = compareDistributions(resolvedRows, unresolved, "year");
  const byPosition = compareDistributions(resolvedRows, unresolved, "position");
  const byAge = compareDistributions(resolvedRows, unresolved, "age");
  const byContractLevel = compareDistributions(resolvedRows, unresolved, "level");
  const bySigningStatus = compareDistributions(resolvedRows, unresolved, "status");
  const byTeam = compareDistributions(resolvedRows, unresolved, "team");
  return {
    resolvedCoverage: {
      contractRows: resolved.length,
      distinctPlayers: new Set(resolved.map(row => row.playerId)).size,
      identityResolution: resolved.reduce((all, row) => (all[row.resolution]++, all), { exact: 0, normalized: 0, manual: 0 }),
      bySigningYear,
      byPosition,
      byAge,
      byContractLevel,
      bySigningStatus,
      byTeam,
      representativeness: {
        position: categoryGate(byPosition),
        age: categoryGate(byAge),
        contractLevel: categoryGate(byContractLevel),
          // The ledger itself leaves signing status blank for 1,714 records.
          // That is feature missingness to report with uncertainty, not an
          // identity-resolution requirement that more NHL IDs can repair.
          signingStatus: {
            missingResolved: bySigningStatus.find(row => row.value === "missing")?.resolved ?? 0,
            missingUnresolved: bySigningStatus.find(row => row.value === "missing")?.unresolved ?? 0,
            treatment: "missing-status stratum; no imputation; wider uncertainty",
          },
        signingYear: categoryGate(bySigningYear),
        team: { totalVariationPp: totalVariation(byTeam), pass: totalVariation(byTeam) <= CALIBRATION_SAMPLE_GATES.representativeness.teamTotalVariation },
        fieldLevelMinimumAdditionalRows: {
          age: fieldLevelMinimum(resolvedRows, unresolved, "age"),
          contractLevel: fieldLevelMinimum(resolvedRows, unresolved, "level"),
        },
      },
    },
    moneyPuckJoin: {
      resolvedContractsWithPreSigningSeason: preSigningIds.size,
      distinctResolvedPlayersWithPreSigningSeason: new Set(resolved.filter(row => preSigningIds.has(row.contractRow)).map(row => row.playerId)).size,
      distinctJoinedPlayerSeasons: joinedPlayerSeasons.size,
      resolvedContractsWithoutPreSigningSeason: resolved.length - preSigningIds.size,
      byPeriod,
    },
    gates: CALIBRATION_SAMPLE_GATES,
  };
}

export function runCalibrationCohortAudit() {
  const identities = runHistoricalDataAudit();
  const signings = parseCsv(readFileSync("OtherData/contracts/signings.csv", "utf8"));
  const moneyPuckRows = loadLocalIdentitySources(readFileSync)
    .filter(source => source.source !== "historicalGoalie")
    .map(source => ({ season: source.season, row: source.row }));
  return auditCalibrationCohort(identities.resolved, identities.unresolved.map(row => signings[row.contractRow - 2]), moneyPuckRows);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("scripts/backtest/nav-calibration-cohort.ts")) {
  try { console.log(JSON.stringify(runCalibrationCohortAudit(), null, 2)); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
