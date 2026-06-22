import { NextResponse, type NextRequest } from "next/server";
import { ADMIN_SESSION_COOKIE, validateAdminSessionValue } from "@/app/lib/admin-auth";

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  if (!pathname.startsWith("/admin") || pathname === "/admin/login" || pathname === "/admin/login/submit") {
    return NextResponse.next();
  }

  const isAuthorized = await validateAdminSessionValue(req.cookies.get(ADMIN_SESSION_COOKIE)?.value);
  if (isAuthorized) return NextResponse.next();

  const loginUrl = req.nextUrl.clone();
  loginUrl.pathname = "/admin/login";
  loginUrl.searchParams.set("next", pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ["/admin/:path*"],
};
