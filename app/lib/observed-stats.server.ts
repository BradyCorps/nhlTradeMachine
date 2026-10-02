import { regulationWinsFrom } from "@/app/lib/nhl-standings-fields";
import { fetchJsonWithStatus } from "@/app/lib/nhl-player-feed";
import { swrCache } from "@/app/lib/swr-cache";
import { swrStore } from "@/app/lib/swr-store";
import { missingObservedStats, observedCacheKey, type ObservedSelection, type ObservedStats } from "@/app/lib/observed-season";

type Report = "skater" | "goalie" | "team";
interface Summary { selection: ObservedSelection; coverage: "available" | "missing" | "unavailable"; rows: Record<string, unknown>[]; source: string; retrievedAt: number }
const numberOrNull = (value: unknown): number | null => typeof value === "number" && Number.isFinite(value) ? value : null;

export function summaryUrl(selection: ObservedSelection, report: Report): string {
  const expression = encodeURIComponent(`seasonId=${selection.season} and gameTypeId=${selection.gameType}`);
  return `https://api.nhle.com/stats/rest/en/${report}/summary?cayenneExp=${expression}&limit=-1`;
}
export function validateSummary(raw: unknown, selection: ObservedSelection, report?: Report): Record<string, unknown>[] | null {
  if (!raw || typeof raw !== "object") return null;
  const { data, total } = raw as { data?: unknown; total?: unknown };
  if (!Array.isArray(data) || total !== data.length) return null; // refuse truncated coverage
  if (data.some(row => !row || typeof row !== "object" || row.seasonId !== Number(selection.season)
    || (row.gameTypeId != null && row.gameTypeId !== selection.gameType)
    || numberOrNull(row.gamesPlayed) == null || row.gamesPlayed < 0)) return null;
  if (report) {
    const field = report === "team" ? "teamId" : "playerId";
    const identities = data.map(row => numberOrNull(row[field]));
    if (identities.some(id => id == null || id <= 0) || new Set(identities).size !== identities.length) return null;
  }
  return data;
}
export async function readObservedSummary(selection: ObservedSelection, report: Report): Promise<Summary> {
  const source = summaryUrl(selection, report);
  const { value } = await swrCache({
    store: swrStore, key: observedCacheKey(selection, report), freshSeconds: 300, staleSeconds: 300,
    isCacheable: value => value.coverage === "available",
    build: async (): Promise<Summary> => {
      const response = await fetchJsonWithStatus(source);
      const rows = response.status === 200 ? validateSummary(response.data, selection, report) : null;
      return { selection, source, retrievedAt: Date.now(), rows: rows ?? [],
        coverage: rows == null ? "unavailable" : rows.length ? "available" : "missing" };
    },
  });
  // Never accept a cache envelope for another identity, even if storage was poisoned.
  if (value.selection.season !== selection.season || value.selection.gameType !== selection.gameType) {
    return { selection, source, retrievedAt: Date.now(), rows: [], coverage: "unavailable" };
  }
  return value;
}
export function statsFromSummary(row: Record<string, unknown> | undefined, summary: Pick<Summary, "selection" | "coverage">): ObservedStats {
  if (!row) return missingObservedStats(summary.selection, summary.coverage === "unavailable");
  const games = numberOrNull(row.gamesPlayed);
  if (games == null) return missingObservedStats(summary.selection, true);
  return { ...summary.selection, coverage: games === 0 ? "zero-games" : "available", games,
    goals: numberOrNull(row.goals), assists: numberOrNull(row.assists), points: numberOrNull(row.points),
    plusMinus: numberOrNull(row.plusMinus), toiMinutes: numberOrNull(row.timeOnIcePerGame) == null ? null : Number(row.timeOnIcePerGame) / 60,
    savePct: numberOrNull(row.savePct), gaa: numberOrNull(row.goalsAgainstAverage), gamesStarted: numberOrNull(row.gamesStarted) };
}
export async function readObservedPlayers(selection: ObservedSelection) {
  const [skaters, goalies] = await Promise.all([readObservedSummary(selection, "skater"), readObservedSummary(selection, "goalie")]);
  const byId = new Map<string, ObservedStats>();
  for (const summary of [skaters, goalies]) {
    for (const row of summary.rows) byId.set(String(row.playerId), statsFromSummary(row, summary));
  }
  return { selection, byId, skaters, goalies };
}

// Match the NHL team summary to existing franchise metadata. No current standings enrichment.
export function observedTeamRecord(row: Record<string, unknown> | undefined) {
  if (!row) return null;
  return { wins: numberOrNull(row.wins), losses: numberOrNull(row.losses), otLosses: numberOrNull(row.otLosses),
    points: numberOrNull(row.points), gamesPlayed: numberOrNull(row.gamesPlayed),
    goalsFor: numberOrNull(row.goalsFor), goalsAgainst: numberOrNull(row.goalsAgainst),
    powerPlayPct: numberOrNull(row.powerPlayPct), penaltyKillPct: numberOrNull(row.penaltyKillPct),
    shotsForPerGame: numberOrNull(row.shotsForPerGame), shotsAgainstPerGame: numberOrNull(row.shotsAgainstPerGame),
    faceoffWinPct: numberOrNull(row.faceoffWinPct), regulationWins: regulationWinsFrom(row),
    streakCode: "", streakCount: 0, l10Record: "", clinchIndicator: "", playoffPosition: "" };
}

if (typeof window !== "undefined") throw new Error("Observed statistics readers require a server runtime");
