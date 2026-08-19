// Shared SWR-cached roster fetch.
// Both the /api/league/players route and server-component pages use this so
// the expensive ~40s assembleCanonicalRoster() runs at most once per SWR
// window, regardless of which entry point triggers it.

import { assembleCanonicalRoster } from "@/app/lib/roster-assembly";
import { LEAGUE_PLAYERS_CACHE_KEY } from "@/app/lib/team-cache";
import { isHealthyRoster } from "@/app/lib/roster-health";
import { swrCache } from "@/app/lib/swr-cache";
import { swrStore } from "@/app/lib/swr-store";

const PLAYERS_FRESH_TTL = 15 * 60;
const PLAYERS_STALE_TTL = 24 * 60 * 60;

export async function getCachedRoster() {
  return swrCache({
    store: swrStore,
    key: LEAGUE_PLAYERS_CACHE_KEY,
    freshSeconds: PLAYERS_FRESH_TTL,
    staleSeconds: PLAYERS_STALE_TTL,
    isCacheable: (p: any) => isHealthyRoster(p?.players ?? []),
    build: async () => {
      const roster = await assembleCanonicalRoster();
      return {
        players: roster.players,
        liveStats: roster.liveStats,
        generatedAt: roster.generatedAt,
        debug: roster.debug,
      };
    },
  });
}
