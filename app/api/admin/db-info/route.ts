import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { players as playersTable } from "@/app/db/schema";
import { requireAdmin } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

// GET /api/admin/db-info — which database is this deployment actually connected to?
// Masks the URL so it's safe to expose; use to compare dev vs prod connectivity.
export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;

  const rawUrl = process.env.DATABASE_URL ?? "";
  const target = !rawUrl
    ? "file:local.db (DATABASE_URL not set — local fallback!)"
    : rawUrl.replace(/\/\/([^.]{4})[^.]*/, "//$1***"); // mask db name, keep prefix + host

  let playerCount: number | null = null;
  let dbError: string | null = null;
  try {
    const rows = await db.select({ id: playersTable.id }).from(playersTable);
    playerCount = rows.length;
  } catch (e: any) {
    dbError = e?.message ?? String(e);
  }

  return NextResponse.json({
    target,
    authTokenSet: Boolean(process.env.DATABASE_AUTH_TOKEN),
    playerCount,
    dbError,
  });
}
