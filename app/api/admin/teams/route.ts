import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { teams } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { TEAMS_DB } from "@/app/lib/db";
import { redis } from "@/app/lib/redis";
import { requireAdmin } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

const TEAM_CACHE_KEYS = ["cache:league:teams:v1", "cache:trade:teams:v1"];

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const dbRows = await db.select().from(teams).catch((e) => { console.error("[teams GET] DB error:", e); return []; });
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
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  const body = await req.json() as {
    id:               string;
    phaseOverride?:   string | null;
    standingOverride?: number | null;
  };

  const existing = await db.select().from(teams).where(eq(teams.id, body.id)).catch((e) => { console.error("[teams POST] DB error:", e); return []; });

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

  if (redis) {
    const cache = redis;
    await Promise.all(TEAM_CACHE_KEYS.map(key => cache.del(key).catch(() => {})));
  }
  return NextResponse.json({ ok: true });
}
