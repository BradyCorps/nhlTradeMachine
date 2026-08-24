// Shared SWR-cached roster fetch.
// Both the /api/league/players route and server-component pages use this so
// the expensive ~40s assembleCanonicalRoster() runs at most once per SWR
// window, regardless of which entry point triggers it.

import { assembleCanonicalRoster } from "@/app/lib/roster-assembly";
import { LEAGUE_PLAYERS_CACHE_KEY } from "@/app/lib/team-cache";
import { isHealthyRoster } from "@/app/lib/roster-health";
import { buildLeagueNavMap } from "@/app/lib/league-nav";
import { getLiveCapCeiling } from "@/app/lib/live-cap-settings";
import { swrCache } from "@/app/lib/swr-cache";
import { swrStore } from "@/app/lib/swr-store";

const PLAYERS_FRESH_TTL = 15 * 60;
const PLAYERS_STALE_TTL = 24 * 60 * 60;

async function buildRosterPayload() {
  const [roster, capCeiling] = await Promise.all([
    assembleCanonicalRoster(),
    getLiveCapCeiling(),
  ]);
  return {
    teams: roster.teams,
    players: roster.players,
    publishedTradeCapMoves: roster.publishedTradeCapMoves,
    navMap: buildLeagueNavMap(roster.players, capCeiling),
    capCeiling,
    liveStats: roster.liveStats,
    generatedAt: roster.generatedAt,
    debug: roster.debug,
  };
}

export async function getCachedRoster() {
  return swrCache({
    store: swrStore,
    key: LEAGUE_PLAYERS_CACHE_KEY,
    freshSeconds: PLAYERS_FRESH_TTL,
    staleSeconds: PLAYERS_STALE_TTL,
    isCacheable: (p: any) => isHealthyRoster(p?.players ?? []),
    build: buildRosterPayload,
  });
}

/** Force the expensive aggregate ahead of traffic (called by the daily cron). */
export async function precomputeRosterCache() {
  const value = await buildRosterPayload();
  const cacheable = isHealthyRoster(value.players);
  if (cacheable && swrStore) {
    await swrStore.setex(LEAGUE_PLAYERS_CACHE_KEY, PLAYERS_STALE_TTL, {
      value,
      builtAt: Date.now(),
    });
  }
  return {
    cached: cacheable && Boolean(swrStore),
    playerCount: value.players.length,
    navCount: Object.keys(value.navMap).length,
    generatedAt: value.generatedAt,
  };
}
