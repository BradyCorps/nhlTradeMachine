import { NextResponse } from "next/server";
import { resolveTeamCapSpace } from "@/app/lib/team-cap-space";
import { SEASON } from "@/app/lib/season-config";
import { TEAMS_DB } from "@/app/lib/db";
import { redis } from "@/app/lib/redis";
import { db } from "@/app/db/client";
import { teams as teamsTable } from "@/app/db/schema";
import { assembleCanonicalRoster } from "@/app/lib/roster-assembly";
import { buildDraftPickInventory } from "@/app/lib/draft-pick-inventory";
import { LEAGUE_TEAMS_CACHE_KEY } from "@/app/lib/team-cache";
import { regulationWinsFrom } from "@/app/lib/nhl-standings-fields";

export const dynamic = "force-dynamic";

const CAP_CEILING = SEASON.capCeiling;
const CAP_FLOOR   = SEASON.capFloor;

const TEAMS_CACHE_TTL     = 6  * 60 * 60; // 6 hours (in seconds for Redis)


// ── Team metadata that needs human curation ──────────────────
// Everything else (standing, capSpace, phase) comes from live APIs
const TEAM_NEEDS: Record<string, { pos: string; minWar: number; label: string }[]> = {
  EDM: [{ pos: "D", minWar: 2.0, label: "Top 4 RD" }],
  CHI: [{ pos: "W", minWar: 2.5, label: "Elite Winger for Bedard" }],
  VGK: [{ pos: "D", minWar: 2.0, label: "Top 4 D" }],
  WPG: [{ pos: "W", minWar: 2.0, label: "Top 6 Winger" }, { pos: "D", minWar: 2.0, label: "Top 4 D" }],
  SJS: [{ pos: "C", minWar: 2.0, label: "Top 6 C" }],
};

// CapWages team slug mapping
const CW_SLUGS: Record<string, string> = {
  ANA: "anaheim_ducks",     BOS: "boston_bruins",      BUF: "buffalo_sabres",
  CGY: "calgary_flames",    CAR: "carolina_hurricanes", CHI: "chicago_blackhawks",
  COL: "colorado_avalanche",CBJ: "columbus_blue_jackets",DAL: "dallas_stars",
  DET: "detroit_red_wings", EDM: "edmonton_oilers",     FLA: "florida_panthers",
  LAK: "los_angeles_kings", MIN: "minnesota_wild",      MTL: "montreal_canadiens",
  NSH: "nashville_predators",NJD: "new_jersey_devils",  NYI: "new_york_islanders",
  NYR: "new_york_rangers",  OTT: "ottawa_senators",     PHI: "philadelphia_flyers",
  PIT: "pittsburgh_penguins",SEA: "seattle_kraken",     SJS: "san_jose_sharks",
  STL: "st_louis_blues",    TBL: "tampa_bay_lightning", TOR: "toronto_maple_leafs",
  UTA: "utah_mammoth",      VAN: "vancouver_canucks",   VGK: "vegas_golden_knights",
  WSH: "washington_capitals",WPG: "winnipeg_jets",
};

const DIVISIONS: Record<string, string> = {
  BOS: "Atlantic", BUF: "Atlantic", DET: "Atlantic", FLA: "Atlantic", MTL: "Atlantic", OTT: "Atlantic", TBL: "Atlantic", TOR: "Atlantic",
  CAR: "Metro", CBJ: "Metro", NJD: "Metro", NYI: "Metro", NYR: "Metro", PHI: "Metro", PIT: "Metro", WSH: "Metro",
  CHI: "Central", COL: "Central", DAL: "Central", MIN: "Central", NSH: "Central", STL: "Central", UTA: "Central", WPG: "Central",
  ANA: "Pacific", CGY: "Pacific", EDM: "Pacific", LAK: "Pacific", SJS: "Pacific", SEA: "Pacific", VAN: "Pacific", VGK: "Pacific",
};

const WESTERN_TEAMS = new Set(["CHI","COL","DAL","MIN","NSH","STL","UTA","WPG","ANA","CGY","EDM","LAK","SJS","SEA","VAN","VGK"]);

