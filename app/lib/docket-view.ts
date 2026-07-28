import type { TradeRecord } from "@/app/lib/trades";
import type { Asset, TradeVerdict } from "@/app/lib/trade-types";

export type DocketSortKey = "date-desc" | "date-asc" | "nav-desc" | "nav-asc" | "winner";

export interface DocketFilters {
  teamId?: string;
  winner?: string;
  query?: string;
  sort?: DocketSortKey;
}

export interface DocketPackageAsset {
  kind: "player" | "pick";
  name: string;
  navAtTrade: number | null;
  navToday: number | null;
  retainedPct: number;
  asset: Asset;
  currentAsset: Asset | null;
}

export interface DocketPackage {
  teamId: string;
  assets: DocketPackageAsset[];
  navTotal: number;
}

export interface DocketEntry {
  id: string;
  executedDate: string;
  sourceUrl: string | null;
  season: string;
  teams: string[];
  winner: string | null;
  fairness: string;
  navMargin: number;
  packages: DocketPackage[];
  conditions: string | null;
  lockedVerdict: TradeVerdict | null;
  atTradeVerdict: string;
  todayVerdict: string;
  todayWinner: string | null;
  todayNavMargin: number | null;
  todayLockedVerdict: TradeVerdict | null;
  rosterMutating: boolean;
}

const slugToLabel = (slug: string): string =>
  slug
    .split("-")
    .filter(Boolean)
    .map(part => part.slice(0, 1).toUpperCase() + part.slice(1))
    .join(" ");

const assetName = (asset: TradeRecord["sides"][number]["assetsGiven"][number]): string => {
  const snapshotName = asset.inputSnapshot.name;
  return typeof snapshotName === "string" && snapshotName.trim()
    ? snapshotName
    : slugToLabel(asset.ref.nameSlug || asset.ref.id);
};

const navTotal = (assets: DocketPackageAsset[]): number =>
  assets.reduce((sum, asset) => sum + (asset.navAtTrade ?? 0), 0);

const navMarginFromGrade = (perTeamNetNav: Record<string, number>): number => {
  const margins = Object.values(perTeamNetNav).filter(Number.isFinite).map(Math.abs);
  return margins.length ? Math.max(...margins) : 0;
};

const numberFromSnapshot = (
  snapshot: Record<string, unknown>,
  key: string,
  fallback = 0,
): number => {
  const value = snapshot[key];
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
};

const boolFromSnapshot = (
  snapshot: Record<string, unknown>,
  key: string,
  fallback = false,
): boolean => {
  const value = snapshot[key];
  return typeof value === "boolean" ? value : fallback;
};

const stringFromSnapshot = (
  snapshot: Record<string, unknown>,
  key: string,
  fallback: string,
): string => {
  const value = snapshot[key];
  return typeof value === "string" && value.trim() ? value : fallback;
};

