import { NextResponse } from "next/server";
import { SEASON } from "@/app/lib/season-config";
import { TEAMS_DB } from "@/app/lib/db";
import { scrapeCapWages } from "@/app/services/scraper";
import { redis } from "@/app/lib/redis";
import { db } from "@/app/db/client";
import { players as playersTable, tradeBlock as tradeBlockTable } from "@/app/db/schema";
import { isNotNull } from "drizzle-orm";

export const dynamic = "force-dynamic";

const CONTRACTS_CACHE_TTL = 23 * 60 * 60; // 23 hours
const MONEYPUCK_CACHE_TTL =  4 * 60 * 60; // 4 hours
const PS_CACHE_TTL        = 12 * 60 * 60; // 12 hours

// Manual overrides for contracts where the CapWages scraper's age-based year calculation
// is unreliable (e.g. back-loaded extensions where ageSigned ≠ effective start year).
const CONTRACT_OVERRIDES: Record<string, { capHit?: number; yearsRemaining?: number; position?: string }> = {
  "Quinton Byfield":  { position: "C" },          // NHL API sometimes tags as "LW"
  "Mark Scheifele":   { yearsRemaining: 5 },       // 8yr/2023→2031; scraper age math gives 1
};

const NHL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin": "https://www.nhl.com",
  "Referer": "https://www.nhl.com/",
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

