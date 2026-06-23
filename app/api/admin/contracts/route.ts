import { NextResponse } from "next/server";
import { scrapeCapWages } from "@/app/services/scraper";
import { db } from "@/app/db/client";
import { players as playersTable } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { TEAMS_DB } from "@/app/lib/db";
import { redis } from "@/app/lib/redis";
import { requireAdmin } from "@/app/lib/admin-auth";
import { ensurePlayerColumns } from "@/app/db/ensure-schema";

const CONTRACT_OVERRIDES: Record<string, { yearsRemaining?: number; position?: string }> = {
  "Quinton Byfield": { position: "C" },

};

const CW_TEAM_TO_ID: Record<string, string> = {
  anaheim_ducks: "ANA",
  san_diego_gulls: "ANA",
  boston_bruins: "BOS",
  providence_bruins: "BOS",
  buffalo_sabres: "BUF",
  rochester_americans: "BUF",
  calgary_flames: "CGY",
  calgary_wranglers: "CGY",
  carolina_hurricanes: "CAR",
  chicago_wolves: "CAR",
  chicago_blackhawks: "CHI",
  rockford_icehogs: "CHI",
  colorado_avalanche: "COL",
  colorado_eagles: "COL",
  columbus_blue_jackets: "CBJ",
  cleveland_monsters: "CBJ",
  dallas_stars: "DAL",
  texas_stars: "DAL",
  detroit_red_wings: "DET",
  grand_rapids_griffins: "DET",
  edmonton_oilers: "EDM",
  bakersfield_condors: "EDM",
  florida_panthers: "FLA",
  charlotte_checkers: "FLA",
  los_angeles_kings: "LAK",
  ontario_reign: "LAK",
  minnesota_wild: "MIN",
  iowa_wild: "MIN",
  montreal_canadiens: "MTL",
  laval_rocket: "MTL",
  nashville_predators: "NSH",
  milwaukee_admirals: "NSH",
  new_jersey_devils: "NJD",
  utica_comets: "NJD",
  new_york_islanders: "NYI",
  bridgeport_islanders: "NYI",
  new_york_rangers: "NYR",
  hartford_wolf_pack: "NYR",
  ottawa_senators: "OTT",
  belleville_senators: "OTT",
  philadelphia_flyers: "PHI",
  lehigh_valley_phantoms: "PHI",
  pittsburgh_penguins: "PIT",
  wilkes_barre_scranton_penguins: "PIT",
  san_jose_sharks: "SJS",
  san_jose_barracuda: "SJS",
  seattle_kraken: "SEA",
  coachella_valley_firebirds: "SEA",
  st_louis_blues: "STL",
  springfield_thunderbirds: "STL",
  tampa_bay_lightning: "TBL",
  syracuse_crunch: "TBL",
  toronto_maple_leafs: "TOR",
  toronto_marlies: "TOR",
  utah_mammoth: "UTA",
  utah_hockey_club: "UTA",
  tucson_roadrunners: "UTA",
  vancouver_canucks: "VAN",
  abbotsford_canucks: "VAN",
  vegas_golden_knights: "VGK",
  henderson_silver_knights: "VGK",
  washington_capitals: "WSH",
  hershey_bears: "WSH",
  winnipeg_jets: "WPG",
  manitoba_moose: "WPG",
};

const SYNC_CACHE_KEYS = [
  "cache:league:teams:v1",
  "cache:trade:teams:v1",
  "cache:contracts",
  "cache:contracts:v2",
  "cache:nhl_skater_summary_stats",
];
const VALID_TEAM_IDS = new Set(TEAMS_DB.map(t => t.id));
const MIN_CONTRACT_CAP_HIT = 0.5;
const MAX_CONTRACT_CAP_HIT = 20.8;
const MIN_CONTRACT_YEARS = 0;
const MAX_CONTRACT_YEARS = 12;

// Memoized per-process column back-fill (retirement + prospect columns).
// Kept as a named wrapper so the retirement-column guard stays explicit here.
async function ensureRetirementColumns() {
  await ensurePlayerColumns();
}

async function clearRosterCaches() {
  if (!redis) return;
  for (const key of SYNC_CACHE_KEYS) {
    await redis.del(key).catch(() => {});
  }
}

