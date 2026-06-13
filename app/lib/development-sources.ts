import { SEASON } from "@/app/lib/season-config";
import { redis } from "@/app/lib/redis";
import type {
  DevelopmentLeague,
  DevelopmentProfileInput,
  PlayerSeasonSnapshot,
} from "@/app/lib/development-profile";

export interface NhlSkaterSummaryRow {
  playerId?: number | string;
  skaterFullName?: string;
  firstName?: string;
  lastName?: string;
  teamAbbrevs?: string;
  teamAbbrev?: string;
  positionCode?: string;
  gamesPlayed?: number | string;
  goals?: number | string;
  assists?: number | string;
  points?: number | string;
  timeOnIcePerGame?: number | string;
  birthDate?: string;
  age?: number | string;
}

export interface NhlSkaterTimelineSeed {
  playerId: string;
  name: string;
  position: DevelopmentProfileInput["position"];
  teamAbbrev?: string;
  games: number;
  goals: number;
  assists: number;
  points: number;
  ptsPace: number;
  avgTOI?: number;
  age?: number;
}

export interface DevelopmentSourceDiagnostics {
  id: string;
  name: string;
  warnings: string[];
  missing: string[];
}

export interface DevelopmentSourceFetchOptions {
  fetcher?: typeof fetch;
  seasonId?: string;
  timeoutMs?: number;
}

export interface NhlSeasonSummaryMatch {
  seasonId: string;
  row: NhlSkaterSummaryRow;
}

export interface NhlTimelineFetchOptions extends Omit<DevelopmentSourceFetchOptions, "seasonId"> {
  playerId: string | number;
  seasonIds?: string[];
  endSeasonId?: string;
  seasonCount?: number;
  useCache?: boolean;
}

export interface CachedNhlTimelineResult {
  matches: NhlSeasonSummaryMatch[];
  cache: {
    enabled: boolean;
    timelineCacheHit: boolean;
    summaryCacheHits: string[];
    liveFetches: string[];
  };
}

export interface DevelopmentDbPlayerSeed {
  id: string;
  name: string;
  position: string;
  secondaryPosition?: string | null;
  age?: number | null;
  draftOverall?: number | null;
  draftYear?: number | null;
  prospectPtsPace?: number | null;
}

export interface DevelopmentPlayerPayloadSeed {
  id: string;
  name: string;
  position: string;
  age?: number | null;
  games?: number | null;
  ptsPace?: number | null;
  avgTOI?: number | null;
  draftOverall?: number | null;
  draftYear?: number | null;
  prospectPtsPace?: number | null;
  teamContext?: DevelopmentProfileInput["teamContext"];
  linemateContext?: DevelopmentProfileInput["linemateContext"];
}

export interface ExternalTimelineRow {
  season?: string;
  age?: number | string;
  league?: string;
  teamId?: string;
  games?: number | string;
  goals?: number | string;
  assists?: number | string;
  points?: number | string;
  ptsPerGame?: number | string;
  nhlePtsPace?: number | string;
  avgTOI?: number | string;
  role?: string;
  draftOverall?: number | string;
  draftYear?: number | string;
}

export interface ExternalTimelineParseResult {
  snapshots: PlayerSeasonSnapshot[];
  rejected: Array<{ row: ExternalTimelineRow; reason: string }>;
}

export const DEVELOPMENT_TIMELINE_CACHE_KEY = "cache:development:timeline:v1";
export const DEVELOPMENT_NHL_SUMMARY_CACHE_KEY = "cache:development:nhl_skater_summary:v1";
export const DEVELOPMENT_CACHE_TTL = 12 * 60 * 60;

const NHL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  Accept: "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  Origin: "https://www.nhl.com",
  Referer: "https://www.nhl.com/",
};

const clamp = (n: number, lo = 0, hi = 100): number => Math.max(lo, Math.min(hi, n));

const NHLE_LEAGUE_FACTORS: Record<DevelopmentLeague, number> = {
  NHL: 1,
  AHL: 0.47,
  CHL: 0.30,
  NCAA: 0.41,
  SHL: 0.78,
  Liiga: 0.54,
  KHL: 0.83,
  INTL: 0.45,
};

const slugify = (name: string): string =>
  name
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim()
    .replace(/\s+/g, "-");

