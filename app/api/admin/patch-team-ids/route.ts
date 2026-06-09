import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { players as playersTable } from "@/app/db/schema";
import { eq, isNull } from "drizzle-orm";
import { TEAMS_DB } from "@/app/lib/db";

export const dynamic = "force-dynamic";

function makeId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

// POST /api/admin/patch-team-ids
// Loops all 32 NHL rosters via the public NHL API and sets team_id on every
// player row that currently has NULL. Safe to re-run.
export async function POST() {
  // Only fetch players that still need a team
  const nullRows = await db.select({ id: playersTable.id, name: playersTable.name })
    .from(playersTable)
    .where(isNull(playersTable.teamId));

  if (nullRows.length === 0) {
    return NextResponse.json({ ok: true, patched: 0, message: "All players already have team IDs" });
  }

  // Build a lookup: normalizedName → playerId
  const nameToId = new Map<string, string>();
  for (const row of nullRows) {
    nameToId.set(makeId(row.name), row.id);
  }

  // Fetch rosters from NHL API for all 32 teams in parallel (batched to avoid rate limits)
  const idToTeam = new Map<string, string>(); // playerId → tricode

  const BATCH_SIZE = 8;
  for (let i = 0; i < TEAMS_DB.length; i += BATCH_SIZE) {
    const batch = TEAMS_DB.slice(i, i + BATCH_SIZE);
    await Promise.all(batch.map(async (team) => {
      try {
        const res = await fetch(
          `https://api-web.nhle.com/v1/roster/${team.id}/current`,
          { cache: "no-store", signal: AbortSignal.timeout(8000) }
        );
        if (!res.ok) return;
        const data = await res.json() as {
          forwards?: { firstName: { default: string }; lastName: { default: string } }[];
          defensemen?: { firstName: { default: string }; lastName: { default: string } }[];
          goalies?: { firstName: { default: string }; lastName: { default: string } }[];
        };

        const all = [
          ...(data.forwards  ?? []),
          ...(data.defensemen ?? []),
          ...(data.goalies   ?? []),
        ];

        for (const p of all) {
          const fullName = `${p.firstName.default} ${p.lastName.default}`;
          const normalized = makeId(fullName);
          const dbId = nameToId.get(normalized);
          if (dbId) idToTeam.set(dbId, team.id);
        }
      } catch {
        // skip this team on timeout/error
      }
    }));
  }

  // Write all matched team IDs
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

  return NextResponse.json({
    ok: true,
    patched,
    skipped,
    nullBefore: nullRows.length,
  });
}
