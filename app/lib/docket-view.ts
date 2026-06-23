import type { TradeRecord } from "@/app/lib/trades";

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
  retainedPct: number;
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
  atTradeVerdict: string;
  todayVerdict: string;
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

export function tradeToDocketEntry(trade: TradeRecord): DocketEntry | null {
  if (!trade.published || !trade.gradeAtTrade) return null;

  const packages = trade.sides.map((side) => {
    const assets = side.assetsGiven.map((asset) => ({
      kind: asset.kind,
      name: assetName(asset),
      navAtTrade: asset.navAtTrade,
      retainedPct: asset.retainedPct ?? 0,
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
    atTradeVerdict: trade.lockedVerdict?.message ?? trade.gradeAtTrade.fairness,
    todayVerdict: "Pending live re-grade",
    rosterMutating: trade.rosterMutating,
  };
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