const asNumber = (value: unknown): number | null => {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim()) {
    const n = Number(value);
    if (Number.isFinite(n)) return n;
  }
  return null;
};

const playerNameFromRow = (row: NhlSkaterSummaryRow): string => {
  if (row.skaterFullName?.trim()) return row.skaterFullName.trim();
  const parts = [row.firstName, row.lastName].map(p => p?.trim()).filter(Boolean);
  return parts.join(" ");
};

export function buildNhlSkaterSummaryUrl(seasonId: string = SEASON.nhleSeasonId): string {
  return `https://api.nhle.com/stats/rest/en/skater/summary?cayenneExp=seasonId%3D${seasonId}%20and%20gameTypeId%3D2&limit=-1`;
}

export function seasonLabelFromNhlSeasonId(seasonId: string): string {
  if (!/^\d{8}$/.test(seasonId)) return seasonId;
  return `${seasonId.slice(0, 4)}-${seasonId.slice(6, 8)}`;
}

export function buildRecentNhlSeasonIds(endSeasonId: string = SEASON.nhleSeasonId, count = 3): string[] {
  if (!/^\d{8}$/.test(endSeasonId) || count <= 0) return [];
  const endStart = Number(endSeasonId.slice(0, 4));
  const result: string[] = [];
  for (let i = Math.max(0, count - 1); i >= 0; i--) {
    const start = endStart - i;
    result.push(`${start}${start + 1}`);
  }
  return result;
}

export function ageForSeason(
  currentAge: number | undefined,
  targetSeasonId: string,
  currentSeasonId: string = SEASON.nhleSeasonId,
): number | undefined {
  if (currentAge == null || !/^\d{8}$/.test(targetSeasonId) || !/^\d{8}$/.test(currentSeasonId)) {
    return currentAge;
  }
  const targetStart = Number(targetSeasonId.slice(0, 4));
  const currentStart = Number(currentSeasonId.slice(0, 4));
  return currentAge - (currentStart - targetStart);
}

export function normalizeNhlPosition(code: unknown): DevelopmentProfileInput["position"] | null {
  if (typeof code !== "string") return null;
  const normalized = code.trim().toUpperCase();
  if (normalized === "C") return "C";
  if (normalized === "D") return "D";
  if (normalized === "G") return "G";
  if (normalized === "L" || normalized === "R" || normalized === "LW" || normalized === "RW" || normalized === "W") return "W";
  return null;
}

export function parseNhlToiMinutes(value: unknown): number | undefined {
  const numeric = asNumber(value);
  if (numeric != null) {
    if (numeric > 60) return Math.round((numeric / 60) * 10) / 10;
    return Math.round(numeric * 10) / 10;
  }

  if (typeof value === "string") {
    const [min, sec] = value.split(":").map(part => Number(part));
    if (Number.isFinite(min) && Number.isFinite(sec)) {
      return Math.round((min + sec / 60) * 10) / 10;
    }
  }

  return undefined;
}

export function ageFromBirthDate(birthDate: string, asOf = new Date()): number | undefined {
  const born = new Date(birthDate);
  if (Number.isNaN(born.getTime())) return undefined;
  let age = asOf.getUTCFullYear() - born.getUTCFullYear();
  const monthDiff = asOf.getUTCMonth() - born.getUTCMonth();
  if (monthDiff < 0 || (monthDiff === 0 && asOf.getUTCDate() < born.getUTCDate())) age--;
  return age;
}

export function normalizeNhlSkaterSummaryRow(row: NhlSkaterSummaryRow, asOf = new Date()): NhlSkaterTimelineSeed | null {
  const playerId = row.playerId == null ? "" : String(row.playerId);
  const name = playerNameFromRow(row);
  const position = normalizeNhlPosition(row.positionCode);
  const games = asNumber(row.gamesPlayed);
  const goals = asNumber(row.goals) ?? 0;
  const assists = asNumber(row.assists) ?? 0;
  const points = asNumber(row.points) ?? goals + assists;

  if (!playerId || !name || !position || games == null || games <= 0) return null;

  const teamAbbrev = (row.teamAbbrevs ?? row.teamAbbrev)?.split(",")[0]?.trim().toUpperCase();
  const age = asNumber(row.age) ?? (row.birthDate ? ageFromBirthDate(row.birthDate, asOf) : undefined);

  return {
    playerId,
    name,
    position,
    teamAbbrev: teamAbbrev || undefined,
    games,
    goals,
    assists,
    points,
    ptsPace: Math.round((points / Math.max(games, 1)) * 82 * 10) / 10,
    avgTOI: parseNhlToiMinutes(row.timeOnIcePerGame),
    age,
  };
}

