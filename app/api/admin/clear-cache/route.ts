import { NextResponse } from "next/server";
import { redis } from "@/app/lib/redis";
import { requireAdmin } from "@/app/lib/admin-auth";
import {
  DEVELOPMENT_NHL_SUMMARY_CACHE_KEY,
  DEVELOPMENT_TIMELINE_CACHE_KEY,
} from "@/app/lib/development-sources";
import { PROSPECT_ENRICHMENT_CACHE_KEY } from "@/app/lib/prospect-enrichment";
import { clearTeamCaches } from "@/app/lib/team-cache";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  const cleared: string[] = [];
  if (redis) {
    cleared.push(...await clearTeamCaches(redis));
    for (const key of [
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
