import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { players as playersTable } from "@/app/db/schema";
import { eq, isNull } from "drizzle-orm";
import { TEAMS_DB } from "@/app/lib/db";
import { isAuthorized } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

function makeId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function sleep(ms: number): Promise<void> {
  return new Promise(r => setTimeout(r, ms));
}

async function fetchRoster(teamId: string): Promise<
  { firstName: { default: string }; lastName: { default: string } }[]
  | null
> {
  const url = `https://api-web.nhle.com/v1/roster/${teamId}/current`;

  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(2000 * attempt); // 2s, 4s back-off on retry

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 10000);
    try {
      const res = await fetch(url, { cache: "no-store", signal: ctrl.signal });
      clearTimeout(t);

      if (res.status === 429) {
        await sleep(3000); // wait 3s then retry
        continue;
      }
      if (!res.ok) return null;

      const data = await res.json() as {
        forwards?:   { firstName: { default: string }; lastName: { default: string } }[];
        defensemen?: { firstName: { default: string }; lastName: { default: string } }[];
        goalies?:    { firstName: { default: string }; lastName: { default: string } }[];
      };
      return [
        ...(data.forwards   ?? []),
        ...(data.defensemen ?? []),
        ...(data.goalies    ?? []),
      ];
    } catch {
      clearTimeout(t);
    }
  }
  return null;
}

// POST /api/admin/patch-team-ids
// Sequentially fetches all 32 NHL rosters (200ms gap between each to avoid
// rate limiting) and writes team_id for every player row still NULL.
// Safe to re-run — only touches rows where team_id IS NULL.
export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const nullRows = await db
    .select({ id: playersTable.id, name: playersTable.name })
    .from(playersTable)
    .where(isNull(playersTable.teamId));

  if (nullRows.length === 0) {
    return NextResponse.json({ ok: true, patched: 0, message: "All players already have team IDs" });
  }

  // normalizedName → playerId for all unpatched players
  const nameToId = new Map<string, string>();
  for (const row of nullRows) {
    nameToId.set(makeId(row.name), row.id);
  }

  const idToTeam  = new Map<string, string>();
  const teamResults: Record<string, number> = {};

  // Sequential — 200ms gap between teams to stay under NHL API rate limit
  for (const team of TEAMS_DB) {
    await sleep(200);
    const roster = await fetchRoster(team.id);
    if (roster === null) {
      teamResults[team.id] = -1;
      continue;
    }

    let matched = 0;
    for (const p of roster) {
      const fullName   = `${p.firstName.default} ${p.lastName.default}`;
      const normalized = makeId(fullName);
      const dbId       = nameToId.get(normalized);
      if (dbId) { idToTeam.set(dbId, team.id); matched++; }
    }
    teamResults[team.id] = matched;
  }

  // Write to DB
  let patched = 0;
  let skipped = 0;

  for (const row of nullRows) {
    const tricode = idToTeam.get(row.id);
    if (!tricode) { skipped++; continue; }
    await db.update(playersTable)
      .set({ teamId: tricode })
      .where(eq(playersTable.id, row.id));
    patched++;
  }

  const failedTeams = Object.entries(teamResults)
    .filter(([, v]) => v < 0)
    .map(([k]) => k);

  return NextResponse.json({
    ok:          true,
    patched,
    skipped,
    nullBefore:  nullRows.length,
    totalFromNHL: idToTeam.size,
    teamResults,
    failedTeams,
  });
}