// Derive team phase from standing (1=best, 32=worst) and points percentage
// Tanking = deliberately non-competitive (< 38% point pct AND bottom 6)
// Rebuilding = losing but not deliberately tanking (young core, future focus)
// Retooling = middle of the pack, transitioning
// Bubble = fringe playoff, competitive but not elite
// Contender = genuine Cup contender
const derivePhase = (confRank: number, divRank: number, pointPct: number): string => {
  // 🏆 Conference leaders, Division Winners, and top-tier home-ice seeds (e.g., Anaheim at #3)
  if ((confRank <= 4 || divRank === 1) && pointPct >= 0.52) return "Contender";
  
  // ⚔️ Secured division spots or high-end wild card threats (Seeds 5 & 6)
  if (confRank <= 6 && pointPct >= 0.50) return "Contender";

  // 🫧 True Wild Card bracket / Playoff Bubble lines (Seeds 7 & 8, or close hunters)
  if (confRank <= 8 && pointPct >= 0.50) return "Bubble";
  if (confRank <= 10 && pointPct >= 0.48) return "Bubble"; 

  // 🛠️ Outside the playoff window
  if (confRank <= 14) return "Retooling";
  if (pointPct < 0.38) return "Tanking";
  
  return "Rebuilding";
};

const fetchWithTimeout = (url: string, ms = 8000, extraHeaders: Record<string,string> = {}): Promise<Response> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, {
    signal: ctrl.signal,
    cache: "no-store",
    headers: { ...extraHeaders },
  }).finally(() => clearTimeout(t));
};

