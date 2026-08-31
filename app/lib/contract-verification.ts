// ── contract-verification.ts ─────────────────────────────────────
//
// `contract-term.ts` classifies whether a row's `expiryYear` and
// `yearsRemaining` agree with each other. It cannot tell you whether either
// number is still TRUE — a row where `expiryYear = seasonStartYear +
// yearsRemaining` holds perfectly is reported "anchored and consistent"
// whether that was confirmed against a real source yesterday or captured
// once and never touched again, because both figures are read off the same
// row and neither carries a date.
//
// Proven against a live 1,640-player production export (Aug 31 2026): 436
// players share the exact shape Korchinski's original bug had — a term that
// LOOKS plausible and is internally self-consistent — and every one of them
// reads "ok" from `auditTerm`. That tool is not wrong; it is answering a
// different question. This module answers the one it structurally cannot:
// when was this row last actually confirmed against a source, as opposed to
// merely consistent with itself?
//
// `termVerifiedAt` is stamped at the two places a human is actually looking
// at a real source when the write happens — the admin contract editor and
// the PuckPedia paste-box ingest (see app/api/admin/contracts/route.ts) —
// not on every touch of the row.

/** A year with no reconfirmation past this is flagged, not deleted or hidden. */
export const TERM_VERIFICATION_STALE_DAYS = 365;

export function daysSinceVerified(
  termVerifiedAt: string | null | undefined,
  asOf: Date = new Date(),
): number | null {
  if (!termVerifiedAt) return null;
  const t = Date.parse(termVerifiedAt);
  if (!Number.isFinite(t)) return null;
  const days = Math.floor((asOf.getTime() - t) / 86_400_000);
  return days >= 0 ? days : 0;
}

export type VerificationState = "unverified" | "stale" | "fresh";

/**
 * `unverified` — no `termVerifiedAt` at all (never confirmed since this
 * column existed, or the row predates it — most of the roster, today).
 * `stale` — confirmed once, but longer ago than the season-length window.
 * `fresh` — confirmed within the window.
 */
export function classifyVerification(
  termVerifiedAt: string | null | undefined,
  asOf: Date = new Date(),
): VerificationState {
  const days = daysSinceVerified(termVerifiedAt, asOf);
  if (days == null) return "unverified";
  return days > TERM_VERIFICATION_STALE_DAYS ? "stale" : "fresh";
}

export interface VerificationRow {
  id: string;
  name: string;
  capHit: number;
  termVerifiedAt?: string | null;
  retired?: boolean | null;
}

export interface VerificationAudit {
  asOf: string;
  staleDays: number;
  /** Excludes retired players — a retired contract's term is history, not a live claim. */
  total: number;
  unverified: number;
  stale: number;
  fresh: number;
  /** unverified + stale rows, worst (never-verified, then oldest) first, money first within each. */
  worklist: (VerificationRow & { daysSinceVerified: number | null; state: VerificationState })[];
}

export function auditVerification(
  rows: VerificationRow[],
  asOf: Date = new Date(),
): VerificationAudit {
  const live = rows.filter((r) => !r.retired);
  let unverified = 0;
  let stale = 0;
  let fresh = 0;
  const worklist: VerificationAudit["worklist"] = [];

  for (const r of live) {
    const state = classifyVerification(r.termVerifiedAt, asOf);
    if (state === "unverified") unverified++;
    else if (state === "stale") stale++;
    else fresh++;
    if (state !== "fresh") {
      worklist.push({ ...r, daysSinceVerified: daysSinceVerified(r.termVerifiedAt, asOf), state });
    }
  }

  worklist.sort((a, b) => {
    // Never-verified before merely-stale, then most money first within each.
    if (a.state !== b.state) return a.state === "unverified" ? -1 : 1;
    return b.capHit - a.capHit;
  });

  return {
    asOf: asOf.toISOString(),
    staleDays: TERM_VERIFICATION_STALE_DAYS,
    total: live.length,
    unverified,
    stale,
    fresh,
    worklist,
  };
}
