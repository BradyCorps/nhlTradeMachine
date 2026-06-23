import { NextResponse } from "next/server";
import { assembleCanonicalRoster } from "@/app/lib/roster-assembly";

export const dynamic = "force-dynamic";

export async function GET() {
  const roster = await assembleCanonicalRoster();

  return NextResponse.json({
    players: roster.players,
    liveStats: roster.liveStats,
    generatedAt: roster.generatedAt,
    debug: roster.debug,
  });
}
