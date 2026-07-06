import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { tradeBlock, teams, players } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

const TRADE_BLOCK_STATUSES = new Set(["requested", "available", "untouchable"]);

import { makePlayerId as makeId } from "@/app/lib/player-identity";
import { ensureTradeBlockColumns } from "@/app/db/ensure-schema";

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const [entries, teamRows, playerRows] = await Promise.all([
    db.select().from(tradeBlock).catch((e) => { console.error("[trade-block GET] DB error:", e); return []; }),
    db.select().from(teams).catch((e) => { console.error("[trade-block GET] DB error:", e); return []; }),
    db.select({
      id:       players.id,
      name:     players.name,
      teamId:   players.teamId,
      position: players.position,
    }).from(players).catch((e) => { console.error("[trade-block GET] DB error:", e); return []; }),
  ]);
  const teamPhases = Object.fromEntries(teamRows.map(t => [t.id, t.phaseOverride]));
  const teamList = teamRows.map(t => ({ id: t.id, name: t.name })).sort((a, b) => a.id.localeCompare(b.id));
  return NextResponse.json({ entries, teamPhases, players: playerRows, teams: teamList });
}

async function upsertEntry(body: {
  id: string; name: string; teamId?: string | null;
  position?: string | null;
  status: string; note?: string | null;
}) {
  await ensureTradeBlockColumns().catch(() => {});
  const position = body.position?.trim() || null;
  // Position salts the entry id so two same-name players (both Elias
  // Petterssons) can hold independent trade-block entries.
  const entryId = makeId(body.name || body.id) + (position ? `-${position.toLowerCase()}` : "");
  if (!entryId) throw new Error("name is required");
  if (body.status === "clear") {
    await db.delete(tradeBlock).where(eq(tradeBlock.id, entryId)).catch(() => {});
    const legacyId = makeId(body.name || body.id);
    if (legacyId && legacyId !== entryId) {
      await db.delete(tradeBlock).where(eq(tradeBlock.id, legacyId)).catch(() => {});
    }
    if (body.id && body.id !== entryId) {
      await db.delete(tradeBlock).where(eq(tradeBlock.id, body.id)).catch(() => {});
    }
    return;
  }
  if (!TRADE_BLOCK_STATUSES.has(body.status)) throw new Error(`Invalid trade-block status: ${body.status}`);
  const existing = await db.select().from(tradeBlock).where(eq(tradeBlock.id, entryId)).catch(() => []);
  if (existing.length > 0) {
    await db.update(tradeBlock).set({
      name: body.name, teamId: body.teamId ?? null, position,
      status: body.status, note: body.note ?? null, updatedAt: Date.now(),
    }).where(eq(tradeBlock.id, entryId));
  } else {
    await db.insert(tradeBlock).values({
      id: entryId, name: body.name, teamId: body.teamId ?? null, position,
      status: body.status, note: body.note ?? null, updatedAt: Date.now(),
    });
  }
}

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  const body = await req.json() as
    | { id: string; name: string; teamId?: string | null; position?: string | null; status: string; note?: string | null }
    | Array<{ id: string; name: string; teamId?: string | null; position?: string | null; status: string; note?: string | null }>;

  // Bulk upsert
  if (Array.isArray(body)) {
    try {
      await Promise.all(body.map(upsertEntry));
    } catch (e: any) {
      return NextResponse.json({ error: e?.message ?? "Invalid trade block entry" }, { status: 400 });
    }
    return NextResponse.json({ ok: true, count: body.length });
  }

  try {
    await upsertEntry(body);
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Invalid trade block entry" }, { status: 400 });
  }
  return NextResponse.json({ ok: true });
}
