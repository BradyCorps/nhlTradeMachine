import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/admin-auth";
import { cardGravityFromV4 } from "@/app/lib/card-payload";
import diagnosticArtifact from "@/app/lib/gravity-v4/fixtures/diagnostic-artifact.json";
import { isGravityV4Enabled } from "@/app/lib/gravity-v4/feature-flag";
import { loadGravityProfileV4 } from "@/app/lib/gravity-v4/load-profile";

export const dynamic = "force-dynamic";

const DIAGNOSTIC_PLAYER_ID = "9999999";
const DIAGNOSTIC_SEASON = "2025-26";

/**
 * Schema/render diagnostic only. The zero-value fixture is explicitly allowed
 * here because this admin route never joins player data or valuation output.
 */
export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const url = new URL(req.url);
  const playerId = url.searchParams.get("id") ?? DIAGNOSTIC_PLAYER_ID;
  const season = url.searchParams.get("season") ?? DIAGNOSTIC_SEASON;
  const lookup = loadGravityProfileV4({
    playerId,
    season,
    position: "W",
    artifact: diagnosticArtifact,
    enabled: true,
    allowDiagnosticFixture: true,
  });

  return NextResponse.json({
    diagnosticOnly: true,
    publicFeatureEnabled: isGravityV4Enabled(),
    xnavIntegrationEnabled: false,
    fixtureContainsFittedValues: false,
    lookup,
    cardGravity: lookup.status === "ready"
      ? cardGravityFromV4(lookup.profile)
      : null,
  });
}
