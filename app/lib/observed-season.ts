// Public observations have their own identity; changing it never changes model inputs.
export const OBSERVED_SEASONS = ["20262027", "20252026"] as const;
export type ObservedSeason = typeof OBSERVED_SEASONS[number];
export type ObservedGameType = 2 | 3;
export interface ObservedSelection { season: ObservedSeason; gameType: ObservedGameType }
export const DEFAULT_OBSERVED_SELECTION: ObservedSelection = { season: "20262027", gameType: 2 };

export function parseObservedSelection(params: URLSearchParams): ObservedSelection {
  if (params.getAll("season").length > 1 || params.getAll("gameType").length > 1) {
    throw new Error("Ambiguous statistics selection");
  }
  const season = params.get("season") ?? DEFAULT_OBSERVED_SELECTION.season;
  const gameType = params.get("gameType") ?? "2";
  if (!(OBSERVED_SEASONS as readonly string[]).includes(season) || !["2", "3"].includes(gameType)) {
    throw new Error("Unsupported statistics season or competition");
  }
  return { season: season as ObservedSeason, gameType: Number(gameType) as ObservedGameType };
}

export function observedQuery(selection: ObservedSelection): string {
  return new URLSearchParams({ season: selection.season, gameType: String(selection.gameType) }).toString();
}
export function observedLabel(selection: ObservedSelection): string {
  return `${selection.season.slice(0, 4)}–${selection.season.slice(6)} ${selection.gameType === 2 ? "regular season" : "playoffs"}`;
}
export function observedCacheKey(selection: ObservedSelection, report: string): string {
  return `cache:observed:v1:${selection.season}:${selection.gameType}:${report}`;
}
// Every legacy snapshot source was captured from /2. Playoff sources are explicit.
export function observedSnapshotSource(kind: string, gameType: ObservedGameType): string {
  return gameType === 2 ? kind : `${kind}:3`;
}

export interface ObservedStats extends ObservedSelection {
  coverage: "available" | "zero-games" | "missing" | "unavailable";
  games: number | null;
  goals: number | null;
  assists: number | null;
  points: number | null;
  plusMinus: number | null;
  toiMinutes: number | null;
  savePct: number | null;
  gaa: number | null;
  gamesStarted: number | null;
}
export function missingObservedStats(selection: ObservedSelection, unavailable = false): ObservedStats {
  return { ...selection, coverage: unavailable ? "unavailable" : "missing", games: null,
    goals: null, assists: null, points: null, plusMinus: null, toiMinutes: null,
    savePct: null, gaa: null, gamesStarted: null };
}