const nullableNumberFromSnapshot = (
  snapshot: Record<string, unknown>,
  key: string,
): number | null => {
  const value = snapshot[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

export function assetSnapshotToDocketAsset(
  asset: TradeRecord["sides"][number]["assetsGiven"][number],
  teamId: string,
): Asset {
  const snapshot = asset.inputSnapshot;
  const position = stringFromSnapshot(snapshot, "position", asset.kind === "pick" ? "Pick" : "C");

  return {
    id: stringFromSnapshot(snapshot, "id", asset.ref.id),
    teamId: stringFromSnapshot(snapshot, "teamId", teamId),
    name: assetName(asset),
    position,
    age: numberFromSnapshot(snapshot, "age"),
    games: numberFromSnapshot(snapshot, "games"),
    ptsPace: numberFromSnapshot(snapshot, "ptsPace"),
    xGPace: numberFromSnapshot(snapshot, "xGPace"),
    defRate: numberFromSnapshot(snapshot, "defRate"),
    avgTOI: numberFromSnapshot(snapshot, "avgTOI"),
    capHit: numberFromSnapshot(snapshot, "capHit"),
    yearsRemaining: numberFromSnapshot(snapshot, "yearsRemaining"),
    capCeiling: numberFromSnapshot(snapshot, "capCeiling"),
    hasNMC: boolFromSnapshot(snapshot, "hasNMC"),
    hasNTC: boolFromSnapshot(snapshot, "hasNTC"),
    canRetain: boolFromSnapshot(snapshot, "canRetain"),
    retainedPct: asset.retainedPct ?? numberFromSnapshot(snapshot, "retainedPct"),
    multiplier: numberFromSnapshot(snapshot, "multiplier", 1),
    qocIndex: nullableNumberFromSnapshot(snapshot, "qocIndex"),
    rosterTier: typeof snapshot.rosterTier === "string" ? snapshot.rosterTier as Asset["rosterTier"] : undefined,
    draftYear: nullableNumberFromSnapshot(snapshot, "draftYear"),
    draftOverall: nullableNumberFromSnapshot(snapshot, "draftOverall"),
    prospectPtsPace: nullableNumberFromSnapshot(snapshot, "prospectPtsPace"),
    developmentProfile: typeof snapshot.developmentProfile === "object" && snapshot.developmentProfile != null
      ? snapshot.developmentProfile as Asset["developmentProfile"]
      : null,
    xgRelTM: nullableNumberFromSnapshot(snapshot, "xgRelTM"),
    xgaRelTM: nullableNumberFromSnapshot(snapshot, "xgaRelTM"),
    dzPct: nullableNumberFromSnapshot(snapshot, "dzPct"),
    goalsPace: numberFromSnapshot(snapshot, "goalsPace"),
    assistsPace: numberFromSnapshot(snapshot, "assistsPace"),
    round: numberFromSnapshot(snapshot, "round"),
    year: numberFromSnapshot(snapshot, "year"),
    teamStanding: numberFromSnapshot(snapshot, "teamStanding"),
    gsax: numberFromSnapshot(snapshot, "gsax"),
    savePct: numberFromSnapshot(snapshot, "savePct"),
    gamesStarted: numberFromSnapshot(snapshot, "gamesStarted"),
    ops: nullableNumberFromSnapshot(snapshot, "ops"),
    dps: nullableNumberFromSnapshot(snapshot, "dps"),
    baselinePtsPace: numberFromSnapshot(snapshot, "baselinePtsPace"),
    pkTimeShare: numberFromSnapshot(snapshot, "pkTimeShare"),
  };
}

export function tradeToDocketEntry(trade: TradeRecord): DocketEntry | null {
  if (!trade.published || !trade.gradeAtTrade) return null;

  const packages = trade.sides.map((side) => {
    const assets = side.assetsGiven.map((asset) => ({
      kind: asset.kind,
      name: assetName(asset),
      navAtTrade: asset.navAtTrade,
      navToday: null,
      retainedPct: asset.retainedPct ?? 0,
      asset: assetSnapshotToDocketAsset(asset, side.teamId),
      currentAsset: null,
    }));
    return {
      teamId: side.teamId,
      assets,
      navTotal: navTotal(assets),
    };
  });

  return {
    id: trade.id,
    executedDate: trade.executedDate,
    sourceUrl: trade.sourceUrl,
    season: trade.season,
    teams: trade.sides.map(side => side.teamId),
    winner: trade.gradeAtTrade.winner,
    fairness: trade.gradeAtTrade.fairness,
    navMargin: navMarginFromGrade(trade.gradeAtTrade.perTeamNetNav),
    packages,
    conditions: trade.conditions,
    lockedVerdict: trade.lockedVerdict ? trade.lockedVerdict as TradeVerdict : null,
    atTradeVerdict: trade.lockedVerdict?.message ?? trade.gradeAtTrade.fairness,
    todayVerdict: "Pending live re-grade",
    todayWinner: null,
    todayNavMargin: null,
    todayLockedVerdict: null,
    rosterMutating: trade.rosterMutating,
  };
}

// ── Which side of the deal is this? ──────────────────────────────
//
// A `DocketPackage` holds `side.assetsGiven` — the assets that club SENT. The
// Docket rendered it under the heading "{team} RECEIVED VALUE", which inverted
// every entry on the page: the club listed as receiving a haul was the one that
// paid it. Anyone reading a grade next to that list drew the opposite
// conclusion from the one the grade supports.
//
// Received is not a field on the record, it is derived: in a two-team trade the
// assets a club receives are exactly the other club's `assetsGiven`. That swap
// has no meaning in a three-way — the record does not say where each asset
// landed — so those are labelled by what the data actually is, SENT, rather
// than guessed at.

export interface DocketReturn {
  teamId: string;
  direction: "received" | "sent";
  assets: DocketPackageAsset[];
  navTotal: number;
}

export function docketReturns(entry: DocketEntry): DocketReturn[] {
  const { packages } = entry;

  if (packages.length === 2) {
    return packages.map((pkg, i) => {
      const incoming = packages[1 - i];
      return {
        teamId: pkg.teamId,
        direction: "received" as const,
        assets: incoming.assets,
        navTotal: incoming.navTotal,
      };
    });
  }

  return packages.map(pkg => ({
    teamId: pkg.teamId,
    direction: "sent" as const,
    assets: pkg.assets,
    navTotal: pkg.navTotal,
  }));
}

export function buildDocketEntries(trades: TradeRecord[]): DocketEntry[] {
  return trades.flatMap((trade) => {
    const entry = tradeToDocketEntry(trade);
    return entry ? [entry] : [];
  });
}

const matchesQuery = (entry: DocketEntry, query: string): boolean => {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const haystack = [
    entry.id,
    entry.executedDate,
    entry.fairness,
    entry.winner ?? "even",
    ...entry.teams,
    ...entry.packages.flatMap(pkg => pkg.assets.map(asset => asset.name)),
  ].join(" ").toLowerCase();
  return haystack.includes(normalized);
};

export function filterAndSortDocketEntries(
  entries: DocketEntry[],
  filters: DocketFilters,
): DocketEntry[] {
  const teamId = filters.teamId?.trim();
  const winner = filters.winner?.trim();
  const sort = filters.sort ?? "date-desc";

  const filtered = entries.filter((entry) => {
    if (teamId && !entry.teams.includes(teamId)) return false;
    if (winner) {
      if (winner === "EVEN" && entry.winner) return false;
      if (winner !== "EVEN" && entry.winner !== winner) return false;
    }
    return matchesQuery(entry, filters.query ?? "");
  });

  return [...filtered].sort((a, b) => {
    if (sort === "date-asc") return a.executedDate.localeCompare(b.executedDate) || a.id.localeCompare(b.id);
    if (sort === "nav-desc") return b.navMargin - a.navMargin || b.executedDate.localeCompare(a.executedDate);
    if (sort === "nav-asc") return a.navMargin - b.navMargin || b.executedDate.localeCompare(a.executedDate);
    if (sort === "winner") return (a.winner ?? "EVEN").localeCompare(b.winner ?? "EVEN") || b.executedDate.localeCompare(a.executedDate);
    return b.executedDate.localeCompare(a.executedDate) || a.id.localeCompare(b.id);
  });
}
