import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { teams as teamsTable } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { TEAMS_DB } from "@/app/lib/db";
import { redis } from "@/app/lib/redis";

export async function GET() {
  const rows = await db.select().from(teamsTable).catch(() => []);
  const rowMap = new Map(rows.map(r => [r.id, r]));

  const teams = TEAMS_DB.map(t => {
    const row = rowMap.get(t.id);
    return {
      id:               t.id,
      name:             t.name,
      fallbackPhase:    t.phase,
      fallbackStanding: t.standing,
      phaseOverride:    row?.phaseOverride    ?? null,
      standingOverride: row?.standingOverride ?? null,
    };
  });

  return NextResponse.json({ teams });
}

export async function POST(req: Request) {
  const body = await req.json() as {
    id:               string;
    phaseOverride?:    string | null;
    standingOverride?: number | null;
  };

  const { id, phaseOverride, standingOverride } = body;
  if (!id) return NextResponse.json({ error: "id required" }, { status: 400 });

  const existing = await db.select().from(teamsTable).where(eq(teamsTable.id, id));

  if (existing.length > 0) {
    await db.update(teamsTable)
      .set({
        ...(phaseOverride    !== undefined && { phaseOverride:    phaseOverride    ?? null }),
        ...(standingOverride !== undefined && { standingOverride: standingOverride ?? null }),
      })
      .where(eq(teamsTable.id, id));
  } else {
    const base = TEAMS_DB.find(t => t.id === id);
    await db.insert(teamsTable).values({
      id,
      name:             base?.name ?? id,
      phaseOverride:    phaseOverride    ?? null,
      standingOverride: standingOverride ?? null,
    });
  }

  if (redis) await redis.del("cache:teams").catch(() => {});
  return NextResponse.json({ ok: true, id });
}
