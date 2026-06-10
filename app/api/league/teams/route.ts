import { NextResponse } from "next/server";
import { SEASON } from "@/app/lib/season-config";
import { TEAMS_DB } from "@/app/lib/db";
import { redis } from "@/app/lib/redis";
import { db } from "@/app/db/client";
import { teams as teamsTable } from "@/app/db/schema";

export const dynamic = "force-dynamic";

const CAP_CEILING     = SEASON.capCeiling;
const CAP_FLOOR       = SEASON.capFloor;
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

  // Cap space comes from TEAMS_DB (curated for start of 2025-26 season).
  // We no longer scrape CapWages for cap space — post-season it returns 2026-27
  // offseason projections which are wrong for this trade machine's context.

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
    const capSpace = t.capSpace;

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
  const LIVE_TEAMS = await loadTeams();

  const picks: any[] = [];
  // Pick inventory derived from SEASON.draftYear — rounds 1-5 of the upcoming
  // draft, rounds 1-3 of the following year. Rolls forward automatically.
  const Y = SEASON.draftYear;
  LIVE_TEAMS.forEach((team) => {
    [
      { round: 1, year: Y }, { round: 1, year: Y + 1 },
      { round: 2, year: Y }, { round: 2, year: Y + 1 },
      { round: 3, year: Y }, { round: 3, year: Y + 1 },
      { round: 4, year: Y },
      { round: 5, year: Y },
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
    capCeiling:  CAP_CEILING,
    capFloor:    CAP_FLOOR,
    generatedAt: new Date().toISOString(),
  });
}
