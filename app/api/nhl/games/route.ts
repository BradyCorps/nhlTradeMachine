import { NextResponse } from "next/server";
import { fetchJsonWithStatus } from "@/app/lib/nhl-player-feed";
import { nhlToday, parseNhlGames, validGameDate } from "@/app/lib/nhl-games";

export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const date = params.get("date") ?? nhlToday();
  if (params.getAll("date").length > 1 || !validGameDate(date)) {
    return NextResponse.json({ error: "Invalid game date" }, { status: 400 });
  }
  const source = `https://api-web.nhle.com/v1/score/${date}`;
  const response = await fetchJsonWithStatus(source);
  const board = response.status === 200 ? parseNhlGames(response.data, date) : null;
  if (!board) {
    return NextResponse.json({ error: "The NHL game schedule is temporarily unavailable.", date }, {
      status: 503, headers: { "Cache-Control": "no-store" },
    });
  }
  return NextResponse.json({ ...board, source }, {
    headers: { "Cache-Control": "public, s-maxage=30, stale-while-revalidate=30" },
  });
}
