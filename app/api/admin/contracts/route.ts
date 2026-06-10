import { NextResponse } from "next/server";
import { scrapeCapWages } from "@/app/services/scraper";
import { db } from "@/app/db/client";
import { players as playersTable } from "@/app/db/schema";
import { eq } from "drizzle-orm";

const CONTRACT_OVERRIDES: Record<string, { yearsRemaining?: number; position?: string }> = {
  "Quinton Byfield": { position: "C" },

};

function makeId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
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
      capHit:         playersTable.capHit,
      yearsRemaining: playersTable.yearsRemaining,
      hasNmc:         playersTable.hasNmc,
      hasNtc:         playersTable.hasNtc,
    }).from(playersTable).catch((e: any) => {
      dbError = e?.message ?? String(e);
      console.error("[Admin Contracts] DB read failed:", dbError);
      return [] as { name: string; capHit: number; yearsRemaining: number; hasNmc: boolean | null; hasNtc: boolean | null }[];
    }),
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

// PUT /api/admin/contracts — bulk-import scraped players not yet in DB
// body: { players: Record<string, { capHit, yearsRemaining }> }
export async function PUT(req: Request) {
  let body: { players?: Record<string, any> } = {};
  try { body = await req.json(); } catch { /* no body */ }

  let source: Record<string, any> = body.players ?? {};
  if (Object.keys(source).length === 0) {
    source = await scrapeCapWages();
  }

  const existing = await db.select({ id: playersTable.id }).from(playersTable);
  const existingIds = new Set(existing.map(r => r.id));

  let added = 0;
  const newEntries: string[] = [];

  for (const [key, cw] of Object.entries(source)) {
    if (key.includes("__")) continue;
    const id = makeId(key);
    if (existingIds.has(id)) continue;
    // Match scraper's CAP_MAX (CBA max = 20% of $104M ceiling); old 16 silently
    // dropped Kaprizov-tier contracts from bulk imports
    if (!cw.capHit || cw.capHit < 0.5 || cw.capHit > 20.8) continue;

    await db.insert(playersTable).values({
      id,
      name:           key,
      position:       "Unknown",
      capHit:         cw.capHit,
      yearsRemaining: cw.yearsRemaining > 0 ? cw.yearsRemaining : 1,
      hasNmc:         false,
      hasNtc:         false,
    }).onConflictDoNothing();

    newEntries.push(key);
    added++;
  }

  const total = await db.select({ id: playersTable.id }).from(playersTable);
  return NextResponse.json({ ok: true, added, total: total.length, newEntries });
}
