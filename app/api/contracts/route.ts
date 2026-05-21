import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";

const CACHE_PATH = path.join(process.cwd(), "app", "data", "contracts.json");

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
    const dir  = path.dirname(CACHE_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(CACHE_PATH, JSON.stringify(body, null, 2));
    return NextResponse.json({ success: true, playerCount: Object.keys(body).length });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