async function loadTeams(): Promise<any[]> {
  if (redis) {
    const cached = await redis.get<any[]>(LEAGUE_TEAMS_CACHE_KEY);
    if (cached && Array.isArray(cached) && cached.length > 0) return cached;
  }

  // ── Fetch standings from NHL stats API ───────────────────────
  let standingsMap = new Map<string, {
  standing: number;
  pointPct: number;
  teamFullName: string;
  conferenceRank: number;
  divisionRank: number;
  points: number;
  wins: number;
  losses: number;
  otLosses: number;
  gamesPlayed: number;
  goalsFor: number;
  goalsAgainst: number;
  powerPlayPct: number;
  penaltyKillPct: number;
  shotsForPerGame: number;
  shotsAgainstPerGame: number;
  faceoffWinPct: number;
  regulationWins: number;
  streakCode: string;
  streakCount: number;
  l10Record: string;
  clinchIndicator: string;
  wildcardSequence: number;
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

      // 1. Sort globally by NHL tiebreakers (Points -> RW -> ROW)
      // Note: NHL changed tiebreakers, Regulation Wins (RW) comes before ROW now!
      teams.sort((a, b) => {
        const pointsA = Number.isFinite(a.points) ? a.points : -1;
        const pointsB = Number.isFinite(b.points) ? b.points : -1;
        return pointsB !== pointsA
          ? pointsB - pointsA
          : regulationWinsFrom(b) - regulationWinsFrom(a);
      });

      // 2. Assign overall standing and map standard points
      teams.forEach((t, i) => {
        t.overallRank = i + 1;
        t.tricode = NHL_ID_TO_TRICODE[t.teamId];
      });

     // 3. Division and conference rankings
      
      // 4. Distribute into Conference buckets for ranking
      let westTeams = teams.filter(t => WESTERN_TEAMS.has(t.tricode));
      let eastTeams = teams.filter(t => !WESTERN_TEAMS.has(t.tricode) && t.tricode);

      westTeams.forEach((t, i) => t.confRank = i + 1);
      eastTeams.forEach((t, i) => t.confRank = i + 1);

      // 5. Calculate Division Ranks cleanly via sequential index counters
      const divCounters: Record<string, number> = { Atlantic: 0, Metro: 0, Central: 0, Pacific: 0 };
      
      teams.forEach((t) => {
        const divName = DIVISIONS[t.tricode];
        if (divCounters[divName] !== undefined) {
          divCounters[divName]++;
          t.divRank = divCounters[divName];
        } else {
          t.divRank = 8; // Fallback bound
        }
      });

      // 6. Construct the completely updated standings data map
      teams.forEach((t) => {
        if (t.tricode) {
          standingsMap.set(t.tricode, {
            standing:           t.overallRank,
            conferenceRank:     t.confRank,
            divisionRank:       t.divRank,
            points:             t.points ?? 0,
            pointPct:           t.pointPct ?? 0.5,
            teamFullName:       t.teamFullName,
            wins:               t.wins ?? 0,
            losses:             t.losses ?? 0,
            otLosses:           t.otLosses ?? 0,
            gamesPlayed:        t.gamesPlayed ?? 82,
            goalsFor:           t.goalsFor ?? 0,
            goalsAgainst:       t.goalsAgainst ?? 0,
            powerPlayPct:       t.powerPlayPct ?? 0,
            penaltyKillPct:     t.penaltyKillPct ?? 0,
            shotsForPerGame:    t.shotsForPerGame ?? 0,
            shotsAgainstPerGame: t.shotsAgainstPerGame ?? 0,
            faceoffWinPct:      t.faceoffWinPct ?? 0,
            regulationWins:     regulationWinsFrom(t),
            streakCode:         "",
            streakCount:        0,
            l10Record:          "",
            clinchIndicator:    "",
            wildcardSequence:   0,
          });
        }
      });
    }
  } catch (err) {
    console.error("[league] Standings API fetch failed:", err instanceof Error ? err.message : err);
  }

  // ── Enrich + Fallback: api-web.nhle.com/v1/standings/now ──
  // Always fetch for streak/L10/clinch data (stats API doesn't have these).
  // Also serves as a fallback when the primary stats API misses teams.
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
        if (!tricode) return;

        const streak = t.streakCode ?? "";
        const streakCount = t.streakCount ?? 0;
        const l10W = t.l10Wins ?? 0;
        const l10L = t.l10Losses ?? 0;
        const l10O = t.l10OtLosses ?? 0;
        const l10Record = (l10W || l10L || l10O) ? `${l10W}-${l10L}-${l10O}` : "";
        const clinch = t.clinchIndicator ?? "";
        const wcSeq = t.wildcardSequence ?? 0;

        const existing = standingsMap.get(tricode);
        if (existing) {
          existing.streakCode = streak;
          existing.streakCount = streakCount;
          existing.l10Record = l10Record;
          existing.clinchIndicator = clinch;
          existing.wildcardSequence = wcSeq;
        } else {
          standingsMap.set(tricode, {
            standing:           i + 1,
            conferenceRank:     t.conferenceSequence ?? 8,
            divisionRank:       t.divisionSequence ?? 4,
            points:             t.points ?? 0,
            pointPct:           t.pointPctg ?? 0.5,
            teamFullName:       t.teamName?.default ?? tricode,
            wins:               t.wins ?? 0,
            losses:             t.losses ?? 0,
            otLosses:           t.otLosses ?? 0,
            gamesPlayed:        t.gamesPlayed ?? 82,
            goalsFor:           t.goalFor ?? 0,
            goalsAgainst:       t.goalAgainst ?? 0,
            powerPlayPct:       t.powerPlayPctg ?? 0,
            penaltyKillPct:     t.penaltyKillPctg ?? 0,
            shotsForPerGame:    0,
            shotsAgainstPerGame: 0,
            faceoffWinPct:      t.faceoffWinPctg ?? 0,
            regulationWins:     regulationWinsFrom(t),
            streakCode:         streak,
            streakCount:        streakCount,
            l10Record,
            clinchIndicator:    clinch,
            wildcardSequence:   wcSeq,
          });
        }
      });
      if (standingsMap.size >= 28) {
        console.log("[league] Standings enriched from api-web");
      }
    }
  } catch (err) {
    console.error("[league] Standings web-API enrichment failed:", err instanceof Error ? err.message : err);
  }

  // ── Fetch cap space from CapWages (batch 8 at a time) ────────
  interface CapInfo {
    capSpace: number;
    ltirUsed: number;
    deadCap: number;
    totalCapHit: number;
    bonuses: number;
  }
  const capMap = new Map<string, CapInfo>();
  const teamIds = Object.keys(CW_SLUGS);

  for (let i = 0; i < teamIds.length; i += 8) {
    const batch = teamIds.slice(i, i + 8);
    await Promise.allSettled(batch.map(async (id) => {
      try {
        const slug = CW_SLUGS[id];
        const res  = await fetchWithTimeout(
          `https://capwages.com/teams/${slug}`,
          8000,
          { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
        );
        if (!res.ok) return;
        const html  = await res.text();
        const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
        if (!match) return;
        const nextData = JSON.parse(match[1]);
        const summary  = nextData?.props?.pageProps?.teamSummary;
        if (summary?.capSpace !== undefined) {
          const toM = (v: number | undefined) => v != null ? Math.round((v / 1_000_000) * 10) / 10 : 0;
          capMap.set(id, {
            capSpace:    toM(summary.capSpace),
            ltirUsed:    toM(summary.ltirPool ?? summary.ltirUsed ?? summary.ltir),
            deadCap:     toM(summary.deadCapHit ?? summary.deadCap ?? summary.deadCapSpace),
            totalCapHit: toM(summary.currentCapHit ?? summary.activeCapHit ?? summary.totalCapHit),
            bonuses:     toM(summary.performanceBonuses ?? summary.bonuses),
          });
        }
      } catch (err) {
        console.error(`[league] CapWages scrape failed for ${id}:`, err instanceof Error ? err.message : err);
      }
    }));
    if (i + 8 < teamIds.length) await new Promise(r => setTimeout(r, 300));
  }

  // ── Query Database for manual overrides ────────
  let dbTeams: any[] = [];
  try {
    dbTeams = await db.select().from(teamsTable);
  } catch (e) {
    console.warn("DB not reachable, falling back to static/live data.");
  }
  const dbTeamMap = new Map(dbTeams.map(t => [t.id, t]));

  // ── Build team objects ────────────────────────────────────────
  const teams = TEAMS_DB.map((t) => {
    const dbTeam   = dbTeamMap.get(t.id);
    const st       = standingsMap.get(t.id);
    const standing = dbTeam?.standingOverride ?? st?.standing ?? t.standing;
    const confRank = st?.conferenceRank ?? 8;   // Safe baseline fallback if API misses
    const divRank  = st?.divisionRank   ?? 4;   // Safe baseline fallback if API misses
    const pointPct = st?.pointPct       ?? 0.5;
    const capInfo = capMap.get(t.id);
    // Shared with /api/league/teams. This route previously used the curated
    // figure raw, so it reported $8.5M less space than the trade machine for
    // every club — the difference between the curated ceiling and the live one.
    const capSpace = resolveTeamCapSpace({
      curatedCapSpace: t.capSpace,
      capCeiling: CAP_CEILING,
      liveCapSpace: capInfo?.capSpace,
    });
    
    const phase = dbTeam?.phaseOverride
      ?? (standingsMap.size >= 28 ? derivePhase(confRank, divRank, pointPct) : t.phase);

    const division = DIVISIONS[t.id] ?? "";
    const conference = WESTERN_TEAMS.has(t.id) ? "Western" : "Eastern";

    let playoffPosition = "";
    if (divRank <= 3) {
      playoffPosition = divRank === 1 ? "DIV-1" : divRank === 2 ? "DIV-2" : "DIV-3";
    } else if (confRank <= 8) {
      playoffPosition = confRank === 7 ? "WC1" : "WC2";
    }

    return {
      id:       t.id,
      name:     st?.teamFullName ?? dbTeam?.name ?? t.name,
      capSpace,
      standing,
      phase,
      division,
      conference,
      needs:    TEAM_NEEDS[t.id] ?? [],
      capBreakdown: capInfo ? {
        ltirUsed: capInfo.ltirUsed,
        deadCap:  capInfo.deadCap,
        totalCapHit: capInfo.totalCapHit,
        bonuses:  capInfo.bonuses,
      } : null,
      record: st ? {
        wins:               st.wins,
        losses:             st.losses,
        otLosses:           st.otLosses,
        points:             st.points,
        gamesPlayed:        st.gamesPlayed,
        goalsFor:           st.goalsFor,
        goalsAgainst:       st.goalsAgainst,
        powerPlayPct:       st.powerPlayPct,
        penaltyKillPct:     st.penaltyKillPct,
        shotsForPerGame:    st.shotsForPerGame,
        shotsAgainstPerGame: st.shotsAgainstPerGame,
        faceoffWinPct:      st.faceoffWinPct,
        regulationWins:     st.regulationWins,
        streakCode:         st.streakCode,
        streakCount:        st.streakCount,
        l10Record:          st.l10Record,
        clinchIndicator:    st.clinchIndicator,
        playoffPosition,
      } : null,
    };
  });

  // ── Cache result ──────────────────────────────────────────────
  if (redis && teams.length > 0) {
    await redis.setex(LEAGUE_TEAMS_CACHE_KEY, TEAMS_CACHE_TTL, teams);
  }


  return teams;
}

export async function GET() {
  const LIVE_TEAMS = await loadTeams();
  const roster = await assembleCanonicalRoster({ teams: LIVE_TEAMS, includeTeamContext: true });
  const picks = await buildDraftPickInventory(LIVE_TEAMS);

  const teams = roster.teams.map((t: any) => ({
    id:       t.id,
    name:     t.name,
    capSpace: t.capSpace,
    standing: t.standing,
    phase:    t.phase,
    division: t.division ?? "",
    conference: t.conference ?? "",
    needs:    t.needs ?? [],
    record:   t.record ?? null,
    capBreakdown: t.capBreakdown ?? null,
  }));

  return NextResponse.json({
    teams,
    players: [...roster.players, ...picks],
    capCeiling: CAP_CEILING,
    capFloor:   CAP_FLOOR,
    generatedAt: roster.generatedAt,
    source: "NHL API + CapWages + Bundled Contracts",
    liveStats: roster.liveStats,
    debug: roster.debug,
  });
}
