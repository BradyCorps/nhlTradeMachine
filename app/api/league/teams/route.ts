import { NextResponse } from "next/server";
import { SEASON } from "@/app/lib/season-config";
import { TEAMS_DB } from "@/app/lib/db";
import { redis } from "@/app/lib/redis";
import { db } from "@/app/db/client";
import { teams as teamsTable, siteSettings } from "@/app/db/schema";

export const dynamic = "force-dynamic";
const TEAMS_CACHE_TTL = 6 * 60 * 60; // 6 hours

const TEAM_NEEDS: Record<string, { pos: string; minWar: number; label: string }[]> = {
  EDM: [{ pos: "D", minWar: 2.0, label: "Top 4 RD" }],
  CHI: [{ pos: "W", minWar: 2.5, label: "Elite Winger for Bedard" }],
  VGK: [{ pos: "D", minWar: 2.0, label: "Top 4 D" }],
  WPG: [{ pos: "W", minWar: 2.0, label: "Top 6 Winger" }, { pos: "D", minWar: 2.0, label: "Top 4 D" }],
  SJS: [{ pos: "C", minWar: 2.0, label: "Top 6 C" }],
};

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

async function loadSettings(): Promise<{ capCeiling: number; capFloor: number }> {
  try {
    const rows = await db.select().from(siteSettings);
    const m = new Map(rows.map(r => [r.key, r.value]));
    return {
      capCeiling: m.has("cap_ceiling") ? parseFloat(m.get("cap_ceiling")!) : SEASON.capCeiling,
      capFloor:   m.has("cap_floor")   ? parseFloat(m.get("cap_floor")!)   : SEASON.capFloor,
    };
  } catch {
    return { capCeiling: SEASON.capCeiling, capFloor: SEASON.capFloor };
  }
}

async function loadTeams(): Promise<any[]> {
  if (redis) {
    const cached = await redis.get<any[]>("cache:teams");
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
      "https://api.nhle.com/stats/rest/en/team/summary?cayenneExp=seasonId=20252026%20and%20gameTypeId=2",
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

      teams.sort((a, b) =>
        b.points !== a.points
          ? b.points - a.points
          : (b.regulationWins ?? 0) - (a.regulationWins ?? 0)
      );

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
  } catch (_) {}

  const capMap = new Map<string, number>();
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
          capMap.set(id, Math.round((summary.capSpace / 1_000_000) * 10) / 10);
        }
      } catch (_) {}
    }));
    if (i + 8 < teamIds.length) await new Promise(r => setTimeout(r, 300));
  }

  let dbTeams: any[] = [];
  try {
    dbTeams = await db.select().from(teamsTable);
  } catch (_) {}
  const dbTeamMap = new Map(dbTeams.map(t => [t.id, t]));

  const teams = TEAMS_DB.map((t) => {
    const dbTeam   = dbTeamMap.get(t.id);
    const st       = standingsMap.get(t.id);
    const standing = dbTeam?.standingOverride ?? st?.standing ?? t.standing;
    const confRank = st?.conferenceRank ?? 8;
    const divRank  = st?.divisionRank   ?? 4;
    const pointPct = st?.pointPct       ?? 0.5;
    const capSpace = capMap.get(t.id) ?? t.capSpace;

    const phase = dbTeam?.phaseOverride
      ?? (standingsMap.size >= 28 ? derivePhase(confRank, divRank, pointPct) : t.phase);

    return {
      id:       t.id,
      name:     st?.teamFullName ?? dbTeam?.name ?? t.name,
      capSpace: Math.round(capSpace * 10) / 10,
      standing,
      phase,
      needs: TEAM_NEEDS[t.id] ?? [],
    };
  });

  if (redis && teams.length > 0) {
    await redis.setex("cache:teams", TEAMS_CACHE_TTL, teams);
  }

  return teams;
}

export async function GET() {
  const [LIVE_TEAMS, { capCeiling: CAP_CEILING, capFloor: CAP_FLOOR }] =
    await Promise.all([loadTeams(), loadSettings()]);

  const picks: any[] = [];
  LIVE_TEAMS.forEach((team) => {
    [
      { round: 1, year: 2026 }, { round: 1, year: 2027 },
      { round: 2, year: 2026 }, { round: 2, year: 2027 },
      { round: 3, year: 2026 }, { round: 3, year: 2027 },
      { round: 4, year: 2026 },
      { round: 5, year: 2026 },
    ].forEach(({ round, year }) => {
      const roundLabel = round === 1 ? "1st" : round === 2 ? "2nd" : round === 3 ? "3rd" : `${round}th`;
      picks.push({
        id:           `pick-${team.id}-${year}-${round}`,
        teamId:       team.id,
        name:         `${year} ${roundLabel} Round Pick (${team.id})`,
        position:     "Pick",
        age:          19, round, year,
        teamStanding: team.standing,
        isProtected:  false,
        games: 0, ptsPace: 0, xGPace: 0, defRate: 0,
        avgTOI: 0, qocRank: 999,
        capHit: 0, yearsRemaining: 0,
        hasNMC: false, hasNTC: false,
        canRetain: false, retainedPct: 0,
        multiplier: 1.0, hasLiveStats: false,
      });
    });
  });

  const teams = LIVE_TEAMS.map((t: any) => ({
    id:       t.id,
    name:     t.name,
    capSpace: t.capSpace,
    standing: t.standing,
    phase:    t.phase,
    needs:    t.needs ?? [],
  }));

  return NextResponse.json({
    teams,
    picks,
    capCeiling:  CAP_CEILING,
    capFloor:    CAP_FLOOR,
    generatedAt: new Date().toISOString(),
  });
}
