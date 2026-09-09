/** NAV-01 economic-target join audit. Aggregate results only; never emits signing rows. */
import { readFileSync } from "node:fs";
import path from "node:path";
import { activePlayers, type ActivePlayerRow } from "../../app/lib/nhl-active-players";
import { parseCsv } from "./nav-target-pilot";

const SOURCE_FILES = [
  [2022, "MoneyPuckData/2022_23/skaters(3).csv"],
  [2022, "MoneyPuckData/2022_23/goalies(3).csv"],
  [2023, "MoneyPuckData/2023_24/skaters(2).csv"],
  [2023, "MoneyPuckData/2023_24/goalies(2).csv"],
  [2024, "MoneyPuckData/2024_25/skaters(1).csv"],
  [2024, "MoneyPuckData/2024_25/goalies(1).csv"],
  [2025, "MoneyPuckData/2025_26/skaters.csv"],
  [2025, "MoneyPuckData/2025_26/goalies.csv"],
] as const;
const SIGNINGS = "OtherData/contracts/signings.csv";

export function normalizedName(name: string): string {
  return name.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().replace(/[^a-z]/g, "");
}

export function priorSeasonForSigning(date: string): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  // A July–December signing follows the season ending that spring; an
  // in-season signing may only consume the season ending in the prior year.
  return month >= 7 ? year - 1 : year - 2;
}

interface SigningRow { [key: string]: string }
export interface ContractAudit {
  ledgerRows: number;
  validSigningDates: number;
  validContractFields: number;
  eligibleOneWayStandard: number;
  sourceRows: number;
  sourcePlayers: number;
  exactUniqueNameMatches: number;
  ambiguousNameMatches: number;
  noAccessibleNameMatch: number;
  matchesWithPriorOnlyPerformance: number;
  matchesWithoutPriorPerformance: number;
  dateOutsideAccessiblePerformanceWindow: number;
  blockedReasons: string[];
}

export interface NhlIdentityAudit {
  currentRosterRows: number;
  signingNameAndPositionMatches: number;
  signingNamePositionAndTeamMatches: number;
  corroboratedNhlIdMatches: number;
  idConflicts: number;
  limitations: string[];
}

function positive(value: string | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0;
}

export function auditContracts(
  signingRows: SigningRow[],
  performanceRows: Array<{ season: number; row: Record<string, string> }>,
): ContractAudit {
  const names = new Map<string, Set<string>>();
  const seasonsById = new Map<string, Set<number>>();
  let sourceRows = 0;
  for (const { season, row } of performanceRows) {
    if (row.situation !== "all" || !/^\d+$/.test(row.playerId) || !row.name?.trim()) continue;
    sourceRows++;
    const id = row.playerId;
    const key = normalizedName(row.name);
    const ids = names.get(key) ?? new Set<string>();
    ids.add(id); names.set(key, ids);
    const years = seasonsById.get(id) ?? new Set<number>();
    years.add(season); seasonsById.set(id, years);
  }
  const result: ContractAudit = {
    ledgerRows: signingRows.length, validSigningDates: 0, validContractFields: 0, eligibleOneWayStandard: 0,
    sourceRows, sourcePlayers: seasonsById.size, exactUniqueNameMatches: 0, ambiguousNameMatches: 0,
    noAccessibleNameMatch: 0, matchesWithPriorOnlyPerformance: 0, matchesWithoutPriorPerformance: 0,
    dateOutsideAccessiblePerformanceWindow: 0,
    blockedReasons: [
      "Signing ledger has no canonical NHL player ID; exact normalised names are a feasibility diagnostic, not an identity join.",
      "Accessible performance seasons are 2022–2025; dates outside their prior-season window cannot be evaluated.",
      "The ledger lacks an observed independent composite transaction-value label.",
    ],
  };
  for (const signing of signingRows) {
    const priorSeason = priorSeasonForSigning(signing.signDate);
    if (priorSeason == null) continue;
    result.validSigningDates++;
    if (positive(signing.capHit) && positive(signing.capPct) && /^\d+yr$/.test(signing.term ?? "") && signing.pos?.trim()) result.validContractFields++;
    if (signing.structure?.trim() === "1-Way" && signing.level?.trim() === "STD") result.eligibleOneWayStandard++;
    if (priorSeason < 2022 || priorSeason > 2025) { result.dateOutsideAccessiblePerformanceWindow++; continue; }
    const matches = names.get(normalizedName(signing.player));
    if (!matches?.size) { result.noAccessibleNameMatch++; continue; }
    if (matches.size !== 1) { result.ambiguousNameMatches++; continue; }
    result.exactUniqueNameMatches++;
    const id = [...matches][0];
    if ([...(seasonsById.get(id) ?? [])].some(season => season <= priorSeason)) result.matchesWithPriorOnlyPerformance++;
    else result.matchesWithoutPriorPerformance++;
  }
  return result;
}