export function snapshotFromNhlSkaterSummary(
  row: NhlSkaterSummaryRow,
  opts: { seasonLabel?: string; age?: number; teamId?: string; asOf?: Date } = {},
): PlayerSeasonSnapshot | null {
  const seed = normalizeNhlSkaterSummaryRow(row, opts.asOf);
  if (!seed) return null;

  return {
    season: opts.seasonLabel ?? SEASON.replaySeason,
    age: opts.age ?? seed.age ?? 0,
    league: "NHL",
    teamId: opts.teamId ?? seed.teamAbbrev,
    games: seed.games,
    goals: seed.goals,
    assists: seed.assists,
    points: seed.points,
    ptsPerGame: Math.round((seed.points / seed.games) * 1000) / 1000,
    nhlePtsPace: seed.ptsPace,
    avgTOI: seed.avgTOI,
  };
}

export function snapshotsFromNhlSeasonSummaryMatches(
  matches: NhlSeasonSummaryMatch[],
  opts: { currentAge?: number; currentSeasonId?: string; asOf?: Date } = {},
): PlayerSeasonSnapshot[] {
  return [...matches]
    .sort((a, b) => a.seasonId.localeCompare(b.seasonId))
    .map(match => snapshotFromNhlSkaterSummary(match.row, {
      seasonLabel: seasonLabelFromNhlSeasonId(match.seasonId),
      age: ageForSeason(opts.currentAge ?? normalizeNhlSkaterSummaryRow(match.row, opts.asOf)?.age, match.seasonId, opts.currentSeasonId),
      asOf: opts.asOf,
    }))
    .filter((snapshot): snapshot is PlayerSeasonSnapshot => Boolean(snapshot));
}

export function buildDevelopmentInputFromNhlSummary(
  row: NhlSkaterSummaryRow,
  opts: {
    age?: number;
    draftOverall?: number;
    draftYear?: number;
    internationalScore?: number;
    teamContext?: DevelopmentProfileInput["teamContext"];
    linemateContext?: DevelopmentProfileInput["linemateContext"];
    snapshots?: PlayerSeasonSnapshot[];
    asOf?: Date;
  } = {},
): DevelopmentProfileInput | null {
  const seed = normalizeNhlSkaterSummaryRow(row, opts.asOf);
  if (!seed) return null;
  const age = opts.age ?? seed.age;
  if (age == null) return null;

  return {
    id: seed.playerId,
    name: seed.name,
    position: seed.position,
    age,
    nhlGames: seed.games,
    ptsPace: seed.ptsPace,
    avgTOI: seed.avgTOI,
    draftOverall: opts.draftOverall,
    draftYear: opts.draftYear,
    internationalScore: opts.internationalScore,
    teamContext: opts.teamContext,
    linemateContext: opts.linemateContext,
    snapshots: opts.snapshots ?? [
      snapshotFromNhlSkaterSummary(row, { age, asOf: opts.asOf })!,
    ],
  };
}

export function buildDevelopmentInputFromNhlTimeline(
  matches: NhlSeasonSummaryMatch[],
  opts: {
    age?: number;
    draftOverall?: number;
    draftYear?: number;
    internationalScore?: number;
    teamContext?: DevelopmentProfileInput["teamContext"];
    linemateContext?: DevelopmentProfileInput["linemateContext"];
    asOf?: Date;
  } = {},
): DevelopmentProfileInput | null {
  if (!matches.length) return null;
  const sorted = [...matches].sort((a, b) => a.seasonId.localeCompare(b.seasonId));
  const latest = sorted[sorted.length - 1];
  const snapshots = snapshotsFromNhlSeasonSummaryMatches(sorted, {
    currentAge: opts.age,
    currentSeasonId: latest.seasonId,
    asOf: opts.asOf,
  });
  return buildDevelopmentInputFromNhlSummary(latest.row, {
    ...opts,
    snapshots,
  });
}

