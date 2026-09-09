/** NAV-01 local historical-data and NHL-ID coverage audit. */
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { makePlayerId, nicknameMergeKey } from "../../app/lib/player-identity";
import { parseCsv } from "./nav-target-pilot";
import { priorSeasonForSigning } from "./nav-contract-target-audit";

const SIGNINGS = "OtherData/contracts/signings.csv";
const WORKBOOK = "OtherData/contracts/NHL_Contract_signings.xlsx";
const HISTORICAL_GOALIES = "OtherData/HistoricalData/goalies_2008_to_2024.csv";
const HISTORICAL_SKATERS = "OtherData/HistoricalData/skaters_2008_to_2024.csv";

const MONEYPUCK_FILES = [
  [2022, "skater", "MoneyPuckData/2022_23/skaters(3).csv"],
  [2022, "goalie", "MoneyPuckData/2022_23/goalies(3).csv"],
  [2023, "skater", "MoneyPuckData/2023_24/skaters(2).csv"],
  [2023, "goalie", "MoneyPuckData/2023_24/goalies(2).csv"],
  [2024, "skater", "MoneyPuckData/2024_25/skaters(1).csv"],
  [2024, "goalie", "MoneyPuckData/2024_25/goalies(1).csv"],
  [2025, "skater", "MoneyPuckData/2025_26/skaters.csv"],
  [2025, "goalie", "MoneyPuckData/2025_26/goalies.csv"],
] as const;

type Row = Record<string, string>;
type SourceRow = { season: number; source: "historicalGoalie" | "moneyPuckSkater" | "moneyPuckGoalie"; row: Row };
type Resolution = "exact" | "normalized" | "manual" | "unmatched";

export interface UnresolvedContractRecord {
  contractRow: number;
  player: string;
  team: string;
  position: string;
  signDate: string;
  reason: "ambiguous identity" | "no ID-bearing name candidate" | "invalid signing date";
}

export interface HistoricalDataAudit {
  inventory: {
    signingLedgerRows: number;
    signingWorkbookPresent: boolean;
    historicalGoalieFilePresent: boolean;
    historicalSkaterFilePresent: boolean;
    moneyPuckFilesPresent: number;
    idBearingRows: number;
    idBearingPlayers: number;
    historicalGoalieRows: number;
    moneyPuckSkaterRows: number;
    moneyPuckGoalieRows: number;
  };
  identityCoverage: {
    total: number;
    exact: number;
    normalized: number;
    manual: number;
    unmatched: number;
    matchedWithPreSigningPerformance: number;
    matchedWithoutPreSigningPerformance: number;
    unresolvedByReason: Record<UnresolvedContractRecord["reason"], number>;
  };
  unresolved: UnresolvedContractRecord[];
}

function plainNameKey(name: string): string {
  return name.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]/g, "");
}

function add(map: Map<string, Set<string>>, key: string, id: string) {
  if (!key) return;
  const ids = map.get(key) ?? new Set<string>();
  ids.add(id);
  map.set(key, ids);
}

function unique(map: Map<string, Set<string>>, key: string): string | null {
  const ids = map.get(key);
  return ids?.size === 1 ? [...ids][0] : null;
}

function ambiguous(map: Map<string, Set<string>>, key: string): boolean {
  return (map.get(key)?.size ?? 0) > 1;
}

function teamVariantKey(team: string, name: string): string {
  return `${team.trim().toUpperCase()}::${nicknameMergeKey(name)}`;
}

function positionGroup(position: string): string {
  const value = position.trim().toUpperCase();
  return ["L", "R", "LW", "RW", "W"].includes(value) ? "W" : value;
}

function positionKey(key: string, position: string): string {
  return `${positionGroup(position)}::${key}`;
}