function samePosition(signingPosition: string, nhlPosition: string): boolean {
  const signing = signingPosition.trim().toUpperCase();
  const nhl = nhlPosition.trim().toUpperCase();
  return signing === nhl || (["L", "R", "LW", "RW", "W"].includes(signing) && ["L", "R", "LW", "RW", "W"].includes(nhl));
}

/**
 * Cross-reference against the NHL-ID seed that EDGE capture requests use.
 * It corroborates current identities only: the seed has no capture date,
 * contract date, or retired-player coverage, so it never upgrades a signing
 * into an as-of historical identity by itself.
 */
export function auditNhlIdentity(
  signingRows: SigningRow[],
  performanceRows: Array<{ season: number; row: Record<string, string> }>,
  rosterRows: ActivePlayerRow[],
): NhlIdentityAudit {
  const performanceIds = new Map<string, Set<string>>();
  for (const { row } of performanceRows) {
    if (row.situation !== "all" || !/^\d+$/.test(row.playerId) || !row.name?.trim()) continue;
    const ids = performanceIds.get(normalizedName(row.name)) ?? new Set<string>();
    ids.add(row.playerId); performanceIds.set(normalizedName(row.name), ids);
  }
  const rosterByName = new Map<string, ActivePlayerRow[]>();
  for (const row of rosterRows) {
    const key = normalizedName(row.name);
    rosterByName.set(key, [...(rosterByName.get(key) ?? []), row]);
  }
  let signingNameAndPositionMatches = 0, signingNamePositionAndTeamMatches = 0;
  let corroboratedNhlIdMatches = 0, idConflicts = 0;
  for (const signing of signingRows) {
    const matches = (rosterByName.get(normalizedName(signing.player)) ?? []).filter(row => samePosition(signing.pos ?? "", row.position));
    if (matches.length !== 1) continue;
    signingNameAndPositionMatches++;
    if (matches[0].team === signing.team?.trim().toUpperCase()) signingNamePositionAndTeamMatches++;
    const performance = performanceIds.get(normalizedName(signing.player));
    if (performance?.size === 1) {
      if (performance.has(matches[0].id)) corroboratedNhlIdMatches++;
      else idConflicts++;
    }
  }
  return {
    currentRosterRows: rosterRows.length, signingNameAndPositionMatches, signingNamePositionAndTeamMatches,
    corroboratedNhlIdMatches, idConflicts,
    limitations: [
      "The NHL roster seed is current and has no as-of timestamp; it cannot prove a historical contract identity or availability date.",
      "Only agreement between a uniquely matched roster ID and uniquely matched MoneyPuck playerId is reported; name/position matching alone is not canonical identity.",
      "NHL EDGE captures a subset of the roster by season and does not contain contract terms, signing dates, or transaction-value labels.",
    ],
  };
}

export function runContractAudit(read = readFileSync) {
  const signingRows = parseCsv(read(SIGNINGS, "utf8"));
  const performanceRows = SOURCE_FILES.flatMap(([season, file]) =>
    parseCsv(read(file, "utf8")).map(row => ({ season, row })),
  );
  return {
    contractJoin: auditContracts(signingRows, performanceRows),
    currentNhlIdentity: auditNhlIdentity(signingRows, performanceRows, activePlayers()),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("scripts/backtest/nav-contract-target-audit.ts")) {
  try { console.log(JSON.stringify(runContractAudit(), null, 2)); }
  catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
