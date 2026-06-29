import { db as defaultDb } from "@/app/db/client";
import { siteSettings } from "@/app/db/schema";
import { redis as defaultRedis } from "@/app/lib/redis";
import { parseStoredCapCeiling } from "@/app/lib/cap-settings";
import { SEASON } from "@/app/lib/season-config";

type Database = typeof defaultDb;
type RedisClient = typeof defaultRedis;

export const LEAGUE_TEAMS_CACHE_KEY = "cache:league:teams:v1";
export const TRADE_TEAMS_CACHE_KEY = "cache:trade:teams:v1";
export const LEGACY_CURATED_CAP_CEILING = 95.5;

export function teamCacheKey(capCeiling: number): string {
  return `${TRADE_TEAMS_CACHE_KEY}:cap:${capCeiling.toFixed(1)}`;
}

export function teamCacheKeys(...capCeilings: number[]): string[] {
  return Array.from(new Set([
    LEAGUE_TEAMS_CACHE_KEY,
    TRADE_TEAMS_CACHE_KEY,
    teamCacheKey(SEASON.capCeiling),
    teamCacheKey(LEGACY_CURATED_CAP_CEILING),
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
