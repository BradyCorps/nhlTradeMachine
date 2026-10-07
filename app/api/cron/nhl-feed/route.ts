import { NextResponse } from "next/server";
import { SEASON } from "@/app/lib/season-config";
import { TEAMS_DB } from "@/app/lib/db";
import { capturePlayerSnapshots, rosterPlayerIds } from "@/app/lib/nhl-feed-capture";
import { captureGoalieEdgeBoards, captureGoalieEdgeDetail } from "@/app/lib/goalie-edge";
import { activeGoalieIdsForTeams } from "@/app/lib/nhl-active-players";
import { isAuthorized } from "@/app/lib/admin-auth";
import { db } from "@/app/db/client";
import { runStrandCheckpointCapture } from "@/app/lib/strand-checkpoint-cron.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// GET /api/cron/nhl-feed — nightly snapshot capture (vercel.json cron).
// Four teams per night, rotating on an 8-day cycle, so the whole league
// lands in nhl_snapshots weekly-ish without ever busting one invocation.
export async function GET(req: Request) {
  const cronSecret = process.env.CRON_SECRET;
  const auth = req.headers.get("authorization");
  const cronOk = Boolean(cronSecret) && auth === `Bearer ${cronSecret}`;
  if (!cronOk && !(await isAuthorized(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Season profile evolution stage. It reports under its own key and can never fail
  // the feed capture below. `?only=strand` runs just this stage (bounded first run /
  // manual retry); `?strandEnd=1` records the END checkpoint after the final game;
  // `?strandDryRun=1` counts what would be written and writes nothing.
  const params = new URL(req.url).searchParams;
  const strandOptions = { seasonComplete: params.get("strandEnd") === "1", dryRun: params.get("strandDryRun") === "1" };
  if (params.get("only") === "strand") {
    return NextResponse.json({ ok: true, only: "strand", strandCheckpoints: await runStrandCheckpointCapture({ db: db as any, ...strandOptions }) });
  }

  const teams = TEAMS_DB.map((t) => t.id).sort();
  const cycleDay = Math.floor(Date.now() / 86_400_000) % 8;
  const group = teams.slice(cycleDay * 4, cycleDay * 4 + 4);

  const season = Number(SEASON.apiSeasonId);
  const idLists = await Promise.all(group.map(rosterPlayerIds));
  const ids = idLists.flat();
  const result = ids.length > 0
    ? await capturePlayerSnapshots(ids, season)
    : { requested: 0, landingStored: 0, edgeStored: 0, failures: [], day: "" };

  // League-wide goalie EDGE boards — one cheap capture per night (PA3)
  const goalieBoards = await captureGoalieEdgeBoards(SEASON.apiSeasonId);

  // Per-goalie EDGE detail, on the same 8-day team rotation as the skater
  // snapshots above — roughly twenty requests a night rather than all ~110
  // at once, so it cannot be the thing that busts the invocation.
  const goalieDetail = await captureGoalieEdgeDetail(
    SEASON.apiSeasonId,
    { playerIds: activeGoalieIdsForTeams(group) },
  ).catch((e: any) => ({ error: String(e?.message ?? e) }));

  // Last, so the existing captures keep their time budget; the stage bounds itself.
  const strandCheckpoints = await runStrandCheckpointCapture({ db: db as any, ...strandOptions });

  return NextResponse.json({ ok: true, cycleDay, teams: group, season, gameType: 2, goalieBoards, goalieDetail, strandCheckpoints, ...result });
}
