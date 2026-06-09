import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { players } from "@/app/db/schema";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // Try selecting teamId explicitly
    const rows = await db.select({
      id:     players.id,
      name:   players.name,
      teamId: players.teamId,
    }).from(players).limit(10);

    const total = await db.select({ id: players.id }).from(players);
    const nullCount  = rows.filter(r => r.teamId === null).length;
    const sample = rows.slice(0, 5);

    return NextResponse.json({
      ok: true,
      totalInDb: total.length,
      sampleSize: rows.length,
      nullTeamIdInSample: nullCount,
      sample,
    });
  } catch (err: any) {
    return NextResponse.json({
      ok: false,
      error: err?.message ?? String(err),
    }, { status: 500 });
  }
}