const NHLE_FACTORS: Record<string, number> = {
  NHL: 1.00, AHL: 0.47, KHL: 0.77, SHL: 0.59, LIIGA: 0.54,
  NL: 0.46, CZECHIA: 0.49, DEL: 0.44, NCAA: 0.41, USHL: 0.27,
  OHL: 0.30, WHL: 0.28, QMJHL: 0.28, USNTDP: 0.35,
  J20: 0.19, MHL: 0.18, U18: 0.15,
};

function isValidTeamId(teamId: string | null | undefined): teamId is string {
  return Boolean(teamId && VALID_TEAM_IDS.has(teamId));
}

function normalisePosition(pos: string | null | undefined): string | null {
  if (!pos || pos === "Unknown" || pos === "-" || pos === "—") return null;
  const first = pos.toUpperCase().split(",").map(p => p.trim()).filter(Boolean)[0];
  if (!first || first === "-" || first === "—") return null;
  if (first.includes("G")) return "G";
  if (first.includes("D")) return "D";
  if (first.includes("C")) return "C";
  if (first.includes("W") || first.includes("L") || first.includes("R")) return "W";
  return first;
}

function teamIdFromSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
  const direct = slug.trim().toUpperCase();
  if (isValidTeamId(direct)) return direct;
  const key = slug.toLowerCase().replace(/[\s-]+/g, "_");
  return CW_TEAM_TO_ID[key] ?? null;
}

function makeId(name: string): string {
  return name.toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function findScrapedByName(scraped: Record<string, any>, name: string): any | null {
  const direct = scraped[name];
  if (direct) return direct;
  const id = makeId(name);
  for (const [key, value] of Object.entries(scraped)) {
    if (!key.includes("__") && makeId(key) === id) return value;
  }
  return null;
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchNhlRosterTeamMap(): Promise<Map<string, { teamId: string; position: string | null }>> {
  const playerTeams = new Map<string, { teamId: string; position: string | null }>();

  for (const team of TEAMS_DB) {
    await sleep(100);
    try {
      const res = await fetch(`https://api-web.nhle.com/v1/roster/${team.id}/current`, {
        cache: "no-store",
        signal: AbortSignal.timeout(8000),
      });
      if (!res.ok) continue;

      const data = await res.json() as {
        forwards?: any[];
        defensemen?: any[];
        goalies?: any[];
      };
      const rows = [
        ...(data.forwards ?? []),
        ...(data.defensemen ?? []),
        ...(data.goalies ?? []),
      ];

      for (const p of rows) {
        const name = `${p.firstName?.default ?? ""} ${p.lastName?.default ?? ""}`.trim();
        if (!name) continue;
        playerTeams.set(makeId(name), {
          teamId: team.id,
          position: normalisePosition(p.positionCode),
        });
      }
    } catch {
      // Best-effort fallback only; CapWages/DB sync can still proceed.
    }
  }

  return playerTeams;
}

// GET /api/admin/contracts — full audit table
// ?scrape=1 adds live CapWages data (slower, enables delta column + SYNC)
export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  await ensureRetirementColumns();

  const url    = new URL(req.url);
  const doScrape = url.searchParams.get("scrape") === "1";

  // Explicit column list — a full select() breaks with "no such column" whenever
  // schema.ts declares a column the live Turso table doesn't have yet.
  let dbError: string | null = null;
  const [dbRows, scraped] = await Promise.all([
    db.select({
      name:           playersTable.name,
      position:       playersTable.position,
      teamId:         playersTable.teamId,
      capHit:         playersTable.capHit,
      yearsRemaining: playersTable.yearsRemaining,
      hasNmc:         playersTable.hasNmc,
      hasNtc:         playersTable.hasNtc,
      retired:        playersTable.retired,
      retiredDate:    playersTable.retiredDate,
    }).from(playersTable).catch((e: any) => {
      dbError = e?.message ?? String(e);
      console.error("[Admin Contracts] DB read failed:", dbError);
      return [] as { name: string; position: string; teamId: string | null; capHit: number; yearsRemaining: number; hasNmc: boolean | null; hasNtc: boolean | null; retired: boolean | null; retiredDate: string | null }[];
    }),
    doScrape ? scrapeCapWages() : Promise.resolve({} as Record<string, any>),
  ]);

  const dbMap = new Map<string, typeof dbRows[number]>();
  for (const row of dbRows) {
    const existing = dbMap.get(row.name);
    const rowHasMetadata = row.teamId != null || normalisePosition(row.position) != null;
    const existingHasMetadata = existing?.teamId != null || normalisePosition(existing?.position) != null;
    if (!existing || (rowHasMetadata && !existingHasMetadata)) dbMap.set(row.name, row);
  }

  const allNames = new Set<string>();
  dbRows.forEach(r => allNames.add(r.name));
  if (doScrape) {
    Object.keys(scraped).filter(n => !n.includes("__")).forEach(n => allNames.add(n));
  }

  const scrapedRaw: Record<string, { capHit: number; yearsRemaining: number; position?: string; teamSlug?: string; age?: number | null }> = {};

  const rows = Array.from(allNames).sort().map(name => {
    const b  = dbMap.get(name);
    const cw = findScrapedByName(scraped, name);
    const ov = CONTRACT_OVERRIDES[name];

    const dbYears    = b?.yearsRemaining ?? null;
    const scrapedYears = cw?.yearsRemaining && cw.yearsRemaining > 0 ? cw.yearsRemaining : null;
    const baseYears  = ov?.yearsRemaining ?? scrapedYears ?? dbYears ?? 1;

    const scrapedCap = cw?.capHit ?? null;
    const baseCap    = scrapedCap ?? b?.capHit ?? null;

    const delta = (dbYears != null && scrapedYears != null)
      ? Math.abs(dbYears - scrapedYears) : null;

    if (cw?.capHit) {
      scrapedRaw[name] = {
        capHit: cw.capHit,
        yearsRemaining: scrapedYears ?? 1,
        position: cw.position,
        teamSlug: cw.teamSlug,
        age: cw.age ?? null,
      };
    }

    return {
      name,
      team:          cw?.teamSlug ?? b?.teamId ?? null,
      position:      ov?.position ?? normalisePosition(cw?.position) ?? normalisePosition(b?.position) ?? null,
      finalYears:    baseYears,
      finalCap:      baseCap,
      bundledYears:  dbYears,
      scrapedYears,
      adminYears:    null,
      adminCap:      null,
      overrideYears: ov?.yearsRemaining ?? null,
      hasNMC:        b?.hasNmc  ?? false,
      hasNTC:        b?.hasNtc  ?? false,
      retired:       b?.retired ?? false,
      retiredDate:   b?.retiredDate ?? null,
      expiryStatus:  cw?.expiryStatus ?? null,
      delta,
      source: ov?.yearsRemaining ? "override"
             : scrapedYears      ? "scraper"
             : dbYears           ? "bundled"
             : "default",
    };
  });

  rows.sort((a, b) => (b.delta ?? -1) - (a.delta ?? -1) || a.name.localeCompare(b.name));

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    total: rows.length,
    contracts: rows,
    scrapedRaw: doScrape ? scrapedRaw : {},
    dbError,
  });
}

