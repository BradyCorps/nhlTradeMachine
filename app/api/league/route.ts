import { NextResponse } from "next/server";
import { SEASON, LEAGUE } from "@/app/lib/season-config";
import { TEAMS_DB } from "@/app/lib/db";
import { scrapeCapWages } from "@/app/services/scraper";
import { redis } from "@/app/lib/redis";
import { db } from "@/app/db/client";
import { teams as teamsTable, players as playersTable, tradeBlock as tradeBlockTable } from "@/app/db/schema";
import { resolveRosterTier } from "@/app/lib/xnav-engine";
import { calcDevelopmentProfile } from "@/app/lib/development-profile";
import {
  buildDevelopmentInputFromNhlTimeline,
  buildDevelopmentInputFromPlayerPayload,
  fetchCachedNhlSkaterTimelineRowsForPlayers,
} from "@/app/lib/development-sources";
import { fetchProspectEnrichmentMap } from "@/app/lib/prospect-enrichment";

export const dynamic = "force-dynamic";

const CAP_CEILING = SEASON.capCeiling;
const CAP_FLOOR   = SEASON.capFloor;

const TEAMS_CACHE_TTL     = 6  * 60 * 60; // 6 hours (in seconds for Redis)
const CONTRACTS_CACHE_TTL = 23 * 60 * 60; // 23 hours
const CONTRACTS_CACHE_KEY = "cache:contracts:v2";
const MONEYPUCK_CACHE_TTL = 4  * 60 * 60; // 4 hours
const PS_CACHE_TTL        = 12 * 60 * 60; // 12 hours

const VALID_TEAM_IDS = new Set(TEAMS_DB.map(t => t.id));

const isValidTeamId = (teamId: string | null | undefined): teamId is string =>
  Boolean(teamId && VALID_TEAM_IDS.has(teamId));


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

// ── In-memory cache globals ───────────────────────────────────

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

// ── Phase overrides for teams whose standing misleads about their true window ──
// Some teams have a bad year but retain the core of a contender.
// These are manually curated based on roster quality, not just standings.
// ── Phase overrides for teams whose standing misleads about their true window ──


// ── Contract overrides — manual corrections for known data errors ──
// Manual overrides for contracts where the CapWages scraper's age-based year calculation
// is unreliable (e.g. back-loaded extensions where ageSigned ≠ effective start year).
const CONTRACT_OVERRIDES: Record<string, { capHit?: number; yearsRemaining?: number; position?: string }> = {
  "Quinton Byfield":  { position: "C" },          // NHL API sometimes tags as "LW"
  "Mark Scheifele":   { yearsRemaining: 5 },       // 8yr/2023→2031; scraper age math gives 1
};

async function loadTeams(): Promise<any[]> {
  if (redis) {
    const cached = await redis.get<any[]>("cache:teams");
    if (cached && Array.isArray(cached) && cached.length > 0) return cached;
  }

  // ── Fetch standings from NHL stats API ───────────────────────
  let standingsMap = new Map<string, { 
  standing: number; 
  pointPct: number; 
  teamFullName: string;
  conferenceRank: number;
  divisionRank: number; // Add this
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

      // 1. Sort globally by NHL tiebreakers (Points -> RW -> ROW)
      // Note: NHL changed tiebreakers, Regulation Wins (RW) comes before ROW now!
      teams.sort((a, b) =>
        b.points !== a.points
          ? b.points - a.points
          : (b.regulationWins ?? 0) - (a.regulationWins ?? 0)
      );

      // 2. Assign overall standing and map standard points
      teams.forEach((t, i) => {
        t.overallRank = i + 1;
        t.tricode = NHL_ID_TO_TRICODE[t.teamId];
      });

     // 3. Define accurate division blueprints
      const DIVISIONS: Record<string, string> = {
        BOS: "Atlantic", BUF: "Atlantic", DET: "Atlantic", FLA: "Atlantic", MTL: "Atlantic", OTT: "Atlantic", TBL: "Atlantic", TOR: "Atlantic",
        CAR: "Metro", CBJ: "Metro", NJD: "Metro", NYI: "Metro", NYR: "Metro", PHI: "Metro", PIT: "Metro", WSH: "Metro",
        CHI: "Central", COL: "Central", DAL: "Central", MIN: "Central", NSH: "Central", STL: "Central", UTA: "Central", WPG: "Central",
        ANA: "Pacific", CGY: "Pacific", EDM: "Pacific", LAK: "Pacific", SJS: "Pacific", SEA: "Pacific", VAN: "Pacific", VGK: "Pacific"
      };

      const WESTERN_TEAMS = new Set(["CHI","COL","DAL","MIN","NSH","STL","UTA","WPG","ANA","CGY","EDM","LAK","SJS","SEA","VAN","VGK"]);
      
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

  // ── Fetch cap space from CapWages (batch 8 at a time) ────────
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
    const capSpace = capMap.get(t.id)   ?? t.capSpace;
    
    const phase = dbTeam?.phaseOverride
      ?? (standingsMap.size >= 28 ? derivePhase(confRank, divRank, pointPct) : t.phase);

    return {
      id:       t.id,
      name:     st?.teamFullName ?? dbTeam?.name ?? t.name,
      capSpace: Math.round(capSpace * 10) / 10,
      standing, // Preserves overall league rank for UI sorting
      phase,    // Now accurately driven by playoff positioning or DB manual override
      needs:    TEAM_NEEDS[t.id] ?? [],
    };
  });

  // ── Cache result ──────────────────────────────────────────────
  if (redis && teams.length > 0) {
    await redis.setex("cache:teams", TEAMS_CACHE_TTL, teams);
  }


  return teams;
}

