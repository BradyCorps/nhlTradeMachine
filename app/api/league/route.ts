import { NextResponse } from "next/server";
import { TEAMS_DB } from "@/app/lib/db";
export const dynamic = "force-dynamic";

const CAP_CEILING = 104.0;
const CAP_FLOOR   = 70.6;

// ── In-memory cache — works in both local dev and serverless ──
// Global variables persist across warm lambda invocations on Vercel.
// On cold start or after TTL, data is re-fetched from source APIs.
declare global {
  var __teamsCache:     { data: any[];                ts: number } | null;
  var __contractsCache: { data: Record<string, any>; ts: number } | null;
  var __mpSkaterCache:  { csv: string;                ts: number } | null;
  var __mpGoalieCache:  { csv: string;                ts: number } | null;
}
if (!global.__teamsCache)     global.__teamsCache     = null;
if (!global.__contractsCache) global.__contractsCache = null;
if (!global.__mpSkaterCache)  global.__mpSkaterCache  = null;
if (!global.__mpGoalieCache)  global.__mpGoalieCache  = null;

const TEAMS_CACHE_TTL     = 6  * 60 * 60 * 1000; // 6 hours
const CONTRACTS_CACHE_TTL = 23 * 60 * 60 * 1000; // 23 hours
const MONEYPUCK_CACHE_TTL = 4  * 60 * 60 * 1000; // 4 hours — MP updates ~twice daily

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
const derivePhase = (standing: number, pointPct: number): string => {
  if (standing <= 8  && pointPct >= 0.58) return "Contender";
  // More specific conditions must come before broader ones
  if (standing <= 8  && pointPct >= 0.52) return "Contender";
  if (standing <= 16 && pointPct >= 0.52) return "Bubble";
  if (standing <= 24)                      return "Retooling";
  if (standing <= 32 && pointPct < 0.38)  return "Tanking";
  return "Rebuilding";
};

// ── Phase overrides for teams whose standing misleads about their true window ──
// Some teams have a bad year but retain the core of a contender.
// These are manually curated based on roster quality, not just standings.
const PHASE_OVERRIDES: Record<string, string> = {
  WPG: "Retooling",    // Presidents Trophy 2023-24, Hellebuyck/Connor/Morrissey core intact
  FLA: "Retooling",    // Back-to-back finals, core still together, off year
  EDM: "Bubble",       // McDavid/Draisaitl never truly rebuild
  TOR: "Retooling",    // Core still competitive, structural issues not a rebuild
  ANA: "Bubble", // Made the playoffs with a young core, looking for the next step
  };

// ── Contract overrides — manual corrections for known data errors ──
const CONTRACT_OVERRIDES: Record<string, { capHit?: number; yearsRemaining?: number; position?: string }> = {
  "Alexander Ovechkin": { yearsRemaining: 1 },
  // Bundled JSON corrections — cap hit or years that have changed since bundle was generated
  "Dylan DeMelo":       { capHit: 4.9,  yearsRemaining: 2 },   // PuckPedia: $4.9M x 4yr, Year 2 of 4
  // Young players (age ≤ 23) with real multi-year deals who get misidentified as ELC
  // when CapWages scrape returns null or wrong p[18] for their entry.
  // Position override needed when NHL API returns "L"/"R" instead of true position.
  "Quinton Byfield":    { capHit: 6.25, yearsRemaining: 3, position: "C" }, // $6.25M x 5yr, Year 3 of 5
  "Connor Bedard":      { capHit: 0.8775, yearsRemaining: 1 },  // ELC, correct
  "Matvei Michkov":     { capHit: 0.8775, yearsRemaining: 1 },  // ELC, correct
  // Years formula broken: p[29] is expiry age not signing age → max() picks wrong value
  "Brady Tkachuk":      { yearsRemaining: 3 },  // 7yr deal signed 2022-23, expires 2028-29; p[29]=28 is expiry age not signing age
};

