import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { ensureSeasonSnapshotTables } from "@/app/db/ensure-schema";
import { requireAdmin } from "@/app/lib/admin-auth";
import { getCachedRoster } from "@/app/lib/cached-roster";
import {
  captureSeasonSnapshotBatch,
  SeasonSnapshotBatchCaptureError,
  seasonSnapshotBatchInventory,
  seasonSnapshotContext,
  seasonSnapshotInventory,
  type SnapshotSeasonKind,
} from "@/app/lib/season-snapshot";
import { snapshotDate } from "@/app/lib/valuation-snapshot";

export const dynamic = "force-dynamic";

/** What season history the database holds. */
export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  await ensureSeasonSnapshotTables();
  return NextResponse.json({
    batches: await seasonSnapshotBatchInventory(db),
    legacyInventory: await seasonSnapshotInventory(db, { unbatchedOnly: true }),
  });
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
  try {
    const results: Record<string, unknown> = {};
    for (const kind of kinds) {
      const ctx = seasonSnapshotContext(kind, { asOf, capCeiling: roster.capCeiling });
      const result = await captureSeasonSnapshotBatch(db as any, {
        snapshotKind: kind,
        context: ctx,
        players: roster.players as any[],
        navMap: roster.navMap,
        createdBy: "admin-session",
        createdAction: "POST /api/admin/season-snapshots",
      });
      results[ctx.season] = {
        batch: result.batch,
        built: result.rows,
        idempotent: result.idempotent,
      };
    }
    return NextResponse.json({ ok: true, rosterGeneratedAt: roster.generatedAt, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Season snapshot capture failed.";
    return NextResponse.json({
      error: message,
      ...(error instanceof SeasonSnapshotBatchCaptureError ? { batchId: error.batchId } : {}),
    }, { status: 409 });
  }
}
