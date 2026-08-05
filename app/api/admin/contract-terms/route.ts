import { NextResponse } from "next/server";
import { db } from "@/app/db/client";
import { players as playersTable } from "@/app/db/schema";
import { eq } from "drizzle-orm";
import { requireAdmin } from "@/app/lib/admin-auth";
import { ensurePlayerColumns, ensurePlayerTable } from "@/app/db/ensure-schema";
import { redis } from "@/app/lib/redis";
import { clearTeamCaches } from "@/app/lib/team-cache";
import { auditTerm, auditTerms, type TermRow } from "@/app/lib/contract-term";
import { SEASON_START_YEAR } from "@/app/lib/contract-expiry";

export const dynamic = "force-dynamic";

// ── Contract terms: audit, anchor, reconcile ─────────────────────
//
// GET      the audit — what every row's term says, and whether anything
//          stands behind it. Read-only.
//
// POST     { action: "backfill" }  write the anchor onto rows where it can be
//          derived without changing what the row MEANS. The refusals are the
//          interesting part; see `contract-term.ts`.
//
//          { action: "reconcile" } recompute the term from the anchor, so the
//          table agrees with the season the app is configured for. This is the
//          season rollover, and it is idempotent — it can be run twice, or
//          over a row pasted five minutes ago, without moving anything twice.
//          That property is why it is safe to have a button for it at all.
//
// Both write actions accept `dryRun` and default to it being off; the panel
// always previews first.

interface Report {
  seasonStartYear: number;
  checkedAt: string;
  total: number;
  counts: Record<string, number>;
  backfillable: number;
  reconcilable: number;
  /** Capped per bucket — this is a worklist, not an export. */
  rows: Record<string, {
    id: string; name: string; teamId: string | null; capHit: number;
    yearsRemaining: number; expiryYear: number | null; expiryStatus: string | null;
    suggestedExpiryYear: number | null; reconciledYears: number | null; why: string;
  }[]>;
}

const PER_BUCKET = 60;

async function loadRows() {
  return db.select({
    id: playersTable.id,
    name: playersTable.name,
    teamId: playersTable.teamId,
    capHit: playersTable.capHit,
    yearsRemaining: playersTable.yearsRemaining,
    expiryYear: playersTable.expiryYear,
    expiryStatus: playersTable.expiryStatus,
    retired: playersTable.retired,
    source: playersTable.source,
  }).from(playersTable);
}

export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  await ensurePlayerTable();
  await ensurePlayerColumns();

  try {
    const rows = await loadRows();
    const audit = auditTerms(rows as TermRow[]);

    const out: Report["rows"] = {};
    for (const [issue, list] of Object.entries(audit.byIssue)) {
      if (list.length === 0) continue;
      out[issue] = list.slice(0, PER_BUCKET).map(r => ({
        id: r.id, name: r.name,
        teamId: (r as { teamId?: string | null }).teamId ?? null,
        capHit: r.capHit, yearsRemaining: r.yearsRemaining,
        expiryYear: r.expiryYear, expiryStatus: r.expiryStatus,
        suggestedExpiryYear: r.verdict.suggestedExpiryYear,
        reconciledYears: r.verdict.reconciledYears,
        why: r.verdict.why,
      }));
    }

    const report: Report = {
      seasonStartYear: audit.seasonStartYear,
      checkedAt: new Date().toISOString(),
      total: audit.total,
      counts: audit.counts,
      backfillable: audit.backfillable,
      reconcilable: audit.reconcilable,
      rows: out,
    };
    return NextResponse.json(report);
  } catch (e) {
    // An empty panel reads as "no problems", which is the one thing it must
    // never claim when it could not look.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "could not read the players table" },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;
  await ensurePlayerTable();
  await ensurePlayerColumns();

  let body: { action?: string; dryRun?: boolean } = {};
  try { body = await req.json(); } catch { /* no body */ }

  const action = body.action;
  if (action !== "backfill" && action !== "reconcile") {
    return NextResponse.json({ error: 'action must be "backfill" or "reconcile"' }, { status: 400 });
  }
  const dryRun = body.dryRun === true;

  try {
    const rows = await loadRows();
    const changed: { id: string; name: string; from: string; to: string }[] = [];
    const refused: { name: string; why: string }[] = [];

    for (const row of rows) {
      const verdict = auditTerm(row as TermRow);

      if (action === "backfill") {
        if (verdict.backfillable && verdict.suggestedExpiryYear != null) {
          changed.push({
            id: row.id, name: row.name,
            from: "no anchor", to: String(verdict.suggestedExpiryYear),
          });
          if (!dryRun) {
            await db.update(playersTable)
              .set({ expiryYear: verdict.suggestedExpiryYear })
              .where(eq(playersTable.id, row.id))
              .catch(() => {});
          }
        } else if (verdict.issue && verdict.issue !== "noAnchor" && row.expiryYear == null) {
          refused.push({ name: row.name, why: verdict.why });
        }
        continue;
      }

      // reconcile
      if (verdict.reconciledYears != null && verdict.reconciledYears !== row.yearsRemaining) {
        changed.push({
          id: row.id, name: row.name,
          from: `${row.yearsRemaining}yr`, to: `${verdict.reconciledYears}yr`,
        });
        if (!dryRun) {
          await db.update(playersTable)
            .set({ yearsRemaining: verdict.reconciledYears })
            .where(eq(playersTable.id, row.id))
            .catch(() => {});
        }
      } else if (row.expiryYear == null && !row.retired) {
        // No anchor means this row cannot be rolled over at all. Saying so is
        // the point: a reconcile that silently skipped half the league would
        // look exactly like one that worked.
        refused.push({ name: row.name, why: "no anchor to reconcile from" });
      }
    }

    let clearedCacheKeys: string[] = [];
    if (!dryRun && changed.length > 0) {
      clearedCacheKeys = await clearTeamCaches(redis, db);
    }

    return NextResponse.json({
      ok: true,
      action,
      dryRun,
      seasonStartYear: SEASON_START_YEAR,
      changedCount: changed.length,
      refusedCount: refused.length,
      changed: changed.slice(0, 100),
      refused: refused.slice(0, 40),
      clearedCacheKeys,
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "contract-term update failed" },
      { status: 500 },
    );
  }
}
