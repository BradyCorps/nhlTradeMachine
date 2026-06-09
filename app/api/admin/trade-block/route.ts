import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { tradeBlock, teams, players } from "@/app/db/schema";
import { eq } from "drizzle-orm";

export const dynamic = "force-dynamic";

export async function GET() {
  const [entries, teamRows, playerRows] = await Promise.all([
    db.select().from(tradeBlock).catch(() => []),
    db.select().from(teams).catch(() => []),
    db.select({
      id:       players.id,
      name:     players.name,
      teamId:   players.teamId,
      position: players.position,
    }).from(players).catch(() => []),
  ]);
  const teamPhases = Object.fromEntries(teamRows.map(t => [t.id, t.phaseOverride]));
  const teamList = teamRows.map(t => ({ id: t.id, name: t.name })).sort((a, b) => a.id.localeCompare(b.id));
  return NextResponse.json({ entries, teamPhases, players: playerRows, teams: teamList });
}

async function upsertEntry(body: {
  id: string; name: string; teamId?: string | null;
  status: string; note?: string | null;
}) {
  if (body.status === "clear") {
    await db.delete(tradeBlock).where(eq(tradeBlock.id, body.id)).catch(() => {});
    return;
  }
  const existing = await db.select().from(tradeBlock).where(eq(tradeBlock.id, body.id)).catch(() => []);
  if (existing.length > 0) {
    await db.update(tradeBlock).set({
      name: body.name, teamId: body.teamId ?? null,
      status: body.status, note: body.note ?? null, updatedAt: Date.now(),
    }).where(eq(tradeBlock.id, body.id));
  } else {
    await db.insert(tradeBlock).values({
      id: body.id, name: body.name, teamId: body.teamId ?? null,
      status: body.status, note: body.note ?? null, updatedAt: Date.now(),
    });
  }
}

export async function POST(req: Request) {
  const body = await req.json() as
    | { id: string; name: string; teamId?: string | null; status: string; note?: string | null }
    | Array<{ id: string; name: string; teamId?: string | null; status: string; note?: string | null }>;

  // Bulk upsert
  if (Array.isArray(body)) {
    await Promise.all(body.map(upsertEntry));
    return NextResponse.json({ ok: true, count: body.length });
  }

  await upsertEntry(body);
  return NextResponse.json({ ok: true });
}