// POST /api/admin/contracts
// body: { name, yearsRemaining?, capHit?, hasNMC?, hasNTC?, draftOverall?, prospectPtsPace?, clear? }
// Upserts to Turso DB — persists across Vercel deployments
export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  await ensureRetirementColumns();

  const body = await req.json();
  const { name, yearsRemaining, capHit, hasNMC, hasNTC, retired, clear } = body as {
    name:            string;
    yearsRemaining?: number;
    capHit?:         number;
    hasNMC?:         boolean;
    hasNTC?:         boolean;
    retired?:        boolean;
    clear?:          boolean;
  };
  const teamId = typeof body.teamId === "string" ? teamIdFromSlug(body.teamId) : null;
  const position = normalisePosition(body.position);
  const age = Number.isFinite(Number(body.age)) ? Number(body.age) : null;
  const draftYear = Number.isFinite(Number(body.draftYear)) ? Number(body.draftYear) : null;
  const draftRound = Number.isFinite(Number(body.draftRound)) ? Number(body.draftRound) : null;
  const draftOverall = Number.isFinite(Number(body.draftOverall)) ? Number(body.draftOverall) : null;
  const explicitProspectPtsPace = Number.isFinite(Number(body.prospectPtsPace)) ? Number(body.prospectPtsPace) : null;
  const league = typeof body.league === "string" ? body.league.toUpperCase() : null;
  const points = Number.isFinite(Number(body.points)) ? Number(body.points) : null;
  const games = Number.isFinite(Number(body.games)) ? Number(body.games) : null;
  const calculatedProspectPtsPace = league && points != null && games != null && games > 0 && NHLE_FACTORS[league] != null
    ? Math.round((points / games) * NHLE_FACTORS[league] * 82 * 10) / 10
    : null;
  const prospectPtsPace = explicitProspectPtsPace ?? calculatedProspectPtsPace;

  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  if (
    capHit != null &&
    (!Number.isFinite(capHit) || capHit < MIN_CONTRACT_CAP_HIT || capHit > MAX_CONTRACT_CAP_HIT)
  ) {
    return NextResponse.json({ error: `capHit must be between ${MIN_CONTRACT_CAP_HIT} and ${MAX_CONTRACT_CAP_HIT}` }, { status: 400 });
  }
  if (
    yearsRemaining != null &&
    (!Number.isInteger(yearsRemaining) || yearsRemaining < MIN_CONTRACT_YEARS || yearsRemaining > MAX_CONTRACT_YEARS)
  ) {
    return NextResponse.json({ error: `yearsRemaining must be an integer between ${MIN_CONTRACT_YEARS} and ${MAX_CONTRACT_YEARS}` }, { status: 400 });
  }

  const id = makeId(name);

  if (clear) {
    await db.delete(playersTable).where(eq(playersTable.id, id));
    await clearRosterCaches();
    return NextResponse.json({ ok: true, cleared: true });
  }

  if (
    yearsRemaining == null && capHit == null && hasNMC == null && hasNTC == null &&
    retired == null &&
    !teamId && !position && age == null && draftYear == null && draftRound == null &&
    draftOverall == null && prospectPtsPace == null
  ) {
    return NextResponse.json({ error: "provide at least one field to update" }, { status: 400 });
  }

  const existing = await db.select().from(playersTable).where(eq(playersTable.id, id));

  if (existing.length > 0) {
    const updates: Record<string, any> = {};
    if (yearsRemaining != null) updates.yearsRemaining = yearsRemaining;
    if (capHit         != null) updates.capHit         = capHit;
    if (hasNMC         != null) updates.hasNmc         = hasNMC;
    if (hasNTC         != null) updates.hasNtc         = hasNTC;
    if (retired        != null) {
      updates.retired = retired;
      updates.retiredDate = retired ? new Date().toISOString().slice(0, 10) : null;
    }
    if (teamId)                  updates.teamId         = teamId;
    if (position)                updates.position       = position;
    if (age           != null)   updates.age            = age;
    if (draftYear     != null)   updates.draftYear      = draftYear;
    if (draftRound    != null)   updates.draftRound     = draftRound;
    if (draftOverall  != null)   updates.draftOverall   = draftOverall;
    if (prospectPtsPace != null) updates.prospectPtsPace = prospectPtsPace;
    await db.update(playersTable).set(updates).where(eq(playersTable.id, id));
    await clearRosterCaches();
    return NextResponse.json({ ok: true, destination: "db-update", name });
  } else {
    await db.insert(playersTable).values({
      id,
      name,
      position:       position ?? "Unknown",
      teamId:         teamId ?? undefined,
      age:            age ?? undefined,
      capHit:         capHit         ?? 0.925,
      yearsRemaining: yearsRemaining ?? 1,
      hasNmc:         hasNMC         ?? false,
      hasNtc:         hasNTC         ?? false,
      retired:        retired        ?? false,
      retiredDate:    retired        ? new Date().toISOString().slice(0, 10) : undefined,
      draftYear:      draftYear      ?? undefined,
      draftRound:     draftRound     ?? undefined,
      draftOverall:   draftOverall   ?? undefined,
      prospectPtsPace: prospectPtsPace ?? undefined,
    });
    await clearRosterCaches();
    return NextResponse.json({ ok: true, destination: "db-insert", name });
  }
}

