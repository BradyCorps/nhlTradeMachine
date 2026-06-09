import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { siteSettings } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { SEASON } from "@/app/lib/season-config";
import { redis } from "@/app/lib/redis";

export async function GET() {
  const rows = await db.select().from(siteSettings).catch(() => []);
  const m = new Map(rows.map(r => [r.key, r.value]));
  return NextResponse.json({
    capCeiling: m.has("cap_ceiling") ? parseFloat(m.get("cap_ceiling")!) : null,
    capFloor:   m.has("cap_floor")   ? parseFloat(m.get("cap_floor")!)   : null,
    defaults: { capCeiling: SEASON.capCeiling, capFloor: SEASON.capFloor, label: SEASON.label },
  });
}

export async function POST(req: Request) {
  const body = await req.json() as {
    capCeiling?: number | null;
    capFloor?:   number | null;
  };

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

  // Bust the teams cache so next page load picks up new ceiling
  if (redis) await redis.del("cache:teams").catch(() => {});

  return NextResponse.json({ ok: true });
}
