import { NextResponse } from "next/server";
import { getCachedRoster } from "@/app/lib/cached-roster";
import { buildLeagueProvenance } from "@/app/lib/data-context";

export const dynamic = "force-dynamic";

// The roster assembly behind this route makes several external calls and
// parses a season of MoneyPuck. With Redis warm it answers in milliseconds;
// with every cache cold — a fresh deploy, an evicted key, the first request
// after a quiet night — it does the whole job inline. The platform default
// would cut that off partway and hand the reader a 504 on the one request
// that was about to fill the cache for everybody behind them.
export const maxDuration = 60;

const CACHE_HEADERS = {
  "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
};

export async function GET() {
  const { value, state, blocked } = await getCachedRoster();
  const provenance = buildLeagueProvenance({
    kind: "players",
    generatedAt: value.generatedAt,
    cacheState: state,
    blocked,
    liveStats: value.liveStats,
    playerCount: value.debug?.playerCount ?? value.players?.length,
    analyticsCount: value.debug?.analyticsCount,
    contractsLoaded: value.debug?.contractsLoaded,
  });

  return NextResponse.json({ ...value, provenance }, {
    headers: { ...CACHE_HEADERS, "x-ledger-cache": state, "x-ledger-blocked": String(blocked) },
  });
}
