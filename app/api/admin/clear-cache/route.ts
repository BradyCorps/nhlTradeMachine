import { NextResponse } from "next/server";
import { redis } from "@/app/lib/redis";
import { isAuthorized } from "@/app/lib/admin-auth";
import {
  DEVELOPMENT_NHL_SUMMARY_CACHE_KEY,
  DEVELOPMENT_TIMELINE_CACHE_KEY,
} from "@/app/lib/development-sources";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cleared: string[] = [];
  if (redis) {
    for (const key of [
      "cache:league:teams:v1",
      "cache:trade:teams:v1",
      "cache:contracts",
      "cache:contracts:v2",
      "cache:nhl_skater_summary_stats",
      DEVELOPMENT_NHL_SUMMARY_CACHE_KEY,
      DEVELOPMENT_TIMELINE_CACHE_KEY,
    ]) {
      await redis.del(key).then(() => cleared.push(key)).catch(() => {});
    }
  }
  return NextResponse.json({ ok: true, cleared, message: "caches cleared — reload Armchair GM" });
}
