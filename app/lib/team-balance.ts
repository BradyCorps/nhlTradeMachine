import { OBSERVED_SEASONS, type ObservedSelection } from "@/app/lib/observed-season";

export interface TeamBalanceInput {
  id: string;
  name: string;
  observedSelection?: ObservedSelection;
  observedCoverage?: string;
  record: { gamesPlayed: number | null; goalsFor: number | null; goalsAgainst: number | null;
    shotsForPerGame: number | null; shotsAgainstPerGame: number | null } | null;
}
export interface TeamBalance {
  id: string; name: string; games: number | null;
  goalsFor: number | null; goalsAgainst: number | null;
  shotsFor: number | null; shotsAgainst: number | null;
  reason: string | null;
}
const measured = (value: number | null | undefined) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;

export function sameObservedSelection(a: ObservedSelection | undefined, b: ObservedSelection) {
  return a?.season === b.season && a.gameType === b.gameType;
}

export function gameBalanceSelection(game: { season: number; gameType: number }): ObservedSelection | null {
  const season = OBSERVED_SEASONS.find(value => value === String(game.season));
  return season && (game.gameType === 2 || game.gameType === 3) ? { season, gameType: game.gameType } : null;
}

export function buildTeamBalance(team: TeamBalanceInput, selection: ObservedSelection): TeamBalance {
  const empty = { id: team.id, name: team.name, games: null, goalsFor: null, goalsAgainst: null, shotsFor: null, shotsAgainst: null };
  if (!sameObservedSelection(team.observedSelection, selection)) return { ...empty, reason: "Selected-season statistics unavailable" };
  const record = team.record;
  const games = measured(record?.gamesPlayed);
  if (!record || !["available", "zero-games"].includes(team.observedCoverage ?? "") || games === null || !Number.isInteger(games)) {
    return { ...empty, reason: "NHL summary coverage unavailable" };
  }
  if (games === 0) return { ...empty, games, reason: "No games recorded; per-game rates unavailable" };
  const goalsFor = measured(record.goalsFor), goalsAgainst = measured(record.goalsAgainst);
  return { ...empty, games,
    goalsFor: goalsFor === null ? null : goalsFor / games,
    goalsAgainst: goalsAgainst === null ? null : goalsAgainst / games,
    shotsFor: measured(record.shotsForPerGame), shotsAgainst: measured(record.shotsAgainstPerGame), reason: null };
}

export function balanceDifference(forValue: number | null, againstValue: number | null) {
  return forValue === null || againstValue === null ? null : forValue - againstValue;
}

export function balanceValue(value: number | null, signed = false) {
  if (value === null || !Number.isFinite(value)) return "Unavailable";
  return `${signed && value > 0 ? "+" : ""}${value.toFixed(2)}`;
}