async function loadTeams(): Promise<any[]> {
  // ── Check in-memory cache (works on Vercel — no filesystem needed) ──
  if (global.__teamsCache && Date.now() - global.__teamsCache.ts < TEAMS_CACHE_TTL) {
    if (global.__teamsCache.data.length >= 32) return global.__teamsCache.data;
  }

  // ── Fetch standings from NHL stats API ───────────────────────
  let standingsMap = new Map<string, { standing: number; pointPct: number; teamFullName: string }>();
  try {
    const res = await fetchWithTimeout(
      "https://api.nhle.com/stats/rest/en/team/summary?cayenneExp=seasonId=20252026%20and%20gameTypeId=2",
      8000
    );
    if (res.ok) {
      const data = await res.json();
      const teams: any[] = data.data ?? [];

      // NHL stats API teamId → tricode mapping for reliable lookup
      // Utah Hockey Club (now Utah Mammoth) uses teamId 59
      // Arizona Coyotes relocated to Utah for 2024-25 season
      const NHL_ID_TO_TRICODE: Record<number, string> = {
        1: "NJD", 2: "NYI", 3: "NYR", 4: "PHI", 5: "PIT",
        6: "BOS", 7: "BUF", 8: "MTL", 9: "OTT", 10: "TOR",
        12: "CAR", 13: "FLA", 14: "TBL", 15: "WSH", 16: "CHI",
        17: "DET", 18: "NSH", 19: "STL", 20: "CGY", 21: "COL",
        22: "EDM", 23: "VAN", 24: "ANA", 25: "DAL", 26: "LAK",
        28: "SJS", 29: "CBJ", 30: "MIN", 52: "WPG", 54: "VGK",
        55: "SEA", 68: "UTA",
      };

      // Sort by points then regulation+OT wins (NHL tiebreaker)
      teams.sort((a, b) =>
        b.points !== a.points
          ? b.points - a.points
          : (b.regulationAndOtWins ?? 0) - (a.regulationAndOtWins ?? 0)
      );

      // Assign sequential ranks using teamId lookup
      teams.forEach((t, i) => {
        const tricode = NHL_ID_TO_TRICODE[t.teamId];
        if (tricode) {
          standingsMap.set(tricode, {
            standing:     i + 1,
            pointPct:     t.pointPct ?? 0.5,
            teamFullName: t.teamFullName,
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

  // ── Build team objects ────────────────────────────────────────
  const teams = TEAMS_DB.map((t) => {
    const st      = standingsMap.get(t.id);
    const standing = st?.standing  ?? t.standing;
    const pointPct = st?.pointPct  ?? 0.5;
    const capSpace = capMap.get(t.id) ?? t.capSpace;
    const phase = PHASE_OVERRIDES[t.id]
      ?? (standingsMap.size >= 28 ? derivePhase(standing, pointPct) : t.phase);

    return {
      id:       t.id,
      name:     st?.teamFullName ?? t.name,
      capSpace: Math.round(capSpace * 10) / 10,
      standing,
      phase,
      needs:    TEAM_NEEDS[t.id] ?? [],
    };
  });

  // ── Cache result ──────────────────────────────────────────────
  try {
  // ── Store in-memory cache ─────────────────────────────────────
  global.__teamsCache = { data: teams, ts: Date.now() };
  } catch (_) {}

  return teams;
}

// ── CapWages contract scraper ─────────────────────────────────
// CapWages embeds all player data in a __NEXT_DATA__ JSON blob.
// Array indices (verified against known contracts):
//   [0]  name "Last, First"
//   [2]  teamId
//   [3]  position
//   [8]  age
    // CapWages array key indices (verified 2025-26):
    //   [0]  player name (LastName, FirstName)
    //   [2]  team abbreviation
    //   [3]  position code
    //   [8]  current age
    //   [15] total contract length in years
    //   [18] AAV cap hit (in $100k units — divide by 10 for millions)
    //   [24] expiry status (UFA/RFA)
    //   [28] age at signing (primary) — but swapped with [29] for some players
    //   [29] age at signing (secondary) — take max(p[28], p[29]) for reliability
//   [18] capHit (raw number, divide by 10 to get $M — e.g. 85 = $8.5M)
//   [24] expiryStatus ("UFA" | "RFA" | ...)
//   [29] age at signing

// loadBundled uses dynamic require — no path constant needed

// Convert "Last, First" → "First Last"
const normaliseName = (raw: string): string => {
  const parts = raw.split(",").map((s) => s.trim());
  return parts.length === 2 ? `${parts[1]} ${parts[0]}` : raw;
};

async function scrapeCapWages(): Promise<Record<string, any>> {
  try {
    const res = await fetch("https://capwages.com/players/active", {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      },
      signal: AbortSignal.timeout(15000),
      cache: "no-store",
    });

    if (!res.ok) return {};

    const html  = await res.text();
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
    if (!match) return {};

    const nextData  = JSON.parse(match[1]);
    const players   = nextData?.props?.pageProps?.playersArray;
    if (!Array.isArray(players) || players.length < 100) return {};

    const contracts: Record<string, any> = {};
    let scraped = 0;
    let skipped = 0;
    const skipReasons: Record<string, string> = {};

    for (const p of players) {
      if (!Array.isArray(p) || p.length < 30) { skipped++; continue; }

      const rawName      = p[0]  as string;
      const capRaw       = p[18] as number;
      const expiryStatus = p[24] as string;
      const teamSlug     = (p[2] as string ?? "").toLowerCase().replace(/\s+/g, "_");
      const position     = (p[3] as string ?? "").toUpperCase();
      const ageNow      = p[8]  as number;
      const totalLength = p[15] as number;

      if (!rawName || !capRaw || capRaw <= 0) {
        if (rawName) skipReasons[normaliseName(rawName)] = `capRaw=${capRaw} (p[18] null/zero)`;
        skipped++;
        continue;
      }

      const name   = normaliseName(rawName);
      const capHit = Math.round((capRaw / 10) * 1000) / 1000;

      // ── Sanity check ──────────────────────────────────────────
      const CAP_MIN = 0.70;
      const CAP_MAX = 18.0;
      if (capHit < CAP_MIN || capHit > CAP_MAX) {
        skipReasons[name] = `capHit=${capHit} out of range [${CAP_MIN},${CAP_MAX}]`;
        skipped++;
        continue;
      }

      // ── Correct years remaining formula ──────────────────────
      // p[28] and p[29] both encode "age at signing" but CapWages
      // inconsistently swaps them between players — DeMelo has them
      // reversed vs McDavid/Parayko/Morrissey. max() reliably
      // identifies the correct signing age in all observed cases.
      // Verified against PuckPedia for Parayko, Hellebuyck, McDavid,
      // Morrissey, DeMelo — all correct.
      const ageSigned      = Math.max((p[28] as number) || 0, (p[29] as number) || 0);
      const yearsServed    = (ageNow && ageSigned) ? Math.max(0, ageNow - ageSigned) : 0;
      const yearsRemaining = totalLength > 0 ? Math.max(1, totalLength - yearsServed) : 1;

      const contractData = {
        capHit,
        yearsRemaining: Math.max(0, yearsRemaining),
        expiryStatus,
        position,
        teamSlug,
      };

      contracts[name] = contractData;
      if (position) contracts[`${name}__${position}`] = contractData;
      if (teamSlug) contracts[`${name}__${teamSlug}`]  = contractData;
      scraped++;
    }

    console.log(`[CapWages] Scraped ${scraped} players, skipped ${skipped}.`);
    // Log any known-good players that got skipped — helps diagnose index drift
    const watchList = ["Quinton Byfield","Connor McDavid","Nathan MacKinnon","Auston Matthews"];
    for (const name of watchList) {
      if (!contracts[name]) {
        const reason = skipReasons[name] ?? "not found in playersArray";
        console.warn(`[CapWages] ⚠ ${name} missing from contracts — ${reason}`);
      }
    }
    return contracts;
  } catch (_) {
    return {};
  }
}

async function loadContracts(): Promise<Record<string, any>> {
  if (global.__contractsCache && Date.now() - global.__contractsCache.ts < CONTRACTS_CACHE_TTL) {
    if (Object.keys(global.__contractsCache.data).length > 200) return global.__contractsCache.data;
  }

  const bundled = loadBundled();
  const fresh   = await scrapeCapWages();
  const merged: Record<string, any> = {};

  if (Object.keys(fresh).length > 200) {
    // Live CapWages data available — use fresh cap hits, bundled for years/NMC/NTC
    for (const [name, cw] of Object.entries(fresh)) {
      // Strip any __position or __teamSlug suffix to get the base name
      const baseName = name.includes("__") ? name.split("__")[0] : name;
      const b = bundled[baseName];
      const entry = {
        capHit:         cw.capHit,
        yearsRemaining: b?.yearsRemaining ?? cw.yearsRemaining,
        hasNMC:         b?.hasNMC  ?? false,
        hasNTC:         b?.hasNTC  ?? false,
        canRetain:      b?.hasNMC  ? false : true,
        expiryStatus:   cw.expiryStatus,
        position:       cw.position, // needed by nameCollision check in player builder
      };
      merged[name] = entry;
    }
  } else {
    // CapWages unavailable — use bundled entirely but ensure all fields present
    for (const [name, b] of Object.entries(bundled)) {
      merged[name] = {
        capHit:         b.capHit,
        yearsRemaining: b.yearsRemaining ?? 1,
        hasNMC:         b.hasNMC  ?? false,
        hasNTC:         b.hasNTC  ?? false,
        canRetain:      b.hasNMC  ? false : true,
        expiryStatus:   b.expiryStatus ?? "UFA",
      };
    }
  }

  // Apply manual overrides last — corrects known stale bundled data
  for (const [name, override] of Object.entries(CONTRACT_OVERRIDES)) {
    if (merged[name]) {
      if (override.capHit        !== undefined) merged[name].capHit        = override.capHit;
      if (override.yearsRemaining !== undefined) merged[name].yearsRemaining = override.yearsRemaining;
    }
  }

  if (Object.keys(merged).length > 200) {
    global.__contractsCache = { data: merged, ts: Date.now() };
  }
  return merged;
}

function loadBundled(): Record<string, any> {
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

const buildFallbackMap = (map: Map<string, any>) => {
  const fb = new Map<string, any>();
  map.forEach((val, slug) => {
    const last = slug.split("-").slice(-1)[0];
    fb.set(last, fb.has(last) ? null : val);
  });
  return fb;
};

const NHL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Origin": "https://www.nhl.com",
  "Referer": "https://www.nhl.com/",
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

// ============================================================
// STATIC ROSTER — ~15 players per team, no duplicates
// Format: [teamId, name, position, birthDate]
// ============================================================
const STATIC_ROSTER: [string, string, string, string][] = [
  // ANA
  ["ANA","Mason McTavish","C","2003-01-30"],
  ["ANA","Leo Carlsson","C","2004-04-09"],
  ["ANA","Trevor Zegras","C","2001-03-20"],
  ["ANA","Troy Terry","W","1997-09-10"],
  ["ANA","Frank Vatrano","W","1994-03-14"],
  ["ANA","Alex Killorn","W","1989-09-14"],
  ["ANA","Brock McGinn","W","1994-02-02"],
  ["ANA","Cam Fowler","D","1991-12-05"],
  ["ANA","Jackson LaCombe","D","2001-06-12"],
  ["ANA","Radko Gudas","D","1990-06-05"],
  ["ANA","Urho Vaakanainen","D","1999-03-20"],
  ["ANA","Pavel Mintyukov","D","2003-10-05"],
  ["ANA","Brian Dumoulin","D","1991-09-06"],
  // BOS
  ["BOS","David Pastrnak","W","1996-05-25"],
  ["BOS","Brad Marchand","W","1988-05-11"],
  ["BOS","Morgan Geekie","C","1998-07-20"],
  ["BOS","Pavel Zacha","C","1997-04-06"],
  ["BOS","Elias Lindholm","C","1994-12-02"],
  ["BOS","Casey Mittelstadt","C","1998-11-22"],
  ["BOS","Fraser Minten","C","2004-03-05"],
  ["BOS","Charlie McAvoy","D","1997-12-21"],
  ["BOS","Hampus Lindholm","D","1993-01-20"],
  ["BOS","Mason Lohrei","D","2001-09-06"],
  ["BOS","Nikita Zadorov","D","1995-04-16"],
  ["BOS","Andrew Peeke","D","1997-03-17"],
  // BUF
  ["BUF","Tage Thompson","C","1997-10-30"],
  ["BUF","Dylan Cozens","C","2001-02-09"],
  ["BUF","JJ Peterka","W","2002-01-14"],
  ["BUF","Jack Quinn","W","2001-09-19"],
  ["BUF","Alex Tuch","W","1996-02-17"],
  ["BUF","Zach Benson","W","2004-05-12"],
  ["BUF","Jason Zucker","W","1992-01-16"],
  ["BUF","Rasmus Dahlin","D","2000-04-13"],
  ["BUF","Owen Power","D","2002-11-22"],
  ["BUF","Bowen Byram","D","2001-06-13"],
  ["BUF","Mattias Samuelsson","D","1999-03-17"],
  ["BUF","Henri Jokiharju","D","1999-06-17"],
  // CGY
  ["CGY","Nazem Kadri","C","1990-10-06"],
  ["CGY","Yegor Sharangovich","C","1998-06-06"],
  ["CGY","Jonathan Huberdeau","W","1993-06-04"],
  ["CGY","Blake Coleman","W","1991-11-28"],
  ["CGY","Matt Coronato","W","2002-10-11"],
  ["CGY","Joel Farabee","W","1999-08-25"],
  ["CGY","MacKenzie Weegar","D","1994-01-07"],
  ["CGY","Rasmus Andersson","D","1996-10-27"],
  ["CGY","Kevin Bahl","D","2000-05-27"],
  ["CGY","Zayne Parekh","D","2005-04-02"],
  // CAR
  ["CAR","Sebastian Aho","C","1997-07-26"],
  ["CAR","Seth Jarvis","C","2002-02-01"],
  ["CAR","Jordan Staal","C","1988-09-10"],
  ["CAR","Andrei Svechnikov","W","2000-03-26"],
  ["CAR","Nikolaj Ehlers","W","1996-02-14"],
  ["CAR","Taylor Hall","W","1991-11-14"],
  ["CAR","Jaccob Slavin","D","1994-05-01"],
  ["CAR","Shayne Gostisbehere","D","1993-04-20"],
  ["CAR","Brady Skjei","D","1994-03-26"],
  ["CAR","KAndre Miller","D","1999-01-21"],
  ["CAR","Sean Walker","D","1994-11-05"],
  // CHI
  ["CHI","Connor Bedard","C","2005-07-17"],
  ["CHI","Frank Nazar","C","2003-06-10"],
  ["CHI","Ryan Greene","C","2003-04-16"],
  ["CHI","Tyler Bertuzzi","W","1995-02-24"],
  ["CHI","Ilya Mikheyev","W","1994-10-10"],
  ["CHI","Nick Lardis","W","2004-08-05"],
  ["CHI","Seth Jones","D","1994-10-03"],
  ["CHI","Alex Vlasic","D","2002-07-10"],
  ["CHI","Kevin Korchinski","D","2003-09-09"],
  ["CHI","Artyom Levshunov","D","2005-02-08"],
  ["CHI","Wyatt Kaiser","D","2002-03-01"],
  // COL
  ["COL","Nathan MacKinnon","C","1995-09-01"],
  ["COL","Martin Necas","C","1999-01-15"],
  ["COL","Nazem Kadri","C","1990-10-06"],
  ["COL","Mikko Rantanen","W","1996-10-29"],
  ["COL","Valeri Nichushkin","W","1995-03-04"],
  ["COL","Artturi Lehkonen","W","1995-07-04"],
  ["COL","Gabriel Landeskog","W","1992-11-23"],
  ["COL","Cale Makar","D","1998-10-30"],
  ["COL","Devon Toews","D","1994-02-27"],
  ["COL","Josh Manson","D","1991-10-07"],
  ["COL","Brent Burns","D","1985-03-09"],
  // CBJ
  ["CBJ","Adam Fantilli","C","2004-01-13"],
  ["CBJ","Sean Monahan","C","1994-10-12"],
  ["CBJ","Kirill Marchenko","W","2000-08-08"],
  ["CBJ","Dmitri Voronkov","W","1999-07-28"],
  ["CBJ","Ivan Provorov","D","1997-01-13"],
  ["CBJ","Zach Werenski","D","1996-07-19"],
  ["CBJ","David Jiricek","D","2003-04-09"],
  ["CBJ","Jake Bean","D","1998-06-09"],
  // DAL
  ["DAL","Jason Robertson","W","1999-07-22"],
  ["DAL","Roope Hintz","C","1997-03-03"],
  ["DAL","Wyatt Johnston","C","2003-05-14"],
  ["DAL","Tyler Seguin","C","1992-01-31"],
  ["DAL","Matt Duchene","C","1991-01-16"],
  ["DAL","Logan Stankoven","C","2002-11-16"],
  ["DAL","Miro Heiskanen","D","1999-07-18"],
  ["DAL","Thomas Harley","D","2002-08-19"],
  ["DAL","Esa Lindell","D","1994-05-23"],
  ["DAL","Brendan Smith","D","1988-02-08"],
  // DET
  ["DET","Dylan Larkin","C","1996-07-30"],
  ["DET","Alex DeBrincat","W","1997-12-18"],
  ["DET","Lucas Raymond","W","2002-03-28"],
  ["DET","Patrick Kane","W","1988-11-19"],
  ["DET","Andrew Copp","C","1994-07-08"],
  ["DET","Robby Fabbri","C","1996-01-22"],
  ["DET","Moritz Seider","D","2001-04-06"],
  ["DET","Simon Edvinsson","D","2003-02-13"],
  ["DET","Ben Chiarot","D","1991-05-09"],
  ["DET","Jeff Petry","D","1987-12-09"],
  // EDM
  ["EDM","Connor McDavid","C","1997-01-13"],
  ["EDM","Leon Draisaitl","C","1995-10-27"],
  ["EDM","Ryan Nugent-Hopkins","C","1992-04-12"],
  ["EDM","Zach Hyman","W","1992-06-09"],
  ["EDM","Vasily Podkolzin","W","2001-06-24"],
  ["EDM","Kasperi Kapanen","W","1996-07-23"],
  ["EDM","Matt Savoie","C","2003-07-17"],
  ["EDM","Jack Roslovic","C","1996-01-29"],
  ["EDM","Evan Bouchard","D","1999-10-20"],
  ["EDM","Darnell Nurse","D","1995-02-04"],
  ["EDM","Mattias Ekholm","D","1990-05-03"],
  ["EDM","Brett Kulak","D","1994-01-06"],
  ["EDM","Connor Murphy","D","1992-03-26"],
  // FLA
  ["FLA","Aleksander Barkov","C","1995-09-02"],
  ["FLA","Sam Reinhart","W","1995-11-06"],
  ["FLA","Matthew Tkachuk","W","1997-12-11"],
  ["FLA","Carter Verhaeghe","W","1995-08-14"],
  ["FLA","Evan Rodrigues","C","1993-07-28"],
  ["FLA","Eetu Luostarinen","C","1998-09-02"],
  ["FLA","Aaron Ekblad","D","1996-02-07"],
  ["FLA","Gustav Forsling","D","1996-06-12"],
  ["FLA","Niko Mikkola","D","1996-04-26"],
  ["FLA","Brandon Montour","D","1994-04-11"],
  // LAK
  ["LAK","Anze Kopitar","C","1987-08-24"],
  ["LAK","Quinton Byfield","C","2002-08-13"],
  ["LAK","Kevin Fiala","W","1996-07-22"],
  ["LAK","Adrian Kempe","W","1996-09-20"],
  ["LAK","Artemi Panarin","W","1991-10-30"],
  ["LAK","Alex Laferriere","W","2001-12-08"],
  ["LAK","Trevor Moore","W","1995-01-31"],
  ["LAK","Drew Doughty","D","1989-12-08"],
  ["LAK","Mikey Anderson","D","1999-05-07"],
  ["LAK","Brandt Clarke","D","2002-11-27"],
  ["LAK","Joel Edmundson","D","1993-09-28"],
  // MIN
  ["MIN","Kirill Kaprizov","W","1997-04-26"],
  ["MIN","Matt Boldy","W","2001-04-05"],
  ["MIN","Joel Eriksson Ek","C","1997-07-29"],
  ["MIN","Marco Rossi","C","2002-06-23"],
  ["MIN","Ryan Hartman","W","1994-09-20"],
  ["MIN","Marcus Johansson","W","1990-10-06"],
  ["MIN","Mats Zuccarello","W","1987-09-01"],
  ["MIN","Quinn Hughes","D","2000-10-14"],
  ["MIN","Jonas Brodin","D","1993-07-12"],
  ["MIN","Brock Faber","D","2002-05-28"],
  ["MIN","Jake Middleton","D","1996-02-04"],
  ["MIN","Jared Spurgeon","D","1989-11-29"],
  // MTL
  ["MTL","Nick Suzuki","C","1999-08-10"],
  ["MTL","Cole Caufield","W","2001-01-02"],
  ["MTL","Juraj Slafkovsky","W","2004-03-30"],
  ["MTL","Ivan Demidov","W","2005-10-14"],
  ["MTL","Kirby Dach","C","2001-01-21"],
  ["MTL","Phillip Danault","C","1993-04-24"],
  ["MTL","Alex Newhook","C","2001-01-28"],
  ["MTL","Jake Evans","C","1996-06-02"],
  ["MTL","Lane Hutson","D","2003-02-12"],
  ["MTL","Mike Matheson","D","1994-02-27"],
  ["MTL","Kaiden Guhle","D","2002-01-18"],
  ["MTL","Noah Dobson","D","2000-01-07"],
  ["MTL","Alexandre Carrier","D","1997-10-08"],
  // NSH
  ["NSH","Filip Forsberg","W","1994-08-13"],
  ["NSH","Ryan O'Reilly","C","1991-02-07"],
  ["NSH","Steven Stamkos","C","1990-02-07"],
  ["NSH","Jonathan Marchessault","C","1990-12-27"],
  ["NSH","Luke Evangelista","W","2001-12-25"],
  ["NSH","Roman Josi","D","1990-06-01"],
  ["NSH","Brady Skjei","D","1994-03-26"],
  ["NSH","Alexandre Carrier","D","1997-10-08"],
  ["NSH","Nick Perbix","D","1997-12-14"],
  // NJD
  ["NJD","Jack Hughes","C","2001-05-14"],
  ["NJD","Nico Hischier","C","1999-01-04"],
  ["NJD","Timo Meier","W","1996-10-08"],
  ["NJD","Jesper Bratt","W","1998-07-30"],
  ["NJD","Dawson Mercer","C","2002-10-27"],
  ["NJD","Stefan Noesen","W","1993-02-26"],
  ["NJD","Dougie Hamilton","D","1993-06-17"],
  ["NJD","Jonas Siegenthaler","D","1997-05-06"],
  ["NJD","Luke Hughes","D","2003-09-09"],
  ["NJD","Brendan Smith","D","1988-02-08"],
  // NYI
  ["NYI","Mathew Barzal","C","1997-05-26"],
  ["NYI","Bo Horvat","C","1995-04-05"],
  ["NYI","Jean-Gabriel Pageau","C","1992-11-11"],
  ["NYI","Brock Nelson","C","1991-10-15"],
  ["NYI","Simon Holmstrom","W","2001-10-15"],
  ["NYI","Anders Lee","W","1990-07-03"],
  ["NYI","Noah Dobson","D","2000-01-07"],
  ["NYI","Ryan Pulock","D","1994-10-18"],
  ["NYI","Adam Pelech","D","1994-08-16"],
  ["NYI","Alexander Romanov","D","2000-02-06"],
  ["NYI","Matthew Schaefer","D","2007-02-13"],
  // NYR
  ["NYR","Mika Zibanejad","C","1993-04-18"],
  ["NYR","Vincent Trocheck","C","1993-07-11"],
  ["NYR","Artemi Panarin","W","1991-10-30"],
  ["NYR","Alexis Lafreniere","W","2001-10-11"],
  ["NYR","Chris Kreider","W","1991-04-30"],
  ["NYR","Will Cuylle","W","2002-02-05"],
  ["NYR","Gabe Perreault","W","2004-08-02"],
  ["NYR","JT Miller","C","1993-03-14"],
  ["NYR","Adam Fox","D","1998-02-17"],
  ["NYR","Braden Schneider","D","2001-09-20"],
  ["NYR","Vladislav Gavrikov","D","1995-11-15"],
  ["NYR","K'Andre Miller","D","1999-01-21"],
  // OTT
  ["OTT","Tim Stutzle","C","2002-01-15"],
  ["OTT","Brady Tkachuk","W","1999-09-16"],
  ["OTT","Drake Batherson","W","1998-04-27"],
  ["OTT","Dylan Cozens","C","2001-02-09"],
  ["OTT","Claude Giroux","W","1988-01-12"],
  ["OTT","Shane Pinto","C","2000-11-07"],
  ["OTT","Ridly Greig","C","2002-08-08"],
  ["OTT","Jake Sanderson","D","2002-07-08"],
  ["OTT","Thomas Chabot","D","1997-01-30"],
  ["OTT","Artem Zub","D","1995-10-03"],
  ["OTT","Jordan Spence","D","2000-09-28"],
  // PHI
  ["PHI","Sean Couturier","C","1992-12-07"],
  ["PHI","Travis Konecny","W","1997-03-11"],
  ["PHI","Matvei Michkov","W","2004-11-06"],
  ["PHI","Owen Tippett","W","1999-02-16"],
  ["PHI","Joel Farabee","W","1999-08-25"],
  ["PHI","Morgan Frost","C","1999-05-14"],
  ["PHI","Travis Sanheim","D","1996-03-29"],
  ["PHI","Cam York","D","2001-01-05"],
  ["PHI","Ivan Provorov","D","1997-01-13"],
  ["PHI","Sean Walker","D","1994-11-05"],
  // PIT
  ["PIT","Sidney Crosby","C","1987-08-07"],
  ["PIT","Evgeni Malkin","C","1986-07-31"],
  ["PIT","Rickard Rakell","W","1993-05-05"],
  ["PIT","Bryan Rust","W","1991-05-11"],
  ["PIT","Reilly Smith","W","1991-04-01"],
  ["PIT","Kris Letang","D","1987-04-24"],
  ["PIT","Erik Karlsson","D","1990-05-31"],
  ["PIT","Marcus Pettersson","D","1996-05-08"],
  ["PIT","Matt Grzelcyk","D","1994-01-05"],
  // SEA
  ["SEA","Matty Beniers","C","2002-11-05"],
  ["SEA","Jared McCann","C","1996-05-31"],
  ["SEA","Jordan Eberle","W","1990-05-15"],
  ["SEA","Chandler Stephenson","C","1993-08-09"],
  ["SEA","Eeli Tolvanen","W","1998-04-02"],
  ["SEA","Kaapo Kakko","W","2001-02-15"],
  ["SEA","Shane Wright","C","2003-01-05"],
  ["SEA","Vince Dunn","D","1996-10-29"],
  ["SEA","Adam Larsson","D","1992-11-12"],
  ["SEA","Brandon Montour","D","1994-04-11"],
  ["SEA","Ryker Evans","D","2001-11-06"],
  // SJS
  ["SJS","Macklin Celebrini","C","2006-01-05"],
  ["SJS","Will Smith","C","2004-02-21"],
  ["SJS","William Eklund","W","2003-10-12"],
  ["SJS","Tyler Toffoli","W","1992-04-24"],
  ["SJS","Fabian Zetterlund","W","1999-08-26"],
  ["SJS","Alexander Wennberg","C","1994-09-22"],
  ["SJS","Collin Graf","W","2002-07-07"],
  ["SJS","Mario Ferraro","D","1998-09-17"],
  ["SJS","Dmitry Orlov","D","1991-07-23"],
  ["SJS","Jake Walman","D","1996-02-10"],
  ["SJS","Sam Dickinson","D","2005-11-15"],
  // STL
  ["STL","Robert Thomas","C","1999-07-02"],
  ["STL","Jordan Kyrou","W","1998-05-05"],
  ["STL","Pavel Buchnevich","W","1995-04-17"],
  ["STL","Dylan Holloway","W","2002-01-23"],
  ["STL","Jake Neighbours","W","2002-03-30"],
  ["STL","Jimmy Snuggerud","W","2004-06-25"],
  ["STL","Colton Parayko","D","1993-05-12"],
  ["STL","Philip Broberg","D","2001-07-11"],
  ["STL","Cam Fowler","D","1991-12-05"],
  ["STL","Logan Mailloux","D","2002-09-22"],
  // TBL
  ["TBL","Nikita Kucherov","W","1993-06-17"],
  ["TBL","Brayden Point","C","1996-03-13"],
  ["TBL","Brandon Hagel","W","1998-08-27"],
  ["TBL","Jake Guentzel","C","1994-10-06"],
  ["TBL","Anthony Cirelli","C","1997-07-15"],
  ["TBL","Steven Stamkos","C","1990-02-07"],
  ["TBL","Yanni Gourde","C","1991-12-15"],
  ["TBL","Victor Hedman","D","1990-12-18"],
  ["TBL","Mikhail Sergachev","D","1998-06-25"],
  ["TBL","Erik Cernak","D","1997-05-28"],
  ["TBL","Darren Raddysh","D","1995-08-10"],
  // TOR
  ["TOR","Auston Matthews","C","1997-09-17"],
  ["TOR","Mitch Marner","W","1997-05-05"],
  ["TOR","William Nylander","W","1996-05-01"],
  ["TOR","John Tavares","C","1990-09-20"],
  ["TOR","Matthew Knies","W","2003-03-25"],
  ["TOR","Max Domi","C","1995-03-02"],
  ["TOR","Nicholas Robertson","W","2001-09-11"],
  ["TOR","Morgan Rielly","D","1994-03-09"],
  ["TOR","Jake McCabe","D","1993-10-12"],
  ["TOR","Chris Tanev","D","1989-12-20"],
  ["TOR","Timothy Liljegren","D","1999-04-30"],
  // UTA
  ["UTA","Clayton Keller","C","1998-07-29"],
  ["UTA","Nick Schmaltz","C","1996-02-15"],
  ["UTA","Logan Cooley","C","2003-05-04"],
  ["UTA","Lawson Crouse","W","1997-06-23"],
  ["UTA","Dylan Guenther","W","2003-06-24"],
  ["UTA","Mikhail Sergachev","D","1998-06-25"],
  ["UTA","Juuso Valimaki","D","1998-10-06"],
  ["UTA","Sean Durzi","D","1998-10-03"],
  ["UTA","Ian Cole","D","1989-02-21"],
  // VAN
  ["VAN","Elias Pettersson","C","1998-11-12"],
  ["VAN","JT Miller","C","1993-03-14"],
  ["VAN","Brock Boeser","W","1997-02-25"],
  ["VAN","Jake DeBrusk","W","1999-10-17"],
  ["VAN","Conor Garland","W","1996-03-11"],
  ["VAN","Nils Hoglander","W","2000-10-20"],
  ["VAN","Quinn Hughes","D","2000-10-14"],
  ["VAN","Filip Hronek","D","1997-11-02"],
  ["VAN","Marcus Pettersson","D","1996-05-08"],
  ["VAN","Nikita Zadorov","D","1995-04-16"],
  ["VAN","Tom Willander","D","2004-06-05"],
  // VGK
  ["VGK","Jack Eichel","C","1996-10-28"],
  ["VGK","Mitch Marner","W","1997-05-05"],
  ["VGK","Mark Stone","W","1992-05-13"],
  ["VGK","Ivan Barbashev","W","1995-12-08"],
  ["VGK","William Karlsson","C","1993-01-08"],
  ["VGK","Pavel Dorofeyev","W","2000-11-21"],
  ["VGK","Tomas Hertl","C","1993-11-12"],
  ["VGK","Shea Theodore","D","1995-08-03"],
  ["VGK","Rasmus Andersson","D","1996-10-27"],
  ["VGK","Noah Hanifin","D","1997-01-25"],
  ["VGK","Brayden McNabb","D","1991-01-21"],
  // WSH
  ["WSH","Alexander Ovechkin","W","1985-09-17"],
  ["WSH","Dylan Strome","C","1997-03-07"],
  ["WSH","Tom Wilson","W","1994-03-26"],
  ["WSH","Lars Eller","C","1989-05-08"],
  ["WSH","Aliaksei Protas","C","2001-01-06"],
  ["WSH","Pierre-Luc Dubois","C","1998-06-24"],
  ["WSH","John Carlson","D","1990-01-10"],
  ["WSH","Matt Roy","D","1995-04-05"],
  ["WSH","Trevor van Riemsdyk","D","1991-07-24"],
  ["WSH","Jakob Chychrun","D","1998-03-31"],
  // WPG
  ["WPG","Mark Scheifele","C","1993-03-15"],
  ["WPG","Kyle Connor","W","1996-12-09"],
  ["WPG","Gabriel Vilardi","C","2000-08-16"],
  ["WPG","Nino Niederreiter","W","1992-09-08"],
  ["WPG","Adam Lowry","C","1992-03-29"],
  ["WPG","Cole Perfetti","C","2002-01-01"],
  ["WPG","Josh Morrissey","D","1995-03-28"],
  ["WPG","Dylan DeMelo","D","1993-05-01"],
  ["WPG","Brenden Dillon","D","1990-11-13"],
  ["WPG","Neal Pionk","D","1995-07-29"],
  ["WPG","Logan Stanley","D","2001-05-26"],
  // GOALIES — one starter per team minimum
  ["WPG","Connor Hellebuyck","G","1993-05-19"],
  ["EDM","Stuart Skinner","G","1998-11-01"],
  ["EDM","Calvin Pickard","G","1992-04-15"],
  ["FLA","Sergei Bobrovsky","G","1988-09-20"],
  ["TBL","Andrei Vasilevskiy","G","1994-07-25"],
  ["CAR","Pyotr Kochetkov","G","1999-06-25"],
  ["COL","Alexandar Georgiev","G","1996-02-10"],
  ["DAL","Jake Oettinger","G","1998-12-18"],
  ["NYR","Igor Shesterkin","G","1995-12-30"],
  ["VGK","Adin Hill","G","1996-05-11"],
  ["TOR","Joseph Woll","G","1998-07-12"],
  ["TOR","Anthony Stolarz","G","1994-01-20"],
  ["BOS","Jeremy Swayman","G","1998-11-16"],
  ["MIN","Filip Gustavsson","G","1998-06-07"],
  ["NSH","Juuse Saros","G","1995-04-19"],
  ["OTT","Linus Ullmark","G","1993-07-31"],
  ["NJD","Jacob Markstrom","G","1990-01-31"],
  ["SEA","Philipp Grubauer","G","1991-11-25"],
  ["BUF","Ukko-Pekka Luukkonen","G","1999-03-09"],
  ["MTL","Sam Montembeault","G","1996-10-30"],
  ["VAN","Kevin Lankinen","G","1995-04-28"],
  ["LAK","Darcy Kuemper","G","1990-05-05"],
  ["PIT","Tristan Jarry","G","1995-04-29"],
  ["STL","Jordan Binnington","G","1993-07-11"],
  ["ANA","Lukas Dostal","G","2000-06-22"],
  ["CHI","Petr Mrazek","G","1992-02-14"],
  ["DET","Cam Talbot","G","1987-07-05"],
  ["PHI","Samuel Ersson","G","2000-02-26"],
  ["NYI","Semyon Varlamov","G","1988-04-27"],
  ["SJS","Mackenzie Blackwood","G","1996-12-09"],
  ["CBJ","Elvis Merzlikins","G","1994-04-13"],
  ["UTA","Connor Ingram","G","1997-04-09"],
  ["CGY","Dustin Wolf","G","2001-04-16"],
  ["WSH","Logan Thompson","G","1997-02-25"],
  ["BOS","Linus Ullmark","G","1993-07-31"],
  ["CAR","Frederik Andersen","G","1989-10-02"],
  ["NYI","Ilya Sorokin","G","1995-08-04"],
];

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

declare global {
  var __psCache: { data: Map<string, { ops: number; dps: number }>; ts: number } | null;
}
if (!global.__psCache) global.__psCache = null;
const PS_CACHE_TTL = 12 * 60 * 60 * 1000; // 12 hours

async function fetchPointShares(): Promise<Map<string, { ops: number; dps: number }>> {
  // Check cache
  if (global.__psCache && Date.now() - global.__psCache.ts < PS_CACHE_TTL) {
    return global.__psCache.data;
  }

  const psMap = new Map<string, { ops: number; dps: number }>();

  try {
    // Fetch skater summary and team summary in parallel
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
    global.__psCache = { data: psMap, ts: Date.now() };
    return psMap;

  } catch (e: any) {
    console.warn("[PS] fetchPointShares failed:", e.message);
    return psMap;
  }
}

export async function GET() {
  // Load contracts, teams, and point shares in parallel
  const [CONTRACTS, LIVE_TEAMS, PS_MAP] = await Promise.all([
    loadContracts(),
    loadTeams(),
    fetchPointShares(),
  ]);
  const EXTENSIONS = loadExtensions();
  // ── 1. MoneyPuck analytics — skaters + goalies ─────────────
  // Cached for 4 hours — MP updates roughly twice daily.
  // Without this cache, every page load downloads two large CSVs (~2MB total).
  const analyticsMap = new Map<string, any>();
  const goalieMap    = new Map<string, any>();
  const teamXgaMap = new Map<string, { xGoals: number; games: number }>();
  let fbMap = new Map<string, any>();

  const mpNow = Date.now();
  const skaterCsvFresh = global.__mpSkaterCache && mpNow - global.__mpSkaterCache.ts < MONEYPUCK_CACHE_TTL;
  const goalieCsvFresh = global.__mpGoalieCache && mpNow - global.__mpGoalieCache.ts < MONEYPUCK_CACHE_TTL;

  try {
    // Fetch only stale CSVs — use cache for fresh ones
    const [mpRes, gpRes] = await Promise.allSettled([
      skaterCsvFresh
        ? Promise.resolve({ ok: true, text: async () => global.__mpSkaterCache!.csv })
        : fetchWithTimeout(
            "https://moneypuck.com/moneypuck/playerData/seasonSummary/2025/regular/skaters.csv",
            8000,
            { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36" }
          ),
      goalieCsvFresh
        ? Promise.resolve({ ok: true, text: async () => global.__mpGoalieCache!.csv })
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
      if (!skaterCsvFresh) global.__mpSkaterCache = { csv, ts: mpNow };
      const rows = csv.split("\n").filter(Boolean);
      const hdr  = parseCSVRow(rows[0]);
      const h    = (k: string) => hdr.indexOf(k);
      const [nI, sI, pI, xgI, gI, iceI, onAI, offAI, rkI, onFI, offFI, dzI, ozI, goalsI, posI] = [
        h("name"), h("situation"), h("I_F_points"), h("I_F_xGoals"),
        h("games_played"), h("icetime"),
        h("OnIce_A_xGoals"), h("OffIce_A_xGoals"),
        h("iceTimeRank"),  // NOTE: This is ice time VOLUME rank (1=most TOI), NOT quality of competition.
                           // Stored as asset.qocRank but is a usage proxy only — not true QoC.
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
        const entry = {
          ptsPace: (parseFloat(c[pI])  / g) * 82,
          xGPace:  (parseFloat(c[xgI]) / g) * 82,
          defRate: offA - onA,
          avgTOI:  iceSec / g / 60,
          qocRank: parseFloat(c[rkI]) || 500, // = iceTimeRank (volume), not competition quality
          games:   g,
          hasLiveStats: true,
          xgRelTM,
          xgaRelTM,
          dzPct,
          goalsPace:   goalsI >= 0 ? (parseFloat(c[goalsI])   / g) * 82 : undefined,
          assistsPace: goalsI >= 0 ? ((parseFloat(c[pI]) - parseFloat(c[goalsI])) / g) * 82 : undefined,
        };
        analyticsMap.set(mapKey, entry);
        // Also store by name-only for players without a name collision
        if (pos) analyticsMap.set(slugify(name), entry);
      });
      fbMap = buildFallbackMap(analyticsMap);
    }

    // Parse goalies — same quote-aware CSV parser
    // Also derive teamXga60 from xGoals allowed per team
    const teamXgaMap = new Map<string, { xGoals: number; games: number }>();

    if (gpRes.status === "fulfilled" && gpRes.value.ok) {
      const csv  = await gpRes.value.text();
      // Store in cache if this was a fresh fetch
      if (!goalieCsvFresh) global.__mpGoalieCache = { csv, ts: mpNow };
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
          const c        = parseCSVRow(row);
          if (c.length <= nI) return;
          const sit = (c[sI] ?? "").trim().toLowerCase();
          if (sit !== "all") return;
          const name    = c[nI].trim();
          const g       = Math.max(1, parseFloat(c[gI]) || 1);
          const xGoals  = parseFloat(c[xgI])    || 0;
          const goals   = parseFloat(c[goalsI]) || 0;
          const ongoal  = parseFloat(c[ongoalI])|| 0;
          const gsax    = xGoals - goals;
          const savePct = ongoal > 0 ? (ongoal - goals) / ongoal : 0.900;

          // Accumulate team-level xGA — sum across all goalies on that team
          const teamAbbr = (c[teamI] ?? "").trim().toUpperCase();
          if (teamAbbr) {
            const prev = teamXgaMap.get(teamAbbr) ?? { xGoals: 0, games: 0 };
            // Use max games (starter's GP) as denominator — avoids double-counting
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

  // ── 2. Build roster from static list (guaranteed) ──────────
  // Then try to enrich with NHL API headshots
  const rosterMap = new Map<string, any[]>();

  // First populate from static roster — this always works
  for (const [teamId, name, position, birthDate] of STATIC_ROSTER) {
    const list = rosterMap.get(teamId) ?? [];
    list.push({
      id:       `${teamId}-${slugify(name)}`,
      name,
      position: normalisePos(position),
      age:      calcAge(birthDate),
      headshot: null,
    });
    rosterMap.set(teamId, list);
  }

  // Then try NHL API to get headshots and update IDs (optional enrichment)
  try {
    const results = await Promise.allSettled(
      LIVE_TEAMS.map((t) =>
        fetchWithTimeout(
          `https://api-web.nhle.com/v1/roster/${t.id}/20252026`,
          5000,
          NHL_HEADERS
        )
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
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

      // Replace static roster with live roster for this team
      const liveList = skaters.map((p: any) => ({
        id:       p.id.toString(),
        name:     `${p.firstName.default} ${p.lastName.default}`,
        position: normalisePos(p.positionCode),
        age:      calcAge(p.birthDate),
        headshot: p.headshot ?? null,
      }));

      rosterMap.set(teamId, liveList);
    });
  } catch (_) { /* NHL API blocked — static roster already set */ }

  // ── 3. Build player objects ─────────────────────────────────
  const players: any[] = [];

  rosterMap.forEach((skaters, teamId) => {
    const team = LIVE_TEAMS.find((t) => t.id === teamId);
    if (!team) return;

    skaters.forEach((p: any) => {
      const slug = slugify(p.name);
      // Try position-specific key first to handle same-name players (e.g. two Petterssons)
      const posSlug = `${slug}__${(p.position ?? "").toUpperCase()}`;
      let stats = analyticsMap.get(posSlug) ?? analyticsMap.get(slug);
      if (!stats) {
        const last = slug.split("-").slice(-1)[0];
        const fb   = fbMap.get(last);
        if (fb !== null && fb !== undefined) stats = fb;
      }

      // Contract lookup — try compound keys first to handle same-name players
      // e.g. two Elias Petterssons on VAN: one C ($11.6M), one D ($0.84M ELC)
      const posKey  = `${p.name}__${p.position}`;
      const teamKey = `${p.name}__${teamId.toLowerCase()}`;
      const fin     = CONTRACTS[posKey] ?? CONTRACTS[teamKey] ?? CONTRACTS[p.name] ?? null;

      // If no contract found and player is young (≤23), assume ELC rates
      // rather than inheriting a same-name veteran's contract
      const isLikelyELC = !fin && p.age <= 23;
      const elcCapHit   = p.age <= 22 ? 0.8775 : 0.925; // standard ELC AAV

      // ── THE OVERRIDE LAYER (Highest Priority) ───────────────
      const override         = EXTENSIONS[p.name];
      const contractOverride = CONTRACT_OVERRIDES[p.name];
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

      // Contract sanity check
      const rawCapHit     = isLikelyELC ? elcCapHit : (fin?.capHit ?? 0.925);
      const nameCollision = p.age <= 23 && rawCapHit > 3.0 && !fin?.position?.startsWith(p.position);

      const finalCapHit   = contractOverride?.capHit ?? override?.capHit ?? (nameCollision ? elcCapHit : rawCapHit);
      const finalYears    = override?.yearsRemaining ?? (nameCollision ? 1 : (isLikelyELC ? 1 : (fin?.yearsRemaining ?? 1)));
      const finalNMC      = override?.hasNMC ?? (nameCollision ? false : (fin?.hasNMC ?? false));
      const finalNTC      = override?.hasNTC ?? (nameCollision ? false : (fin?.hasNTC ?? false));
      const finalRetain   = override?.canRetain ?? (nameCollision ? true  : (fin?.canRetain ?? true));
      const hasExtension     = override?.hasExtension ?? false;
      const extensionCapHit  = override?.extensionCapHit ?? undefined;
      const extensionYears   = override?.extensionYears ?? undefined;
      const intangibleMult = override?.intangibleMultiplier ?? (fin?.intangibleMultiplier ?? 1.0);

      // ── UPSTREAM GOALIE METRICS ─────────────────────────────
      // teamXga60: derived from MoneyPuck xGoals allowed / team games played
      // League average is ~2.55 xGA/60. Higher = worse defense = goalie in hostile env.
      const LEAGUE_AVG_XGA60 = 2.55;
      const teamXgaRaw = teamXgaMap.get(teamId);
      const teamXga60 = teamXgaRaw && teamXgaRaw.games > 10
        ? Math.round((teamXgaRaw.xGoals / teamXgaRaw.games / (30 / 60)) * 100) / 100
        : LEAGUE_AVG_XGA60;

      // baselineGsax: current year GSAx — future enhancement will add weighted 3yr avg
      const baselineGsax = goalieStats?.gsax ?? 0;

      players.push({
        id:             p.id,
        teamId,
        name:           p.name,
        position:       finalPosition,
        age:            p.age,
        headshot:       p.headshot ?? null,
        games:          stats?.games    ?? goalieStats?.gamesStarted ?? 40,
        ptsPace:        stats?.ptsPace  ?? defaultPts,
        xGPace:         stats?.xGPace   ?? 0,
        defRate:        stats?.defRate  ?? 0.08,
        avgTOI:         stats?.avgTOI   ?? defaultTOI,
        qocRank:        stats?.qocRank  ?? 450,
        hasLiveStats:   stats?.hasLiveStats ?? goalieStats?.hasLiveStats ?? false,
        // Goalie-specific
        gsax:           goalieStats?.gsax         ?? 0,
        savePct:        goalieStats?.savePct       ?? 0.900,
        gamesStarted:   goalieStats?.gamesStarted  ?? 0,
        shotsPerGame:   goalieStats?.shotsPerGame  ?? 0,
        teamXga60:      teamXga60,     // NEW
        baselineGsax:   baselineGsax,  // NEW
        // Contract
        capHit:         CONTRACT_OVERRIDES[p.name]?.capHit         ?? finalCapHit,
        yearsRemaining: CONTRACT_OVERRIDES[p.name]?.yearsRemaining ?? finalYears,
        hasExtension:   hasExtension,
        extensionCapHit: extensionCapHit,
        extensionYears:  extensionYears,
        hasNMC:         finalNMC,
        hasNTC:         finalNTC,
        canRetain:      finalRetain,
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
        age:          19,
        round,
        year,
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