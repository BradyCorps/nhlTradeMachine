import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/admin-auth";
import { getCachedRoster } from "@/app/lib/cached-roster";
import { buildLiveReleaseManifest } from "@/app/lib/live-release-manifest";
import { manifestIsPublishable, failedDomains } from "@/app/lib/release-manifest";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/admin/release-manifest — DATA-06's manifest, published for the
// first time. Reads the same cached roster every other route already reads
// (no extra heavy fetch) and reports roster/contracts/valuation/teamModel
// against live gates; stats/picks/fantasy/simulation are not yet wired to a
// live signal and read `degraded` with an explicit "no gates ran" warning
// rather than being asserted healthy by default — see live-release-manifest.ts.
export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const { value } = await getCachedRoster();
    const manifest = buildLiveReleaseManifest({
      players: value.players,
      generatedAt: value.generatedAt ?? null,
      capCeiling: value.capCeiling,
    });

    return NextResponse.json({
      ok: true,
      publishable: manifestIsPublishable(manifest),
      failedDomains: failedDomains(manifest),
      manifest,
    });
  } catch (e) {
    // An empty/missing manifest reads as "nothing to diagnose", which is the
    // one thing this endpoint must never claim when it could not build one.
    return NextResponse.json(
      { ok: false, error: e instanceof Error ? e.message : "could not build the release manifest" },
      { status: 500 },
    );
  }
}
