import { NextResponse } from "next/server";
import { redis } from "@/app/lib/redis";

export const dynamic = "force-dynamic";

export async function GET() {
  if (redis) {
    await redis.del("cache:teams").catch(() => {});
  }
  return NextResponse.json({ ok: true, message: "cache:teams cleared — reload the trade machine" });
}
