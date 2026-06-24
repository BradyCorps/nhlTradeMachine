import { NextRequest, NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { faOverrides } from "@/app/db/schema";
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
  const auth = requireAdmin(req);
  if (auth) return auth;

  try {
    await ensureNewTables();
    const rows = await db.select().from(faOverrides);
    return NextResponse.json({ overrides: rows });
  } catch (e: any) {
    console.error("[admin/fa-overrides GET]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// POST /api/admin/fa-overrides
// Add or update an override: { playerName, teamSlug?, forceStatus, notes? }
export async function POST(req: NextRequest) {
  const auth = requireAdmin(req);
  if (auth) return auth;

  try {
    await ensureNewTables();
    const body = await req.json();
    const { playerName, teamSlug, forceStatus, notes } = body;

    if (!playerName || !forceStatus) {
      return NextResponse.json({ error: "playerName and forceStatus are required" }, { status: 400 });
    }
    if (!VALID_STATUSES.includes(forceStatus as ForceStatus)) {
      return NextResponse.json({ error: `forceStatus must be one of: ${VALID_STATUSES.join(", ")}` }, { status: 400 });
    }

    const id = slugify(playerName);
    await db
      .insert(faOverrides)
      .values({ id, playerName, teamSlug: teamSlug ?? null, forceStatus, season: SEASON.label, notes: notes ?? null, updatedAt: Date.now() })
      .onConflictDoUpdate({
        target: faOverrides.id,
        set: { playerName, teamSlug: teamSlug ?? null, forceStatus, notes: notes ?? null, updatedAt: Date.now() },
      });

    return NextResponse.json({ ok: true, id });
  } catch (e: any) {
    console.error("[admin/fa-overrides POST]", e);
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}

// DELETE /api/admin/fa-overrides?id=...
export async function DELETE(req: NextRequest) {
  const auth = requireAdmin(req);
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
