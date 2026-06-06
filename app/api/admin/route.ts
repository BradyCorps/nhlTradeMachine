import { NextResponse } from "next/server";
import { scrapeCapWages } from "@/app/services/scraper";
import path from "path";
import fs from "fs";

const BUNDLED_PATH = path.join(process.cwd(), "app/data/contracts.bundled.json");
const ADMIN_PATH   = path.join(process.cwd(), "app/data/contracts.admin.json");

const CONTRACT_OVERRIDES: Record<string, { yearsRemaining?: number; position?: string }> = {
  "Quinton Byfield": { position: "C" },
  
};

function loadJSON(p: string): Record<string, any> {
  try { return JSON.parse(fs.readFileSync(p, "utf8")); }
  catch { return {}; }
}

// GET /api/admin/contracts — full audit table
export async function GET(req: Request) {
  const bundled = loadJSON(BUNDLED_PATH);
  const admin   = loadJSON(ADMIN_PATH);

  // Skip live scrape unless ?scrape=1 — bundled+admin loads instantly
  const url    = new URL(req.url);
  const scraped = url.searchParams.get("scrape") === "1"
    ? await scrapeCapWages()
    : {};

  const allNames = new Set<string>();
  Object.keys(bundled).forEach(n => allNames.add(n));
  Object.keys(scraped).filter(n => !n.includes("__")).forEach(n => allNames.add(n));

  const rows = Array.from(allNames).sort().map(name => {
    const b  = bundled[name];
    const cw = scraped[name];
    const ov = CONTRACT_OVERRIDES[name];
    const ad = admin[name];

    const scrapedYears = cw?.yearsRemaining && cw.yearsRemaining > 0 ? cw.yearsRemaining : null;
    const baseYears    = ov?.yearsRemaining ?? scrapedYears ?? b?.yearsRemaining ?? 1;
    const finalYears   = ad?.yearsRemaining ?? baseYears;

    const scrapedCap   = cw?.capHit ?? null;
    const baseCap      = scrapedCap ?? b?.capHit ?? null;
    const finalCap     = ad?.capHit ?? baseCap;

    const delta = (b?.yearsRemaining != null && scrapedYears != null)
      ? Math.abs(b.yearsRemaining - scrapedYears) : null;

    return {
      name,
      team:           cw?.teamSlug ?? null,
      position:       ov?.position ?? cw?.position ?? null,
      finalYears,
      finalCap,
      bundledYears:   b?.yearsRemaining  ?? null,
      scrapedYears,
      adminYears:     ad?.yearsRemaining ?? null,
      adminCap:       ad?.capHit         ?? null,
      overrideYears:  ov?.yearsRemaining ?? null,
      hasNMC:         b?.hasNMC  ?? false,
      hasNTC:         b?.hasNTC  ?? false,
      expiryStatus:   cw?.expiryStatus   ?? null,
      delta,
      source: ad
        ? "admin"
        : ov?.yearsRemaining ? "override"
        : scrapedYears       ? "scraper"
        : b?.yearsRemaining  ? "bundled"
        : "default",
    };
  });

  rows.sort((a, b) => (b.delta ?? -1) - (a.delta ?? -1) || a.name.localeCompare(b.name));

  // Include raw scraped map when scrape=1 so client can pass it back for sync
  const scrapedRaw: Record<string, { capHit: number; yearsRemaining: number }> = {};
  if (url.searchParams.get("scrape") === "1") {
    for (const [k, v] of Object.entries(scraped)) {
      if (!k.includes("__") && v.capHit) scrapedRaw[k] = { capHit: v.capHit, yearsRemaining: v.yearsRemaining };
    }
  }

  return NextResponse.json({ generatedAt: new Date().toISOString(), total: rows.length, contracts: rows, scrapedRaw });
}