export function buildDevelopmentInputForDbPlayer(
  player: DevelopmentDbPlayerSeed,
  matches: NhlSeasonSummaryMatch[],
  opts: {
    externalSnapshots?: PlayerSeasonSnapshot[];
    internationalScore?: number;
    teamContext?: DevelopmentProfileInput["teamContext"];
    linemateContext?: DevelopmentProfileInput["linemateContext"];
    asOf?: Date;
  } = {},
): DevelopmentProfileInput | null {
  const timelineInput = buildDevelopmentInputFromNhlTimeline(matches, {
    age: player.age ?? undefined,
    draftOverall: player.draftOverall ?? undefined,
    draftYear: player.draftYear ?? undefined,
    internationalScore: opts.internationalScore,
    teamContext: opts.teamContext,
    linemateContext: opts.linemateContext,
    asOf: opts.asOf,
  });
  if (timelineInput) {
    return {
      ...timelineInput,
      id: player.id || timelineInput.id,
      name: player.name || timelineInput.name,
      position: normalizeNhlPosition(player.position) ?? timelineInput.position,
      draftOverall: player.draftOverall ?? timelineInput.draftOverall,
      draftYear: player.draftYear ?? timelineInput.draftYear,
      snapshots: mergeTimelineSnapshots(opts.externalSnapshots ?? [], timelineInput.snapshots ?? []),
    };
  }

  const position = normalizeNhlPosition(player.position);
  if (!position || player.age == null) return null;
  const ptsPace = player.prospectPtsPace ?? 0;
  const fallbackSnapshot: PlayerSeasonSnapshot[] = player.prospectPtsPace == null ? [] : [{
    season: player.draftYear ? `${player.draftYear - 1}-${String(player.draftYear).slice(-2)}` : "pre-nhl",
    age: player.age,
    league: "INTL",
    games: 0,
    goals: 0,
    assists: 0,
    points: 0,
    ptsPerGame: 0,
    nhlePtsPace: ptsPace,
  }];

  return {
    id: player.id,
    name: player.name,
    position,
    age: player.age,
    nhlGames: 0,
    ptsPace,
    draftOverall: player.draftOverall ?? undefined,
    draftYear: player.draftYear ?? undefined,
    internationalScore: opts.internationalScore,
    teamContext: opts.teamContext,
    linemateContext: opts.linemateContext,
    snapshots: mergeTimelineSnapshots(opts.externalSnapshots ?? [], fallbackSnapshot),
  };
}

export function buildDevelopmentInputFromPlayerPayload(
  player: DevelopmentPlayerPayloadSeed,
): DevelopmentProfileInput | null {
  const position = normalizeNhlPosition(player.position);
  const age = asNumber(player.age);
  const games = asNumber(player.games) ?? 0;
  const livePtsPace = asNumber(player.ptsPace) ?? 0;
  const prospectPtsPace = asNumber(player.prospectPtsPace);
  const avgTOI = asNumber(player.avgTOI) ?? undefined;

  if (!position || position === "G" || age == null) return null;

  const currentPtsPace = games > 0 ? livePtsPace : prospectPtsPace ?? livePtsPace;
  const snapshots: PlayerSeasonSnapshot[] = [];

  if (prospectPtsPace != null && games < 40) {
    snapshots.push({
      season: player.draftYear ? `${player.draftYear - 1}-${String(player.draftYear).slice(-2)}` : "pre-nhl",
      age,
      league: "INTL",
      games: 0,
      goals: 0,
      assists: 0,
      points: 0,
      ptsPerGame: 0,
      nhlePtsPace: prospectPtsPace,
      draftOverall: player.draftOverall ?? undefined,
      draftYear: player.draftYear ?? undefined,
    });
  }

  if (games > 0) {
    snapshots.push({
      season: SEASON.replaySeason,
      age,
      league: "NHL",
      games,
      goals: 0,
      assists: 0,
      points: Math.round((livePtsPace / 82) * games),
      ptsPerGame: Math.round((livePtsPace / 82) * 1000) / 1000,
      nhlePtsPace: livePtsPace,
      avgTOI,
      draftOverall: player.draftOverall ?? undefined,
      draftYear: player.draftYear ?? undefined,
    });
  }

  return {
    id: player.id,
    name: player.name,
    position,
    age,
    nhlGames: games,
    ptsPace: currentPtsPace,
    avgTOI,
    draftOverall: player.draftOverall ?? undefined,
    draftYear: player.draftYear ?? undefined,
    teamContext: player.teamContext,
    linemateContext: player.linemateContext,
    snapshots: mergeTimelineSnapshots(snapshots),
  };
}

