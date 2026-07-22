import { NextResponse } from "next/server";
import { assembleCanonicalRoster } from "@/app/lib/roster-assembly";
import { redis } from "@/app/lib/redis";
import { LEAGUE_PLAYERS_CACHE_KEY } from "@/app/lib/team-cache";
import { isHealthyRoster } from "@/app/lib/roster-health";

export const dynamic = "force-dynamic";

// The full roster assembly (~40s cold: 32 live NHL roster fetches, timeline
// pulls, MoneyPuck CSV parse, per-player valuation for ~900 players) ran on
// every request. Cache the finished payload so only one request per window
// pays that cost; the rest are served instantly. Invalidated by
// clearTeamCaches (LEAGUE_PLAYERS_CACHE_KEY) on any roster mutation.
const PLAYERS_CACHE_TTL = 15 * 60; // 15 min

const CACHE_HEADERS = {
  // Also let Vercel's CDN cache + revalidate in the background.
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
};

export async function GET() {
  if (redis) {
    const cached = await redis.get<any>(LEAGUE_PLAYERS_CACHE_KEY).catch(() => null);
    if (cached) {
      return NextResponse.json(cached, { headers: { ...CACHE_HEADERS, "x-ledger-cache": "hit" } });
    }
  }

  const roster = await assembleCanonicalRoster();
  const payload = {
    players: roster.players,
    liveStats: roster.liveStats,
    generatedAt: roster.generatedAt,
    debug: roster.debug,
  };

  if (redis && isHealthyRoster(roster.players)) {
    await redis.setex(LEAGUE_PLAYERS_CACHE_KEY, PLAYERS_CACHE_TTL, payload).catch(() => {});
  }

  return NextResponse.json(payload, { headers: { ...CACHE_HEADERS, "x-ledger-cache": "miss" } });
}
