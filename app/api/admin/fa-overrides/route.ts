import { NextResponse } from "next/server";
import { requireAdmin } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

const deprecatedResponse = () => NextResponse.json({
  error: "FA overrides moved to Contract Admin. Update players.expiryStatus, players.expiryYear, and players.excludeFromRoster there.",
  replacement: "/admin/contracts",
}, { status: 410 });

export async function GET(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  return deprecatedResponse();
}

export async function POST(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  return deprecatedResponse();
}

export async function PUT(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  return deprecatedResponse();
}

export async function DELETE(req: Request) {
  const unauthorized = await requireAdmin(req);
  if (unauthorized) return unauthorized;
  return deprecatedResponse();
}
