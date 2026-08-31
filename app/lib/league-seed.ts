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
import { plausibleAnchor } from "@/app/lib/contract-term";
import { canonicalNameSlug } from "@/app/lib/player-identity";

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
  /** ISO birthdate, when known — the canonical age source (app/lib/player-age.ts). */
  birthDate?: string | null;
  /**
   * Set only on an individually fact-checked `SEED_CORRECTIONS` row (never
   * the bulk `FREE_AGENT_SEED_LIST_2026` merge). Bypasses the "don't send a
   * signed player back to the market" guard below, which otherwise trusts
   * whatever `expiryYear` a row already has to decide the contract "runs
   * on." That guard is right in general — but it was written to be fooled
   * by exactly the DATA-01/03 bug it was protecting against: Kevin
   * Korchinski's real players-table row (a live NHL numeric id, not this
   * seed's id — see the name-fallback match above) carried a *plausible but
   * wrong* `expiryYear` of 2029, re-derived at some past ingest from his
   * stale, never-decremented `yearsRemaining`. The guard read that as "a
   * real contract running to 2029" and refused every correction. A row
   * verified by hand against a live source is trusted over the anchor the
   * guard is trying to protect.
   */
  forceExpiry?: boolean;
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
  /**
   * Players the curated class still calls free agents whose contract runs past
   * this offseason. Not stamped — and reported, because the right fix is to
   * take them off the list rather than to keep catching them here.
   */
  staleFaClass: string[];
}

// Idempotent baseline load. Safe to run repeatedly; never clobbers editor rows.
export async function seedPlayersTable(database: Database = defaultDb): Promise<SeedResult> {
  await ensurePlayerTable(database);
  await ensurePlayerColumns(database);

  const seed = loadLeagueSeed();
  const existing = await database
    .select({
      id: playersTable.id,
      name: playersTable.name,
      source: playersTable.source,
      expiryStatus: playersTable.expiryStatus,
      expiryYear: playersTable.expiryYear,
      hasNmc: playersTable.hasNmc,
      hasNtc: playersTable.hasNtc,
      birthDate: playersTable.birthDate,
    })
    .from(playersTable)
    .catch(() => [] as { id: string; name: string; source: string | null; expiryStatus: string | null; expiryYear: number | null; hasNmc: boolean | null; hasNtc: boolean | null; birthDate: string | null }[]);
  const existingById = new Map(existing.map((r) => [r.id, r]));
  // A seed row's id is a name-derived slug (`makePlayerId`); a real DB row for
  // the same person can carry a live NHL numeric id from a contract sync
  // instead — Kevin Korchinski's row is "8483466", not "kevinkorchinski". An
  // id-only lookup silently misses every such player: the fix sits in the
  // committed seed forever, correctly reasoned about, and never reaches the
  // row the app actually reads. Match by canonical name as a fallback — the
  // same trust level draft-reconcile.ts already uses for exactly this kind
  // of live-identity collision — so a correction lands on whichever row is
  // real, not only on a row whose id happens to match the seed's guess.
  const existingByNameSlug = new Map<string, (typeof existing)[number]>();
  for (const r of existing) {
    if (!r.name) continue;
    const slug = canonicalNameSlug(r.name);
    if (slug && !existingByNameSlug.has(slug)) existingByNameSlug.set(slug, r);
  }

  let inserted = 0;
  let filled = 0;
  let skipped = 0;
  /** Rows the class list still calls free agents but whose deal runs on. */
  const staleFaClass: string[] = [];
  const toInsert: LeagueSeedRow[] = [];

  for (const row of seed.players) {
    const ex = existingById.get(row.id) ?? existingByNameSlug.get(canonicalNameSlug(row.name));
    if (!ex) {
      toInsert.push(row);
      continue;
    }
    if (ex.source === "editor") {
      skipped++;
      continue;
    }
    // Reconcile the canonical baseline facts the sync can't supply:
    //   • FA class (expiryStatus/expiryYear) onto a row missing an expiry, and
    //   • NMC/NTC clauses — the CapWages scrape carries none, so the seed is the
    //     only clause source. A sync-created row defaults the clauses to false and
    //     would otherwise lose Ekblad's NTC, Crosby's NMC, etc. forever.
    const set: Record<string, unknown> = {};
    // ── Do not send a signed player back to the market ──────────
    // The curated 2026 free-agent class is a snapshot, and players in it keep
    // signing: Alex Tuch is on it and is under contract in Washington; Collin
    // Graf is on it and re-signed in San Jose. Stamping UFA/RFA onto a row
    // whose contract runs past this offseason zeroes his cap hit and prices
    // him as a nought-year rental — the phantom-bargain bug, arriving through
    // a button rather than a scrape.
    //
    // The anchor settles it: a row whose expiry year is later than the
    // offseason being seeded is signed, whatever the class list remembers.
    // Editor rows never reach here at all.
    const anchor = plausibleAnchor(ex.expiryYear, seed.offseasonYear);
    const contractRunsOn = !row.forceExpiry && anchor != null && anchor > seed.offseasonYear;
    if (ex.expiryStatus == null && row.expiryStatus != null && !contractRunsOn) {
      set.expiryStatus = row.expiryStatus;
      set.expiryYear = row.expiryYear;
    } else if (contractRunsOn && row.expiryStatus != null && ex.expiryStatus == null) {
      staleFaClass.push(ex.id);
    }
    if (row.hasNmc && !ex.hasNmc) set.hasNmc = true;
    if (row.hasNtc && !ex.hasNtc) set.hasNtc = true;
    // Fill a missing birthdate the same way as expiry: a real fact the sync
    // can't supply, never overwriting one already on the row.
    if (ex.birthDate == null && row.birthDate != null) set.birthDate = row.birthDate;

    if (Object.keys(set).length > 0) {
      // Write to the REAL row's id — `ex.id`, not the seed's guessed
      // `row.id` — so a name-fallback match updates the row that exists
      // rather than silently no-op'ing on an id nothing has.
      await database
        .update(playersTable)
        .set(set)
        .where(eq(playersTable.id, ex.id))
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
      birthDate: row.birthDate ?? null,
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

  return { inserted, filled, skipped, total: seed.players.length, staleFaClass };
}
