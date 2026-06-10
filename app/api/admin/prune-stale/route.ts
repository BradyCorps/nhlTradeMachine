import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { players as playersTable } from "@/app/db/schema";
import { inArray } from "drizzle-orm";
import { scrapeCapWages } from "@/app/services/scraper";
import { TEAMS_DB } from "@/app/lib/db";
import { isAuthorized } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

// ── Stale player pruning ──────────────────────────────────────
// A DB row is stale when the player is gone from BOTH live sources:
//   1. CapWages active contracts (retired, bought out, overseas)
//   2. NHL API current rosters   (catches UFAs like Carlson who have
//      no contract but are still rostered in the sim)
// Always protected: draftees (draft_overall set) and rows carrying an
// admin-entered extension.
//
// GET    → dry run: returns the full candidate list, deletes nothing
// DELETE → prunes, but only if both sources came back healthy

const NHL_HEADERS = {
  "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept": "application/json, text/plain, */*",
  "Origin": "https://www.nhl.com",
  "Referer": "https://www.nhl.com/",
};

const norm = (n: string) =>
  n.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();

async function findStale() {
  const scraped = await scrapeCapWages();
  const activeNames = new Set(
    Object.keys(scraped).filter(n => !n.includes("__")).map(norm)
  );

  const rosterNames = new Set<string>();
  let rostersFetched = 0;
  const results = await Promise.allSettled(
    TEAMS_DB.map((t: any) =>
      fetch(`https://api-web.nhle.com/v1/roster/${t.id}/current`, {
        cache: "no-store", headers: NHL_HEADERS,
        signal: AbortSignal.timeout(8000),
      }).then(r => (r.ok ? r.json() : null)).catch(() => null)
    )
  );
  for (const res of results) {
    const data = res.status === "fulfilled" ? res.value : null;
    if (!data) continue;
    const skaters = [...(data.forwards ?? []), ...(data.defensemen ?? []), ...(data.goalies ?? [])];
    if (skaters.length < 5) continue;
    rostersFetched++;
    for (const p of skaters) rosterNames.add(norm(`${p.firstName.default} ${p.lastName.default}`));
  }

  const rows = await db.select({
    id:              playersTable.id,
    name:            playersTable.name,
    teamId:          playersTable.teamId,
    capHit:          playersTable.capHit,
    yearsRemaining:  playersTable.yearsRemaining,
    draftOverall:    playersTable.draftOverall,
    extensionCapHit: playersTable.extensionCapHit,
  }).from(playersTable);

  const stale = rows.filter(r =>
    r.draftOverall == null &&
    r.extensionCapHit == null &&
    !activeNames.has(norm(r.name)) &&
    !rosterNames.has(norm(r.name))
  );

  // Both sources must be healthy before any deletion is trusted —
  // a failed scrape or blocked NHL API would flag everyone as stale.
  const sourcesHealthy = activeNames.size > 200 && rostersFetched >= 28;

  return { rows, stale, activeCount: activeNames.size, rostersFetched, sourcesHealthy };
}

// GET /api/admin/prune-stale — dry run
export async function GET(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { rows, stale, activeCount, rostersFetched, sourcesHealthy } = await findStale();
  return NextResponse.json({
    dryRun: true,
    totalInDb: rows.length,
    staleCount: stale.length,
    wouldKeep: rows.length - stale.length,
    sourcesHealthy,
    sources: { capwagesActive: activeCount, nhlRostersFetched: rostersFetched },
    stale: stale
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(r => ({ name: r.name, teamId: r.teamId, capHit: r.capHit, yearsRemaining: r.yearsRemaining })),
  });
}

// DELETE /api/admin/prune-stale — execute the prune
export async function DELETE(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const { rows, stale, activeCount, rostersFetched, sourcesHealthy } = await findStale();

  if (!sourcesHealthy) {
    return NextResponse.json({
      error: "Refusing to prune — upstream sources unhealthy",
      sources: { capwagesActive: activeCount, nhlRostersFetched: rostersFetched },
      hint: "Need >200 CapWages contracts and ≥28 NHL rosters to trust the stale list.",
    }, { status: 503 });
  }
  if (stale.length === 0) {
    return NextResponse.json({ ok: true, deleted: 0, remaining: rows.length });
  }
  // Guard against catastrophic deletes even with healthy sources
  if (stale.length > rows.length * 0.6) {
    return NextResponse.json({
      error: `Refusing to prune — ${stale.length}/${rows.length} rows flagged stale (>60%), likely a matching bug`,
    }, { status: 503 });
  }

  const ids = stale.map(r => r.id);
  for (let i = 0; i < ids.length; i += 100) {
    await db.delete(playersTable).where(inArray(playersTable.id, ids.slice(i, i + 100)));
  }

  return NextResponse.json({
    ok: true,
    deleted: ids.length,
    remaining: rows.length - ids.length,
    deletedNames: stale.map(r => r.name).sort(),
  });
}
