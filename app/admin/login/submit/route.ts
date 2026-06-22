import { NextResponse } from "next/server";
import {
  ADMIN_SESSION_COOKIE,
  ADMIN_SESSION_MAX_AGE_SECONDS,
  createAdminSessionValue,
} from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

function safeAdminPath(value: string): string {
  return value.startsWith("/admin") && value !== "/admin/login" ? value : "/admin";
}

export async function POST(req: Request) {
  const formData = await req.formData();
  const password = String(formData.get("password") ?? "");
  const safeNext = safeAdminPath(String(formData.get("next") ?? "/admin"));
  const configured = process.env.ADMIN_KEY?.trim() || process.env.ADMIN_PASSWORD?.trim();
  const devDisabled = process.env.ADMIN_DISABLE_AUTH === "1" && process.env.NODE_ENV !== "production";

  if (!devDisabled && (!configured || password !== configured)) {
    return NextResponse.redirect(
      new URL(`/admin/login?error=1&next=${encodeURIComponent(safeNext)}`, req.url),
      { status: 303 },
    );
  }

  const res = NextResponse.redirect(new URL(safeNext, req.url), { status: 303 });
  res.cookies.set({
    name: ADMIN_SESSION_COOKIE,
    value: await createAdminSessionValue(),
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: ADMIN_SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