export function normalizeDevelopmentLeague(value: unknown): DevelopmentLeague | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toUpperCase();
  if (normalized === "NHL") return "NHL";
  if (normalized === "AHL") return "AHL";
  if (normalized === "CHL" || normalized === "OHL" || normalized === "WHL" || normalized === "QMJHL") return "CHL";
  if (normalized === "NCAA" || normalized === "USHL") return "NCAA";
  if (normalized === "SHL") return "SHL";
  if (normalized === "LIIGA" || normalized === "FINLAND") return "Liiga";
  if (normalized === "KHL") return "KHL";
  if (normalized === "INTL" || normalized === "WJC" || normalized === "U18" || normalized === "INTERNATIONAL") return "INTL";
  return null;
}

export function normalizeExternalTimelineRow(row: ExternalTimelineRow): PlayerSeasonSnapshot | null {
  const season = row.season?.trim();
  const league = normalizeDevelopmentLeague(row.league);
  const age = asNumber(row.age);
  const games = asNumber(row.games);
  const goals = asNumber(row.goals) ?? 0;
  const assists = asNumber(row.assists) ?? 0;
  const explicitPoints = asNumber(row.points);
  const points = explicitPoints ?? goals + assists;

  if (!season || !/^\d{4}-\d{2}$|^pre-nhl$/.test(season)) return null;
  if (!league) return null;
  if (age == null || age < 15 || age > 45) return null;
  if (games == null || games < 0 || games > 100) return null;
  if (goals < 0 || assists < 0 || points < 0) return null;
  if (points < goals + assists) return null;

  const ptsPerGame = asNumber(row.ptsPerGame) ?? (games > 0 ? points / games : 0);
  const nhlePtsPace = asNumber(row.nhlePtsPace) ?? Math.round(ptsPerGame * 82 * NHLE_LEAGUE_FACTORS[league] * 10) / 10;
  const avgTOI = parseNhlToiMinutes(row.avgTOI);
  const draftOverall = asNumber(row.draftOverall);
  const draftYear = asNumber(row.draftYear);

  return {
    season,
    age,
    league,
    teamId: row.teamId?.trim() || undefined,
    games,
    goals,
    assists,
    points,
    ptsPerGame: Math.round(ptsPerGame * 1000) / 1000,
    nhlePtsPace,
    avgTOI,
    role: row.role?.trim() || undefined,
    draftOverall: draftOverall == null ? undefined : draftOverall,
    draftYear: draftYear == null ? undefined : draftYear,
  };
}

export function parseExternalTimelineRows(rows: ExternalTimelineRow[]): ExternalTimelineParseResult {
  const snapshots: PlayerSeasonSnapshot[] = [];
  const rejected: ExternalTimelineParseResult["rejected"] = [];

  for (const row of rows) {
    const snapshot = normalizeExternalTimelineRow(row);
    if (snapshot) snapshots.push(snapshot);
    else rejected.push({ row, reason: rejectionReasonForExternalTimelineRow(row) });
  }

  return {
    snapshots: snapshots.sort(compareSnapshots),
    rejected,
  };
}

export function mergeTimelineSnapshots(...groups: PlayerSeasonSnapshot[][]): PlayerSeasonSnapshot[] {
  const byKey = new Map<string, PlayerSeasonSnapshot>();
  for (const snapshot of groups.flat()) {
    byKey.set(`${snapshot.season}:${snapshot.league}`, snapshot);
  }
  return [...byKey.values()].sort(compareSnapshots);
}

export function buildNhlSkaterSummaryMaps(rows: NhlSkaterSummaryRow[]): Map<string, NhlSkaterTimelineSeed> {
  const map = new Map<string, NhlSkaterTimelineSeed>();

  for (const row of rows) {
    const seed = normalizeNhlSkaterSummaryRow(row);
    if (!seed) continue;
    map.set(`id:${seed.playerId}`, seed);
    map.set(slugify(seed.name), seed);
    map.set(`${slugify(seed.name)}__${seed.position}`, seed);
  }

  return map;
}