export function auditHistoricalData(signings: Row[], sourceRows: SourceRow[], presence: {
  signingWorkbookPresent: boolean;
  historicalGoalieFilePresent: boolean;
  historicalSkaterFilePresent: boolean;
  moneyPuckFilesPresent: number;
} = {
  signingWorkbookPresent: true,
  historicalGoalieFilePresent: true,
  historicalSkaterFilePresent: false,
  moneyPuckFilesPresent: MONEYPUCK_FILES.length,
}): HistoricalDataAudit {
  const raw = new Map<string, Set<string>>();
  const rawByPosition = new Map<string, Set<string>>();
  const normalized = new Map<string, Set<string>>();
  const normalizedByPosition = new Map<string, Set<string>>();
  const manual = new Map<string, Set<string>>();
  const manualByPosition = new Map<string, Set<string>>();
  const teamScopedVariant = new Map<string, Set<string>>();
  const seasonsById = new Map<string, Set<number>>();
  let idBearingRows = 0, historicalGoalieRows = 0, moneyPuckSkaterRows = 0, moneyPuckGoalieRows = 0;

  for (const source of sourceRows) {
    const { row } = source;
    if (row.situation !== "all" || !/^\d+$/.test(row.playerId ?? "") || !row.name?.trim()) continue;
    idBearingRows++;
    if (source.source === "historicalGoalie") historicalGoalieRows++;
    if (source.source === "moneyPuckSkater") moneyPuckSkaterRows++;
    if (source.source === "moneyPuckGoalie") moneyPuckGoalieRows++;
    add(raw, row.name.trim(), row.playerId);
    add(rawByPosition, positionKey(row.name.trim(), row.position ?? ""), row.playerId);
    add(normalized, plainNameKey(row.name), row.playerId);
    add(normalizedByPosition, positionKey(plainNameKey(row.name), row.position ?? ""), row.playerId);
    // This is the repository's explicit alias/variant normalization.  We
    // only accept it when it resolves to one NHL playerId.
    add(manual, makePlayerId(row.name), row.playerId);
    add(manualByPosition, positionKey(makePlayerId(row.name), row.position ?? ""), row.playerId);
    // nicknameMergeKey is deliberately safe only inside one team; preserve
    // that constraint when using it for historical resolution.
    add(teamScopedVariant, teamVariantKey(row.team ?? "", row.name), row.playerId);
    const seasons = seasonsById.get(row.playerId) ?? new Set<number>();
    seasons.add(source.season);
    seasonsById.set(row.playerId, seasons);
  }

  const unresolved: UnresolvedContractRecord[] = [];
  const identityCoverage: HistoricalDataAudit["identityCoverage"] = {
    total: signings.length, exact: 0, normalized: 0, manual: 0, unmatched: 0,
    matchedWithPreSigningPerformance: 0, matchedWithoutPreSigningPerformance: 0,
    unresolvedByReason: { "ambiguous identity": 0, "no ID-bearing name candidate": 0, "invalid signing date": 0 },
  };

  for (const [index, signing] of signings.entries()) {
    const player = signing.player?.trim() ?? "";
    const signDate = signing.signDate ?? "";
    const priorSeason = priorSeasonForSigning(signDate);
    let resolution: Resolution = "unmatched";
    let id: string | null = null;
    if (priorSeason == null) {
      identityCoverage.unresolvedByReason["invalid signing date"]++;
      unresolved.push({ contractRow: index + 2, player, team: signing.team ?? "", position: signing.pos ?? "", signDate, reason: "invalid signing date" });
    } else if ((id = unique(raw, player) ?? unique(rawByPosition, positionKey(player, signing.pos ?? "")))) {
      resolution = "exact";
    } else if ((id = unique(normalized, plainNameKey(player)) ?? unique(normalizedByPosition, positionKey(plainNameKey(player), signing.pos ?? "")))) {
      resolution = "normalized";
    } else {
      id = unique(manual, makePlayerId(player))
        ?? unique(manualByPosition, positionKey(makePlayerId(player), signing.pos ?? ""))
        ?? unique(teamScopedVariant, teamVariantKey(signing.team ?? "", player));
      if (id) resolution = "manual";
      else {
        const collision = ambiguous(raw, player)
          || ambiguous(rawByPosition, positionKey(player, signing.pos ?? ""))
          || ambiguous(normalized, plainNameKey(player))
          || ambiguous(normalizedByPosition, positionKey(plainNameKey(player), signing.pos ?? ""))
          || ambiguous(manual, makePlayerId(player))
          || ambiguous(manualByPosition, positionKey(makePlayerId(player), signing.pos ?? ""))
          || ambiguous(teamScopedVariant, teamVariantKey(signing.team ?? "", player));
        const reason = collision ? "ambiguous identity" : "no ID-bearing name candidate";
        identityCoverage.unresolvedByReason[reason]++;
        unresolved.push({ contractRow: index + 2, player, team: signing.team ?? "", position: signing.pos ?? "", signDate, reason });
      }
    }
    identityCoverage[resolution]++;
    if (id) {
      if ([...(seasonsById.get(id) ?? [])].some(season => season <= priorSeason!)) identityCoverage.matchedWithPreSigningPerformance++;
      else identityCoverage.matchedWithoutPreSigningPerformance++;
    }
  }
  return {
    inventory: {
      signingLedgerRows: signings.length,
      signingWorkbookPresent: presence.signingWorkbookPresent,
      historicalGoalieFilePresent: presence.historicalGoalieFilePresent,
      historicalSkaterFilePresent: presence.historicalSkaterFilePresent,
      moneyPuckFilesPresent: presence.moneyPuckFilesPresent,
      idBearingRows, idBearingPlayers: seasonsById.size, historicalGoalieRows, moneyPuckSkaterRows, moneyPuckGoalieRows,
    },
    identityCoverage, unresolved,
  };
}

export function runHistoricalDataAudit(read = readFileSync, exists = existsSync): HistoricalDataAudit {
  const signings = parseCsv(read(SIGNINGS, "utf8"));
  const sourceRows: SourceRow[] = [
    ...parseCsv(read(HISTORICAL_GOALIES, "utf8")).map(row => ({ season: Number(row.season), source: "historicalGoalie" as const, row })),
    ...MONEYPUCK_FILES.flatMap(([season, kind, file]) => parseCsv(read(file, "utf8")).map(row => ({
      season, source: kind === "skater" ? "moneyPuckSkater" as const : "moneyPuckGoalie" as const, row,
    }))),
  ];
  return auditHistoricalData(signings, sourceRows, {
    signingWorkbookPresent: exists(WORKBOOK),
    historicalGoalieFilePresent: exists(HISTORICAL_GOALIES),
    historicalSkaterFilePresent: exists(HISTORICAL_SKATERS),
    moneyPuckFilesPresent: MONEYPUCK_FILES.filter(([, , file]) => exists(file)).length,
  });
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve("scripts/backtest/nav-historical-data-audit.ts")) {
  try {
    const report = runHistoricalDataAudit();
    const onlyUnresolved = process.argv.includes("--unresolved");
    console.log(JSON.stringify(onlyUnresolved ? report.unresolved : { ...report, unresolved: undefined }, null, 2));
  } catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; }
}