const buildFallbackMap = (map: Map<string, any>) => {
  const fb = new Map<string, any>();
  map.forEach((val, slug) => {
    const last = slug.split("-").slice(-1)[0];
    fb.set(last, fb.has(last) ? null : val);
  });
  return fb;
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


async function loadFromDB(): Promise<Record<string, any>> {
  try {
    // Explicit column list — a full select() breaks with "no such column" whenever
    // schema.ts declares a column the live Turso table doesn't have yet.
    const rows = await db.select({
      name:            playersTable.name,
      capHit:          playersTable.capHit,
      yearsRemaining:  playersTable.yearsRemaining,
      hasNmc:          playersTable.hasNmc,
      hasNtc:          playersTable.hasNtc,
      extensionCapHit: playersTable.extensionCapHit,
      extensionYears:  playersTable.extensionYears,
    }).from(playersTable);
    const result: Record<string, any> = {};
    for (const row of rows) {
      result[row.name] = {
        capHit:          row.capHit,
        yearsRemaining:  row.yearsRemaining,
        hasNMC:          row.hasNmc  ?? false,
        hasNTC:          row.hasNtc  ?? false,
        canRetain:       row.hasNmc  ? false : true,
        extensionCapHit: row.extensionCapHit ?? null,
        extensionYears:  row.extensionYears  ?? null,
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
  } catch (_) { return {}; }
}

function loadBaselines(): Record<string, any> {
  try {
    const fs   = require("fs");
    const path = require("path");
    const file = path.join(process.cwd(), "app/data/moneypuck_baselines.json");
    return JSON.parse(fs.readFileSync(file, "utf-8"));
  } catch (_) { return {}; }
}

async function loadContracts(): Promise<Record<string, any>> {
  if (redis) {
    const cached = await redis.get<Record<string, any>>("cache:contracts");
    if (cached && Object.keys(cached).length > 200) return cached;
  }

  const dbData  = await loadFromDB();
  const fresh   = await scrapeCapWages();
  const merged: Record<string, any> = {};

  if (Object.keys(fresh).length > 200) {
    for (const [name, cw] of Object.entries(fresh)) {
      const baseName = name.includes("__") ? name.split("__")[0] : name;
      const b = dbData[baseName];
      merged[name] = {
        capHit:          cw.capHit,
        yearsRemaining:  (cw.yearsRemaining > 0 ? cw.yearsRemaining : null) ?? b?.yearsRemaining ?? 1,
        hasNMC:          b?.hasNMC  ?? false,
        hasNTC:          b?.hasNTC  ?? false,
        canRetain:       b?.hasNMC  ? false : true,
        expiryStatus:    cw.expiryStatus,
        position:        cw.position,
        extensionCapHit: b?.extensionCapHit ?? null,
        extensionYears:  b?.extensionYears  ?? null,
      };
    }
    // Backfill: DB players the scraper rejected or skipped (cap out-of-range, index drift, etc.)
    for (const [name, b] of Object.entries(dbData)) {
      if (!merged[name]) {
        merged[name] = {
          capHit:          b.capHit,
          yearsRemaining:  b.yearsRemaining ?? 1,
          hasNMC:          b.hasNMC  ?? false,
          hasNTC:          b.hasNTC  ?? false,
          canRetain:       b.hasNMC  ? false : true,
          expiryStatus:    "UFA",
          extensionCapHit: b.extensionCapHit ?? null,
          extensionYears:  b.extensionYears  ?? null,
        };
      }
    }
  } else {
    for (const [name, b] of Object.entries(dbData)) {
      merged[name] = {
        capHit:          b.capHit,
        yearsRemaining:  b.yearsRemaining ?? 1,
        hasNMC:          b.hasNMC  ?? false,
        hasNTC:          b.hasNTC  ?? false,
        canRetain:       b.hasNMC  ? false : true,
        expiryStatus:    "UFA",
        extensionCapHit: b.extensionCapHit ?? null,
        extensionYears:  b.extensionYears  ?? null,
      };
    }
  }

  for (const [name, override] of Object.entries(CONTRACT_OVERRIDES)) {
    if (merged[name]) {
      if (override.capHit         !== undefined) merged[name].capHit         = override.capHit;
      if (override.yearsRemaining !== undefined) merged[name].yearsRemaining = override.yearsRemaining;
    }
  }

  if (redis && Object.keys(merged).length > 200) {
    await redis.setex("cache:contracts", CONTRACTS_CACHE_TTL, merged);
  }

  return merged;
}

interface NHLSkaterRow {
  playerId:         number;
  skaterFullName:   string;
  teamAbbrevs:      string;
  positionCode:     string;
  gamesPlayed:      number;
  goals:            number;
  assists:          number;
  plusMinus:        number;
  timeOnIcePerGame: number;
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
    if (cached) return new Map(Object.entries(cached));
  }

  const psMap = new Map<string, { ops: number; dps: number }>();

  try {
    const [skatersRes, teamsRes] = await Promise.allSettled([
      fetchWithTimeout(
        "https://api.nhle.com/stats/rest/en/skater/summary?cayenneExp=seasonId%3D20252026%20and%20gameTypeId%3D2&limit=-1",
        10000
      ),
      fetchWithTimeout(
        "https://api.nhle.com/stats/rest/en/team/summary?cayenneExp=seasonId%3D20252026%20and%20gameTypeId%3D2&limit=32",
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

    const leagueGoals  = teams.reduce((s, t) => s + t.goalsFor, 0);
    const leaguePoints = teams.reduce((s, t) => s + t.points, 0);
    const totalTeamGames = teams.reduce((s, t) => s + t.gamesPlayed, 0);
    const leagueGPG      = leagueGoals / totalTeamGames;
    const marginalGoalsPerPoint = leagueGoals / leaguePoints;

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

    const normalise = (s: string) => s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
    const teamByName = new Map<string, NHLTeamRow>();
    for (const t of teams) teamByName.set(normalise(t.teamFullName), t);
    const teamByAbbrev = new Map<string, NHLTeamRow>();
    for (const [abbrev, fullName] of Object.entries(TEAM_ABBREV_MAP)) {
      const t = teamByName.get(normalise(fullName));
      if (t) teamByAbbrev.set(abbrev, t);
    }

    const toMin = (sec: number) => sec / 60;
    const MIN_TOI_PER_GAME = 5 * 60;

    const teamAggregates = new Map<string, {
      fwdTOI: number; defTOI: number; totalSktTOI: number;
      fwdPM: number;  defPM: number;
      fwdGP: number;  defGP: number;
    }>();

    for (const s of skaters) {
      if (s.timeOnIcePerGame < MIN_TOI_PER_GAME) continue;
      const abbrev   = s.teamAbbrevs.split(",")[0].trim();
      const totalTOI = toMin(s.timeOnIcePerGame) * s.gamesPlayed;
      const isD      = s.positionCode === "D";
      const agg      = teamAggregates.get(abbrev) ?? {
        fwdTOI: 0, defTOI: 0, totalSktTOI: 0,
        fwdPM: 0,  defPM: 0,
        fwdGP: 0,  defGP: 0,
      };
      if (isD) { agg.defTOI += totalTOI; agg.defPM += s.plusMinus; agg.defGP += s.gamesPlayed; }
      else     { agg.fwdTOI += totalTOI; agg.fwdPM += s.plusMinus; agg.fwdGP += s.gamesPlayed; }
      agg.totalSktTOI += totalTOI;
      teamAggregates.set(abbrev, agg);
    }

    let fwdTOItotal = 0;
    let defTOItotal = 0;
    for (const s of skaters) {
      const totTOI = toMin(s.timeOnIcePerGame) * s.gamesPlayed;
      if (s.positionCode === "D") defTOItotal += totTOI;
      else                        fwdTOItotal += totTOI;
    }

    const fwdGCtotal   = leagueGoals * 0.75 * 1.85 * 0.5;
    const defGCtotal   = leagueGoals * 0.25 * 1.85 * 0.5;
    const fwdGCperTOI  = fwdTOItotal > 0 ? fwdGCtotal / fwdTOItotal : 0;
    const defGCperTOI  = defTOItotal > 0 ? defGCtotal / defTOItotal : 0;

    for (const s of skaters) {
      const abbrev = s.teamAbbrevs.split(",")[0].trim();
      const team   = teamByAbbrev.get(abbrev);
      const agg    = teamAggregates.get(abbrev);
      if (!team || !agg) continue;

      const isD    = s.positionCode === "D";
      const posAdj = isD ? 10/7 : 5/7;
      const totTOI = toMin(s.timeOnIcePerGame) * s.gamesPlayed;

      const teamFactor = team.goalsFor / (team.goalsFor + team.goalsAgainst);
      const gc = (s.goals + 0.5 * s.assists) * teamFactor;

      const gcPerTOI   = isD ? defGCperTOI : fwdGCperTOI;
      const marginalGF = gc - (7/12) * totTOI * gcPerTOI;
      const ops        = Math.max(-3, marginalGF / marginalGoalsPerPoint);

      const teamMGA        = (1 + 7/12) * team.gamesPlayed * leagueGPG - team.goalsAgainst;
      const teamSktTOI     = agg.totalSktTOI;
      const toiProportion  = teamSktTOI > 0 ? totTOI / teamSktTOI : 0;
      const posTOI         = isD ? agg.defTOI : agg.fwdTOI;
      const posPM          = isD ? agg.defPM  : agg.fwdPM;
      const pmAdj          = (1/7) * posAdj * (s.plusMinus - totTOI * (posTOI > 0 ? posPM / posTOI : 0));
      const marginalGA     = toiProportion * (5/7) * posAdj * teamMGA + pmAdj;
      const dps            = Math.max(-3, marginalGA / marginalGoalsPerPoint);

      const name = s.skaterFullName.trim();
      const ps   = { ops: Math.round(ops * 10) / 10, dps: Math.round(dps * 10) / 10 };
      psMap.set(name,               ps);
      psMap.set(`id:${s.playerId}`, ps);
      psMap.set(slugify(name),      ps);
    }

    console.log(`[PS] Computed Point Shares for ${psMap.size / 3} players`);
    if (redis) {
      await redis.setex("cache:pointshares", PS_CACHE_TTL, Object.fromEntries(psMap));
    }
  } catch (e: any) {
    console.warn("[PS] fetchPointShares failed:", e.message);
  }

  return psMap;
}

export async function GET() {
  const [CONTRACTS, PS_MAP] = await Promise.all([
    loadContracts(),
    fetchPointShares(),
  ]);
  const EXTENSIONS = loadExtensions();
  const BASELINES  = loadBaselines();

  // ── MoneyPuck analytics ─────────────────────────────────────
  const analyticsMap = new Map<string, any>();
  const goalieMap    = new Map<string, any>();
  const teamXgaMap   = new Map<string, { xGoals: number; games: number }>();
  let fbMap = new Map<string, any>();

  let skaterCsv: string | null = null;
  let goalieCsv: string | null = null;

  if (redis) {
    skaterCsv = await redis.get<string>("cache:mp_skaters");
    goalieCsv = await redis.get<string>("cache:mp_goalies");
  }

  const skaterCsvFresh = !!skaterCsv;
  const goalieCsvFresh = !!goalieCsv;

  try {
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

    if (mpRes.status === "fulfilled" && mpRes.value.ok) {
      const csv  = await mpRes.value.text();
      if (!skaterCsvFresh && redis) await redis.setex("cache:mp_skaters", MONEYPUCK_CACHE_TTL, csv);
      const rows = csv.split("\n").filter(Boolean);
      const hdr  = parseCSVRow(rows[0]);
      const h    = (k: string) => hdr.indexOf(k);
      const [nI, sI, pI, xgI, gI, iceI, onAI, offAI, rkI, onFI, offFI, dzI, ozI, goalsI, posI] = [
        h("name"), h("situation"), h("I_F_points"), h("I_F_xGoals"),
        h("games_played"), h("icetime"),
        h("OnIce_A_xGoals"), h("OffIce_A_xGoals"),
        h("iceTimeRank"),
        h("OnIce_F_xGoals"), h("OffIce_F_xGoals"),
        h("I_F_dZoneShiftStarts"), h("I_F_oZoneShiftStarts"),
        h("I_F_goals"),
        h("position"),
      ];
      const zoneMap = new Map<string, number>();

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

        const onF      = parseFloat(c[onFI])  || 0;
        const offFVal  = parseFloat(c[offFI]) || 0;
        const onAVal   = parseFloat(c[onAI])  || 0;
        const offAVal  = parseFloat(c[offAI]) || 0;
        const onXgPct  = onF + onAVal > 0 ? onF / (onF + onAVal) : 0.5;
        const offXgPct = offFVal + offAVal > 0 ? offFVal / (offFVal + offAVal) : 0.5;
        const xgRelTM  = (onXgPct - offXgPct) * 100;
        const xgaRelTM = onA - offA;

        const pos = posI >= 0 ? (c[posI]?.trim().toUpperCase() ?? "") : "";
        const posForZone = pos ? `${slugify(name)}__${pos}` : slugify(name);
        const dzPct = zoneMap.get(posForZone) ?? zoneMap.get(slugify(name)) ?? null;

        const mapKey     = pos ? `${slugify(name)}__${pos}` : slugify(name);
        const rawPtsPace = (parseFloat(c[pI]) / g) * 82;
        const posDefault = pos.startsWith("D") ? 26 : pos === "C" ? 52 : 44;
        const sampleWeight = Math.min(1.0, g / 25);
        const ptsPace    = rawPtsPace * sampleWeight + posDefault * (1 - sampleWeight);
        const rawXgPace  = (parseFloat(c[xgI]) / g) * 82;
        const xGPace     = rawXgPace * sampleWeight + (pos.startsWith("D") ? 6 : 10) * (1 - sampleWeight);

        const entry = {
          ptsPace, xGPace,
          defRate:  offA - onA,
          avgTOI:   iceSec / g / 60,
          xgRelTM:  xgRelTM  * Math.min(1.0, g / 30),
          xgaRelTM: xgaRelTM * Math.min(1.0, g / 30),
          qocRank:  Math.round(
            (parseFloat(c[rkI]) || 500) * Math.min(1.0, g / 20) +
            400 * (1 - Math.min(1.0, g / 20))
          ),
          games: g, hasLiveStats: true, dzPct,
          goalsPace:   goalsI >= 0 ? (parseFloat(c[goalsI])   / g) * 82 : undefined,
          assistsPace: goalsI >= 0 ? ((parseFloat(c[pI]) - parseFloat(c[goalsI])) / g) * 82 : undefined,
        };
        analyticsMap.set(mapKey, entry);
        if (pos) analyticsMap.set(slugify(name), entry);
      });
      fbMap = buildFallbackMap(analyticsMap);
    }

    if (gpRes.status === "fulfilled" && gpRes.value.ok) {
      const csv  = await gpRes.value.text();
      if (!goalieCsvFresh && redis) await redis.setex("cache:mp_goalies", MONEYPUCK_CACHE_TTL, csv);
      const rows = csv.split("\n").filter(Boolean);
      const hdr  = parseCSVRow(rows[0]);
      const h    = (k: string) => hdr.indexOf(k);
      const [nI, sI, gI, xgI, goalsI, ongoalI, teamI] = [
        h("name"), h("situation"), h("games_played"),
        h("xGoals"), h("goals"), h("ongoal"), h("team"),
      ];
      if (nI >= 0 && xgI >= 0) {
        const goalieRows = new Map<string, any>();
        rows.slice(1).forEach((row) => {
          const c   = parseCSVRow(row);
          if (c.length <= nI) return;
          if ((c[sI] ?? "").trim().toLowerCase() !== "all") return;
          const name   = c[nI].trim();
          const g      = Math.max(1, parseFloat(c[gI]) || 1);
          const xGoals = parseFloat(c[xgI])    || 0;
          const goals  = parseFloat(c[goalsI]) || 0;
          const ongoal = parseFloat(c[ongoalI])|| 0;
          const gsax   = xGoals - goals;
          const savePct = ongoal > 0 ? (ongoal - goals) / ongoal : 0.900;

          const teamAbbr = (c[teamI] ?? "").trim().toUpperCase();
          if (teamAbbr) {
            const prev = teamXgaMap.get(teamAbbr) ?? { xGoals: 0, games: 0 };
            teamXgaMap.set(teamAbbr, {
              xGoals: prev.xGoals + xGoals,
              games:  Math.max(prev.games, g),
            });
          }

          goalieRows.set(name, {
            gsax,
            savePct:      Math.round(savePct * 10000) / 10000,
            shotsPerGame: ongoal / g,
            gamesStarted: g,
            xGoalsAllowed: xGoals,
            hasLiveStats: true,
          });
        });

        goalieRows.forEach((stats, name) => {
          goalieMap.set(slugify(name), stats);
          const parts = name.split(" ");
          if (parts.length >= 2) goalieMap.set(slugify(parts[parts.length - 1]), stats);
        });
      }
    }
  } catch (_) {}

  // ── Seed rosters from DB (fallback if NHL API is down) ──────
  // Live NHL API rosters replace these per-team below; the DB seed only
  // survives for teams whose roster fetch fails. Replaces the old hand-
  // maintained STATIC_ROSTER, which went stale every season.
  const rosterMap = new Map<string, any[]>();
  try {
    const rows = await db.select({
      id:       playersTable.id,
      name:     playersTable.name,
      position: playersTable.position,
      teamId:   playersTable.teamId,
      age:      playersTable.age,
    }).from(playersTable).where(isNotNull(playersTable.teamId));
    for (const r of rows) {
      const list = rosterMap.get(r.teamId!) ?? [];
      list.push({
        id:       r.id,
        name:     r.name,
        position: normalisePos(!r.position || r.position === "Unknown" ? "W" : r.position),
        age:      r.age ?? 27,
        headshot: null,
      });
      rosterMap.set(r.teamId!, list);
    }
  } catch (e: any) {
    console.warn("[Roster seed] DB read failed:", e.message);
  }

  try {
    const results = await Promise.allSettled(
      TEAMS_DB.map((t) =>
        fetchWithTimeout(`https://api-web.nhle.com/v1/roster/${t.id}/current`, 5000, NHL_HEADERS)
          .then((r) => (r.ok ? r.json() : null))
          .catch(() =>
            fetchWithTimeout(`https://api-web.nhle.com/v1/roster/${t.id}/${SEASON.nhleSeasonId}`, 5000, NHL_HEADERS)
              .then((r) => (r.ok ? r.json() : null))
              .catch(() => null)
          )
      )
    );

    results.forEach((result, idx) => {
      const teamId = TEAMS_DB[idx].id;
      const data   = result.status === "fulfilled" ? result.value : null;
      if (!data) return;

      const skaters = [...(data.forwards || []), ...(data.defensemen || []), ...(data.goalies || [])];
      if (skaters.length < 5) return;

      rosterMap.set(teamId, skaters.map((p: any) => ({
        id:       p.id.toString(),
        name:     `${p.firstName.default} ${p.lastName.default}`,
        position: normalisePos(p.positionCode),
        age:      calcAge(p.birthDate),
        headshot: p.headshot ?? null,
      })));
    });
  } catch (_) {}

  // ── Inject drafted prospects from DB ─────────────────────────
  // Mock-draft imports live only in the DB; NHL API rosters don't know them.
  try {
    const draftees = await db.select({
      id:              playersTable.id,
      name:            playersTable.name,
      position:        playersTable.position,
      teamId:          playersTable.teamId,
      age:             playersTable.age,
      draftOverall:    playersTable.draftOverall,
      prospectPtsPace: playersTable.prospectPtsPace,
    }).from(playersTable).where(isNotNull(playersTable.draftOverall));

    for (const d of draftees) {
      if (!d.teamId) continue;
      const list = rosterMap.get(d.teamId) ?? [];
      if (!list.some((x: any) => x.name === d.name)) {
        list.push({
          id:              d.id,
          name:            d.name,
          position:        normalisePos(d.position),
          age:             d.age ?? 18,
          headshot:        null,
          draftOverall:    d.draftOverall,
          prospectPtsPace: d.prospectPtsPace,
        });
      }
      rosterMap.set(d.teamId, list);
    }
  } catch (e: any) {
    console.warn("[Draftees] injection skipped:", e.message);
  }

  // ── Trade block statuses (admin-managed, keyed by name) ──────
  let blockMap = new Map<string, { status: string; note: string | null }>();
  try {
    const blockRows = await db.select().from(tradeBlockTable);
    blockMap = new Map(blockRows.map(r => [r.name, { status: r.status, note: r.note ?? null }]));
  } catch (e: any) {
    console.warn("[TradeBlock] read skipped:", e.message);
  }

  // ── Build player objects ────────────────────────────────────
  const players: any[] = [];

  rosterMap.forEach((skaters, teamId) => {
    if (!TEAMS_DB.find(t => t.id === teamId)) return;

    skaters.forEach((p: any) => {
      const slug    = slugify(p.name);
      const posSlug = `${slug}__${(p.position ?? "").toUpperCase()}`;
      let stats = analyticsMap.get(posSlug) ?? analyticsMap.get(slug);
      if (!stats) {
        const last = slug.split("-").slice(-1)[0];
        const fb   = fbMap.get(last);
        if (fb !== null && fb !== undefined) stats = fb;
      }
      if (!stats && slug.length > 4) {
        const truncSlug = slug.slice(0, -1);
        stats = analyticsMap.get(`${truncSlug}__${(p.position ?? "").toUpperCase()}`)
             ?? analyticsMap.get(truncSlug);
      }

      const normalName  = p.name.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
      const posKey      = `${p.name}__${p.position}`;
      const teamKey     = `${p.name}__${teamId.toLowerCase()}`;
      const normPosKey  = `${normalName}__${p.position}`;
      const normTeamKey = `${normalName}__${teamId.toLowerCase()}`;
      const fin = CONTRACTS[posKey]     ?? CONTRACTS[teamKey]
               ?? CONTRACTS[normPosKey] ?? CONTRACTS[normTeamKey]
               ?? CONTRACTS[p.name]     ?? CONTRACTS[normalName]
               ?? null;

      const isLikelyELC = !fin && p.age <= 23;
      const elcCapHit   = p.age <= 22 ? 0.8775 : 0.925;

      const normContractPos = (pos: string | undefined): string => {
        if (!pos) return "";
        const u = pos.toUpperCase();
        if (u.includes("G")) return "G";
        if (u.includes("D")) return "D";
        if (u.includes("C")) return "C";
        if (u.includes("W") || u.includes("L") || u.includes("R")) return "W";
        return u.charAt(0);
      };

      const override         = EXTENSIONS[p.name]    ?? EXTENSIONS[normalName];
      const contractOverride = CONTRACT_OVERRIDES[p.name] ?? CONTRACT_OVERRIDES[normalName];
      const finalPosition    = contractOverride?.position ?? p.position;

      const isGoalie   = finalPosition === "G";
      const defaultTOI = isGoalie ? 0 : finalPosition === "D" ? 18.5 : 13.5;
      const defaultPts = isGoalie ? 0 : finalPosition === "D" ? 22 : finalPosition === "C" ? 32 : 28;

      const goalieStats = isGoalie
        ? (goalieMap.get(slugify(p.name)) ?? goalieMap.get(slugify(p.name.split(" ").pop() ?? "")) ?? null)
        : null;

      const rawCapHit     = isLikelyELC ? elcCapHit : (fin?.capHit ?? 0.925);
      const nameCollision = p.age <= 23
        && rawCapHit > 3.0
        && normContractPos(fin?.position) !== p.position;

      const finalCapHit  = contractOverride?.capHit ?? override?.capHit ?? (nameCollision ? elcCapHit : rawCapHit);
      const finalYears   = override?.yearsRemaining ?? (nameCollision ? 1 : (isLikelyELC ? 1 : (fin?.yearsRemaining ?? 1)));
      const finalNMC     = override?.hasNMC  ?? (nameCollision ? false : (fin?.hasNMC  ?? false));
      const finalNTC     = override?.hasNTC  ?? (nameCollision ? false : (fin?.hasNTC  ?? false));
      const finalRetain  = override?.canRetain ?? (nameCollision ? true : (fin?.canRetain ?? true));
      const extensionCapHit = override?.extensionCapHit ?? fin?.extensionCapHit ?? undefined;
      const extensionYears  = override?.extensionYears  ?? fin?.extensionYears  ?? undefined;
      const hasExtension    = override?.hasExtension    ?? (extensionCapHit != null && extensionYears != null);
      const intangibleMult  = override?.intangibleMultiplier ?? (fin?.intangibleMultiplier ?? 1.0);

      const LEAGUE_AVG_XGA60 = 2.55;
      const teamXgaRaw = teamXgaMap.get(teamId);
      const teamXga60  = teamXgaRaw && teamXgaRaw.games > 10
        ? Math.round((teamXgaRaw.xGoals / teamXgaRaw.games / (30 / 60)) * 100) / 100
        : LEAGUE_AVG_XGA60;

      const currentYearGsax = goalieStats?.gsax ?? 0;
      const baselineKey = p.name.toLowerCase().replace(/[^a-z]/g, "");
      const baselines   = BASELINES[baselineKey] || {};

      players.push({
        id:             p.id,
        teamId,
        name:           p.name,
        position:       finalPosition,
        age:            p.age,
        headshot:       p.headshot ?? null,
        // Draftees default to 0 games so the pedigree NAV path (games < 14) triggers
        games:          p.draftOverall != null ? (stats?.games ?? 0) : (stats?.games ?? goalieStats?.gamesStarted ?? 40),
        ptsPace:        stats?.ptsPace  ?? defaultPts,
        xGPace:         stats?.xGPace   ?? 0,
        defRate:        stats?.defRate  ?? 0.08,
        avgTOI:         stats?.avgTOI   ?? defaultTOI,
        qocRank:        stats?.qocRank  ?? 450,
        hasLiveStats:   stats?.hasLiveStats ?? goalieStats?.hasLiveStats ?? false,
        gsax:           goalieStats?.gsax         ?? 0,
        savePct:        goalieStats?.savePct       ?? 0.900,
        gamesStarted:   goalieStats?.gamesStarted  ?? 0,
        shotsPerGame:   goalieStats?.shotsPerGame  ?? 0,
        teamXga60,
        baselineGsax:      baselines.baselineGsax      ?? currentYearGsax,
        baselinePtsPace:   baselines.baselinePtsPace,
        baselineGameScore: baselines.baselineGameScore,
        baselineDpsProxy:  baselines.baselineDpsProxy,
        capHit:         CONTRACT_OVERRIDES[p.name]?.capHit         ?? finalCapHit,
        yearsRemaining: CONTRACT_OVERRIDES[p.name]?.yearsRemaining ?? finalYears,
        hasExtension, extensionCapHit, extensionYears,
        hasNMC:    finalNMC,
        hasNTC:    finalNTC,
        canRetain: finalRetain,
        draftOverall:    p.draftOverall    ?? null,
        prospectPtsPace: p.prospectPtsPace ?? null,
        tradeBlockStatus: blockMap.get(p.name)?.status ?? null,
        tradeBlockNote:   blockMap.get(p.name)?.note   ?? null,
        retainedPct: 0,
        multiplier:  intangibleMult,
        ops:  PS_MAP.get(p.name)?.ops ?? PS_MAP.get(`id:${p.id}`)?.ops ?? PS_MAP.get(slugify(p.name))?.ops ?? null,
        dps:  PS_MAP.get(p.name)?.dps ?? PS_MAP.get(`id:${p.id}`)?.dps ?? PS_MAP.get(slugify(p.name))?.dps ?? null,
        xgRelTM:     stats?.xgRelTM   ?? null,
        xgaRelTM:    stats?.xgaRelTM  ?? null,
        dzPct:       stats?.dzPct     ?? null,
        goalsPace:   stats?.goalsPace,
        assistsPace: stats?.assistsPace,
      });
    });
  });

  return NextResponse.json({
    players,
    liveStats:  analyticsMap.size > 0,
    generatedAt: new Date().toISOString(),
    debug: {
      playerCount:    players.length,
      analyticsCount: analyticsMap.size,
    },
  });
}
