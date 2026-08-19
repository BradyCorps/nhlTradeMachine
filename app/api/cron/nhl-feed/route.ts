import { NextResponse } from "next/server";
import { SEASON } from "@/app/lib/season-config";
import { TEAMS_DB } from "@/app/lib/db";
import { capturePlayerSnapshots, rosterPlayerIds } from "@/app/lib/nhl-feed-capture";
import { captureGoalieEdgeBoards, captureGoalieEdgeDetail } from "@/app/lib/goalie-edge";
import { activeGoalieIdsForTeams } from "@/app/lib/nhl-active-players";
import { isAuthorized } from "@/app/lib/admin-auth";

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

  const teams = TEAMS_DB.map((t) => t.id).sort();
  const cycleDay = Math.floor(Date.now() / 86_400_000) % 8;
  const group = teams.slice(cycleDay * 4, cycleDay * 4 + 4);

  const season = Number(SEASON.nhleSeasonId);
  const idLists = await Promise.all(group.map(rosterPlayerIds));
  const ids = idLists.flat();
  const result = ids.length > 0
    ? await capturePlayerSnapshots(ids, season)
    : { requested: 0, landingStored: 0, edgeStored: 0, failures: [], day: "" };

  // League-wide goalie EDGE boards — one cheap capture per night (PA3)
  const goalieBoards = await captureGoalieEdgeBoards(SEASON.nhleSeasonId);

  // Per-goalie EDGE detail, on the same 8-day team rotation as the skater
  // snapshots above — roughly twenty requests a night rather than all ~110
  // at once, so it cannot be the thing that busts the invocation.
  const goalieDetail = await captureGoalieEdgeDetail(
    SEASON.nhleSeasonId,
    activeGoalieIdsForTeams(group),
  ).catch((e: any) => ({ error: String(e?.message ?? e) }));

  return NextResponse.json({ ok: true, cycleDay, teams: group, season, goalieBoards, goalieDetail, ...result });
}
