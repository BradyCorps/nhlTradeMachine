import { NextResponse } from "next/server";
import { assembleCanonicalRoster } from "@/app/lib/roster-assembly";
import { LEAGUE_PLAYERS_CACHE_KEY } from "@/app/lib/team-cache";
import { isHealthyRoster } from "@/app/lib/roster-health";
import { swrCache } from "@/app/lib/swr-cache";
import { swrStore } from "@/app/lib/swr-store";

export const dynamic = "force-dynamic";

// The full roster assembly (~40s cold: 32 live NHL roster fetches, timeline
// pulls, MoneyPuck CSV parse, per-player valuation for ~900 players) ran on
// every request. Cache the finished payload so only one request per window
// pays that cost; the rest are served instantly. Invalidated by
// clearTeamCaches (LEAGUE_PLAYERS_CACHE_KEY) on any roster mutation.
// Serve instantly, refresh behind the request. The rebuild is ~40s, so a plain
// TTL meant whoever arrived first after it lapsed paid the full cost — on a site
// without constant traffic, that is most visitors. Now only a completely empty
// or day-old cache blocks.
const PLAYERS_FRESH_TTL = 15 * 60;          // serve without refreshing
const PLAYERS_STALE_TTL = 24 * 60 * 60;     // serve stale + refresh in background

const CACHE_HEADERS = {
  // Also let Vercel's CDN cache + revalidate in the background.
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
};

export async function GET() {
  const { value, state, blocked } = await swrCache({
    store: swrStore,
    key: LEAGUE_PLAYERS_CACHE_KEY,
    freshSeconds: PLAYERS_FRESH_TTL,
    staleSeconds: PLAYERS_STALE_TTL,
    // Never cache a broken assembly — a half-empty roster served for 24 hours
    // is far worse than a slow rebuild.
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

  return NextResponse.json(value, {
    headers: { ...CACHE_HEADERS, "x-ledger-cache": state, "x-ledger-blocked": String(blocked) },
  });
}