export function diagnoseDevelopmentInput(input: DevelopmentProfileInput): DevelopmentSourceDiagnostics {
  const missing: string[] = [];
  const warnings: string[] = [];

  if (!input.id) missing.push("id");
  if (!input.name) missing.push("name");
  if (!input.age) missing.push("age");
  if (input.nhlGames == null) missing.push("nhlGames");
  if (input.ptsPace == null) missing.push("ptsPace");
  if (!input.snapshots?.length) missing.push("snapshots");
  if (input.position === "G") warnings.push("goalie-development-model-not-validated");
  if (input.age < 17 || input.age > 45) warnings.push("age-out-of-range");
  if (input.nhlGames < 40 && !input.draftOverall && !input.snapshots?.some(s => s.league !== "NHL")) {
    warnings.push("limited-nhl-sample-without-pedigree-or-non-nhl-timeline");
  }
  if (input.snapshots?.some(s => !s.age || s.age < 15 || s.age > 45)) warnings.push("snapshot-age-missing-or-invalid");
  if (input.snapshots?.some(s => !isKnownDevelopmentLeague(s.league))) warnings.push("unknown-development-league");

  return { id: input.id, name: input.name, missing, warnings };
}

export async function fetchNhlSkaterSummaryRows(
  opts: DevelopmentSourceFetchOptions = {},
): Promise<NhlSkaterSummaryRow[]> {
  const fetcher = opts.fetcher ?? fetch;
  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 10000);

  try {
    const res = await fetcher(buildNhlSkaterSummaryUrl(opts.seasonId), {
      cache: "no-store",
      headers: NHL_HEADERS,
      signal: ctrl.signal,
    });
    if (!res.ok) return [];
    const body = await res.json() as { data?: NhlSkaterSummaryRow[] };
    return Array.isArray(body.data) ? body.data : [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchNhlSkaterSummaryRowsWithCache(
  opts: DevelopmentSourceFetchOptions & { useCache?: boolean } = {},
): Promise<{ rows: NhlSkaterSummaryRow[]; source: "cache" | "live" | "miss" }> {
  const seasonId = opts.seasonId ?? SEASON.nhleSeasonId;
  const cacheEnabled = Boolean(redis && opts.useCache !== false && !opts.fetcher);

  if (cacheEnabled && redis) {
    const cached = await redis.get<Record<string, NhlSkaterSummaryRow[]>>(DEVELOPMENT_NHL_SUMMARY_CACHE_KEY).catch(() => null);
    const rows = cached?.[seasonId];
    if (Array.isArray(rows)) return { rows, source: "cache" };
  }

  const rows = await fetchNhlSkaterSummaryRows(opts);
  if (cacheEnabled && redis && rows.length > 0) {
    const cached = await redis.get<Record<string, NhlSkaterSummaryRow[]>>(DEVELOPMENT_NHL_SUMMARY_CACHE_KEY).catch(() => null);
    await redis.setex(DEVELOPMENT_NHL_SUMMARY_CACHE_KEY, DEVELOPMENT_CACHE_TTL, {
      ...(cached ?? {}),
      [seasonId]: rows,
    }).catch(() => {});
  }

  return { rows, source: rows.length > 0 ? "live" : "miss" };
}

export async function fetchNhlSkaterTimelineRowsForPlayer(
  opts: NhlTimelineFetchOptions,
): Promise<NhlSeasonSummaryMatch[]> {
  const seasonIds = opts.seasonIds ?? buildRecentNhlSeasonIds(opts.endSeasonId, opts.seasonCount ?? 3);
  const targetId = String(opts.playerId);
  const rowsBySeason = await Promise.all(seasonIds.map(async seasonId => ({
    seasonId,
    rows: await fetchNhlSkaterSummaryRows({
      fetcher: opts.fetcher,
      seasonId,
      timeoutMs: opts.timeoutMs,
    }),
  })));

  return rowsBySeason
    .map(({ seasonId, rows }) => ({
      seasonId,
      row: rows.find(row => row.playerId != null && String(row.playerId) === targetId),
    }))
    .filter((match): match is NhlSeasonSummaryMatch => Boolean(match.row));
}

export async function fetchCachedNhlSkaterTimelineRowsForPlayer(
  opts: NhlTimelineFetchOptions,
): Promise<CachedNhlTimelineResult> {
  const seasonIds = opts.seasonIds ?? buildRecentNhlSeasonIds(opts.endSeasonId, opts.seasonCount ?? 3);
  const targetId = String(opts.playerId);
  const timelineCacheKey = `${targetId}:${seasonIds.join(",")}`;
  const cacheEnabled = Boolean(redis && opts.useCache !== false && !opts.fetcher);

  if (cacheEnabled && redis) {
    const cached = await redis.get<Record<string, NhlSeasonSummaryMatch[]>>(DEVELOPMENT_TIMELINE_CACHE_KEY).catch(() => null);
    const matches = cached?.[timelineCacheKey];
    if (Array.isArray(matches)) {
      return {
        matches,
        cache: {
          enabled: true,
          timelineCacheHit: true,
          summaryCacheHits: [],
          liveFetches: [],
        },
      };
    }
  }

  const summaryResults = await Promise.all(seasonIds.map(async seasonId => ({
    seasonId,
    ...(await fetchNhlSkaterSummaryRowsWithCache({
      fetcher: opts.fetcher,
      seasonId,
      timeoutMs: opts.timeoutMs,
      useCache: opts.useCache,
    })),
  })));

  const matches = summaryResults
    .map(({ seasonId, rows }) => ({
      seasonId,
      row: rows.find(row => row.playerId != null && String(row.playerId) === targetId),
    }))
    .filter((match): match is NhlSeasonSummaryMatch => Boolean(match.row));

  if (cacheEnabled && redis && matches.length > 0) {
    const cached = await redis.get<Record<string, NhlSeasonSummaryMatch[]>>(DEVELOPMENT_TIMELINE_CACHE_KEY).catch(() => null);
    await redis.setex(DEVELOPMENT_TIMELINE_CACHE_KEY, DEVELOPMENT_CACHE_TTL, {
      ...(cached ?? {}),
      [timelineCacheKey]: matches,
    }).catch(() => {});
  }

  return {
    matches,
    cache: {
      enabled: cacheEnabled,
      timelineCacheHit: false,
      summaryCacheHits: summaryResults.filter(r => r.source === "cache").map(r => r.seasonId),
      liveFetches: summaryResults.filter(r => r.source === "live").map(r => r.seasonId),
    },
  };
}

function isKnownDevelopmentLeague(league: DevelopmentLeague): boolean {
  return ["NHL", "AHL", "CHL", "NCAA", "SHL", "Liiga", "KHL", "INTL"].includes(league);
}

function compareSnapshots(a: PlayerSeasonSnapshot, b: PlayerSeasonSnapshot): number {
  const seasonCompare = a.season.localeCompare(b.season);
  if (seasonCompare !== 0) return seasonCompare;
  return a.league.localeCompare(b.league);
}

function rejectionReasonForExternalTimelineRow(row: ExternalTimelineRow): string {
  const season = row.season?.trim();
  const league = normalizeDevelopmentLeague(row.league);
  const age = asNumber(row.age);
  const games = asNumber(row.games);
  const goals = asNumber(row.goals) ?? 0;
  const assists = asNumber(row.assists) ?? 0;
  const explicitPoints = asNumber(row.points);
  const points = explicitPoints ?? goals + assists;

  if (!season) return "missing-season";
  if (!/^\d{4}-\d{2}$|^pre-nhl$/.test(season)) return "invalid-season";
  if (!league) return "unknown-league";
  if (age == null) return "missing-age";
  if (age < 15 || age > 45) return "age-out-of-range";
  if (games == null) return "missing-games";
  if (games < 0 || games > 100) return "games-out-of-range";
  if (goals < 0 || assists < 0 || points < 0) return "negative-production";
  if (points < goals + assists) return "points-less-than-goals-plus-assists";
  return "invalid-row";
}

export function confidenceFromAdapterCoverage(input: DevelopmentProfileInput): number {
  const base = 30;
  const nhlSample = clamp((input.nhlGames / 200) * 35, 0, 35);
  const timeline = clamp((input.snapshots?.length ?? 0) * 8, 0, 24);
  const pedigree = input.draftOverall ? 8 : 0;
  const context = input.teamContext || input.linemateContext ? 3 : 0;
  return Math.round(clamp(base + nhlSample + timeline + pedigree + context));
}
