import { NextResponse } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/app/lib/admin-auth";
import { getCachedRoster } from "@/app/lib/cached-roster";
import { TEAMS_DB } from "@/app/lib/db";
import { parseObservedSelection } from "@/app/lib/observed-season";
import { manualLineupSchema, validateLineupPlayers } from "@/app/lib/manual-team-lineups";
import { LineupConflict, readManualLineup, removeManualLineup, saveManualLineup } from "@/app/lib/manual-team-lineups.server";

export const dynamic = "force-dynamic";
export const maxDuration = 60;
const writeSchema = z.object({ lineup: manualLineupSchema, expectedRevision: z.string().uuid().nullable() }).strict();
const deleteSchema = z.object({ teamId: z.string(), season: z.string(), gameType: z.number(), expectedRevision: z.string().uuid() }).strict();
const headers = { "Cache-Control": "no-store" };

function identity(req: Request) {
  const params = new URL(req.url).searchParams;
  const teamId = params.get("team");
  if (params.getAll("team").length !== 1 || !TEAMS_DB.some(team => team.id === teamId)) throw new Error("Unknown team");
  return { teamId: teamId!, ...parseObservedSelection(params) };
}

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  let key;
  try { key = identity(req); } catch { return NextResponse.json({ error: "Invalid lineup selection" }, { status: 400 }); }
  try {
    const [lineup, roster] = await Promise.all([readManualLineup(key.teamId, key), getCachedRoster()]);
    const players = roster.value.players.filter(p => p.teamId === key.teamId && p.position !== "Pick")
      .map(p => ({ id: String(p.id), name: p.name, position: p.position, teamId: p.teamId }));
    return NextResponse.json({ lineup, players }, { headers });
  } catch {
    return NextResponse.json({ error: "Could not load lineup and roster" }, { status: 503, headers });
  }
}

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  const parsed = writeSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues[0]?.message ?? "Invalid lineup" }, { status: 400 });
  try {
    const roster = await getCachedRoster();
    try { validateLineupPlayers(parsed.data.lineup, roster.value.players); }
    catch (error) { return NextResponse.json({ error: (error as Error).message }, { status: 400 }); }
    const lineup = await saveManualLineup(parsed.data.lineup, parsed.data.expectedRevision);
    return NextResponse.json({ lineup }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof LineupConflict ? error.message : "Could not save lineup" }, { status: error instanceof LineupConflict ? 409 : 503, headers });
  }
}

export async function DELETE(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  const parsed = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid removal request" }, { status: 400 });
  const body = parsed.data;
  let selection;
  try {
    if (!TEAMS_DB.some(team => team.id === body.teamId)) throw new Error();
    selection = parseObservedSelection(new URLSearchParams({ season: body.season, gameType: String(body.gameType) }));
  } catch { return NextResponse.json({ error: "Invalid lineup selection" }, { status: 400 }); }
  try {
    await removeManualLineup(body.teamId, selection, body.expectedRevision);
    return NextResponse.json({ lineup: null }, { headers });
  } catch (error) {
    return NextResponse.json({ error: error instanceof LineupConflict ? error.message : "Could not remove lineup" }, { status: error instanceof LineupConflict ? 409 : 503, headers });
  }
}
