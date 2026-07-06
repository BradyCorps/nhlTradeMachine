import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { nhlSnapshots } from "@/app/db/schema";
import { ensureNhlSnapshotTable } from "@/app/db/ensure-schema";
import { requireAdmin } from "@/app/lib/admin-auth";
import { SEASON } from "@/app/lib/season-config";
import {
  fetchPlayerLanding,
  fetchEdgeDetail,
  missingPaths,
  LANDING_REQUIRED_PATHS,
  EDGE_REQUIRED_PATHS,
  LANDING_URL,
  EDGE_URL,
} from "@/app/lib/nhl-player-feed";
import { capturePlayerSnapshots, rosterPlayerIds } from "@/app/lib/nhl-feed-capture";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// A stable, always-rostered probe player for the drift check.
const CANARY_PLAYER_ID = 8478402; // Connor McDavid
const seasonId = () => Number(SEASON.nhleSeasonId);

// GET /api/admin/nhl-feed — source health check. Probes both endpoints
// with a canary player and reports any required field that vanished, so
// an upstream contract change (v1 → v2 someday) is caught in the admin
// panel instead of silently corrupting the feed.
export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const [landing, edge] = await Promise.all([
    fetchPlayerLanding(CANARY_PLAYER_ID),
    fetchEdgeDetail(CANARY_PLAYER_ID, seasonId()),
  ]);

  const landingMissing = landing.raw ? missingPaths(landing.raw, LANDING_REQUIRED_PATHS) : [...LANDING_REQUIRED_PATHS];
  const edgeMissing = edge.raw ? missingPaths(edge.raw, EDGE_REQUIRED_PATHS) : [...EDGE_REQUIRED_PATHS];

  let snapshotCount: number | null = null;
  try {
    await ensureNhlSnapshotTable();
    const rows = await db.select({ id: nhlSnapshots.id }).from(nhlSnapshots);
    snapshotCount = rows.length;
  } catch { /* table unavailable */ }

  return NextResponse.json({
    checkedAt: new Date().toISOString(),
    season: seasonId(),
    landing: {
      url: LANDING_URL(CANARY_PLAYER_ID),
      reachable: landing.raw != null,
      parsed: landing.facts != null,
      missingFields: landingMissing,
      ok: landing.facts != null && landingMissing.length === 0,
    },
    edge: {
      url: EDGE_URL(CANARY_PLAYER_ID, seasonId()),
      reachable: edge.raw != null,
      parsed: edge.facts != null,
      missingFields: edgeMissing,
      ok: edge.facts != null && edgeMissing.length === 0,
    },
    snapshotCount,
  });
}

// POST /api/admin/nhl-feed — capture snapshots into the historical feed.
// Body: { team?: "EDM" } to sync one team's current roster, or
//       { ids?: number[] } for explicit NHL player ids.
export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => ({})) as { team?: string; ids?: number[] };
  let ids: number[] = Array.isArray(body.ids) ? body.ids.filter((n) => Number.isFinite(n)) : [];
  if (ids.length === 0 && body.team) ids = await rosterPlayerIds(body.team);
  if (ids.length === 0) {
    return NextResponse.json({ error: "Provide { team } or { ids } — no players resolved." }, { status: 400 });
  }

  const result = await capturePlayerSnapshots(ids.slice(0, 40), seasonId());
  return NextResponse.json({ ok: true, season: seasonId(), ...result });
}