async function loadContracts(): Promise<Record<string, any>> {
  if (redis) {
    const cached = await redis.get<Record<string, any>>(CONTRACTS_CACHE_KEY);
    if (cached && Object.keys(cached).length > 200) return cached;
  }


  const dbData  = await loadFromDB();
  const fresh   = await scrapeCapWages();
  const merged: Record<string, any> = {};

  if (Object.keys(fresh).length > 200) {
    // Live CapWages data available, with admin DB rows taking precedence for
    // contract fields when a player exists in both sources.
    for (const [name, cw] of Object.entries(fresh)) {
      const baseName = name.includes("__") ? name.split("__")[0] : name;
      const b = dbData[baseName];
      merged[name] = {
        capHit:         b?.capHit ?? cw.capHit,
        yearsRemaining: b?.yearsRemaining ?? (cw.yearsRemaining > 0 ? cw.yearsRemaining : 1),
        hasNMC:         b?.hasNMC  ?? false,
        hasNTC:         b?.hasNTC  ?? false,
        canRetain:      b?.hasNMC  ? false : true,
        expiryStatus:   cw.expiryStatus,
        position:       b?.position ?? cw.position,
        extensionCapHit: b?.extensionCapHit,
        extensionYears:  b?.extensionYears,
      };
    }
    // Backfill: DB players the scraper rejected or dropped (expired deals at
    // season rollover, cap out-of-range parses, index drift). Without this,
    // admin-edited contracts vanish whenever CapWages stops listing the player
    // and they fall to the 0.925 default.
    for (const [name, b] of Object.entries(dbData)) {
      if (!merged[name]) {
        merged[name] = {
          capHit:         b.capHit,
          yearsRemaining: b.yearsRemaining ?? 1,
          hasNMC:         b.hasNMC  ?? false,
          hasNTC:         b.hasNTC  ?? false,
          canRetain:      b.hasNMC  ? false : true,
          expiryStatus:   "UFA",
          position:       b.position,
          extensionCapHit: b.extensionCapHit,
          extensionYears:  b.extensionYears,
        };
      }
    }
  } else {
    // CapWages unavailable — use DB entirely
    for (const [name, b] of Object.entries(dbData)) {
      merged[name] = {
        capHit:         b.capHit,
        yearsRemaining: b.yearsRemaining ?? 1,
        hasNMC:         b.hasNMC  ?? false,
        hasNTC:         b.hasNTC  ?? false,
        canRetain:      b.hasNMC  ? false : true,
        expiryStatus:   "UFA",
        position:       b.position,
        extensionCapHit: b.extensionCapHit,
        extensionYears:  b.extensionYears,
      };
    }
  }

  // Code-level overrides for edge cases (back-loaded extensions where scraper age math fails)
  for (const [name, override] of Object.entries(CONTRACT_OVERRIDES)) {
    if (merged[name]) {
      if (override.capHit         !== undefined) merged[name].capHit         = override.capHit;
      if (override.yearsRemaining !== undefined) merged[name].yearsRemaining = override.yearsRemaining;
    }
  }

  if (redis && Object.keys(merged).length > 200) {
    await redis.setex(CONTRACTS_CACHE_KEY, CONTRACTS_CACHE_TTL, merged);
  }

  return merged;
}

// ── EV QoC Index (0-100): quantified even-strength deployment difficulty ──
// Replaces the old "qocRank", which was MoneyPuck's raw iceTimeRank SUM — a
// number that scaled with games played and measured nothing. Components:
//   65% — average per-game ice-time rank (coach trust; F scaled 1-12, D 1-6)
//   35% — defensive-zone start share (shutdown deployment)
// PK deployment is intentionally excluded; X-NAV applies SH leverage separately.
// Higher = tougher 5v5 minutes. ~75+ shutdown/top-pair usage, ~40 middle six, <20 sheltered.
function calcQocIndex(
  position: string,
  iceRankAvg: number | null | undefined,
  dzPct: number | null | undefined,
): number | null {
  if (position === "G") return null;
  if (iceRankAvg == null && dzPct == null) return null;
  const slots = position === "D" ? 6 : 12;
  const rankScore = iceRankAvg != null
    ? Math.max(0, Math.min(1, (slots + 1 - iceRankAvg) / slots))
    : 0.4; // unknown deployment → assume mid-roster
  const dzScore = Math.max(0, Math.min(1, ((dzPct ?? 0.5) - 0.35) / 0.30));
  return Math.round(100 * (0.65 * rankScore + 0.35 * dzScore));
}

async function loadFromDB(): Promise<Record<string, any>> {
  try {
    const rows = await db.select().from(playersTable);
    const result: Record<string, any> = {};
    for (const row of rows) {
      result[row.name] = {
        id:             row.id,
        name:           row.name,
        position:       row.position,
        teamId:         row.teamId,
        age:            row.age,
        capHit:         row.capHit,
        yearsRemaining: row.yearsRemaining,
        hasNMC:         row.hasNmc  ?? false,
        hasNTC:         row.hasNtc  ?? false,
        canRetain:      row.hasNmc  ? false : true,
        draftOverall:   row.draftOverall,
        prospectPtsPace: row.prospectPtsPace,
        extensionCapHit: row.extensionCapHit,
        extensionYears:  row.extensionYears,
      };
    }
    return result;
  } catch (e: any) {
    console.warn("[DB] loadFromDB failed, falling back to bundled.json:", e.message);
    return loadBundledFallback();
  }
}

