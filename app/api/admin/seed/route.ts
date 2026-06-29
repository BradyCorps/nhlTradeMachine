import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/admin-auth";
import { seedPlayersTable } from "@/app/lib/league-seed";
import { redis } from "@/app/lib/redis";
import { clearTeamCaches } from "@/app/lib/team-cache";

export const dynamic = "force-dynamic";

const SEED_CACHE_KEYS = [
  "cache:contracts",
  "cache:contracts:v2",
];

// POST /api/admin/seed — load the canonical contract/FA baseline into the players
// table. Idempotent: inserts missing players, fills curated FA marks on existing
// seed/sync rows, and never touches editor-curated rows.
export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  try {
    const result = await seedPlayersTable();
    const cleared: string[] = [];
    cleared.push(...await clearTeamCaches(redis));
    if (redis) {
      for (const key of SEED_CACHE_KEYS) {
        await redis.del(key).then(() => cleared.push(key)).catch(() => {});
      }
    }
    return NextResponse.json({ ok: true, ...result, clearedCacheKeys: cleared });
  } catch (e: any) {
    console.error("[admin/seed] failed:", e);
    return NextResponse.json({ error: e?.message ?? "Seed failed" }, { status: 500 });
  }
}
