import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { players as playersTable } from "@/app/db/schema";
import { eq, sql } from "drizzle-orm";
import { isAuthorized } from "@/app/lib/admin-auth";

export const dynamic = "force-dynamic";

function makeId(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, "");
}

const ELC_CAP_HIT = 0.975; // standard max ELC AAV ($M)
const ELC_YEARS   = 3;

// NHL-equivalency translation factors (Desjardins/Vollman family).
// juniorPtsPerGame × factor × 82 ≈ expected NHL points pace.
const NHLE_FACTORS: Record<string, number> = {
  NHL: 1.00, AHL: 0.47, KHL: 0.77, SHL: 0.59, LIIGA: 0.54,
  NL: 0.46, CZECHIA: 0.49, DEL: 0.44, NCAA: 0.41, USHL: 0.27,
  OHL: 0.30, WHL: 0.28, QMJHL: 0.28, USNTDP: 0.35,
  J20: 0.19, MHL: 0.18, U18: 0.15,
};

// Columns added after the original table creation — ensure they exist.
// SQLite ALTER TABLE ADD COLUMN is idempotent-safe via try/catch.
async function ensureProspectColumns() {
  for (const col of ["draft_overall INTEGER", "prospect_pts_pace REAL"]) {
    try { await db.run(sql.raw(`ALTER TABLE players ADD COLUMN ${col}`)); } catch { /* already exists */ }
  }
}

// POST /api/admin/import-draft-class
// body: {
//   draftYear: 2026,
//   players: [{
//     name, teamId, position,           — required
//     age?, capHit?, round?, overall?,  — overall defaults to array position (keep players in draft order)
//     league?, points?, games?          — optional junior stats → NHLe-translated ptsPace
//   }, ...]
// }
// Upserts each draftee with ELC defaults. League routes append DB players
// with a non-null draftYear onto rosters; the X-NAV engine values them by
// draft pedigree (overall slot) until they have a real NHL sample.
export async function POST(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as {
    draftYear: number;
    players: {
      name:      string;
      teamId:    string;
      position:  string;
      age?:      number;
      capHit?:   number;
      round?:    number;
      overall?:  number;
      league?:   string;
      points?:   number;
      games?:    number;
    }[];
  };

  if (!body.draftYear || !Array.isArray(body.players) || body.players.length === 0) {
    return NextResponse.json({ error: "draftYear and a non-empty players array are required" }, { status: 400 });
  }

  await ensureProspectColumns();

  let added   = 0;
  let updated = 0;
  const errors: string[] = [];

  for (let i = 0; i < body.players.length; i++) {
    const p = body.players[i];
    if (!p.name || !p.teamId || !p.position) {
      errors.push(`Skipped entry missing name/teamId/position: ${JSON.stringify(p)}`);
      continue;
    }

    // NHLe-translated scoring pace from junior/college stats, if provided
    let prospectPtsPace: number | null = null;
    if (p.league && p.points != null && p.games != null && p.games > 0) {
      const factor = NHLE_FACTORS[p.league.toUpperCase()];
      if (factor == null) {
        errors.push(`${p.name}: unknown league "${p.league}" — NHLe skipped (valid: ${Object.keys(NHLE_FACTORS).join(", ")})`);
      } else {
        prospectPtsPace = Math.round((p.points / p.games) * factor * 82 * 10) / 10;
      }
    }

    const id = makeId(p.name);
    const row = {
      name:           p.name,
      position:       p.position.toUpperCase(),
      teamId:         p.teamId.toUpperCase(),
      age:            p.age ?? 18,
      capHit:         p.capHit ?? ELC_CAP_HIT,
      yearsRemaining: ELC_YEARS,
      hasNmc:         false,
      hasNtc:         false,
      draftYear:      body.draftYear,
      draftRound:     p.round ?? 1,
      draftOverall:   p.overall ?? i + 1, // array order = draft order
      prospectPtsPace,
    };

    const existing = await db.select({
      id: playersTable.id,
      draftYear: playersTable.draftYear,
      age: playersTable.age,
      capHit: playersTable.capHit,
      yearsRemaining: playersTable.yearsRemaining,
      hasNmc: playersTable.hasNmc,
      hasNtc: playersTable.hasNtc,
    }).from(playersTable).where(eq(playersTable.id, id));
    if (existing.length > 0) {
      const current = existing[0];
      const isProspectRow = current.draftYear != null
        || ((current.age ?? 99) <= 22
          && current.capHit <= 1.15
          && current.yearsRemaining <= ELC_YEARS
          && !current.hasNmc
          && !current.hasNtc);
      if (!isProspectRow) {
        errors.push(`${p.name}: skipped existing NHL contract row; draft import will not overwrite cap/term/clauses`);
        continue;
      }
      await db.update(playersTable).set(row).where(eq(playersTable.id, id));
      updated++;
    } else {
      await db.insert(playersTable).values({ id, ...row });
      added++;
    }
  }

  return NextResponse.json({ ok: true, draftYear: body.draftYear, added, updated, errors });
}

// DELETE /api/admin/import-draft-class
// body: { draftYear: 2026 }
// Removes an entire imported class — use when replacing a mock draft with real results.
export async function DELETE(req: Request) {
  if (!isAuthorized(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json() as { draftYear: number };
  if (!body.draftYear) {
    return NextResponse.json({ error: "draftYear required" }, { status: 400 });
  }

  const removed = await db.delete(playersTable)
    .where(eq(playersTable.draftYear, body.draftYear))
    .returning({ id: playersTable.id });

  return NextResponse.json({ ok: true, draftYear: body.draftYear, removed: removed.length });
}
