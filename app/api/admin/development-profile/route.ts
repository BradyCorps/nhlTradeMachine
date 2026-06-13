import { NextResponse } from "next/server";
import { eq } from "drizzle-orm";
import { db } from "@/app/db/client";
import { players as playersTable } from "@/app/db/schema";
import { isAuthorized } from "@/app/lib/admin-auth";
import { calcDevelopmentProfile } from "@/app/lib/development-profile";
import {
  buildDevelopmentInputForDbPlayer,
  confidenceFromAdapterCoverage,
  diagnoseDevelopmentInput,
  type ExternalTimelineRow,
  fetchCachedNhlSkaterTimelineRowsForPlayer,
  parseExternalTimelineRows,
} from "@/app/lib/development-sources";

export const dynamic = "force-dynamic";

const DEFAULT_SEASON_COUNT = 3;
const MAX_SEASON_COUNT = 6;

interface DevelopmentProfileDiagnosticRequest {
  id?: string;
  name?: string;
  seasons?: number;
  externalTimelineRows?: ExternalTimelineRow[];
}

const clampSeasonCount = (value: unknown): number => {
  const seasonCountParam = Number(value ?? DEFAULT_SEASON_COUNT);
  return Number.isFinite(seasonCountParam)
    ? Math.min(Math.max(Math.trunc(seasonCountParam), 1), MAX_SEASON_COUNT)
    : DEFAULT_SEASON_COUNT;
};

async function buildDiagnosticResponse(args: DevelopmentProfileDiagnosticRequest) {
  const id = args.id?.trim();
  const name = args.name?.trim();
  const seasonCount = clampSeasonCount(args.seasons);
  const externalTimelineRows = Array.isArray(args.externalTimelineRows) ? args.externalTimelineRows : [];
  const externalTimeline = parseExternalTimelineRows(externalTimelineRows);

  if (!id && !name) {
    return NextResponse.json({ error: "Provide id or name" }, { status: 400 });
  }

  const rows = id
    ? await db.select().from(playersTable).where(eq(playersTable.id, id)).catch(() => [])
    : await db.select().from(playersTable).where(eq(playersTable.name, name!)).catch(() => []);
  const player = rows[0];

  if (!player) {
    return NextResponse.json({ error: "Player not found", id, name }, { status: 404 });
  }

  const timelineResult = await fetchCachedNhlSkaterTimelineRowsForPlayer({
    playerId: player.id,
    seasonCount,
  }).catch(() => ({
    matches: [],
    cache: {
      enabled: false,
      timelineCacheHit: false,
      summaryCacheHits: [],
      liveFetches: [],
    },
  }));
  const timelineMatches = timelineResult.matches;

  const input = buildDevelopmentInputForDbPlayer(player, timelineMatches, {
    externalSnapshots: externalTimeline.snapshots,
  });
  if (!input) {
    return NextResponse.json({
      error: "Could not build development input",
      player: {
        id: player.id,
        name: player.name,
        position: player.position,
        age: player.age,
      },
      externalTimeline,
      sourceCoverage: {
        nhlTimelineSeasons: timelineMatches.map(match => match.seasonId),
        cache: timelineResult.cache,
      },
    }, { status: 422 });
  }

  const diagnostics = diagnoseDevelopmentInput(input);
  const profile = calcDevelopmentProfile(input);

  return NextResponse.json({
    player: {
      id: player.id,
      name: player.name,
      position: player.position,
      secondaryPosition: player.secondaryPosition,
      age: player.age,
      draftYear: player.draftYear,
      draftOverall: player.draftOverall,
      prospectPtsPace: player.prospectPtsPace,
    },
    developmentInput: input,
    developmentProfile: profile,
    diagnostics,
    externalTimeline: {
      acceptedRows: externalTimeline.snapshots.length,
      rejectedRows: externalTimeline.rejected.length,
      snapshots: externalTimeline.snapshots,
      rejected: externalTimeline.rejected,
    },
    sourceCoverage: {
      adapterCoverage: confidenceFromAdapterCoverage(input),
      nhlTimelineSeasons: timelineMatches.map(match => match.seasonId),
      nhlTimelineRows: timelineMatches.length,
      externalTimelineRows: externalTimeline.snapshots.length,
      externalRejectedRows: externalTimeline.rejected.length,
      cache: timelineResult.cache,
      seasonCountRequested: seasonCount,
      tradeValueChanged: false,
    },
  });
}

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const url = new URL(req.url);
  return buildDiagnosticResponse({
    id: url.searchParams.get("id") ?? undefined,
    name: url.searchParams.get("name") ?? undefined,
    seasons: Number(url.searchParams.get("seasons") ?? DEFAULT_SEASON_COUNT),
  });
}

export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json().catch(() => null) as DevelopmentProfileDiagnosticRequest | null;
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  return buildDiagnosticResponse(body);
}
