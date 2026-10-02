import { NextResponse } from "next/server";
import { parseObservedSelection } from "@/app/lib/observed-season";
import { readObservedEdge } from "@/app/lib/observed-edge.server";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ playerId: string }> }) {
  const { playerId: id } = await params;
  if (!/^\d+$/.test(id) || !Number.isSafeInteger(Number(id)) || Number(id) <= 0) {
    return NextResponse.json({ error: "Invalid player id" }, { status: 400 });
  }
  let selection;
  try { selection = parseObservedSelection(new URL(req.url).searchParams); }
  catch { return NextResponse.json({ error: "Unsupported statistics season or competition" }, { status: 400 }); }
  const result = await readObservedEdge(Number(id), selection);
  if (!result.raw) return NextResponse.json(result, { status: result.coverage === "missing" ? 404 : 503 });
  const raw = result.raw;
  return NextResponse.json({ ...result, raw: undefined,
    sogDetails: raw.sogDetails ?? [], sogSummary: raw.sogSummary ?? [], zoneTime: raw.zoneTimeDetails ?? null,
    speedMax: raw.skatingSpeed?.speedMax?.imperial ?? null,
    speedMaxPercentile: raw.skatingSpeed?.speedMax?.percentile ?? null,
    burstsOver20: raw.skatingSpeed?.burstsOver20?.value ?? null,
    topShotSpeed: raw.topShotSpeed?.imperial ?? null, distancePerGameMax: raw.distanceMaxGame?.imperial ?? null,
  }, { headers: { "Cache-Control": "public, max-age=300" } });
}
