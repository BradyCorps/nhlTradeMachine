import { NextResponse } from "next/server";
import { redis } from "@/app/lib/redis";
import { isAuthorized } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (redis) {
    await redis.del("cache:teams").catch(() => {});
  }
  return NextResponse.json({ ok: true, message: "cache:teams cleared — reload the trade machine" });
}
