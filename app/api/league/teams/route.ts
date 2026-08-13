import { NextResponse } from "next/server";
import { resolveTeamCapSpace } from "@/app/lib/team-cap-space";
import { SEASON } from "@/app/lib/season-config";
import { TEAMS_DB } from "@/app/lib/db";
import { redis } from "@/app/lib/redis";
import { db } from "@/app/db/client";
import { teams as teamsTable } from "@/app/db/schema";
import { buildDraftPickInventory } from "@/app/lib/draft-pick-inventory";
import { teamCacheKey, LEAGUE_TEAMS_PAYLOAD_CACHE_KEY } from "@/app/lib/team-cache";
import { swrCache } from "@/app/lib/swr-cache";
import { swrStore } from "@/app/lib/swr-store";
import { regulationWinsFrom } from "@/app/lib/nhl-standings-fields";
import { getLiveCapCeiling } from "@/app/lib/live-cap-settings";

export const dynamic = "force-dynamic";

// The roster assembly behind this route makes several external calls and
// parses a season of MoneyPuck. With Redis warm it answers in milliseconds;
// with every cache cold — a fresh deploy, an evicted key, the first request
// after a quiet night — it does the whole job inline. The platform default
// would cut that off partway and hand the reader a 504 on the one request
// that was about to fill the cache for everybody behind them.
//
// A ceiling, not a delay: a fast response is unaffected.
export const maxDuration = 60;

const CAP_FLOOR       = SEASON.capFloor;
// The curated TEAMS_DB capSpace values are room under the 2025-26 ceiling ($95.5M).
// Cap space scales 1:1 with the ceiling (a team's roster cost is fixed), so a ceiling
// change shifts every team's space by the delta. See Decision A: we keep the curated
// static used-cap accounting (LTIR/burial/bonuses) and only apply the ceiling delta —
// NOT a naive sum of all contract rows (which overstates used cap → false negatives).
// Now shared with /api/league — see app/lib/team-cap-space.ts.
const TEAMS_CACHE_TTL = 6 * 60 * 60; // 6 hours

const TEAM_NEEDS: Record<string, { pos: string; minWar: number; label: string }[]> = {

};


const fetchWithTimeout = (url: string, ms = 8000, extraHeaders: Record<string, string> = {}): Promise<Response> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, {
    signal: ctrl.signal,
    cache: "no-store",
    headers: { ...extraHeaders },
  }).finally(() => clearTimeout(t));
};

const derivePhase = (confRank: number, divRank: number, pointPct: number): string => {
  if ((confRank <= 4 || divRank === 1) && pointPct >= 0.52) return "Contender";
  if (confRank <= 6 && pointPct >= 0.50) return "Contender";
  if (confRank <= 8 && pointPct >= 0.50) return "Bubble";
  if (confRank <= 10 && pointPct >= 0.48) return "Bubble";
  if (confRank <= 14) return "Retooling";
  if (pointPct < 0.38) return "Tanking";
  return "Rebuilding";
};

