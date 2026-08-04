import { NextResponse } from "next/server";
import { assembleCanonicalRoster } from "@/app/lib/roster-assembly";
import { requireAdmin } from "@/app/lib/admin-auth";
import type { Asset } from "@/app/lib/trade-types";

export const dynamic = "force-dynamic";

// ── What the contract pipeline could not resolve ──────────────
//
// `roster-assembly` already computes `contractMissing` for every player it
// cannot find a deal for, and a comment there has said "surfaced for the
// admin's needs-data view" since before that view existed. It did not exist.
// The flag was computed and dropped, which is why a pending free agent
// advertised as a $9.6M bargain had to be found by reading a player page.
//
// This is that view. It reports what the pipeline knows and nobody could see.
//
// THREE DIFFERENT PROBLEMS, DELIBERATELY NOT MERGED
//
//   missing    — no contract row resolved, and not an entry-level or drafted
//                player where a placeholder is reasonable. The $0.925M he is
//                carrying is a guess. These need entering by hand.
//
//   pendingFa  — his deal has run out. `capHit` is zeroed ON PURPOSE so trade
//                pricing treats him as a nought-year rental. Correct, and worth
//                seeing, because a recent signing that has not reached the
//                contract source yet looks exactly like this.
//
//   placeholder — carrying the league-minimum default without being flagged
//                missing, usually a young player. Lower priority, but a star
//                sitting on $0.925M is a source failure wearing a disguise.
//
// Read-only. Nothing here writes.

interface Row {
  id: string;
  name: string;
  teamId: string;
  position: string;
  age: number;
  games: number;
  capHit: number;
  lastCapHit: number | null;
  yearsRemaining: number;
  /** Trade value, so the list can be sorted by who it actually matters for. */
  nav: number | null;
  expiryStatus: string | null;
}

const LEAGUE_MIN_PLACEHOLDER = 0.925;

const toRow = (p: Asset): Row => ({
  id: String(p.id),
  name: p.name,
  teamId: p.teamId,
  position: p.position,
  age: p.age,
  games: p.games ?? 0,
  capHit: p.capHit,
  lastCapHit: p.lastCapHit ?? null,
  yearsRemaining: p.yearsRemaining,
  nav: null,
  expiryStatus: p.expiryStatus ?? null,
});

export async function GET(req: Request) {
  const denied = await requireAdmin(req);
  if (denied) return denied;

  try {
    const roster = await assembleCanonicalRoster();
    const players = ((roster as { players?: Asset[] }).players ?? [])
      .filter(p => p.position !== "Pick");

    const missing = players.filter(p => p.contractMissing).map(toRow);
    const pendingFa = players.filter(p => !p.contractMissing && p.expiresThisOffseason).map(toRow);
    // A placeholder is only interesting on someone who plays. A 19-year-old who
    // has never dressed carrying the default is not a data problem.
    const placeholder = players
      .filter(p => !p.contractMissing && !p.expiresThisOffseason
        && Math.abs(p.capHit - LEAGUE_MIN_PLACEHOLDER) < 0.0005
        && (p.games ?? 0) >= 20)
      .map(toRow);

    // Most-played first: a missing contract on a first-liner is a launch
    // problem, the same gap on a fourth-line call-up is housekeeping.
    const bySignificance = (a: Row, b: Row) => b.games - a.games;
    missing.sort(bySignificance);
    pendingFa.sort(bySignificance);
    placeholder.sort(bySignificance);

    return NextResponse.json({
      checkedAt: new Date().toISOString(),
      total: players.length,
      counts: {
        missing: missing.length,
        pendingFa: pendingFa.length,
        placeholder: placeholder.length,
        healthy: players.length - missing.length - pendingFa.length - placeholder.length,
      },
      missing,
      pendingFa,
      placeholder,
    });
  } catch (e) {
    // A failure here means the roster itself would not assemble, which is worse
    // than a missing contract and should say so rather than reporting zero
    // problems.
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "could not assemble the roster" },
      { status: 500 },
    );
  }
}
