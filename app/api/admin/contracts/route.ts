import { NextResponse } from "next/server";
import { scrapeCapWages } from "@/app/services/scraper";
import { db } from "@/app/db/client";
import { players as playersTable } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { TEAMS_DB } from "@/app/lib/db";

const CONTRACT_OVERRIDES: Record<string, { yearsRemaining?: number; position?: string }> = {
  "Quinton Byfield": { position: "C" },

};

const CW_TEAM_TO_ID: Record<string, string> = {
  anaheim_ducks: "ANA",
  boston_bruins: "BOS",
  buffalo_sabres: "BUF",
  calgary_flames: "CGY",
  carolina_hurricanes: "CAR",
  chicago_blackhawks: "CHI",
  colorado_avalanche: "COL",
  columbus_blue_jackets: "CBJ",
  dallas_stars: "DAL",
  detroit_red_wings: "DET",
  edmonton_oilers: "EDM",
  florida_panthers: "FLA",
  los_angeles_kings: "LAK",
  minnesota_wild: "MIN",
  montreal_canadiens: "MTL",
  nashville_predators: "NSH",
  new_jersey_devils: "NJD",
  new_york_islanders: "NYI",
  new_york_rangers: "NYR",
  ottawa_senators: "OTT",
  philadelphia_flyers: "PHI",
  pittsburgh_penguins: "PIT",
  san_jose_sharks: "SJS",
  seattle_kraken: "SEA",
  st_louis_blues: "STL",
  tampa_bay_lightning: "TBL",
  toronto_maple_leafs: "TOR",
  utah_mammoth: "UTA",
  utah_hockey_club: "UTA",
  vancouver_canucks: "VAN",
  vegas_golden_knights: "VGK",
  washington_capitals: "WSH",
  winnipeg_jets: "WPG",
};

function normalisePosition(pos: string | null | undefined): string | null {
  if (!pos || pos === "Unknown") return null;
  const first = pos.toUpperCase().split(",").map(p => p.trim()).filter(Boolean)[0];
  if (!first) return null;
  if (first.includes("G")) return "G";
  if (first.includes("D")) return "D";
  if (first.includes("C")) return "C";
  if (first.includes("W") || first.includes("L") || first.includes("R")) return "W";
  return first;
}

function teamIdFromSlug(slug: string | null | undefined): string | null {
  if (!slug) return null;
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
    }).from(playersTable).catch((e: any) => {
      dbError = e?.message ?? String(e);
      console.error("[Admin Contracts] DB read failed:", dbError);
      return [] as { name: string; position: string; teamId: string | null; capHit: number; yearsRemaining: number; hasNmc: boolean | null; hasNtc: boolean | null }[];
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

  const scrapedRaw: Record<string, { capHit: number; yearsRemaining: number; position?: string; teamSlug?: string }> = {};

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
// body: { name, yearsRemaining?, capHit?, hasNMC?, hasNTC?, clear? }
// Upserts to Turso DB — persists across Vercel deployments
export async function POST(req: Request) {
  const body = await req.json();
  const { name, yearsRemaining, capHit, hasNMC, hasNTC, clear } = body as {
    name:            string;
    yearsRemaining?: number;
    capHit?:         number;
    hasNMC?:         boolean;
    hasNTC?:         boolean;
    clear?:          boolean;
  };

  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const id = makeId(name);

  if (clear) {
    await db.delete(playersTable).where(eq(playersTable.id, id));
    return NextResponse.json({ ok: true, cleared: true });
  }

  if (yearsRemaining == null && capHit == null && hasNMC == null && hasNTC == null) {
    return NextResponse.json({ error: "provide at least one field to update" }, { status: 400 });
  }

  const existing = await db.select().from(playersTable).where(eq(playersTable.id, id));

  if (existing.length > 0) {
    const updates: Record<string, any> = {};
    if (yearsRemaining != null) updates.yearsRemaining = yearsRemaining;
    if (capHit         != null) updates.capHit         = capHit;
    if (hasNMC         != null) updates.hasNmc         = hasNMC;
    if (hasNTC         != null) updates.hasNtc         = hasNTC;
    await db.update(playersTable).set(updates).where(eq(playersTable.id, id));
    return NextResponse.json({ ok: true, destination: "db-update", name });
  } else {
    await db.insert(playersTable).values({
      id,
      name,
      position:       "Unknown",
      capHit:         capHit         ?? 0.925,
      yearsRemaining: yearsRemaining ?? 1,
      hasNmc:         hasNMC         ?? false,
      hasNtc:         hasNTC         ?? false,
    });
    return NextResponse.json({ ok: true, destination: "db-insert", name });
  }
}

// PUT /api/admin/contracts — sync scraped players into DB
// body: { players: Record<string, { capHit, yearsRemaining }> }
export async function PUT(req: Request) {
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
    capHit:         playersTable.capHit,
    yearsRemaining: playersTable.yearsRemaining,
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
    const position = normalisePosition(cw.position) ?? rosterFallback?.position ?? "Unknown";
    const teamId = teamIdFromSlug(cw.teamSlug) ?? rosterFallback?.teamId ?? null;
    if (!teamId) metadataMisses.push(key);
    const values = {
      position,
      teamId,
      capHit:         cw.capHit,
      yearsRemaining: cw.yearsRemaining > 0 ? cw.yearsRemaining : 1,
    };
    const current = existingById.get(id) ?? existingByName.get(id);
    if (watchNames.has(key.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, ""))) {
      watch[key] = {
        matchedExisting: Boolean(current),
        currentId: current?.id ?? null,
        sourceTeamSlug: cw.teamSlug ?? null,
        rosterFallbackTeamId: rosterFallback?.teamId ?? null,
        resolvedTeamId: teamId,
        sourcePosition: cw.position ?? null,
        resolvedPosition: position,
      };
    }
    if (current) {
      const updates: Record<string, any> = {
        capHit: values.capHit,
        yearsRemaining: values.yearsRemaining,
      };
      if (position !== "Unknown" && (current.position === "Unknown" || current.position !== position)) {
        updates.position = position;
      }
      if (teamId && current.teamId !== teamId) updates.teamId = teamId;

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
      capHit:         values.capHit,
      yearsRemaining: values.yearsRemaining,
      hasNmc:         false,
      hasNtc:         false,
    }).onConflictDoNothing();

    newEntries.push(key);
    added++;
  }

  const total = await db.select({ id: playersTable.id }).from(playersTable);
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
  });
}
