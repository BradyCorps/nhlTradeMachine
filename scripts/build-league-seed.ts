// ============================================================
// build-league-seed.ts — generate app/data/league-seed.json
//
// One canonical baseline of contract + free-agency facts for the players table,
// the single source of truth the read path joins onto live NHL identity.
//
// Sources (committed, environment-agnostic):
//   1. app/data/contracts.bundled.json — last-known cap/years/NMC/NTC per player
//   2. app/lib/free-agent-seed.ts       — the known 2026 UFA/RFA class
//
// The output is committed so the DB can be seeded in any environment (incl. ones
// where the CapWages scrape 403s). Re-run each off-season after refreshing the
// two sources:  npx tsx scripts/build-league-seed.ts
// ============================================================

import fs from "fs";
import path from "path";
import bundled from "../app/data/contracts.bundled.json";
import { FREE_AGENT_SEED_LIST_2026 } from "../app/lib/free-agent-seed";
import { SEASON } from "../app/lib/season-config";
import { makePlayerId as makeId } from "../app/lib/player-identity";

const OFFSEASON_YEAR = Number(SEASON.label.slice(0, 4)); // 2026

interface SeedRow {
  id: string;
  name: string;
  position: string;            // best-effort; live NHL identity refines at read
  capHit: number;
  yearsRemaining: number;
  hasNmc: boolean;
  hasNtc: boolean;
  expiryStatus: "UFA" | "RFA" | null;
  expiryYear: number | null;
  /** ISO birthdate, when known — the canonical age source (app/lib/player-age.ts). */
  birthDate?: string | null;
}

// Known contract-fact corrections where the bundled snapshot is wrong (e.g. the
// old CapWages age-math floored a back-loaded extension to 1 year), or where a
// verified birthdate closes the DATA-01 "static age" gap for a player whose
// stale bundled row would otherwise read through unchanged. Baked into the
// seed so the fix lives as data, not as a read-time code override.
const SEED_CORRECTIONS: Record<string, Partial<SeedRow>> = {
  "Mark Scheifele": { yearsRemaining: 5 },         // 8yr/2023→2031; age math gave 1
  "Elias Pettersson": { position: "C" },           // disambiguates from the VAN D-man below
  // DATA-01 canaries: both ELCs ran through 2025-26 and expired. The
  // Blackhawks issued qualifying offers in June 2026 that lapsed July 15,
  // 2026 unverified; both remain unsigned Group 2 RFAs as of August 2026
  // (thehockeynews.com, bleachernation.com). Birthdates from Wikipedia/
  // Hockey-Reference. expiryStatus/expiryYear are also set by the FA-class
  // merge below; birthDate is not, so it is corrected here.
  "Kevin Korchinski":  { birthDate: "2004-06-21" },
  "Ethan Del Mastro":  { birthDate: "2003-01-15" },
};

// Same-name players collapse to a single makeId, and the bundled snapshot
// only carries one row per name — the second player's contract is simply
// missing upstream. Hand-curated rows with position-salted ids restore
// them; the read path's Name__POS contract keys pick the right one per
// roster player.
const SAME_NAME_ADDITIONS: SeedRow[] = [
  {
    id: "eliaspettersson-d",
    name: "Elias Pettersson",
    position: "D",                                  // VAN defenseman (EP25)
    capHit: 0.913,                                  // $913,333 — year 3 of 3
    yearsRemaining: 1,                              // 2026-27 is the final year
    hasNmc: false,
    hasNtc: false,
    expiryStatus: "RFA",
    expiryYear: 2027,
  },
];

const byId = new Map<string, SeedRow>();

// 1. Baseline contract facts from the bundled snapshot.
for (const [name, raw] of Object.entries(bundled as Record<string, any>)) {
  if (name.includes("__")) continue;          // skip any alias keys
  if (!raw || typeof raw.capHit !== "number") continue;
  const id = makeId(name);
  if (!id || byId.has(id)) continue;
  byId.set(id, {
    id,
    name,
    position: typeof raw.position === "string" && raw.position ? raw.position : "Unknown",
    capHit: raw.capHit,
    yearsRemaining: typeof raw.yearsRemaining === "number" ? raw.yearsRemaining : 1,
    hasNmc: Boolean(raw.hasNMC),
    hasNtc: Boolean(raw.hasNTC),
    expiryStatus: raw.expiryStatus === "UFA" || raw.expiryStatus === "RFA" ? raw.expiryStatus : null,
    expiryYear: typeof raw.expiryYear === "number" ? raw.expiryYear : null,
  });
}

// 2. Overlay the known 2026 free-agent class. Existing rows get their expiry set;
//    FA-class players missing from bundled.json get a minimal pending-FA row.
let faSet = 0;
let faAdded = 0;
for (const { name, status } of FREE_AGENT_SEED_LIST_2026) {
  const id = makeId(name);
  if (!id) continue;
  const existing = byId.get(id);
  if (existing) {
    existing.expiryStatus = status;
    existing.expiryYear = OFFSEASON_YEAR;
    faSet++;
  } else {
    byId.set(id, {
      id,
      name,
      position: "Unknown",
      capHit: 0,
      yearsRemaining: 0,
      hasNmc: false,
      hasNtc: false,
      expiryStatus: status,
      expiryYear: OFFSEASON_YEAR,
    });
    faAdded++;
  }
}

// 3. Apply known contract-fact corrections.
let corrected = 0;
for (const [name, patch] of Object.entries(SEED_CORRECTIONS)) {
  const row = byId.get(makeId(name));
  if (row) {
    Object.assign(row, patch);
    corrected++;
  }
}

// 4. Same-name duplicate rows (position-salted ids, never collide with makeId rows).
for (const row of SAME_NAME_ADDITIONS) {
  if (!byId.has(row.id)) byId.set(row.id, row);
}

const rows = Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name));

const out = {
  generatedAt: new Date().toISOString(),
  season: SEASON.label,
  offseasonYear: OFFSEASON_YEAR,
  count: rows.length,
  players: rows,
};

const outPath = path.join(process.cwd(), "app/data/league-seed.json");
fs.writeFileSync(outPath, JSON.stringify(out, null, 2) + "\n", "utf-8");

console.log(
  `[build-league-seed] wrote ${rows.length} rows → ${outPath}\n` +
  `  bundled rows: ${byId.size - faAdded}\n` +
  `  FA-class expiry set on existing: ${faSet}\n` +
  `  FA-class new rows added: ${faAdded}\n` +
  `  contract corrections applied: ${corrected}`,
);
