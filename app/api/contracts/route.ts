import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

// ── Use /tmp for writes — the repo filesystem is read-only on Vercel ──
// /tmp is the only writable path in serverless environments.
// Max /tmp size on Vercel is 512 MB — well within our needs.
const CACHE_PATH = path.join("/tmp", "contracts.json");

export async function GET() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const data = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
      return NextResponse.json({
        success:     true,
        playerCount: Object.keys(data).length,
        data,
      });
    }
    return NextResponse.json({ success: false, playerCount: 0, data: {} });
  } catch {
    return NextResponse.json({ success: false, playerCount: 0, data: {} });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();

    // Basic schema validation — must be a non-empty object
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ success: false, error: "Invalid data shape" }, { status: 400 });
    }

    fs.writeFileSync(CACHE_PATH, JSON.stringify(body, null, 2));
    return NextResponse.json({ success: true, playerCount: Object.keys(body).length });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: "Write failed" }, { status: 500 });
  }
}
