import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { draftPickOverrides } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/app/lib/admin-auth";
import { ensureNewTables } from "@/app/db/ensure-schema";
import { SEASON } from "@/app/lib/season-config";
import { TEAMS_DB } from "@/app/lib/db";
import { pickEffectiveStanding } from "@/app/lib/pick-value";

// Generates the canonical pick id used throughout the app.
function pickId(origOwner: string, year: number, round: number) {
  return `pick-${origOwner}-${year}-${round}`;
}

// Build the full set of runtime-generated picks (same logic as /api/league).
function buildDefaultPicks() {
  const { draftYear } = SEASON;
  const picks: Record<string, { originalOwnerId: string; currentOwnerId: string; round: number; year: number; isProtected: boolean }> = {};
  for (const team of TEAMS_DB) {
    for (const year of [draftYear, draftYear + 1, draftYear + 2]) {
      for (const round of [1, 2, 3, 4, 5]) {
        const id = pickId(team.id, year, round);
        picks[id] = { originalOwnerId: team.id, currentOwnerId: team.id, round, year, isProtected: false };
      }
    }
  }
  return picks;
}

// GET /api/admin/draft-picks
// Returns the full merged pick list (defaults + DB overrides).
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth) return auth;

  try {
    await ensureNewTables();
    const overrides = await db.select().from(draftPickOverrides);
    const overrideMap = new Map(overrides.map((o) => [o.id, o]));

    const defaults = buildDefaultPicks();
    const teamPhaseMap = new Map(TEAMS_DB.map((t) => [t.id, { phase: t.phase, standing: t.standing }]));

    const result = Object.entries(defaults).map(([id, def]) => {
      const override = overrideMap.get(id);
      const currentOwnerId = override?.currentOwnerId ?? def.currentOwnerId;
      const isProtected = override?.isProtected ?? def.isProtected;
      const conditions = override?.conditions ?? null;
      const teamCtx = teamPhaseMap.get(def.originalOwnerId) ?? { phase: "Rebuilding", standing: 16 };
      return {
        id,
        originalOwnerId: def.originalOwnerId,
        currentOwnerId,
        round: def.round,
        year: def.year,
        isProtected,
        conditions,
        hasOverride: !!override,
        teamStanding: pickEffectiveStanding(teamCtx.phase, teamCtx.standing),
      };
    });

    return NextResponse.json({ picks: result });
  } catch (e: any) {
    console.error("[admin/draft-picks GET]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// PUT /api/admin/draft-picks
// Upsert an override: { id, currentOwnerId, isProtected, conditions }
export async function PUT(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth) return auth;

  try {
    await ensureNewTables();
    const body = await req.json();
    const { id, currentOwnerId, originalOwnerId, round, year, isProtected, conditions } = body;

    if (!id || !currentOwnerId || !originalOwnerId || !round || !year) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    // If current owner is the same as original owner and no other overrides, delete the record.
    if (currentOwnerId === originalOwnerId && !isProtected && !conditions) {
      await db.delete(draftPickOverrides).where(eq(draftPickOverrides.id, id));
      return NextResponse.json({ ok: true, action: "reset" });
    }

    await db
      .insert(draftPickOverrides)
      .values({ id, currentOwnerId, originalOwnerId, round, year, isProtected: !!isProtected, conditions: conditions ?? null, updatedAt: Date.now() })
      .onConflictDoUpdate({
        target: draftPickOverrides.id,
        set: { currentOwnerId, isProtected: !!isProtected, conditions: conditions ?? null, updatedAt: Date.now() },
      });

    return NextResponse.json({ ok: true, action: "upserted" });
  } catch (e: any) {
    console.error("[admin/draft-picks PUT]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/admin/draft-picks?id=...
// Reset a pick override back to default.
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth) return auth;

  try {
    await ensureNewTables();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    await db.delete(draftPickOverrides).where(eq(draftPickOverrides.id, id));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[admin/draft-picks DELETE]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
