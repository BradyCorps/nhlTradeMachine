import { NextResponse } from "next/server";
import { redis } from "@/app/lib/redis";
import { isAuthorized } from "@/app/lib/admin-auth";
import {
  DEVELOPMENT_NHL_SUMMARY_CACHE_KEY,
  DEVELOPMENT_TIMELINE_CACHE_KEY,
} from "@/app/lib/development-sources";
import { PROSPECT_ENRICHMENT_CACHE_KEY } from "@/app/lib/prospect-enrichment";

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
      "cache:pointshares",
      "cache:pointshares:v2",
      "cache:mp_skaters",
      "cache:mp_goalies",
      "cache:nhl_skater_summary_stats",
      "cache:nhl_goalie_summary_stats",
      "cache:prospect_enrichment:v1",
      PROSPECT_ENRICHMENT_CACHE_KEY,
      DEVELOPMENT_NHL_SUMMARY_CACHE_KEY,
      DEVELOPMENT_TIMELINE_CACHE_KEY,
    ]) {
      await redis.del(key).then(() => cleared.push(key)).catch(() => {});
    }
  }
  return NextResponse.json({ ok: true, cleared, message: "caches cleared — reload Armchair GM" });
}
