import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { ensureSeasonSnapshotTables } from "@/app/db/ensure-schema";
import { requireAdmin } from "@/app/lib/admin-auth";
import { getCachedRoster } from "@/app/lib/cached-roster";
import {
  buildSeasonSnapshotRows,
  seasonSnapshotContext,
  seasonSnapshotInventory,
  writeSeasonSnapshots,
  type SnapshotSeasonKind,
} from "@/app/lib/season-snapshot";
import { snapshotDate } from "@/app/lib/valuation-snapshot";

export const dynamic = "force-dynamic";

/** What season history the database holds. */
export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  await ensureSeasonSnapshotTables();
  return NextResponse.json({ inventory: await seasonSnapshotInventory(db) });
}

/**
 * Idempotent backfill. Body: `{ "season": "completed" | "projected" | "both" }`
 * (default both). Re-running never rewrites a stored row. Runs where the
 * Turso credentials and the cached roster already are — the admin panel —
 * not from a codespace script that would default to `file:local.db`.
 */
export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => ({})) as { season?: string };
  const kinds: SnapshotSeasonKind[] = body.season === "completed"
    ? ["completed"]
    : body.season === "projected"
      ? ["projected"]
      : ["completed", "projected"];

  await ensureSeasonSnapshotTables();
  const { value: roster } = await getCachedRoster();
  const asOf = snapshotDate();
  const results: Record<string, unknown> = {};
  for (const kind of kinds) {
    const ctx = seasonSnapshotContext(kind, { asOf, capCeiling: roster.capCeiling });
    const rows = buildSeasonSnapshotRows(roster.players as any[], roster.navMap, ctx);
    const written = await writeSeasonSnapshots(db, rows);
    results[ctx.season] = {
      coverage: ctx.coverage,
      statsSeason: ctx.statsSeason,
      seasonGamesObserved: ctx.seasonGamesObserved,
      contractSeason: ctx.contractSeason,
      asOf: ctx.asOf,
      modelVersion: ctx.modelVersion,
      built: { players: rows.players.length, teams: rows.teams.length, skipped: rows.skipped.length },
      written,
    };
  }
  return NextResponse.json({ ok: true, rosterGeneratedAt: roster.generatedAt, results });
}
