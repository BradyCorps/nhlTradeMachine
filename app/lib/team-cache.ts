import { db as defaultDb } from "@/app/db/client";
import { siteSettings } from "@/app/db/schema";
import { redis as defaultRedis } from "@/app/lib/redis";
import { parseStoredCapCeiling } from "@/app/lib/cap-settings";
import { SEASON } from "@/app/lib/season-config";
import { XNAV_MODEL_VERSION } from "@/app/lib/data-context";
import { manifestCacheKey } from "@/app/lib/release-manifest";
import { snapshotDate } from "@/app/lib/valuation-snapshot";

type Database = typeof defaultDb;
type RedisClient = typeof defaultRedis;

export const LEAGUE_TEAMS_CACHE_KEY = "cache:league:teams:v1";
export const TRADE_TEAMS_CACHE_KEY = "cache:trade:teams:v1";
// Full assembled players payload for /api/league/players — the expensive
// (~40s) roster assembly, cached whole. Cleared alongside the team caches so
// every roster mutation drops it too.
export const LEAGUE_PLAYERS_CACHE_KEY = "cache:league:players:v2";
// The whole /api/league/teams response — teams, picks and the live ceiling —
// cached together. The warm path previously still hit the database twice and
// rebuilt 800 pick objects on every request.
export const LEAGUE_TEAMS_PAYLOAD_CACHE_KEY = "cache:league:teams:payload:v2";
// Full Team Analytics payload, including the server-precomputed league NAV map.
export const LEAGUE_ANALYTICS_CACHE_KEY = "cache:league:analytics:v1";
// Published Docket view models; the daily precompute adds current-day grades.
export const DOCKET_ENTRIES_CACHE_KEY = "cache:docket:entries:v1";
export const LEGACY_CURATED_CAP_CEILING = 95.5;

// DATA-06: "all downstream caches invalidate by snapshotDate + modelVersion."
// A deployed model-version bump used to leave a stale-shaped cached payload
// serving under its old key for up to TEAMS_CACHE_TTL (6h) with nothing to
// force a miss; wrapping the existing cap-parameterized key through
// manifestCacheKey makes that automatic — the key itself changes, so the old
// entry is never looked up again rather than needing an explicit bust.
export function teamCacheKey(capCeiling: number): string {
  return manifestCacheKey(`${TRADE_TEAMS_CACHE_KEY}:cap:${capCeiling.toFixed(1)}`, snapshotDate(), XNAV_MODEL_VERSION);
}

export function leagueTeamCacheKey(capCeiling: number): string {
  return manifestCacheKey(`${LEAGUE_TEAMS_CACHE_KEY}:cap:${capCeiling.toFixed(1)}`, snapshotDate(), XNAV_MODEL_VERSION);
}

export function teamCacheKeys(...capCeilings: number[]): string[] {
  return Array.from(new Set([
    LEAGUE_TEAMS_CACHE_KEY,
    TRADE_TEAMS_CACHE_KEY,
    LEAGUE_PLAYERS_CACHE_KEY,
    LEAGUE_TEAMS_PAYLOAD_CACHE_KEY,
    LEAGUE_ANALYTICS_CACHE_KEY,
    DOCKET_ENTRIES_CACHE_KEY,
    leagueTeamCacheKey(SEASON.capCeiling),
    leagueTeamCacheKey(LEGACY_CURATED_CAP_CEILING),
    teamCacheKey(SEASON.capCeiling),
    teamCacheKey(LEGACY_CURATED_CAP_CEILING),
    ...capCeilings.map(leagueTeamCacheKey),
    ...capCeilings.map(teamCacheKey),
  ]));
}

export async function activeTeamCacheKeys(
  database: Database = defaultDb,
  extraCapCeilings: Array<number | null | undefined> = [],
): Promise<string[]> {
  const rows = await database.select().from(siteSettings).catch(() => []);
  const activeSetting = rows.find((row) => row.key === "cap_ceiling")?.value;
  const activeCapCeiling = parseStoredCapCeiling(activeSetting, SEASON.capCeiling) ?? SEASON.capCeiling;
  return teamCacheKeys(activeCapCeiling, ...extraCapCeilings.filter((cap): cap is number => typeof cap === "number"));
}

export async function clearTeamCaches(
  cache: RedisClient = defaultRedis,
  database: Database = defaultDb,
  extraCapCeilings: Array<number | null | undefined> = [],
): Promise<string[]> {
  const cleared: string[] = [];
  if (!cache) return cleared;
  const keys = await activeTeamCacheKeys(database, extraCapCeilings);
  for (const key of keys) {
    await cache.del(key).then(() => cleared.push(key)).catch(() => {});
  }
  return cleared;
}
