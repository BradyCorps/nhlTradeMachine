// Game-day observations are independent of the Teams statistics selector and models.
export interface NhlGameTeam {
  id: number;
  abbrev: string;
  name: string;
  record: string | null;
  score: number | null;
}

export interface NhlGame {
  id: number;
  season: number;
  gameType: number;
  gameDate: string;
  startTimeUTC: string;
  gameState: string;
  scheduleState: string;
  away: NhlGameTeam;
  home: NhlGameTeam;
  venue: string | null;
  broadcasts: string[];
  period: number | null;
  periodType: string | null;
  nhlUrl: string;
}

export interface NhlGamesBoard {
  date: string;
  retrievedAt: number;
  games: NhlGame[];
}

const object = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const text = (value: unknown) => typeof value === "string" && value.trim() ? value : null;
const integer = (value: unknown) => typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
const localized = (value: unknown) => text(object(value)?.default);

/** The NHL slate uses Eastern dates, including west-coast starts after midnight UTC. */
export function nhlToday(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

export function validGameDate(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value)
    && Number.isFinite(Date.parse(`${value}T12:00:00Z`))
    && new Date(`${value}T12:00:00Z`).toISOString().slice(0, 10) === value;
}

function teamFrom(value: unknown): NhlGameTeam | null {
  const team = object(value);
  if (!team || !integer(team.id) || !/^[A-Z]{2,3}$/.test(String(team.abbrev))) return null;
  const name = localized(team.name) ?? localized(team.commonName);
  if (!name) return null;
  return { id: team.id as number, abbrev: team.abbrev as string, name,
    record: text(team.record), score: integer(team.score) };
}

/** Reject wrong-date, incomplete and duplicate identities instead of showing a false empty slate. */
export function parseNhlGames(raw: unknown, date: string, retrievedAt = Date.now()): NhlGamesBoard | null {
  const payload = object(raw);
  if (!validGameDate(date) || payload?.currentDate !== date || !Array.isArray(payload.games)) return null;
  const games: NhlGame[] = [];
  const ids = new Set<number>();
  for (const value of payload.games) {
    const game = object(value);
    if (!game) return null;
    const id = integer(game.id), season = integer(game.season), gameType = integer(game.gameType);
    const away = teamFrom(game.awayTeam), home = teamFrom(game.homeTeam);
    const startTimeUTC = text(game.startTimeUTC), gameState = text(game.gameState);
    if (!id || !/^\d{10}$/.test(String(id)) || ids.has(id) || !season || !gameType
      || game.gameDate !== date || !away || !home || away.id === home.id
      || !startTimeUTC || !Number.isFinite(Date.parse(startTimeUTC)) || !gameState) return null;
    ids.add(id);
    const period = object(game.periodDescriptor);
    const broadcasts = Array.isArray(game.tvBroadcasts) ? game.tvBroadcasts : [];
    games.push({ id, season, gameType, gameDate: date, startTimeUTC, gameState,
      scheduleState: text(game.gameScheduleState) ?? "UNKNOWN", away, home,
      venue: localized(game.venue), broadcasts: [...new Set(broadcasts.flatMap(v => text(object(v)?.network) ? [text(object(v)?.network)!] : []))],
      period: integer(period?.number), periodType: text(period?.periodType),
      nhlUrl: `https://www.nhl.com/gamecenter/${id}` });
  }
  games.sort((a, b) => Date.parse(a.startTimeUTC) - Date.parse(b.startTimeUTC) || a.id - b.id);
  return { date, retrievedAt, games };
}

export function gameStatus(game: NhlGame): string {
  if (game.scheduleState === "PPD") return "Postponed";
  if (game.scheduleState === "CNCL") return "Cancelled";
  if (["FINAL", "OFF"].includes(game.gameState)) return `Final${game.periodType === "OT" ? " · OT" : game.periodType === "SO" ? " · SO" : ""}`;
  if (["LIVE", "CRIT"].includes(game.gameState)) return `Live${game.periodType === "OT" ? " · OT" : game.periodType === "SO" ? " · SO" : game.period ? ` · Period ${game.period}` : ""}`;
  if (["FUT", "PRE"].includes(game.gameState) && game.scheduleState === "OK") {
    return new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", hour: "numeric", minute: "2-digit", timeZoneName: "short" }).format(new Date(game.startTimeUTC));
  }
  return "Schedule update pending";
}

export function gameScore(game: NhlGame): string | null {
  if (!["LIVE", "CRIT", "FINAL", "OFF"].includes(game.gameState) || game.scheduleState !== "OK") return null;
  return game.away.score !== null && game.home.score !== null ? `${game.away.score}–${game.home.score}` : null;
}
