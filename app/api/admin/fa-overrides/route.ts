import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { faOverrides, players as playersTable } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/app/lib/admin-auth";
import { ensureNewTables } from "@/app/db/ensure-schema";
import { SEASON } from "@/app/lib/season-config";

const VALID_STATUSES = ["UFA", "RFA", "SIGNED", "EXCLUDE"] as const;
type ForceStatus = (typeof VALID_STATUSES)[number];

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

// GET /api/admin/fa-overrides
export async function GET(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth) return auth;

  try {
    await ensureNewTables();
    const [rows, playerOptions] = await Promise.all([
      db.select().from(faOverrides),
      db.select({
        id:       playersTable.id,
        name:     playersTable.name,
        teamId:   playersTable.teamId,
        position: playersTable.position,
        age:      playersTable.age,
      }).from(playersTable),
    ]);
    playerOptions.sort((a, b) => a.name.localeCompare(b.name));
    return NextResponse.json({ overrides: rows, playerOptions });
  } catch (e: any) {
    console.error("[admin/fa-overrides GET]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/admin/fa-overrides
// Add or update an override: { playerId, playerName, teamSlug?, forceStatus, notes? }
export async function POST(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth) return auth;

  try {
    await ensureNewTables();
    const body = await req.json();
    const { playerId, playerName, teamSlug, forceStatus, notes } = body;

    if ((!playerId && !playerName) || !forceStatus) {
      return NextResponse.json({ error: "playerId/playerName and forceStatus are required" }, { status: 400 });
    }
    if (!VALID_STATUSES.includes(forceStatus as ForceStatus)) {
      return NextResponse.json({ error: `forceStatus must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
    }

    let resolvedPlayerName = String(playerName ?? "").trim();
    let resolvedTeamSlug = teamSlug ?? null;
    let resolvedPlayerId = typeof playerId === "string" && playerId.trim() ? playerId.trim() : null;

    if (resolvedPlayerId) {
      // Enrich from the DB players table when the id matches a curated row, but do
      // NOT require it: most live free agents (e.g. Alex Tuch) are scraped from
      // CapWages/NHL and never written to the players table. The override is matched
      // by id OR name during roster assembly, so a name-only override still works.
      const [player] = await db.select({
        id:     playersTable.id,
        name:   playersTable.name,
        teamId: playersTable.teamId,
      }).from(playersTable).where(eq(playersTable.id, resolvedPlayerId)).catch(() => []);
      if (player) {
        resolvedPlayerName = player.name;
        resolvedTeamSlug = player.teamId ?? resolvedTeamSlug;
        resolvedPlayerId = player.id;
      }
    }

    if (!resolvedPlayerName) {
      return NextResponse.json({ error: "playerName is required" }, { status: 400 });
    }

    const id = resolvedPlayerId ?? slugify(resolvedPlayerName);
    await db
      .insert(faOverrides)
      .values({
        id,
        playerId: resolvedPlayerId,
        playerName: resolvedPlayerName,
        teamSlug: resolvedTeamSlug,
        forceStatus,
        season: SEASON.label,
        notes: notes ?? null,
        updatedAt: Date.now(),
      })
      .onConflictDoUpdate({
        target: faOverrides.id,
        set: {
          playerId: resolvedPlayerId,
          playerName: resolvedPlayerName,
          teamSlug: resolvedTeamSlug,
          forceStatus,
          notes: notes ?? null,
          updatedAt: Date.now(),
        },
      });
    if (resolvedPlayerId) {
      const legacyId = slugify(resolvedPlayerName);
      if (legacyId !== id) {
        await db.delete(faOverrides).where(eq(faOverrides.id, legacyId));
      }
    }

    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    console.error("[admin/fa-overrides POST]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/admin/fa-overrides?id=...
export async function DELETE(req: NextRequest) {
  const auth = await requireAdmin(req);
  if (auth) return auth;

  try {
    await ensureNewTables();
    const id = req.nextUrl.searchParams.get("id");
    if (!id) return NextResponse.json({ error: "Missing id" }, { status: 400 });

    await db.delete(faOverrides).where(eq(faOverrides.id, id));
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("[admin/fa-overrides DELETE]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
