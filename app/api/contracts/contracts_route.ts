import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const CACHE_PATH = path.join(process.cwd(), "app", "data", "contracts.json");
const CACHE_TTL  = 24 * 60 * 60 * 1000; // 24 hours

// ============================================================
// GET — return cached contract data
// ============================================================
export async function GET() {
  try {
    if (fs.existsSync(CACHE_PATH)) {
      const stat = fs.statSync(CACHE_PATH);
      const data = JSON.parse(fs.readFileSync(CACHE_PATH, "utf-8"));
      return NextResponse.json({
        success:     true,
        source:      "cache",
        age:         Math.round((Date.now() - stat.mtimeMs) / 60000) + " minutes",
        playerCount: Object.keys(data).length,
        data,
      });
    }
    return NextResponse.json({ success: false, playerCount: 0, data: {} });
  } catch {
    return NextResponse.json({ success: false, playerCount: 0, data: {} });
  }
}

// ============================================================
// POST — receive contract data from browser-side scraper
// and write to cache. Browser can reach Puckpedia; server can't.
//
// Called from the frontend with:
//   fetch('/api/contracts', { method: 'POST', body: JSON.stringify(data) })
// ============================================================
export async function POST(req: Request) {
  try {
    const body = await req.json();
    if (!body || typeof body !== "object") {
      return NextResponse.json({ success: false, error: "Invalid data" }, { status: 400 });
    }

    const dir = path.dirname(CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(body, null, 2));

    return NextResponse.json({
      success:     true,
      playerCount: Object.keys(body).length,
      message:     "Contracts cached successfully",
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}