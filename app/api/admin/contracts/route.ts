import { NextResponse } from "next/server";
import { scrapeCapWages } from "@/app/services/scraper";
import { db } from "@/app/db/client";
import { players as playersTable } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { isAuthorized } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

const CONTRACT_OVERRIDES: Record<string, { yearsRemaining?: number; position?: string }> = {
  "Quinton Byfield": { position: "C" },
  "Mark Scheifele":  { yearsRemaining: 5 },
};

// CapWages returns teamSlug like "winnipeg_jets" — map to DB tricode
const SLUG_TO_TRICODE: Record<string, string> = {
  anaheim_ducks:        "ANA",
  boston_bruins:        "BOS",
  buffalo_sabres:       "BUF",
  calgary_flames:       "CGY",
  carolina_hurricanes:  "CAR",
  chicago_blackhawks:   "CHI",
  colorado_avalanche:   "COL",
  columbus_blue_jackets:"CBJ",
  dallas_stars:         "DAL",
  detroit_red_wings:    "DET",
  edmonton_oilers:      "EDM",
  florida_panthers:     "FLA",
  los_angeles_kings:    "LAK",
  minnesota_wild:       "MIN",
  montreal_canadiens:   "MTL",
  nashville_predators:  "NSH",
  new_jersey_devils:    "NJD",
  new_york_islanders:   "NYI",
  new_york_rangers:     "NYR",
  ottawa_senators:      "OTT",
  philadelphia_flyers:  "PHI",
  pittsburgh_penguins:  "PIT",
  seattle_kraken:       "SEA",
  san_jose_sharks:      "SJS",
  "st._louis_blues":    "STL",
  st_louis_blues:       "STL",
  tampa_bay_lightning:  "TBL",
  toronto_maple_leafs:  "TOR",
  utah_hockey_club:     "UTA",
  utah_mammoth:         "UTA",
  vancouver_canucks:    "VAN",
  vegas_golden_knights: "VGK",
  washington_capitals:  "WSH",
  winnipeg_jets:        "WPG",
};

function makeId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// GET /api/admin/contracts — full audit table
// ?scrape=1 adds live CapWages data (slower, enables delta column + SYNC)
export async function GET(req: Request) {
  const url    = new URL(req.url);
  const doScrape = url.searchParams.get("scrape") === "1";

  const [dbRows, scraped] = await Promise.all([
    db.select().from(playersTable).catch((e) => { console.error("[contracts GET] DB error:", e); return [] as typeof playersTable.$inferSelect[]; }),
    doScrape ? scrapeCapWages() : Promise.resolve({} as Record<string, any>),
  ]);

  const dbMap = new Map(dbRows.map(r => [r.name, r]));

  const allNames = new Set<string>();
  dbRows.forEach(r => allNames.add(r.name));
  if (doScrape) {
    Object.keys(scraped).filter(n => !n.includes("__")).forEach(n => allNames.add(n));
  }

  const scrapedRaw: Record<string, { capHit: number; yearsRemaining: number }> = {};

  const rows = Array.from(allNames).sort().map(name => {
    const b  = dbMap.get(name);
    const cw = scraped[name];
    const ov = CONTRACT_OVERRIDES[name];

    const dbYears    = b?.yearsRemaining ?? null;
    const scrapedYears = cw?.yearsRemaining && cw.yearsRemaining > 0 ? cw.yearsRemaining : null;
    const baseYears  = ov?.yearsRemaining ?? scrapedYears ?? dbYears ?? 1;

    const scrapedCap = cw?.capHit ?? null;
    const baseCap    = scrapedCap ?? b?.capHit ?? null;

    const delta = (dbYears != null && scrapedYears != null)
      ? Math.abs(dbYears - scrapedYears) : null;

    if (cw?.capHit) scrapedRaw[name] = { capHit: cw.capHit, yearsRemaining: scrapedYears ?? 1 };

    return {
      name,
      team:          cw?.teamSlug  ?? null,
      position:      ov?.position  ?? cw?.position ?? null,
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
  });
}

// POST /api/admin/contracts
// body: { name, yearsRemaining?, capHit?, hasNMC?, hasNTC?, clear? }
// Upserts to Turso DB — persists across Vercel deployments
export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json();
  const { name, yearsRemaining, capHit, hasNMC, hasNTC, clear, extensionCapHit, extensionYears } = body as {
    name:              string;
    yearsRemaining?:   number;
    capHit?:           number;
    hasNMC?:           boolean;
    hasNTC?:           boolean;
    clear?:            boolean;
    extensionCapHit?:  number | null;
    extensionYears?:   number | null;
  };

  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const id = makeId(name);

  if (clear) {
    await db.delete(playersTable).where(eq(playersTable.id, id));
    return NextResponse.json({ ok: true, cleared: true });
  }

  const hasUpdate = yearsRemaining != null || capHit != null || hasNMC != null || hasNTC != null
    || extensionCapHit !== undefined || extensionYears !== undefined;
  if (!hasUpdate) {
    return NextResponse.json({ error: "provide at least one field to update" }, { status: 400 });
  }

  const existing = await db.select().from(playersTable).where(eq(playersTable.id, id));

  if (existing.length > 0) {
    const updates: Record<string, any> = {};
    if (yearsRemaining  != null)     updates.yearsRemaining  = yearsRemaining;
    if (capHit          != null)     updates.capHit          = capHit;
    if (hasNMC          != null)     updates.hasNmc          = hasNMC;
    if (hasNTC          != null)     updates.hasNtc          = hasNTC;
    if (extensionCapHit !== undefined) updates.extensionCapHit = extensionCapHit;
    if (extensionYears  !== undefined) updates.extensionYears  = extensionYears;
    await db.update(playersTable).set(updates).where(eq(playersTable.id, id));
    return NextResponse.json({ ok: true, destination: "db-update", name });
  } else {
    await db.insert(playersTable).values({
      id,
      name,
      position:        "Unknown",
      capHit:          capHit         ?? 0.925,
      yearsRemaining:  yearsRemaining ?? 1,
      hasNmc:          hasNMC         ?? false,
      hasNtc:          hasNTC         ?? false,
      extensionCapHit: extensionCapHit ?? null,
      extensionYears:  extensionYears  ?? null,
    });
    return NextResponse.json({ ok: true, destination: "db-insert", name });
  }
}

