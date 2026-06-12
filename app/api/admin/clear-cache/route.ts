import { NextResponse } from "next/server";
import { redis } from "@/app/lib/redis";
import { isAuthorized } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const cleared: string[] = [];
  if (redis) {
    for (const key of ["cache:teams", "cache:contracts", "cache:contracts:v2"]) {
      await redis.del(key).then(() => cleared.push(key)).catch(() => {});
    }
  }
  return NextResponse.json({ ok: true, cleared, message: "caches cleared — reload the trade machine" });
}