// PUT /api/admin/contracts — sync scraped players into DB
// body: { players: Record<string, { capHit, yearsRemaining }> }
export async function PUT(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  await ensureRetirementColumns();

  let body: { players?: Record<string, any> } = {};
  try { body = await req.json(); } catch { /* no body */ }

  let source: Record<string, any> = body.players ?? {};
  if (Object.keys(source).length === 0) {
    source = await scrapeCapWages();
  }
  const needsMetadata = Object.entries(source)
    .some(([key, cw]) => !key.includes("__") && (!cw.position || !cw.teamSlug));

  if (needsMetadata) {
    const scraped = await scrapeCapWages();
    source = Object.fromEntries(Object.entries(source).map(([key, cw]) => {
      if (key.includes("__")) return [key, cw];
      const live = findScrapedByName(scraped, key) ?? {};
      return [key, {
        ...live,
        ...cw,
        position: cw.position ?? live.position,
        teamSlug: cw.teamSlug ?? live.teamSlug,
      }];
    }));
  }
  const needsRosterFallback = Object.entries(source)
    .some(([key, cw]) => !key.includes("__") && !teamIdFromSlug(cw.teamSlug));
  const rosterTeamMap = needsRosterFallback ? await fetchNhlRosterTeamMap() : new Map<string, { teamId: string; position: string | null }>();

  const existing = await db.select({
    id:             playersTable.id,
    name:           playersTable.name,
    position:       playersTable.position,
    teamId:         playersTable.teamId,
    age:            playersTable.age,
    capHit:         playersTable.capHit,
    yearsRemaining: playersTable.yearsRemaining,
    retired:        playersTable.retired,
  }).from(playersTable);
  const existingById = new Map(existing.map(r => [r.id, r]));
  const existingByName = new Map(existing.map(r => [makeId(r.name), r]));

  let added = 0;
  let updated = 0;
  const newEntries: string[] = [];
  const updatedEntries: string[] = [];
  const metadataMisses: string[] = [];
  const watchNames = new Set(["aatu raty", "brad lambert"]);
  const watch: Record<string, any> = {};

  for (const [key, cw] of Object.entries(source)) {
    if (key.includes("__")) continue;
    const id = makeId(key);
    // Match scraper's CAP_MAX (CBA max = 20% of $104M ceiling); old 16 silently
    // dropped Kaprizov-tier contracts from bulk imports
    if (!cw.capHit || cw.capHit < 0.5 || cw.capHit > 20.8) continue;

    const rosterFallback = rosterTeamMap.get(id);
    const current = existingById.get(id) ?? existingByName.get(id);
    const position = normalisePosition(cw.position) ?? rosterFallback?.position ?? "Unknown";
    const currentTeamId = isValidTeamId(current?.teamId) ? current.teamId : null;
    const teamId = teamIdFromSlug(cw.teamSlug) ?? rosterFallback?.teamId ?? currentTeamId ?? null;
    if (!teamId) metadataMisses.push(key);
    const values = {
      position,
      teamId,
      age:            Number.isFinite(cw.age) && cw.age > 0 ? cw.age : null,
      capHit:         cw.capHit,
      yearsRemaining: cw.yearsRemaining > 0 ? cw.yearsRemaining : 1,
    };
    if (watchNames.has(key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) {
      watch[key] = {
        matchedExisting: Boolean(current),
        currentId: current?.id ?? null,
        currentTeamId,
        sourceTeamSlug: cw.teamSlug ?? null,
        rosterFallbackTeamId: rosterFallback?.teamId ?? null,
        resolvedTeamId: teamId,
        sourcePosition: cw.position ?? null,
        resolvedPosition: position,
        sourceAge: cw.age ?? null,
        resolvedAge: values.age ?? current?.age ?? null,
      };
    }
    if (current) {
      if (current.retired) continue;
      const updates: Record<string, any> = {
        capHit: values.capHit,
        yearsRemaining: values.yearsRemaining,
      };
      if (position !== "Unknown" && (current.position === "Unknown" || current.position !== position)) {
        updates.position = position;
      }
      if (teamId && current.teamId !== teamId) updates.teamId = teamId;
      if (values.age && current.age !== values.age) updates.age = values.age;

      await db.update(playersTable).set(updates).where(eq(playersTable.id, current.id));
      updatedEntries.push(key);
      updated++;
      continue;
    }

    await db.insert(playersTable).values({
      id,
      name:           key,
      position:       values.position,
      teamId:         values.teamId,
      age:            values.age,
      capHit:         values.capHit,
      yearsRemaining: values.yearsRemaining,
      hasNmc:         false,
      hasNtc:         false,
    }).onConflictDoNothing();

    newEntries.push(key);
    added++;
  }

  const total = await db.select({ id: playersTable.id }).from(playersTable);
  const clearedCacheKeys: string[] = [];
  if (redis) {
    for (const key of SYNC_CACHE_KEYS) {
      await redis.del(key).then(() => clearedCacheKeys.push(key)).catch(() => {});
    }
  }

  return NextResponse.json({
    ok: true,
    added,
    updated,
    total: total.length,
    newEntries,
    updatedEntries,
    metadataMisses: metadataMisses.slice(0, 25),
    metadataMissCount: metadataMisses.length,
    watch,
    clearedCacheKeys,
  });
}
