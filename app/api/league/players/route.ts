import { parseObservedSelection, missingObservedStats } from "@/app/lib/observed-season";
import { readObservedPlayers } from "@/app/lib/observed-stats.server";
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

export async function GET(req?: Request) {
  // Explicit observations are a display overlay. Unqualified callers retain model inputs.
  let selection;
  try {
    const params = new URL(req?.url ?? "http://localhost/api/league/players").searchParams;
    if (params.has("season") || params.has("gameType")) selection = parseObservedSelection(params);
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Invalid selection" }, { status: 400 });
  }
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

  const observations = selection ? await readObservedPlayers(selection) : null;
  const players = observations ? value.players.map(player => ({ ...player,
    observedStats: observations.byId.get(String(player.id)) ?? missingObservedStats(observations.selection,
      (player.position === "G" ? observations.goalies : observations.skaters).coverage === "unavailable"),
  })) : value.players;
  return NextResponse.json({ ...value, players, provenance,
    observations: observations ? { selection,
      skaters: { coverage: observations.skaters.coverage, source: observations.skaters.source, retrievedAt: observations.skaters.retrievedAt },
      goalies: { coverage: observations.goalies.coverage, source: observations.goalies.source, retrievedAt: observations.goalies.retrievedAt },
    } : undefined,
  }, {
    headers: { ...CACHE_HEADERS, "x-ledger-cache": state, "x-ledger-blocked": String(blocked) },
  });
}