// PUT /api/admin/contracts — bulk-import scraped players + update changed contracts
// body: { players: Record<string, { capHit, yearsRemaining, secondaryPosition }> }
export async function PUT(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  let body: { players?: Record<string, any> } = {};
  try { body = await req.json(); } catch { /* no body */ }

  let source: Record<string, any> = body.players ?? {};
  if (Object.keys(source).length === 0) {
    source = await scrapeCapWages();
  }

  const existingRows = await db.select().from(playersTable);
  const existingMap  = new Map(existingRows.map(r => [r.id, r]));

  let added   = 0;
  let updated = 0;
  const newEntries:     string[] = [];
  const updatedEntries: string[] = [];

  for (const [key, cw] of Object.entries(source)) {
    if (key.includes("__")) continue;
    const id = makeId(key);
    if (!cw.capHit || cw.capHit < 0.5 || cw.capHit > 16) continue;

    const teamId = SLUG_TO_TRICODE[cw.teamSlug as string] ?? null;
    const existing = existingMap.get(id);

    if (!existing) {
      await db.insert(playersTable).values({
        id,
        name:              key,
        position:          cw.position ?? "Unknown",
        capHit:            cw.capHit,
        yearsRemaining:    cw.yearsRemaining > 0 ? cw.yearsRemaining : 1,
        hasNmc:            false,
        hasNtc:            false,
        teamId,
        secondaryPosition: cw.secondaryPosition ?? null,
      }).onConflictDoNothing();
      newEntries.push(key);
      added++;
    } else {
      const capChanged   = Math.abs((existing.capHit ?? 0) - cw.capHit) > 0.05;
      const yearsChanged = Math.abs((existing.yearsRemaining ?? 1) - (cw.yearsRemaining ?? 1)) >= 1;
      const teamChanged  = existing.teamId == null && teamId != null;
      if (capChanged || yearsChanged || teamChanged) {
        await db.update(playersTable)
          .set({
            capHit:         cw.capHit,
            yearsRemaining: cw.yearsRemaining > 0 ? cw.yearsRemaining : 1,
            ...(teamId != null ? { teamId } : {}),
            ...(cw.secondaryPosition != null ? { secondaryPosition: cw.secondaryPosition } : {}),
          })
          .where(eq(playersTable.id, id));
        updatedEntries.push(key);
        updated++;
      }
    }
  }

  const total = await db.select({ id: playersTable.id }).from(playersTable);
  return NextResponse.json({ ok: true, added, updated, total: total.length, newEntries, updatedEntries });
}
