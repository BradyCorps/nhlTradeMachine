import { NextResponse } from "next/server";
import { SEASON } from "@/app/lib/season-config";
import { TEAMS_DB } from "@/app/lib/db";
import { redis } from "@/app/lib/redis";
import { db } from "@/app/db/client";
import { players as playersTable, siteSettings, teams as teamsTable } from "@/app/db/schema";
import { buildTeamCapSpaceMap, parseStoredCapCeiling } from "@/app/lib/cap-settings";

export const dynamic = "force-dynamic";

const CAP_FLOOR       = SEASON.capFloor;
const TEAMS_CACHE_TTL = 6 * 60 * 60; // 6 hours
const TRADE_TEAMS_CACHE_KEY = "cache:trade:teams:v1";

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

const getLiveCapCeiling = async (): Promise<number> => {
  const rows = await db.select().from(siteSettings).catch(() => []);
  const row = rows.find((r) => r.key === "cap_ceiling");
  return parseStoredCapCeiling(row?.value, SEASON.capCeiling) ?? SEASON.capCeiling;
};

const teamCacheKey = (capCeiling: number): string =>
  `${TRADE_TEAMS_CACHE_KEY}:cap:${capCeiling.toFixed(1)}`;

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
          : (b.regulationWins ?? 0) - (a.regulationWins ?? 0);
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
  } catch (_) {}

  let dbTeams: any[] = [];
  try {
    dbTeams = await db.select().from(teamsTable);
  } catch (_) {}
  const dbTeamMap = new Map(dbTeams.map(t => [t.id, t]));

  // Prefer synced contract rows for cap space. Static TEAMS_DB cap space is only
  // an emergency fallback when a team's contract table is incomplete.
  const dbContracts = await db.select({
    teamId:         playersTable.teamId,
    position:       playersTable.position,
    capHit:         playersTable.capHit,
    yearsRemaining: playersTable.yearsRemaining,
    isLtir:         playersTable.isLtir,
    isRetained:     playersTable.isRetained,
    retainedSalary: playersTable.retainedSalary,
  }).from(playersTable).catch(() => []);
  const dbCapSpaceMap = buildTeamCapSpaceMap(dbContracts, capCeiling);

  const teams = TEAMS_DB.map((t) => {
    const dbTeam   = dbTeamMap.get(t.id);
    const st       = standingsMap.get(t.id);
    const standing = dbTeam?.standingOverride ?? st?.standing ?? t.standing;
    const confRank = st?.conferenceRank ?? 8;
    const divRank  = st?.divisionRank   ?? 4;
    const pointPct = st?.pointPct       ?? 0.5;
    const capSpace = dbCapSpaceMap.get(t.id) ?? t.capSpace;

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

export async function GET() {
  const liveCapCeiling = await getLiveCapCeiling();
  const LIVE_TEAMS = await loadTeams(liveCapCeiling);

  const picks: any[] = [];
  // Pick inventory derived from SEASON.draftYear — rounds 1-5 for the next
  // three drafts. Rolls forward automatically and stays sorted by year.
  const Y = SEASON.draftYear;
  LIVE_TEAMS.forEach((team) => {
    [Y, Y + 1, Y + 2].flatMap(year =>
      [1, 2, 3, 4, 5].map(round => ({ round, year }))
    ).forEach(({ round, year }) => {
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
        avgTOI: 0, qocIndex: null,
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
    capCeiling:  liveCapCeiling,
    capFloor:    CAP_FLOOR,
    generatedAt: new Date().toISOString(),
  });
}
