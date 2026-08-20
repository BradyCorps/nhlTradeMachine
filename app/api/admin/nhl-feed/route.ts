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
import { capturePlayerSnapshots, rosterPlayerIds, backfillSkaterEdge, skaterEdgeCoverage } from "@/app/lib/nhl-feed-capture";
import { captureGoalieEdgeDetail, goalieEdgeCoverage } from "@/app/lib/goalie-edge";

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

  // Goalie EDGE detail is captured on an 8-day rotation and read by the
  // dossier panel, which renders nothing when a goalie has no row. That
  // failure mode is silent on the player page, so the standing coverage
  // is reported here instead — "0 of 144" is the whole diagnosis.
  const goalieEdge = await goalieEdgeCoverage(SEASON.nhleSeasonId);
  // Skater EDGE feeds the gravity model's inputs; its coverage is the reason a
  // gravity flip would render sparsely, so it is surfaced alongside the goalie
  // number rather than inferred from empty player pages.
  const skaterEdge = await skaterEdgeCoverage(SEASON.nhleSeasonId);

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
    goalieEdge,
    skaterEdge,
  });
}

// How many goalies one invocation attempts. `maxDuration` is 60s and a
// single EDGE request can take the full 8s timeout, so 40 ids at six in
// flight leaves headroom even in the worst case. The response carries
// `nextOffset`, and the admin page loops on it — from the operator's
// side one button press still covers the league.
const GOALIE_BATCH = 40;
const GOALIE_CONCURRENCY = 6;
// Skaters fetch TWO endpoints each (landing + edge), so a smaller batch keeps
// one invocation inside maxDuration; the response carries nextOffset and the
// admin page walks it, so one button press still covers all ~1,200 skaters.
const SKATER_BATCH = 40;
const SKATER_CONCURRENCY = 6;

// POST /api/admin/nhl-feed — capture snapshots into the historical feed.
// Body: { team?: "EDM" }   sync one team's current roster (landing + EDGE)
//       { ids?: number[] } explicit NHL player ids
//       { goalies: true }  goalie EDGE detail backfill — the whole league,
//                          one batch per call; pass back `nextOffset` to
//                          resume, `teams` to scope, `discover` to include
//                          goalies the bundled snapshot predates.
//       { skaters: true }  skater EDGE (+ landing) backfill — same shape as
//                          the goalie one; the inputs the gravity model reads.
export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const body = await req.json().catch(() => ({})) as {
    team?: string;
    ids?: number[];
    goalies?: boolean;
    skaters?: boolean;
    teams?: string[];
    offset?: number;
    limit?: number;
    discover?: boolean;
  };

  const explicitIds: number[] = Array.isArray(body.ids) ? body.ids.filter((n) => Number.isFinite(n)) : [];
  const scopedTeams = Array.isArray(body.teams) && body.teams.length > 0
    ? body.teams
    : body.team ? [body.team] : undefined;

  if (body.skaters) {
    const result = await backfillSkaterEdge(SEASON.nhleSeasonId, {
      playerIds: explicitIds.length > 0 ? explicitIds : undefined,
      teams: scopedTeams,
      discover: body.discover === true,
      offset: Number.isFinite(body.offset) ? Number(body.offset) : 0,
      limit: Math.min(Number.isFinite(body.limit) ? Number(body.limit) : SKATER_BATCH, SKATER_BATCH),
      concurrency: SKATER_CONCURRENCY,
    });
    return NextResponse.json({ ok: true, season: seasonId(), mode: "skater-edge", ...result });
  }

  if (body.goalies) {
    const result = await captureGoalieEdgeDetail(SEASON.nhleSeasonId, {
      playerIds: explicitIds.length > 0 ? explicitIds : undefined,
      teams: scopedTeams,
      discover: body.discover === true,
      offset: Number.isFinite(body.offset) ? Number(body.offset) : 0,
      limit: Math.min(Number.isFinite(body.limit) ? Number(body.limit) : GOALIE_BATCH, GOALIE_BATCH),
      concurrency: GOALIE_CONCURRENCY,
    });
    return NextResponse.json({ ok: true, season: seasonId(), mode: "goalie-detail", ...result });
  }

  let ids: number[] = explicitIds;
  if (ids.length === 0 && body.team) ids = await rosterPlayerIds(body.team);
  if (ids.length === 0) {
    return NextResponse.json({ error: "Provide { team }, { ids } or { goalies: true } — no players resolved." }, { status: 400 });
  }

  const result = await capturePlayerSnapshots(ids.slice(0, 40), seasonId());
  return NextResponse.json({ ok: true, season: seasonId(), ...result });
}
