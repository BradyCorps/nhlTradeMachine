import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { tradeBlock as tradeBlockTable } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { TEAMS_DB } from "@/app/lib/db";

function makeId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// GET /api/admin/trade-block
// Returns all manual overrides plus a summary count
export async function GET() {
  const rows = await db.select().from(tradeBlockTable).catch(() => []);

  const teamPhaseMap = new Map<string, string>(TEAMS_DB.map(t => [t.id, t.phase]));

  return NextResponse.json({
    overrides:  rows,
    teamPhases: Object.fromEntries(teamPhaseMap),
    total:      rows.length,
  });
}

// POST /api/admin/trade-block
// body: { name, teamId?, status, note? }  — status 'clear' removes the entry
export async function POST(req: Request) {
  const body = await req.json() as {
    name:    string;
    teamId?: string;
    status:  string;   // 'requested' | 'available' | 'blocked' | 'untouchable' | 'clear'
    note?:   string | null;
  };

  const { name, teamId, status, note } = body;
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });

  const id = makeId(name);

  if (status === "clear") {
    await db.delete(tradeBlockTable).where(eq(tradeBlockTable.id, id));
    return NextResponse.json({ ok: true, cleared: true });
  }

  const validStatuses = ["requested", "available", "blocked", "untouchable"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json({ error: `status must be one of ${validStatuses.join(", ")}` }, { status: 400 });
  }

  const existing = await db.select().from(tradeBlockTable).where(eq(tradeBlockTable.id, id));

  if (existing.length > 0) {
    await db.update(tradeBlockTable)
      .set({ status, note: note ?? null, teamId: teamId ?? existing[0].teamId, updatedAt: Date.now() })
      .where(eq(tradeBlockTable.id, id));
  } else {
    await db.insert(tradeBlockTable).values({
      id, name, teamId: teamId ?? null, status, note: note ?? null, updatedAt: Date.now(),
    });
  }

  return NextResponse.json({ ok: true, name, status });
}
