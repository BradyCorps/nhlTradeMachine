import { NextResponse } from "next/server";
import { isAuthorized } from "@/app/lib/admin-auth";
import { precomputeRosterCache } from "@/app/lib/cached-roster";
import { precomputeDocketCache } from "@/app/lib/cached-docket";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Runs after the nightly NHL capture. It refreshes the roster + NAV aggregate
// before readers arrive, so a cache flush or expired payload is paid by cron
// instead of the first Teams or Armchair GM visit.
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const cronOk = Boolean(cronSecret) && auth === `Bearer ${cronSecret}`;
  if (!cronOk && !(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const roster = await precomputeRosterCache();
  const docket = await precomputeDocketCache().catch((error) => ({
    cached: false,
    error: error instanceof Error ? error.message : String(error),
  }));
  return NextResponse.json({ ok: true, roster, docket });
}