async function loadTeams(capCeiling: number): Promise<any[]> {
  const cacheKey = teamCacheKey(capCeiling);
  if (redis) {
    const cached = await redis.get<any[]>(cacheKey);
    if (cached && Array.isArray(cached) && cached.length > 0) return cached;
  }

  let standingsMap = new Map<string, {
    standing: number;
    pointPct: number;
    teamFullName: string;
    conferenceRank: number;
    divisionRank: number;
    points: number;
  }>();

  try {
    const res = await fetchWithTimeout(
      `https://api.nhle.com/stats/rest/en/team/summary?cayenneExp=seasonId=${SEASON.nhleSeasonId}%20and%20gameTypeId=2`,
      8000
    );
    if (res.ok) {
      const data = await res.json();
      const teams: any[] = data.data ?? [];

      const NHL_ID_TO_TRICODE: Record<number, string> = {
        1: "NJD", 2: "NYI", 3: "NYR", 4: "PHI", 5: "PIT",
        6: "BOS", 7: "BUF", 8: "MTL", 9: "OTT", 10: "TOR",
        12: "CAR", 13: "FLA", 14: "TBL", 15: "WSH", 16: "CHI",
        17: "DET", 18: "NSH", 19: "STL", 20: "CGY", 21: "COL",
        22: "EDM", 23: "VAN", 24: "ANA", 25: "DAL", 26: "LAK",
        28: "SJS", 29: "CBJ", 30: "MIN", 52: "WPG", 54: "VGK",
        55: "SEA", 68: "UTA",
      };

      teams.sort((a, b) => {
        const pointsA = Number.isFinite(a.points) ? a.points : -1;
        const pointsB = Number.isFinite(b.points) ? b.points : -1;
        return pointsB !== pointsA
          ? pointsB - pointsA
          : regulationWinsFrom(b) - regulationWinsFrom(a);
      });

      teams.forEach((t, i) => {
        t.overallRank = i + 1;
        t.tricode = NHL_ID_TO_TRICODE[t.teamId];
      });

      const DIVISIONS: Record<string, string> = {
        BOS: "Atlantic", BUF: "Atlantic", DET: "Atlantic", FLA: "Atlantic", MTL: "Atlantic", OTT: "Atlantic", TBL: "Atlantic", TOR: "Atlantic",
        CAR: "Metro", CBJ: "Metro", NJD: "Metro", NYI: "Metro", NYR: "Metro", PHI: "Metro", PIT: "Metro", WSH: "Metro",
        CHI: "Central", COL: "Central", DAL: "Central", MIN: "Central", NSH: "Central", STL: "Central", UTA: "Central", WPG: "Central",
        ANA: "Pacific", CGY: "Pacific", EDM: "Pacific", LAK: "Pacific", SJS: "Pacific", SEA: "Pacific", VAN: "Pacific", VGK: "Pacific",
      };

      const WESTERN_TEAMS = new Set(["CHI","COL","DAL","MIN","NSH","STL","UTA","WPG","ANA","CGY","EDM","LAK","SJS","SEA","VAN","VGK"]);

      const westTeams = teams.filter(t => WESTERN_TEAMS.has(t.tricode));
      const eastTeams = teams.filter(t => !WESTERN_TEAMS.has(t.tricode) && t.tricode);
      westTeams.forEach((t, i) => t.confRank = i + 1);
      eastTeams.forEach((t, i) => t.confRank = i + 1);

      const divCounters: Record<string, number> = { Atlantic: 0, Metro: 0, Central: 0, Pacific: 0 };
      teams.forEach((t) => {
        const divName = DIVISIONS[t.tricode];
        if (divCounters[divName] !== undefined) {
          divCounters[divName]++;
          t.divRank = divCounters[divName];
        } else {
          t.divRank = 8;
        }
      });

      teams.forEach((t) => {
        if (t.tricode) {
          standingsMap.set(t.tricode, {
            standing:       t.overallRank,
            conferenceRank: t.confRank,
            divisionRank:   t.divRank,
            points:         t.points,
            pointPct:       t.pointPct ?? 0.5,
            teamFullName:   t.teamFullName,
          });
        }
      });
    }
  } catch (err) {
    console.error("[league/teams] Standings API fetch failed:", err instanceof Error ? err.message : err);
  }

  if (standingsMap.size < 28) {
    try {
      const res = await fetchWithTimeout(
        "https://api-web.nhle.com/v1/standings/now",
        8000,
        { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36", "Origin": "https://www.nhl.com", "Referer": "https://www.nhl.com/" }
      );
      if (res.ok) {
        const data = await res.json();
        const entries: any[] = data.standings ?? [];
        entries.sort((a: any, b: any) => (b.points ?? 0) - (a.points ?? 0));
        entries.forEach((t: any, i: number) => {
          const tricode = t.teamAbbrev?.default;
          if (!tricode || standingsMap.has(tricode)) return;
          standingsMap.set(tricode, {
            standing:       i + 1,
            conferenceRank: t.conferenceSequence ?? 8,
            divisionRank:   t.divisionSequence ?? 4,
            points:         t.points ?? 0,
            pointPct:       t.pointPctg ?? 0.5,
            teamFullName:   t.teamName?.default ?? tricode,
          });
        });
        if (standingsMap.size >= 28) {
          console.log("[league/teams] Standings recovered from api-web fallback");
        }
      }
    } catch (err) {
      console.error("[league/teams] Standings web-API fallback also failed:", err instanceof Error ? err.message : err);
    }
  }

  let dbTeams: any[] = [];
  try {
    dbTeams = await db.select().from(teamsTable);
  } catch (err) {
    console.error("[league/teams] DB team query failed:", err instanceof Error ? err.message : err);
  }
  const dbTeamMap = new Map(dbTeams.map(t => [t.id, t]));

  // Cap space = curated static room (Decision A — authoritative used-cap accounting)
  // shifted by the ceiling delta so the live 2026-27 ceiling raises every team's room.

  const teams = TEAMS_DB.map((t) => {
    const dbTeam   = dbTeamMap.get(t.id);
    const st       = standingsMap.get(t.id);
    const standing = dbTeam?.standingOverride ?? st?.standing ?? t.standing;
    const confRank = st?.conferenceRank ?? 8;
    const divRank  = st?.divisionRank   ?? 4;
    const pointPct = st?.pointPct       ?? 0.5;
    const capSpace = resolveTeamCapSpace({ curatedCapSpace: t.capSpace, capCeiling });

    const phase = dbTeam?.phaseOverride
      ?? (standingsMap.size >= 28 ? derivePhase(confRank, divRank, pointPct) : t.phase);

    return {
      id:       t.id,
      name:     st?.teamFullName ?? dbTeam?.name ?? t.name,
      capSpace,
      standing,
      phase,
      needs: TEAM_NEEDS[t.id] ?? [],
    };
  });

  if (redis && teams.length > 0) {
    await redis.setex(cacheKey, TEAMS_CACHE_TTL, teams);
  }

  return teams;
}

// Serve instantly, refresh behind the request — the same policy the players
// route uses. Even on a warm `loadTeams` cache this path still read the cap
// ceiling from the database, ran ensureNewTables, selected pick overrides and
// rebuilt ~800 pick objects on EVERY request; caching the assembled response
// removes all of that from the warm path.
const TEAMS_FRESH_TTL = 30 * 60;            // serve without refreshing
const TEAMS_STALE_TTL = 24 * 60 * 60;       // serve stale + refresh in background

async function buildTeamsPayload() {
  const liveCapCeiling = await getLiveCapCeiling();
  const LIVE_TEAMS = await loadTeams(liveCapCeiling);
  const picks = await buildDraftPickInventory(LIVE_TEAMS);

  const teams = LIVE_TEAMS.map((t: any) => ({
    id:       t.id,
    name:     t.name,
    capSpace: t.capSpace,
    standing: t.standing,
    phase:    t.phase,
    needs:    t.needs ?? [],
  }));

  return {
    teams,
    picks,
    capCeiling:  liveCapCeiling,
    capFloor:    CAP_FLOOR,
    generatedAt: new Date().toISOString(),
  };
}

export async function GET() {
  const { value, state, blocked } = await swrCache({
    store: swrStore,
    key: LEAGUE_TEAMS_PAYLOAD_CACHE_KEY,
    freshSeconds: TEAMS_FRESH_TTL,
    staleSeconds: TEAMS_STALE_TTL,
    // A teamless payload is a failed upstream, not a league — never cache it
    // for a day. An admin cap change drops this key via clearTeamCaches.
    isCacheable: (p) => Array.isArray(p?.teams) && p.teams.length > 0,
    build: buildTeamsPayload,
  });

  return NextResponse.json(value, {
    headers: {
      "Cache-Control": "public, s-maxage=300, stale-while-revalidate=900",
      "x-ledger-cache": state,
      "x-ledger-blocked": String(blocked),
    },
  });
}
