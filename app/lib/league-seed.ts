// ============================================================
// league-seed.ts — load the canonical contract/FA baseline into the players table
//
// The players table is the single source of truth the roster read path joins onto
// live NHL identity. This loader populates it from the committed
// app/data/league-seed.json (built by scripts/build-league-seed.ts), so the DB is
// never empty — on first boot, after an admin reset, or in an environment where
// the live CapWages scrape 403s.
//
// Provenance rules:
//   • Missing player        → inserted as source='seed' (full baseline row).
//   • Existing 'editor' row  → never touched (hand-curated wins).
//   • Existing seed/sync row → only fills a NULL expiry (curated FA class), never
//                              clobbers cap/years/team/position the sync owns.
// ============================================================

import { db as defaultDb } from "@/app/db/client";
import { players as playersTable } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { ensurePlayerColumns, ensurePlayerTable } from "@/app/db/ensure-schema";

type Database = typeof defaultDb;

export interface LeagueSeedRow {
  id: string;
  name: string;
  position: string;
  capHit: number;
  yearsRemaining: number;
  hasNmc: boolean;
  hasNtc: boolean;
  expiryStatus: "UFA" | "RFA" | null;
  expiryYear: number | null;
}

interface LeagueSeedFile {
  generatedAt: string;
  season: string;
  offseasonYear: number;
  count: number;
  players: LeagueSeedRow[];
}

let cached: LeagueSeedFile | null = null;

export function loadLeagueSeed(): LeagueSeedFile {
  if (cached) return cached;
  try {
    const fs = require("fs");
    const path = require("path");
    const file = path.join(process.cwd(), "app/data/league-seed.json");
    cached = JSON.parse(fs.readFileSync(file, "utf-8")) as LeagueSeedFile;
  } catch (e: any) {
    console.error("[league-seed] load failed:", e?.message);
    cached = { generatedAt: "", season: "", offseasonYear: 0, count: 0, players: [] };
  }
  return cached;
}

export interface SeedResult {
  inserted: number;
  filled: number;
  skipped: number;
  total: number;
}

// Idempotent baseline load. Safe to run repeatedly; never clobbers editor rows.
export async function seedPlayersTable(database: Database = defaultDb): Promise<SeedResult> {
  await ensurePlayerTable(database);
  await ensurePlayerColumns(database);

  const seed = loadLeagueSeed();
  const existing = await database
    .select({ id: playersTable.id, source: playersTable.source, expiryStatus: playersTable.expiryStatus })
    .from(playersTable)
    .catch(() => [] as { id: string; source: string | null; expiryStatus: string | null }[]);
  const existingById = new Map(existing.map((r) => [r.id, r]));

  let inserted = 0;
  let filled = 0;
  let skipped = 0;
  const toInsert: LeagueSeedRow[] = [];

  for (const row of seed.players) {
    const ex = existingById.get(row.id);
    if (!ex) {
      toInsert.push(row);
      continue;
    }
    if (ex.source === "editor") {
      skipped++;
      continue;
    }
    // Fill the curated FA class onto a row that doesn't already carry an expiry.
    if (ex.expiryStatus == null && row.expiryStatus != null) {
      await database
        .update(playersTable)
        .set({ expiryStatus: row.expiryStatus, expiryYear: row.expiryYear })
        .where(eq(playersTable.id, row.id))
        .catch(() => {});
      filled++;
    } else {
      skipped++;
    }
  }

  // Batch the inserts so a full reset-and-seed stays a handful of round-trips.
  const CHUNK = 100;
  for (let i = 0; i < toInsert.length; i += CHUNK) {
    const chunk = toInsert.slice(i, i + CHUNK).map((row) => ({
      id: row.id,
      name: row.name,
      position: row.position || "Unknown",
      capHit: row.capHit,
      yearsRemaining: row.yearsRemaining,
      hasNmc: row.hasNmc,
      hasNtc: row.hasNtc,
      expiryStatus: row.expiryStatus,
      expiryYear: row.expiryYear,
      source: "seed",
    }));
    await database.insert(playersTable).values(chunk).onConflictDoNothing().catch(async () => {
      // Fall back to per-row inserts if a batch trips a constraint.
      for (const v of chunk) {
        await database.insert(playersTable).values(v).onConflictDoNothing().catch(() => {});
      }
    });
    inserted += chunk.length;
  }

  return { inserted, filled, skipped, total: seed.players.length };
}
