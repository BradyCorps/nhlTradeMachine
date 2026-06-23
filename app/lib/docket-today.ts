import { POST as evaluatePost } from "@/app/api/evaluate/route";
import type { DocketEntry } from "@/app/lib/docket-view";
import { canonicalNameSlug } from "@/app/lib/player-identity";
import { assembleCanonicalRoster } from "@/app/lib/roster-assembly";
import type { Asset, EvaluateResponse, Team } from "@/app/lib/trade-types";

const assetKey = (asset: Pick<Asset, "id" | "name">): string[] => [
  asset.id ? `id:${asset.id}` : "",
  asset.name ? `slug:${canonicalNameSlug(asset.name)}` : "",
].filter(Boolean);

const buildCurrentAssetIndex = (players: Asset[]): Map<string, Asset> => {
  const index = new Map<string, Asset>();
  for (const player of players) {
    for (const key of assetKey(player)) index.set(key, player);
  }
  return index;
};

const currentAssetFor = (
  frozenAsset: Asset,
  currentAssets: Map<string, Asset>,
): Asset => {
  for (const key of assetKey(frozenAsset)) {
    const current = currentAssets.get(key);
    if (current) {
      return {
        ...current,
        retainedPct: frozenAsset.retainedPct,
      };
    }
  }
  return frozenAsset;
};

const navMargin = (verdict: EvaluateResponse["verdict"]): number | null => {
  if (!verdict) return null;
  return Math.abs(verdict.metrics.homeNetGain);
};

const winnerFor = (
  verdict: EvaluateResponse["verdict"],
  homeTeamId: string,
  partnerTeamId: string,
): string | null => {
  if (!verdict || verdict.status === "FAIR" || verdict.metrics.homeNetGain === 0) return null;
  return verdict.metrics.homeNetGain > 0 ? homeTeamId : partnerTeamId;
};

async function evaluateTodayEntry(
  entry: DocketEntry,
  teams: Team[],
  currentAssets: Map<string, Asset>,
  capCeiling?: number | null,
): Promise<DocketEntry> {
  const [homePackage, partnerPackage] = entry.packages;
  const homeTeam = teams.find(team => team.id === homePackage?.teamId);
  const partnerTeam = teams.find(team => team.id === partnerPackage?.teamId);
  if (!homePackage || !partnerPackage || !homeTeam || !partnerTeam) return entry;

  const tradeOutgoing = homePackage.assets.map(asset => currentAssetFor(asset.asset, currentAssets));
  const tradeIncoming = partnerPackage.assets.map(asset => currentAssetFor(asset.asset, currentAssets));
  const assets = [...tradeOutgoing, ...tradeIncoming];
  const allHomeRoster = [...currentAssets.values()].filter(asset => asset.teamId === homeTeam.id);
  const allPartnerRoster = [...currentAssets.values()].filter(asset => asset.teamId === partnerTeam.id);

  const response = await evaluatePost(new Request("http://localhost/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      assets,
      tradeOutgoing,
      tradeIncoming,
      homeTeam,
      partnerTeam,
      allHomeRoster,
      allPartnerRoster,
      capCeiling,
      runTrade: true,
    }),
  }));
  if (!response.ok) return entry;
  const evaluation = await response.json() as EvaluateResponse;
  const currentById = new Map(assets.map(asset => [asset.id, asset]));
  const todayWinner = winnerFor(evaluation.verdict, homeTeam.id, partnerTeam.id);
  const todayMargin = navMargin(evaluation.verdict);

  return {
    ...entry,
    packages: entry.packages.map(pkg => ({
      ...pkg,
      assets: pkg.assets.map(asset => {
        const currentAsset = currentAssetFor(asset.asset, currentAssets);
        const navToday = evaluation.navMap[currentAsset.id]?.total ?? null;
        return {
          ...asset,
          navToday,
          currentAsset: currentById.get(currentAsset.id) ?? currentAsset,
        };
      }),
    })),
    todayVerdict: evaluation.verdict?.message ?? "Today grade unavailable",
    todayWinner,
    todayNavMargin: todayMargin,
    todayLockedVerdict: evaluation.verdict ?? null,
  };
}

export async function attachTodayDocketGrades(entries: DocketEntry[]): Promise<DocketEntry[]> {
  if (entries.length === 0) return entries;
  try {
    const roster = await assembleCanonicalRoster({ includeTeamContext: true });
    const currentAssets = buildCurrentAssetIndex(roster.players as Asset[]);
    const teams = roster.teams as Team[];
    return Promise.all(entries.map(entry =>
      evaluateTodayEntry(entry, teams, currentAssets)
    ));
  } catch (error) {
    console.warn("[Docket] today re-grade skipped:", error instanceof Error ? error.message : error);
    return entries;
  }
}
