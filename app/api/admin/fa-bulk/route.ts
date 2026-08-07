import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { players as playersTable } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/app/lib/admin-auth";
import { ensurePlayerColumns, ensurePlayerTable } from "@/app/db/ensure-schema";
import { SEASON } from "@/app/lib/season-config";
import { redis } from "@/app/lib/redis";
import { clearTeamCaches } from "@/app/lib/team-cache";

export const dynamic = "force-dynamic";

const VALID = ["UFA", "RFA", "SIGNED", "EXCLUDE"] as const;
type BulkStatus = (typeof VALID)[number];
const OFFSEASON_YEAR = Number(SEASON.label.slice(0, 4));

const CACHE_KEYS = ["cache:contracts", "cache:contracts:v2"];

import { makePlayerId as makeId } from "@/app/lib/player-identity";

// POST /api/admin/fa-bulk — set free-agency status on player rows in bulk.
// Body: { names: string[] | string, status: "UFA"|"RFA"|"SIGNED"|"EXCLUDE" }
// Writes the players table (the single source of truth) with source='editor', so
// the marks survive a live sync. Creates a minimal row for names not yet in the DB.
export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    await ensurePlayerTable();
    await ensurePlayerColumns();
    const body = await req.json().catch(() => ({}));
    const status = body.status as BulkStatus;
    if (!VALID.includes(status)) {
      return NextResponse.json({ error: `status must be one of: ${VALID.join(", ")}` }, { status: 400 });
    }
    const rawList: string[] = Array.isArray(body.names)
      ? body.names.map((n: unknown) => String(n))
      : String(body.names ?? "").split(/[\n,]+/);
    const names = rawList.map((n) => n.trim()).filter(Boolean);
    if (names.length === 0) {
      return NextResponse.json({ error: "Provide at least one player name" }, { status: 400 });
    }

    const namesById = new Map<string, string>();
    const skipped: string[] = [];
    for (const name of names) {
      const id = makeId(name);
      if (!id) {
        skipped.push(`${name} — no usable player id`);
        continue;
      }
      const retained = namesById.get(id);
      if (retained) {
        skipped.push(`${name} — same player as ${retained}`);
        continue;
      }
      namesById.set(id, name);
    }
    if (namesById.size === 0) {
      return NextResponse.json({ error: "Provide at least one valid player name" }, { status: 400 });
    }

    // Field changes implied by the chosen status.
    const patch: Record<string, any> = { source: "editor" };
    if (status === "UFA" || status === "RFA") {
      patch.expiryStatus = status;
      patch.expiryYear = OFFSEASON_YEAR;
      patch.excludeFromRoster = false;
    } else if (status === "SIGNED") {
      patch.expiryStatus = null;
      patch.expiryYear = null;
      patch.excludeFromRoster = false;
    } else { // EXCLUDE
      patch.excludeFromRoster = true;
    }

    const { updated, created } = await db.transaction(async (tx) => {
      const existing = await tx.select({ id: playersTable.id }).from(playersTable);
      const existingIds = new Set(existing.map((row) => row.id));
      let updated = 0;
      let created = 0;

      for (const [id, name] of namesById) {
        if (existingIds.has(id)) {
          const written = await tx.update(playersTable).set(patch)
            .where(eq(playersTable.id, id))
            .returning({ id: playersTable.id });
          if (written.length !== 1) {
            throw new Error(`expected to update one player for ${id}; updated ${written.length}`);
          }
          updated += written.length;
          continue;
        }

        const inserted = await tx.insert(playersTable).values({
          id,
          name,
          position: "Unknown",
          capHit: status === "UFA" || status === "RFA" ? 0 : 0.925,
          yearsRemaining: status === "UFA" || status === "RFA" ? 0 : 1,
          expiryStatus: patch.expiryStatus ?? null,
          expiryYear: patch.expiryYear ?? null,
          excludeFromRoster: patch.excludeFromRoster ?? false,
          source: "editor",
        }).onConflictDoNothing()
          .returning({ id: playersTable.id });
        if (inserted.length !== 1) {
          throw new Error(`expected to create one player for ${id}; created ${inserted.length}`);
        }
        created += inserted.length;
      }

      return { updated, created };
    });

    await clearTeamCaches(redis, db);
    if (redis) for (const k of CACHE_KEYS) await redis.del(k).catch(() => {});
    return NextResponse.json({
      ok: true,
      status,
      updated,
      created,
      total: namesById.size,
      submitted: names.length,
      skipped,
    });
  } catch (e: any) {
    console.error("[admin/fa-bulk]", e);
    return NextResponse.json({ error: e?.message ?? "Bulk FA update failed" }, { status: 500 });
  }
}