function loadBundledFallback(): Record<string, any> {
  try {
    const fs   = require("fs");
    const path = require("path");
    const file = path.join(process.cwd(), "app/data/contracts.bundled.json");
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (e: any) {
    console.error("[Bundled] FAILED:", e.message);
  }
  return {};
}

function loadExtensions(): Record<string, any> {
  try {
    const fs   = require("fs");
    const path = require("path");
    const file = path.join(process.cwd(), "app/data/contracts.extensions.json");
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (e: any) {
    return {};
  }
}

function loadBaselines(): Record<string, any> {
  try {
    const fs   = require("fs");
    const path = require("path");
    const file = path.join(process.cwd(), "app/data/moneypuck_baselines.json");
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (e: any) {
    return {};
  }
}

function loadTeamBaselines(): Record<string, any> {
  try {
    const fs   = require("fs");
    const path = require("path");
    const file = path.join(process.cwd(), "app/data/team_baselines.json");
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (_) { return {}; }
}

// Proper CSV row parser — handles quoted fields containing commas.
// Prevents silent data corruption when player names contain commas.
const parseCSVRow = (row: string): string[] => {
  const result: string[] = [];
  let current = "";
  let inQuotes = false;
  for (const ch of row) {
    if (ch === '"') { inQuotes = !inQuotes; continue; }
    if (ch === "," && !inQuotes) { result.push(current.trim()); current = ""; continue; }
    current += ch;
  }
  result.push(current.trim());
  return result;
};

const slugify = (n: string) =>
  n.toLowerCase().normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim().replace(/\s+/g, "-");

const NHL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin": "https://www.nhl.com",
  "Referer": "https://www.nhl.com/",
};

const hasDiacritics = (name: string): boolean =>
  name.normalize("NFD") !== name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

const fetchWithTimeout = (url: string, ms = 8000, extraHeaders: Record<string,string> = {}): Promise<Response> => {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  return fetch(url, {
    signal: ctrl.signal,
    cache: "no-store",
    headers: { ...extraHeaders },
  }).finally(() => clearTimeout(t));
};

const normalisePos = (code: string) =>
  code === "L" || code === "R" ? "W" : code;

const calcAge = (birthDate: string): number => {
  const b = new Date(birthDate);
  const n = new Date();
  let age = n.getFullYear() - b.getFullYear();
  const m = n.getMonth() - b.getMonth();
  if (m < 0 || (m === 0 && n.getDate() < b.getDate())) age--;
  return age;
};


// ── Point Shares computation ─────────────────────────────────
// Computes OPS (Offensive) and DPS (Defensive) Point Shares
// using the marginal goals framework (Justin Kubatko / Hockey Reference)
// Data sources: NHL Stats API skater summary + team summary
// Formula (1998-99 to present, TOI available):
//   goalsCreated = G + 0.5*A (simplified — full formula uses team GF context)
//   marginalGF   = goalsCreated - (7/12) * TOI * (posGC / posTOI)
//   OPS          = marginalGF / (leagueGoals / leaguePoints)
//   DPS          = (TOIproportion * posAdj * teamMGA + plusMinusAdj)
//                   / (leagueGoals / leaguePoints)

interface NHLSkaterRow {
  playerId:        number;
  skaterFullName:  string;
  teamAbbrevs:     string;
  positionCode:    string;
  gamesPlayed:     number;
  goals:           number;
  assists:         number;
  plusMinus:       number;
  timeOnIcePerGame: number; // seconds per game
}

interface NHLTeamRow {
  teamId:       number;
  teamFullName: string;
  gamesPlayed:  number;
  goalsFor:     number;
  goalsAgainst: number;
  points:       number;
}

async function fetchPointShares(): Promise<Map<string, { ops: number; dps: number }>> {
  if (redis) {
    const cached = await redis.get<Record<string, { ops: number; dps: number }>>("cache:pointshares");
    if (cached) {
      return new Map(Object.entries(cached));
    }
  }

  const psMap = new Map<string, { ops: number; dps: number }>();

  try {
    // Fetch skater summary and team summary in parallel
    const [skatersRes, teamsRes] = await Promise.allSettled([
      fetchWithTimeout(
        `https://api.nhle.com/stats/rest/en/skater/summary?cayenneExp=seasonId%3D${SEASON.nhleSeasonId}%20and%20gameTypeId%3D2&limit=-1`,
        10000
      ),
      fetchWithTimeout(
        `https://api.nhle.com/stats/rest/en/team/summary?cayenneExp=seasonId%3D${SEASON.nhleSeasonId}%20and%20gameTypeId%3D2&limit=32`,
        8000
      ),
    ]);

    if (skatersRes.status !== "fulfilled" || !skatersRes.value.ok) return psMap;
    if (teamsRes.status  !== "fulfilled" || !teamsRes.value.ok)   return psMap;

    const skaterData: { data: NHLSkaterRow[] } = await skatersRes.value.json();
    const teamData:   { data: NHLTeamRow[]   } = await teamsRes.value.json();

    const skaters = skaterData.data ?? [];
    const teams   = teamData.data   ?? [];

    if (skaters.length < 100 || teams.length < 28) return psMap;

    // ── League-level constants ────────────────────────────────
    const leagueGoals  = teams.reduce((s, t) => s + t.goalsFor, 0);
    const leaguePoints = teams.reduce((s, t) => s + t.points, 0);
    // leagueGPG must be goals per TEAM per game (not per contest)
    // The DPS formula uses: teamMGA = (1+7/12) × teamGP × leagueGPG - teamGA
    // where teamGP is one team's games — so GPG must be per-team rate
    const totalTeamGames = teams.reduce((s, t) => s + t.gamesPlayed, 0);
    const leagueGPG      = leagueGoals / totalTeamGames; // ~2.98 goals/team/game
    const marginalGoalsPerPoint = leagueGoals / leaguePoints;

    // ── Team lookup ───────────────────────────────────────────
    // Map team abbreviation → team stats
    const TEAM_ABBREV_MAP: Record<string, string> = {
      "ANA":"Anaheim Ducks","ARI":"Utah Hockey Club","UTA":"Utah Hockey Club",
      "BOS":"Boston Bruins","BUF":"Buffalo Sabres","CGY":"Calgary Flames",
      "CAR":"Carolina Hurricanes","CHI":"Chicago Blackhawks","COL":"Colorado Avalanche",
      "CBJ":"Columbus Blue Jackets","DAL":"Dallas Stars","DET":"Detroit Red Wings",
      "EDM":"Edmonton Oilers","FLA":"Florida Panthers","LAK":"Los Angeles Kings",
      "MIN":"Minnesota Wild","MTL":"Montreal Canadiens","NSH":"Nashville Predators",
      "NJD":"New Jersey Devils","NYI":"New York Islanders","NYR":"New York Rangers",
      "OTT":"Ottawa Senators","PHI":"Philadelphia Flyers","PIT":"Pittsburgh Penguins",
      "SJS":"San Jose Sharks","SEA":"Seattle Kraken","STL":"St. Louis Blues",
      "TBL":"Tampa Bay Lightning","TOR":"Toronto Maple Leafs","VAN":"Vancouver Canucks",
      "VGK":"Vegas Golden Knights","WSH":"Washington Capitals","WPG":"Winnipeg Jets",
    };
    const teamByName = new Map<string, NHLTeamRow>();
    // Normalise accents on stored keys so "Montréal Canadiens" → "montreal canadiens"
    // The NHL API returns "Montréal Canadiens" (accented é) but TEAM_ABBREV_MAP has "Montreal Canadiens"
    const normalise = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    for (const t of teams) teamByName.set(normalise(t.teamFullName), t);
    const teamByAbbrev = new Map<string, NHLTeamRow>();
    for (const [abbrev, fullName] of Object.entries(TEAM_ABBREV_MAP)) {
      const t = teamByName.get(normalise(fullName));
      if (t) teamByAbbrev.set(abbrev, t);
    }

    // ── Build team-level aggregates for DPS formula ───────────
    // TOI stored in SECONDS from NHL API — convert to MINUTES throughout
    const toMin = (sec: number) => sec / 60;

    // IMPORTANT: Only count players with meaningful TOI (≥5 min/gm average)
    // HR uses active roster contributions, not every callup/depth appearance.
    // Including AHL callups and depth scratches inflates team TOI 3x and
    // tanks every player's DPS by the same factor.
    const MIN_TOI_PER_GAME = 5 * 60; // 5 min/gm minimum in seconds

    const teamAggregates = new Map<string, {
      fwdTOI: number; defTOI: number; totalSktTOI: number;
      fwdPM: number;  defPM: number;
      fwdGP: number;  defGP: number;
    }>();

    for (const s of skaters) {
      // Skip players with very low TOI — callups, healthy scratches, etc.
      if (s.timeOnIcePerGame < MIN_TOI_PER_GAME) continue;
      const abbrev   = s.teamAbbrevs.split(",")[0].trim();
      const totalTOI = toMin(s.timeOnIcePerGame) * s.gamesPlayed; // minutes
      const isD      = s.positionCode === "D";
      const agg      = teamAggregates.get(abbrev) ?? {
        fwdTOI: 0, defTOI: 0, totalSktTOI: 0,
        fwdPM: 0,  defPM: 0,
        fwdGP: 0,  defGP: 0,
      };
      if (isD) {
        agg.defTOI += totalTOI;
        agg.defPM  += s.plusMinus;
        agg.defGP  += s.gamesPlayed;
      } else {
        agg.fwdTOI += totalTOI;
        agg.fwdPM  += s.plusMinus;
        agg.fwdGP  += s.gamesPlayed;
      }
      agg.totalSktTOI += totalTOI;
      teamAggregates.set(abbrev, agg);
    }

    // ── League position averages for OPS formula ─────────────
    // Use team-level goals for accuracy, all-skater TOI in minutes
    // This matches Hockey Reference's methodology exactly
    let fwdTOItotal = 0;
    let defTOItotal = 0;

    for (const s of skaters) {
      const totTOI = toMin(s.timeOnIcePerGame) * s.gamesPlayed; // minutes
      if (s.positionCode === "D") defTOItotal += totTOI;
      else                        fwdTOItotal += totTOI;
    }

    // Use team GF data for league totals with team-context adjustment
    // GC = (G + 0.5*A) * teamGF/(teamGF+teamGA)
    // League-wide: teamFactor averages to 0.5 (equal GF/GA across all teams)
    // So league_adjGC = raw_GC * 0.5
    // Forwards: ~75% of goals, A/G ratio ~1.5: rawGC = goals*0.75*1.85, adjGC = *0.5
    const fwdGCtotal = leagueGoals * 0.75 * 1.85 * 0.5;
    const defGCtotal = leagueGoals * 0.25 * 1.85 * 0.5;

    const fwdGCperTOI = fwdTOItotal > 0 ? fwdGCtotal / fwdTOItotal : 0; // GC per minute
    const defGCperTOI = defTOItotal > 0 ? defGCtotal / defTOItotal : 0; // GC per minute

    // ── Compute PS per player ─────────────────────────────────
    // Goals Created formula (HR): GC = (G + 0.5*A) * teamGF/(teamGF+teamGA)
    // Team context adjusts raw production for team quality
    for (const s of skaters) {
      const abbrev  = s.teamAbbrevs.split(",")[0].trim();
      const team    = teamByAbbrev.get(abbrev);
      const agg     = teamAggregates.get(abbrev);
      if (!team || !agg) continue;

      const isD    = s.positionCode === "D";
      const posAdj = isD ? 10/7 : 5/7;
      const totTOI = toMin(s.timeOnIcePerGame) * s.gamesPlayed; // MINUTES

      // Team-context adjusted Goals Created (HR methodology)
      const teamFactor = team.goalsFor / (team.goalsFor + team.goalsAgainst);
      const gc = (s.goals + 0.5 * s.assists) * teamFactor;

      // ── OPS ──────────────────────────────────────────────────
      const gcPerTOI   = isD ? defGCperTOI : fwdGCperTOI;
      const marginalGF = gc - (7/12) * totTOI * gcPerTOI;
      const ops        = Math.max(-3, marginalGF / marginalGoalsPerPoint);

      // ── DPS ──────────────────────────────────────────────────
      const teamMGA = (1 + 7/12) * team.gamesPlayed * leagueGPG - team.goalsAgainst;

      const teamSktTOI    = agg.totalSktTOI;
      const toiProportion = teamSktTOI > 0 ? totTOI / teamSktTOI : 0;

      const posTOI = isD ? agg.defTOI : agg.fwdTOI;
      const posPM  = isD ? agg.defPM  : agg.fwdPM;
      const pmAdj  = (1/7) * posAdj * (s.plusMinus - totTOI * (posTOI > 0 ? posPM / posTOI : 0));

      const shotsAdjProportion = 5/7;
      const marginalGA = toiProportion * shotsAdjProportion * posAdj * teamMGA + pmAdj;
      const dps        = Math.max(-3, marginalGA / marginalGoalsPerPoint);

      const name = s.skaterFullName.trim();
      const ps   = { ops: Math.round(ops * 10) / 10, dps: Math.round(dps * 10) / 10 };
      psMap.set(name,               ps);
      psMap.set(`id:${s.playerId}`, ps);
      psMap.set(slugify(name),      ps); // normalised fallback — handles nickname/encoding mismatches
    }

    console.log(`[PS] Computed Point Shares for ${psMap.size / 2} players`);
    if (redis) {
      await redis.setex("cache:pointshares", PS_CACHE_TTL, Object.fromEntries(psMap));
    }
    return psMap;

  } catch (e: any) {
    console.warn("[PS] fetchPointShares failed:", e.message);
    return psMap;
  }
}

async function fetchNhlSkaterStatsFallback(): Promise<Map<string, any>> {
  const cacheKey = "cache:nhl_skater_summary_stats";
  if (redis) {
    const cached = await redis.get<Record<string, any>>(cacheKey);
    if (cached) return new Map(Object.entries(cached));
  }

  const statsMap = new Map<string, any>();
  try {
    const res = await fetchWithTimeout(
      `https://api.nhle.com/stats/rest/en/skater/summary?cayenneExp=seasonId%3D${SEASON.nhleSeasonId}%20and%20gameTypeId%3D2&limit=-1`,
      10000
    );
    if (!res.ok) return statsMap;

    const skaterData: { data: NHLSkaterRow[] } = await res.json();
    for (const s of skaterData.data ?? []) {
      if (!s.skaterFullName || s.gamesPlayed <= 0) continue;
      const position = normalisePos(s.positionCode);
      const games = Math.max(1, s.gamesPlayed);
      const entry = {
        ptsPace: ((s.goals + s.assists) / games) * 82,
        xGPace: 0,
        defRate: 0.08,
        avgTOI: s.timeOnIcePerGame / 60,
        games,
        hasLiveStats: true,
        goalsPace: (s.goals / games) * 82,
        assistsPace: (s.assists / games) * 82,
      };
      const slug = slugify(s.skaterFullName);
      statsMap.set(slug, entry);
      statsMap.set(`${slug}__${position}`, entry);
    }

    if (redis && statsMap.size > 100) {
      await redis.setex(cacheKey, PS_CACHE_TTL, Object.fromEntries(statsMap));
    }
  } catch (e: any) {
    console.warn("[NHL skater fallback] failed:", e.message);
  }
  return statsMap;
}

export async function GET() {
  // Load contracts, teams, and point shares in parallel
  const [CONTRACTS, LIVE_TEAMS, PS_MAP, NHL_SKATER_STATS, PROSPECT_ENRICHMENT] = await Promise.all([
    loadContracts(),
    loadTeams(),
    fetchPointShares(),
    fetchNhlSkaterStatsFallback(),
    fetchProspectEnrichmentMap(),
  ]);
  const EXTENSIONS = loadExtensions();
  const BASELINES      = loadBaselines();
  const TEAM_BASELINES = loadTeamBaselines();
  // ── 1. MoneyPuck analytics — skaters + goalies ─────────────
  // Cached for 4 hours — MP updates roughly twice daily.
  // Without this cache, every page load downloads two large CSVs (~2MB total).
  const analyticsMap = new Map<string, any>();
  const goalieMap    = new Map<string, any>();
  const teamXgaMap = new Map<string, { xGoals: number; ice: number }>();
  let skaterCsv: string | null = null;
  let goalieCsv: string | null = null;
  
  if (redis) {
    skaterCsv = await redis.get<string>("cache:mp_skaters");
    goalieCsv = await redis.get<string>("cache:mp_goalies");
  }

  const skaterCsvFresh = !!skaterCsv;
  const goalieCsvFresh = !!goalieCsv;

  try {
    // Fetch only stale CSVs — use cache for fresh ones
    const [mpRes, gpRes] = await Promise.allSettled([
      skaterCsvFresh
        ? Promise.resolve({ ok: true, text: async () => skaterCsv! })
        : fetchWithTimeout(
            "https://moneypuck.com/moneypuck/playerData/seasonSummary/2025/regular/skaters.csv",
            8000,
            { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
          ),
      goalieCsvFresh
        ? Promise.resolve({ ok: true, text: async () => goalieCsv! })
        : fetchWithTimeout(
            "https://moneypuck.com/moneypuck/playerData/seasonSummary/2025/regular/goalies.csv",
            8000,
            { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
          ),
    ]);

    // Parse skaters — use proper CSV parser to handle quoted fields (e.g. "Last, First")
    if (mpRes.status === "fulfilled" && mpRes.value.ok) {
      const csv  = await mpRes.value.text();
      // Store in cache if this was a fresh fetch
      if (!skaterCsvFresh && redis) await redis.setex("cache:mp_skaters", MONEYPUCK_CACHE_TTL, csv);
      const rows = csv.split("\n").filter(Boolean);
      const hdr  = parseCSVRow(rows[0]);
      const h    = (k: string) => hdr.indexOf(k);
      const [nI, sI, pI, xgI, gI, iceI, onAI, offAI, rkI, onFI, offFI, dzI, ozI, goalsI, posI] = [
        h("name"), h("situation"), h("I_F_points"), h("I_F_xGoals"),
        h("games_played"), h("icetime"),
        h("OnIce_A_xGoals"), h("OffIce_A_xGoals"),
        h("iceTimeRank"),  // NOTE: This is ice time VOLUME rank (1=most TOI), NOT quality of competition.
        h("OnIce_F_xGoals"), h("OffIce_F_xGoals"),
        h("I_F_dZoneShiftStarts"), h("I_F_oZoneShiftStarts"),
        h("I_F_goals"),
        h("position"),  // used to disambiguate same-name players (e.g. two Elias Petterssons on VAN)
      ];
      const zoneMap = new Map<string, number>(); // slugified name → 5on5 DZ%

      // First pass: collect 5on5 zone shift data
      rows.slice(1).forEach((row) => {
        const c = parseCSVRow(row);
        if (c.length <= nI) return;
        if (c[sI]?.trim() !== "5on5") return;
        if (dzI < 0 || ozI < 0) return;
        const name = c[nI].trim();
        const dz5  = parseFloat(c[dzI]) || 0;
        const oz5  = parseFloat(c[ozI]) || 0;
        if (dz5 + oz5 > 0) {
          const pos5 = posI >= 0 ? (c[posI]?.trim().toUpperCase() ?? "") : "";
          if (pos5) zoneMap.set(`${slugify(name)}__${pos5}`, dz5 / (dz5 + oz5));
          zoneMap.set(slugify(name), dz5 / (dz5 + oz5));
        }
      });

      // Second pass: process "all" situation rows, using zoneMap for DZ%
      rows.slice(1).forEach((row) => {
        const c = parseCSVRow(row);
        if (c.length <= nI || c[sI]?.trim() !== "all") return;
        const name     = c[nI].trim();
        const g        = Math.max(1, parseFloat(c[gI]) || 1);
        const iceSec   = parseFloat(c[iceI]) || 1;
        const iceHours = iceSec / 3600;
        const benchH   = Math.max(0.01, (g * 60 - iceSec / 60) / 60);
        const onA  = (parseFloat(c[onAI])  || 0) / Math.max(0.01, iceHours);
        const offA = (parseFloat(c[offAI]) || 0) / Math.max(0.01, benchH);

        // NOIV components — Relative to Teammates metrics
        const onF      = parseFloat(c[onFI])  || 0;
        const offFVal  = parseFloat(c[offFI]) || 0;
        const onAVal   = parseFloat(c[onAI])  || 0;
        const offAVal  = parseFloat(c[offAI]) || 0;
        // xG% on ice vs off ice (relative to teammates)
        const onXgPct  = onF + onAVal > 0 ? onF / (onF + onAVal) : 0.5;
        const offXgPct = offFVal + offAVal > 0 ? offFVal / (offFVal + offAVal) : 0.5;
        const xgRelTM  = (onXgPct - offXgPct) * 100; // percentage points

        // xGA/60 relative to teammates
        const onXgA60  = onA;
        const offXgA60 = offA;
        const xgaRelTM = onXgA60 - offXgA60; // negative = better defense

        // Defensive zone start % — 5on5 only (MoneyPuck "all" rows have 0 for zone shifts)
        // 5on5 zone deployment is the analytics standard for deployment measurement.
        const pos = posI >= 0 ? (c[posI]?.trim().toUpperCase() ?? "") : "";
        const posForZone = pos ? `${slugify(name)}__${pos}` : slugify(name);
        const dzPct = zoneMap.get(posForZone) ?? zoneMap.get(slugify(name)) ?? null;

        // Use name__position key when available to handle same-name players
        // e.g. "elias-pettersson__C" vs "elias-pettersson__D" (two VAN players)
        const mapKey = pos ? `${slugify(name)}__${pos}` : slugify(name);
        // Bayesian small-sample correction — prevents wild extrapolation for players
        // with limited games (e.g. Oliver Bonk 1GP 2pts → 164pts raw, ~31pts corrected).
        // Blend raw pace toward position mean based on games played.
        // Weight reaches 1.0 at 25 games; below that, regress toward position mean.
        const rawPtsPace   = (parseFloat(c[pI]) / g) * 82;
        const posDefault   = pos.startsWith('D') ? 26 : pos === 'C' ? 52 : 44;
        const sampleWeight = Math.min(1.0, g / 25);
        const ptsPace      = rawPtsPace * sampleWeight + posDefault * (1 - sampleWeight);
        const rawXgPace    = (parseFloat(c[xgI]) / g) * 82;
        const xGPace       = rawXgPace * sampleWeight + (pos.startsWith('D') ? 6 : 10) * (1 - sampleWeight);
        const entry = {
          ptsPace,
          xGPace,
          defRate: offA - onA,
          avgTOI:  iceSec / g / 60,
          // ── Bayesian shrinkage for relative stats ──────────────────────────
          // xgRelTM / xgaRelTM are even noisier than ptsPace — a single shift
          // can produce extreme values. Shrink towards 0 (league mean) using a
          // longer stabilisation window (30 GP vs 25 for counting stats).
          xgRelTM:  xgRelTM  * Math.min(1.0, g / 30),
          xgaRelTM: xgaRelTM * Math.min(1.0, g / 30),
          // MoneyPuck's iceTimeRank is the SUM of per-game ranks (1 = team's
          // most-used F/D that night). Divide by games for the average rank —
          // ~1-3 = top line/pair, ~10-12 = 4th line. Require 5 GP for signal.
          iceRankAvg: g >= 5 ? (parseFloat(c[rkI]) || 0) / g : null,
          games:   g,
          hasLiveStats: true,
          dzPct,
          goalsPace:   goalsI >= 0 ? (parseFloat(c[goalsI])   / g) * 82 : undefined,
          assistsPace: goalsI >= 0 ? ((parseFloat(c[pI]) - parseFloat(c[goalsI])) / g) * 82 : undefined,
        };
        analyticsMap.set(mapKey, entry);
        // Also store by name-only for players without a name collision
        if (pos) analyticsMap.set(slugify(name), entry);
      });
    }

    // Parse goalies — same quote-aware CSV parser
    // Also derive teamXga60 from xGoals allowed per team.
    // NOTE: writes to the outer teamXgaMap — a shadowing redeclaration here
    // previously discarded all parsed data, leaving the outer map empty and
    // the goalie defCorrection permanently zeroed in this route.

    if (gpRes.status === "fulfilled" && gpRes.value.ok) {
      const csv  = await gpRes.value.text();
      // Store in cache if this was a fresh fetch
      if (!goalieCsvFresh && redis) await redis.setex("cache:mp_goalies", MONEYPUCK_CACHE_TTL, csv);
      const rows = csv.split("\n").filter(Boolean);
      const hdr  = parseCSVRow(rows[0]);
      const h    = (k: string) => hdr.indexOf(k);
      const [nI, sI, gI, xgI, goalsI, ongoalI, teamI, iceI] = [
        h("name"), h("situation"), h("games_played"),
        h("xGoals"), h("goals"), h("ongoal"), h("team"), h("icetime"),
      ];
      if (nI >= 0 && xgI >= 0) {
        const goalieRows = new Map<string, any>();
        rows.slice(1).forEach((row) => {
          const c        = parseCSVRow(row);
          if (c.length <= nI) return;
          const sit = (c[sI] ?? "").trim().toLowerCase();
          if (sit !== "all") return;
          const name    = c[nI].trim();
          const g       = Math.max(1, parseFloat(c[gI]) || 1);
          const xGoals  = parseFloat(c[xgI])    || 0;
          const goals   = parseFloat(c[goalsI]) || 0;
          const ongoal  = parseFloat(c[ongoalI])|| 0;
          const ice     = iceI >= 0 ? (parseFloat(c[iceI]) || 0) : 0;
          const gsax    = xGoals - goals;
          const savePct = ongoal > 0 ? (ongoal - goals) / ongoal : 0.900;

          // Accumulate team xGA over real goalie icetime (seconds) so xGA/60
          // has correct units — games-based denominators inflated the ratio
          // and pinned the defCorrection clamp league-wide.
          const teamAbbr = (c[teamI] ?? "").trim().toUpperCase();
          if (teamAbbr) {
            const prev = teamXgaMap.get(teamAbbr) ?? { xGoals: 0, ice: 0 };
            teamXgaMap.set(teamAbbr, {
              xGoals: prev.xGoals + xGoals,
              ice:    prev.ice + ice,
            });
          }

          goalieRows.set(name, {
            gsax,
            savePct:      Math.round(savePct * 10000) / 10000,
            shotsPerGame: ongoal / g,
            gamesStarted: g,
            xGoalsAllowed: xGoals,  // raw xGoals allowed — used for teamXga60
            hasLiveStats: true,
          });
        });

        goalieRows.forEach((stats, name) => {
          goalieMap.set(slugify(name), stats);
          const parts = name.split(" ");
          if (parts.length >= 2) {
            goalieMap.set(slugify(parts[parts.length - 1]), stats);
          }
        });
      }
    }
  } catch (_) { /* external APIs blocked */ }

  // ── 2. Build roster from live NHL API only ─────────────────
  // Static player rosters were removed because they drift quickly and conflict
  // with the DB/live-data source of truth. If the NHL API is unavailable, this
  // route returns DB-injected draftees and draft picks rather than stale active
  // player rows.
  const rosterMap = new Map<string, any[]>();

  // Try /current first (always reflects active roster), fall back to season-specific.
  try {
    const results = await Promise.allSettled(
      LIVE_TEAMS.map((t) =>
        fetchWithTimeout(
          `https://api-web.nhle.com/v1/roster/${t.id}/current`,
          5000,
          NHL_HEADERS
        )
          .then((r) => (r.ok ? r.json() : null))
          .catch(() =>
            fetchWithTimeout(
              `https://api-web.nhle.com/v1/roster/${t.id}/${SEASON.nhleSeasonId}`,
              5000,
              NHL_HEADERS
            )
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
          )
      )
    );

    results.forEach((result, idx) => {
      const teamId = LIVE_TEAMS[idx].id;
      const data   = result.status === "fulfilled" ? result.value : null;
      if (!data) return;

      const skaters = [
        ...(data.forwards   || []),
        ...(data.defensemen || []),
        ...(data.goalies    || []),
      ];

      if (skaters.length < 5) return; // skip bad responses

      const liveList = skaters.map((p: any) => ({
        id:       p.id.toString(),
        name:     `${p.firstName.default} ${p.lastName.default}`,
        position: normalisePos(p.positionCode),
        age:      calcAge(p.birthDate),
        headshot: p.headshot ?? null,
      }));

      rosterMap.set(teamId, liveList);
    });
  } catch (_) {
    console.warn("[NHL roster] live roster fetch failed; no static player fallback is used.");
  }

  // ── Inject DB roster rows ────────────────────────────────────
  // Admin DB rows cover mock-draft prospects and roster players missing from
  // the live NHL roster feed. Deduplicate by id and normalized name so DB rows
  // augment the live roster instead of creating duplicates.
  try {
    const dbPlayers = await db.select({
      id:              playersTable.id,
      name:            playersTable.name,
      position:        playersTable.position,
      teamId:          playersTable.teamId,
      age:             playersTable.age,
      draftYear:       playersTable.draftYear,
      draftOverall:    playersTable.draftOverall,
      prospectPtsPace: playersTable.prospectPtsPace,
    }).from(playersTable);

    for (const d of dbPlayers) {
      if (!isValidTeamId(d.teamId)) continue;
      const list = rosterMap.get(d.teamId) ?? [];
      const dbSlug = slugify(d.name);
      const existing = list.find((x: any) => String(x.id) === String(d.id) || slugify(x.name) === dbSlug);
      if (existing) {
        existing.draftYear = existing.draftYear ?? d.draftYear;
        existing.draftOverall = existing.draftOverall ?? d.draftOverall;
        existing.prospectPtsPace = existing.prospectPtsPace ?? d.prospectPtsPace;
      } else {
        list.push({
          id:              d.id,
          name:            d.name,
          position:        normalisePos(d.position),
          age:             d.age ?? 18,
          headshot:        null,
          draftYear:       d.draftYear,
          draftOverall:    d.draftOverall,
          prospectPtsPace: d.prospectPtsPace,
          injectedFromDb:   true,
        });
      }
      rosterMap.set(d.teamId, list);
    }
  } catch (e: any) {
    console.warn("[DB roster] injection skipped:", e.message);
  }

  // ── Trade block statuses (admin-managed, keyed by name) ──────
  let blockMap = new Map<string, { status: string; note: string | null }>();
  try {
    const blockRows = await db.select().from(tradeBlockTable);
    blockMap = new Map(blockRows.map(r => [r.name, { status: r.status, note: r.note ?? null }]));
  } catch (e: any) {
    console.warn("[TradeBlock] read skipped:", e.message);
  }

  const activePlayerIds = [...new Set(
    [...rosterMap.values()]
      .flat()
      .filter((p: any) => p?.id != null)
      .map((p: any) => String(p.id))
  )];
  const developmentTimelineMap = await fetchCachedNhlSkaterTimelineRowsForPlayers({
    playerIds: activePlayerIds,
    seasonCount: 5,
    timeoutMs: 10000,
  }).catch((e: any) => {
    console.warn("[Development timeline] bulk fetch skipped:", e.message);
    return new Map();
  });

  // ── 3. Build player objects ─────────────────────────────────
  const players: any[] = [];

  rosterMap.forEach((skaters, teamId) => {
    const team = LIVE_TEAMS.find((t) => t.id === teamId);
    if (!team) return;

    skaters.forEach((p: any) => {
      const slug = slugify(p.name);
      const prospectOverride = PROSPECT_ENRICHMENT[slug];
      const draftYear = p.draftYear ?? prospectOverride?.draftYear;
      const draftOverall = p.draftOverall ?? prospectOverride?.draftOverall;
      const prospectPtsPace = p.prospectPtsPace ?? prospectOverride?.prospectPtsPace;
      // Try position-specific key first to handle same-name players (e.g. two Petterssons)
      const posSlug = `${slug}__${(p.position ?? "").toUpperCase()}`;
      const isDraftee = draftOverall != null;
      let stats = analyticsMap.get(posSlug) ?? analyticsMap.get(slug);
      // Fallback: MoneyPuck sometimes drops accented characters entirely
      // e.g. "Slafkovský" → "Slafkovsk" in CSV (ý stripped, not converted to y).
      // Try slug minus its last character only for names that actually contain
      // diacritics. Surname-only matching is too risky for minor-league rows.
      if (!stats && !isDraftee && hasDiacritics(p.name) && slug.length > 4) {
        const truncSlug = slug.slice(0, -1);
        stats = analyticsMap.get(`${truncSlug}__${(p.position ?? "").toUpperCase()}`)
             ?? analyticsMap.get(truncSlug);
      }
      if (!stats && !isDraftee) {
        stats = NHL_SKATER_STATS.get(posSlug) ?? NHL_SKATER_STATS.get(slug);
      }

      // Contract lookup — try compound keys first to handle same-name players
      // e.g. two Elias Petterssons on VAN: one C ($11.6M), one D ($0.84M ELC)
      // normalName strips accents so "Slafkovský" matches "Slafkovsky" in CapWages data
      const normalName = p.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const posKey  = `${p.name}__${p.position}`;
      const teamKey = `${p.name}__${teamId.toLowerCase()}`;
      const normPosKey  = `${normalName}__${p.position}`;
      const normTeamKey = `${normalName}__${teamId.toLowerCase()}`;
      const fin = CONTRACTS[posKey]     ?? CONTRACTS[teamKey]
               ?? CONTRACTS[normPosKey] ?? CONTRACTS[normTeamKey]
               ?? CONTRACTS[p.name]     ?? CONTRACTS[normalName]
               ?? null;

      // If no contract found and player is young (≤23), assume ELC rates
      // rather than inheriting a same-name veteran's contract
      const isLikelyELC = !fin && p.age <= 23;
      const elcCapHit   = p.age <= 22 ? 0.8775 : 0.925;

      // Normalise a contract position string (may be "LW", "RW", "LW, RW", "RW, LW")
      // to match our system's "W" / "C" / "D" / "G" — used in nameCollision check.
      const normContractPos = (pos: string | undefined): string => {
        if (!pos) return "";
        const u = pos.toUpperCase();
        if (u.includes("G")) return "G";
        if (u.includes("D")) return "D";
        if (u.includes("C")) return "C";
        if (u.includes("W") || u.includes("L") || u.includes("R")) return "W";
        return u.charAt(0);
      };

      // ── THE OVERRIDE LAYER (Highest Priority) ───────────────
      const override         = EXTENSIONS[p.name]    ?? EXTENSIONS[normalName];
      const contractOverride = CONTRACT_OVERRIDES[p.name] ?? CONTRACT_OVERRIDES[normalName];
      // Position override must be resolved before isGoalie/defaultTOI/defaultPts
      const finalPosition    = contractOverride?.position ?? p.position;

      const isGoalie   = finalPosition === "G";
      const defaultTOI = isGoalie ? 0 : finalPosition === "D" ? 18.5 : 13.5;
      const defaultPts = isGoalie ? 0 : finalPosition === "D" ? 22 : finalPosition === "C" ? 32 : 28;

      // Merge goalie-specific stats — try full name slug, then last name only
      const goalieSlug      = slugify(p.name);
      const goalieSlugLast  = slugify(p.name.split(" ").pop() ?? "");
      const goalieStats     = isGoalie
        ? (goalieMap.get(goalieSlug) ?? goalieMap.get(goalieSlugLast) ?? null)
        : null;

      const hasProspectSignal = draftOverall != null || (prospectPtsPace != null && prospectPtsPace > 0);
      if (p.injectedFromDb && !stats && !goalieStats && !hasProspectSignal && p.age >= 24) {
        return;
      }

      // Contract sanity check
      const rawCapHit     = isLikelyELC ? elcCapHit : (fin?.capHit ?? 0.925);
      // nameCollision: young player with a high cap hit whose contract position
      // doesn't match their NHL position — likely inherited a veteran's contract.
      // Use normContractPos so "RW, LW" → "W" matches "W" (fixes Slafkovsky and all wingers).
      const nameCollision = p.age <= 23
        && rawCapHit > 3.0
        && normContractPos(fin?.position) !== p.position;

      const finalCapHit   = contractOverride?.capHit ?? override?.capHit ?? (nameCollision ? elcCapHit : rawCapHit);
      const finalYears    = override?.yearsRemaining ?? (nameCollision ? 1 : (isLikelyELC ? 1 : (fin?.yearsRemaining ?? 1)));
      const finalNMC      = override?.hasNMC ?? (nameCollision ? false : (fin?.hasNMC ?? false));
      const finalNTC      = override?.hasNTC ?? (nameCollision ? false : (fin?.hasNTC ?? false));
      const finalRetain   = override?.canRetain ?? (nameCollision ? true  : (fin?.canRetain ?? true));
      const hasExtension     = override?.hasExtension ?? (fin?.extensionCapHit != null);
      const extensionCapHit  = override?.extensionCapHit ?? fin?.extensionCapHit ?? undefined;
      const extensionYears   = override?.extensionYears  ?? fin?.extensionYears  ?? undefined;
      const intangibleMult = override?.intangibleMultiplier ?? (fin?.intangibleMultiplier ?? 1.0);

      // ── UPSTREAM GOALIE METRICS ─────────────────────────────
      // teamXga60: true xGA/60 over goalie icetime. League average ~2.92 (all
      // situations). Higher = worse defense = goalie in hostile environment.
      const teamXgaRaw = teamXgaMap.get(teamId);
      const teamXga60 = teamXgaRaw && teamXgaRaw.ice > 36000
        ? Math.round((teamXgaRaw.xGoals / (teamXgaRaw.ice / 3600)) * 100) / 100
        : LEAGUE.avgXga60;

      // baselineGsax: current year GSAx — future enhancement will add weighted 3yr avg
      const currentYearGsax = goalieStats?.gsax ?? 0;

      const baselineKey = p.name.toLowerCase().replace(/[^a-z]/g, '');
      const baselines = BASELINES[baselineKey] || {};
      const qocIndex = calcQocIndex(finalPosition, stats?.iceRankAvg, stats?.dzPct);
      const hasSkaterStats = Boolean(stats);
      const games = draftOverall != null
        ? (stats?.games ?? 0)
        : (stats?.games ?? goalieStats?.gamesStarted ?? 0);
      const ptsPace = stats?.ptsPace ?? (hasSkaterStats ? defaultPts : 0);
      const avgTOI = stats?.avgTOI ?? (hasSkaterStats ? defaultTOI : 0);
      const timelineMatches = developmentTimelineMap.get(String(p.id)) ?? [];
      const developmentInput = timelineMatches.length > 0
        ? buildDevelopmentInputFromNhlTimeline(timelineMatches, {
            age: p.age,
            draftYear: draftYear ?? undefined,
            draftOverall: draftOverall ?? undefined,
          })
        : buildDevelopmentInputFromPlayerPayload({
            id: p.id,
            name: p.name,
            position: finalPosition,
            age: p.age,
            games,
            ptsPace,
            avgTOI,
            draftYear: draftYear ?? null,
            draftOverall: draftOverall ?? null,
            prospectPtsPace: prospectPtsPace ?? null,
          });
      const developmentProfile = developmentInput ? calcDevelopmentProfile(developmentInput) : null;

      players.push({
        id:             p.id,
        teamId,
        name:           p.name,
        position:       finalPosition,
        age:            p.age,
        headshot:       p.headshot ?? null,
        // Draftees default to 0 games so the pedigree NAV path (games < 14) triggers
        games,
        ptsPace,
        xGPace:         stats?.xGPace   ?? 0,
        defRate:        stats?.defRate  ?? 0.08,
        avgTOI,
        qocIndex,
        rosterTier:     resolveRosterTier({
          id: p.id,
          name: p.name,
          position: finalPosition as "C" | "W" | "D" | "G" | "Pick",
          age: p.age,
          capHit: CONTRACT_OVERRIDES[p.name]?.capHit ?? finalCapHit,
          yearsRemaining: CONTRACT_OVERRIDES[p.name]?.yearsRemaining ?? finalYears,
          ptsPace,
          avgTOI,
          qocIndex,
          dzPct: stats?.dzPct ?? null,
          pkTimeShare: baselines.pkTimeShare,
          baselinePtsPace: baselines.baselinePtsPace,
        }),
        hasLiveStats:   stats?.hasLiveStats ?? goalieStats?.hasLiveStats ?? false,
        // Goalie-specific
        gsax:           goalieStats?.gsax         ?? 0,
        savePct:        goalieStats?.savePct       ?? 0.900,
        gamesStarted:   goalieStats?.gamesStarted  ?? 0,
        shotsPerGame:   goalieStats?.shotsPerGame  ?? 0,
        teamXga60:      teamXga60,
        teamHdca60:     TEAM_BASELINES[teamId]?.hdca60 ?? null,
        baselineGsax:   baselines.baselineGsax ?? currentYearGsax,
        baselinePtsPace: baselines.baselinePtsPace,
        baselineGameScore: baselines.baselineGameScore,
        baselineDpsProxy: baselines.baselineDpsProxy,
        baselineXgRel:     baselines.baselineXgRel,
        ppPtsPace82:       baselines.ppPtsPace82,
        pkTimeShare:       baselines.pkTimeShare,
        baselineIxg82:     baselines.baselineIxg82,
        baselineHits82:    baselines.baselineHits82,
        baselineBlocks82:  baselines.baselineBlocks82,
        pairXgfPct:        baselines.pairXgfPct,
        pairDriverScore:   baselines.pairDriverScore,
        baselineHdsvPct:   baselines.baselineHdsvPct,
        // Contract
        capHit:         CONTRACT_OVERRIDES[p.name]?.capHit         ?? finalCapHit,
        yearsRemaining: CONTRACT_OVERRIDES[p.name]?.yearsRemaining ?? finalYears,
        hasExtension:   hasExtension,
        extensionCapHit: extensionCapHit,
        extensionYears:  extensionYears,
        hasNMC:         finalNMC,
        hasNTC:         finalNTC,
        canRetain:      finalRetain,
        draftYear:        draftYear       ?? null,
        draftOverall:     draftOverall    ?? null,
        prospectPtsPace:  prospectPtsPace ?? null,
        developmentProfile,
        tradeBlockStatus: blockMap.get(p.name)?.status ?? null,
        tradeBlockNote:   blockMap.get(p.name)?.note   ?? null,
        retainedPct:    0,
        multiplier:     intangibleMult,
        // Point Shares — three lookup methods to handle API name variations
        // (roster API may use "Nick" while stats API uses "Nicholas", or Unicode differences)
        ops:  PS_MAP.get(p.name)?.ops ?? PS_MAP.get(`id:${p.id}`)?.ops ?? PS_MAP.get(slugify(p.name))?.ops ?? null,
        dps:  PS_MAP.get(p.name)?.dps ?? PS_MAP.get(`id:${p.id}`)?.dps ?? PS_MAP.get(slugify(p.name))?.dps ?? null,
        // NOIV components
        xgRelTM:        stats?.xgRelTM   ?? null,
        xgaRelTM:       stats?.xgaRelTM  ?? null,
        dzPct:          stats?.dzPct     ?? null,
        goalsPace:      stats?.goalsPace,
        assistsPace:    stats?.assistsPace,
      });
    });
  });

  // ── 4. Draft picks ──────────────────────────────────────────
  const picks: any[] = [];
  const currentDraftYear = SEASON.draftYear;
  LIVE_TEAMS.forEach((team) => {
    [currentDraftYear, currentDraftYear + 1, currentDraftYear + 2].flatMap(year =>
      [1, 2, 3, 4, 5].map(round => ({ round, year }))
    ).forEach(({ round, year }) => {
      const roundLabel = round === 1 ? "1st" : round === 2 ? "2nd" : round === 3 ? "3rd" : `${round}th`;
      picks.push({
        id:           `pick-${team.id}-${year}-${round}`,
        teamId:       team.id,
        name:         `${year} ${roundLabel} Round Pick (${team.id})`,
        position:     "Pick",
        age:          19,
        round,
        year,
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
    players: [...players, ...picks],
    capCeiling: CAP_CEILING,
    capFloor:   CAP_FLOOR,
    generatedAt: new Date().toISOString(),
    source: "NHL API + CapWages + Bundled Contracts",
    liveStats:  analyticsMap.size > 0,
    debug: {
      playerCount:    players.length,
      analyticsCount: analyticsMap.size,
    },
  });
}
