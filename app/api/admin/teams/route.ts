import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { teams } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { TEAMS_DB } from "@/app/lib/db";
import { redis } from "@/app/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  const dbRows = await db.select().from(teams).catch(() => []);
  const dbMap  = new Map(dbRows.map(r => [r.id, r]));

  const result = TEAMS_DB.map(t => {
    const row = dbMap.get(t.id);
    return {
      id:               t.id,
      name:             t.name,
      fallbackPhase:    t.phase,
      phaseOverride:    row?.phaseOverride    ?? null,
      fallbackStanding: t.standing,
      standingOverride: row?.standingOverride ?? null,
    };
  });

  return NextResponse.json({ teams: result });
}

export async function POST(req: Request) {
  const body = await req.json() as {
    id:               string;
    phaseOverride?:   string | null;
    standingOverride?: number | null;
  };

  const existing = await db.select().from(teams).where(eq(teams.id, body.id)).catch(() => []);

  const payload = {
    phaseOverride:    body.phaseOverride    ?? null,
    standingOverride: body.standingOverride ?? null,
  };

  if (existing.length > 0) {
    await db.update(teams).set(payload).where(eq(teams.id, body.id));
  } else {
    const teamMeta = TEAMS_DB.find(t => t.id === body.id);
    await db.insert(teams).values({
      id:   body.id,
      name: teamMeta?.name ?? body.id,
      ...payload,
    });
  }

  if (redis) await redis.del("cache:teams").catch(() => {});
  return NextResponse.json({ ok: true });
}