// POST /api/admin/contracts
// body: { name, yearsRemaining?, capHit?, hasNMC?, hasNTC?, clear? }
//
// Routing logic:
//   - Player already in bundled.json → write to contracts.admin.json (overlay)
//   - Player NOT in bundled.json     → write directly to contracts.bundled.json (new entry)
//   - clear=true                     → remove from admin.json; if name only exists in
//                                      bundled because we added it, leave it there
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

  const admin   = loadJSON(ADMIN_PATH);
  const bundled = loadJSON(BUNDLED_PATH);
  const inBundled = name in bundled;

  if (clear) {
    delete admin[name];
    fs.writeFileSync(ADMIN_PATH, JSON.stringify(admin, null, 2) + "\n", "utf8");
    return NextResponse.json({ ok: true, cleared: true });
  }

  const entry: Record<string, any> = {};
  if (yearsRemaining != null) entry.yearsRemaining = yearsRemaining;
  if (capHit         != null) entry.capHit         = capHit;
  if (hasNMC         != null) entry.hasNMC         = hasNMC;
  if (hasNTC         != null) entry.hasNTC         = hasNTC;

  if (Object.keys(entry).length === 0) {
    return NextResponse.json({ error: "provide at least one field to update" }, { status: 400 });
  }

  if (inBundled) {
    // Existing player — overlay via admin.json so bundled stays clean
    admin[name] = { ...(admin[name] ?? {}), ...entry };
    fs.writeFileSync(ADMIN_PATH, JSON.stringify(admin, null, 2) + "\n", "utf8");
    return NextResponse.json({ ok: true, destination: "admin", saved: admin[name] });
  } else {
    // New player — write directly into bundled.json so they become a first-class entry
    // that survives a cache flush and is visible to the full contract pipeline.
    bundled[name] = {
      capHit:         entry.capHit         ?? 0.925,
      yearsRemaining: entry.yearsRemaining ?? 1,
      hasNMC:         entry.hasNMC         ?? false,
      hasNTC:         entry.hasNTC         ?? false,
      canRetain:      entry.hasNMC         ? false : true,
    };
    const sorted = Object.fromEntries(Object.entries(bundled).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(BUNDLED_PATH, JSON.stringify(sorted, null, 2) + "\n", "utf8");
    return NextResponse.json({ ok: true, destination: "bundled", saved: bundled[name] });
  }
}

// PUT /api/admin/contracts — bulk-import scraped players not yet in bundled.json
// Body: { players: Record<string, { capHit, yearsRemaining }> } (client passes data
// it already fetched via GET?scrape=1 so no second live scrape is needed server-side)
export async function PUT(req: Request) {
  const bundled = loadJSON(BUNDLED_PATH);

  let body: { players?: Record<string, any> } = {};
  try { body = await req.json(); } catch { /* no body */ }

  // Use client-supplied data if present; fall back to a fresh scrape only as last resort
  let source: Record<string, any> = body.players ?? {};
  if (Object.keys(source).length === 0) {
    source = await scrapeCapWages();
  }

  let added = 0;
  const newEntries: string[] = [];

  for (const [key, cw] of Object.entries(source)) {
    if (key.includes("__")) continue;
    if (key in bundled) continue;
    if (!cw.capHit || cw.capHit < 0.5 || cw.capHit > 16) continue;

    bundled[key] = {
      capHit:         cw.capHit,
      yearsRemaining: cw.yearsRemaining > 0 ? cw.yearsRemaining : 1,
      hasNMC:         false,
      hasNTC:         false,
      canRetain:      true,
    };
    newEntries.push(key);
    added++;
  }

  if (added > 0) {
    const sorted = Object.fromEntries(Object.entries(bundled).sort(([a], [b]) => a.localeCompare(b)));
    fs.writeFileSync(BUNDLED_PATH, JSON.stringify(sorted, null, 2) + "\n", "utf8");
  }

  return NextResponse.json({ ok: true, added, total: Object.keys(bundled).length, newEntries });
}
