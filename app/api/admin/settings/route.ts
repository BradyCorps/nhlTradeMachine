import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { siteSettings } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { SEASON } from "@/app/lib/season-config";
import { redis } from "@/app/lib/redis";
import { isAuthorized } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

const TEAM_CACHE_KEYS = ["cache:league:teams:v1", "cache:trade:teams:v1"];

export async function GET() {
  const rows = await db.select().from(siteSettings).catch(() => []);
  const m = new Map(rows.map(r => [r.key, r.value]));
  return NextResponse.json({
    capCeiling: m.has("cap_ceiling") ? parseFloat(m.get("cap_ceiling")!) : null,
    capFloor:   m.has("cap_floor")   ? parseFloat(m.get("cap_floor")!)   : null,
    defaults:   { capCeiling: SEASON.capCeiling, capFloor: SEASON.capFloor, label: SEASON.label },
  });
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = await req.json() as {
    action?:     "clear_cache";
    capCeiling?: number | null;
    capFloor?:   number | null;
  };

  // Dedicated cache-bust action
  if (body.action === "clear_cache") {
    if (redis) {
      const cache = redis;
      await Promise.all(TEAM_CACHE_KEYS.map(key => cache.del(key).catch(() => {})));
    }
    return NextResponse.json({ ok: true, cleared: true });
  }

  const upsert = async (key: string, val: number | null | undefined) => {
    if (val === undefined) return;
    if (val === null) {
      await db.delete(siteSettings).where(eq(siteSettings.key, key));
    } else {
      const existing = await db.select().from(siteSettings).where(eq(siteSettings.key, key));
      if (existing.length > 0) {
        await db.update(siteSettings).set({ value: String(val) }).where(eq(siteSettings.key, key));
      } else {
        await db.insert(siteSettings).values({ key, value: String(val) });
      }
    }
  };

  await Promise.all([
    upsert("cap_ceiling", body.capCeiling),
    upsert("cap_floor",   body.capFloor),
  ]);

  if (redis) {
    const cache = redis;
    await Promise.all(TEAM_CACHE_KEYS.map(key => cache.del(key).catch(() => {})));
  }
  return NextResponse.json({ ok: true });
}
