import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { siteSettings } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { SEASON } from "@/app/lib/season-config";
import { redis } from "@/app/lib/redis";
import { requireAdmin } from "@/app/lib/admin-auth";
import { isValidCapFloor, maxCapCeiling, parseStoredCapCeiling, parseStoredCapFloor } from "@/app/lib/cap-settings";
import { clearTeamCaches } from "@/app/lib/team-cache";

export const dynamic = "force-dynamic";

const MAX_CAP_CEILING = maxCapCeiling();

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const rows = await db.select().from(siteSettings).catch(() => []);
  const m = new Map(rows.map(r => [r.key, r.value]));
  return NextResponse.json({
    capCeiling: parseStoredCapCeiling(m.get("cap_ceiling"), SEASON.capCeiling),
    capFloor:   parseStoredCapFloor(m.get("cap_floor"), SEASON.capFloor),
    defaults:   { capCeiling: SEASON.capCeiling, capFloor: SEASON.capFloor, label: SEASON.label },
  });
}

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  const body = await req.json() as {
    action?:     "clear_cache";
    capCeiling?: number | null;
    capFloor?:   number | null;
  };

  // Dedicated cache-bust action
  if (body.action === "clear_cache") {
    await clearTeamCaches(redis, db);
    return NextResponse.json({ ok: true, cleared: true });
  }

  const validateCapValue = (label: string, value: number | null | undefined) => {
    if (value === undefined || value === null) return null;
    if (!isValidCapFloor(value)) {
      return `${label} must be a positive number`;
    }
    if (label === "capCeiling" && value > MAX_CAP_CEILING) {
      return `capCeiling must be no greater than ${MAX_CAP_CEILING}`;
    }
    return null;
  };
  const capError = validateCapValue("capCeiling", body.capCeiling)
    ?? validateCapValue("capFloor", body.capFloor);
  if (capError) {
    return NextResponse.json({ error: capError }, { status: 400 });
  }
  if (body.capCeiling != null && body.capFloor != null && body.capFloor > body.capCeiling) {
    return NextResponse.json({ error: "capFloor cannot exceed capCeiling" }, { status: 400 });
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

  try {
    await Promise.all([
      upsert("cap_ceiling", body.capCeiling),
      upsert("cap_floor",   body.capFloor),
    ]);
  } catch (e) {
    const msg = e instanceof Error ? e.message : "unknown error";
    return NextResponse.json({ error: `Failed to save cap settings: ${msg}` }, { status: 500 });
  }

  if (redis) {
    const nextCapCeiling = body.capCeiling ?? SEASON.capCeiling;
    await clearTeamCaches(redis, db, [nextCapCeiling]);
  }
  return NextResponse.json({ ok: true });
}
