import { NextResponse } from "next/server";
import { TEAMS_DB } from "@/app/lib/db";
import { parseObservedSelection } from "@/app/lib/observed-season";
import { readManualLineup } from "@/app/lib/manual-team-lineups.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const params = new URL(req.url).searchParams;
  let selection;
  const teamId = params.get("team");
  try {
    selection = parseObservedSelection(params);
    if (params.getAll("team").length !== 1 || !TEAMS_DB.some(team => team.id === teamId)) throw new Error("Unknown team");
  } catch {
    return NextResponse.json({ error: "Invalid team, season or competition" }, { status: 400 });
  }
  try {
    return NextResponse.json({ lineup: await readManualLineup(teamId!, selection) }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ error: "Manual lineup is unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
