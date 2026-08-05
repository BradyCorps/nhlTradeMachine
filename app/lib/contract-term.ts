// ── contract-term.ts ─────────────────────────────────────────────
//
// `yearsRemaining` is not a fact about a contract. It is a fact about a
// contract AND a season, and the row does not record which season.
//
// Hanifin is year 3 of 8: six seasons left counting 2026-27. Come 2027-28 the
// same true contract is five. Nothing in the app advances that — the only
// rollover here is `advanceSeason`, which is Cup Run's in-memory simulation and
// never touches the table. So every stored term is right for whichever season
// it happened to be captured in, and there is no way to tell which that was.
//
// That is why a "decrement everything by one" button would be wrong. Contracts
// are hand-maintained from PuckPedia now, and a pasted row is already current;
// decrementing it makes it wrong. The rows that need moving and the rows that
// do not look identical.
//
// THE ANCHOR
//
// `expiryYear` is already on the table and does not drift: it is the calendar
// year the player reaches the market. Hanifin's is 2032 whatever season you
// read it in. So:
//
//     expiryYear     = seasonStartYear + yearsRemaining
//     yearsRemaining = expiryYear − seasonStartYear
//
// Derive the term from the anchor instead of decrementing it and a rollover
// becomes idempotent: running it twice, or running it over a row you pasted
// five minutes ago, changes nothing. That is the property that makes it safe
// to run at all.
//
// Nothing here writes, and nothing guesses. It classifies.

import { SEASON_START_YEAR } from "@/app/lib/contract-expiry";

/** CBA maximum term: 8 years re-signing, 7 signing elsewhere. */
export const MAX_CBA_TERM = 8;

export type TermIssue =
  /** Longer than any contract may legally be. */
  | "overMaxTerm"
  /** Exactly at the maximum, which only a deal signed THIS offseason can be. */
  | "atMaxTerm"
  /** Anchor and term are both present and contradict each other. */
  | "anchorDisagrees"
  /** Carries a UFA/RFA class but no anchor — see the note in `auditTerm`. */
  | "pendingFaNoAnchor"
  /** No term and no class, so nothing says when this deal ends. */
  | "zeroTermNoStatus"
  /** Fine, just not anchored yet. The backfill queue. */
  | "noAnchor";

export interface TermRow {
  id: string;
  name: string;
  capHit: number;
  yearsRemaining: number;
  expiryYear: number | null;
  expiryStatus: string | null;
  retired?: boolean | null;
}

export interface TermVerdict {
  issue: TermIssue | null;
  /** The anchor this row should carry, where that can be said safely. */
  suggestedExpiryYear: number | null;
  /** True only when writing `suggestedExpiryYear` needs no human. */
  backfillable: boolean;
  /** The term the anchor already implies, for a reconcile. */
  reconciledYears: number | null;
  why: string;
}

const clampTerm = (n: number): number => Math.max(0, Math.round(n));

/**
 * Classify one row.
 *
 * The one rule here that is not arithmetic: a row carrying a UFA/RFA class
 * with no anchor is NEVER backfilled. `deriveContractStatus` treats a missing
 * anchor by falling back to `yearsRemaining <= 1`, and terms are floored to 1
 * across the pipeline, so that fallback is what currently makes hand-set
 * pending free agents read as pending. Anchoring one at
 * `seasonStartYear + 1` would move it a year into the future and quietly turn
 * a free agent back into a signed player — which is the bug that put a $9.6M
 * phantom bargain on the board, arriving from the other direction. Those rows
 * get reported and left alone.
 */
export function auditTerm(row: TermRow, seasonStartYear = SEASON_START_YEAR): TermVerdict {
  const none = { suggestedExpiryYear: null, backfillable: false, reconciledYears: null };

  if (row.retired) {
    return { ...none, issue: null, why: "retired — term is history, not a claim about a season" };
  }

  if (row.yearsRemaining > MAX_CBA_TERM) {
    return {
      ...none, issue: "overMaxTerm",
      why: `${row.yearsRemaining} years is longer than the CBA allows — the term is wrong, not just unanchored`,
    };
  }

  if (row.expiryYear != null) {
    const reconciledYears = clampTerm(row.expiryYear - seasonStartYear);
    if (reconciledYears !== row.yearsRemaining) {
      return {
        issue: "anchorDisagrees",
        suggestedExpiryYear: null,
        backfillable: false,
        reconciledYears,
        why: `anchored to ${row.expiryYear}, which is ${reconciledYears} year${reconciledYears === 1 ? "" : "s"} from ${seasonStartYear}-${String((seasonStartYear + 1) % 100).padStart(2, "0")}, but the row says ${row.yearsRemaining}`,
      };
    }
    return {
      issue: null, suggestedExpiryYear: row.expiryYear, backfillable: false, reconciledYears,
      why: "anchored and consistent",
    };
  }

  // ── No anchor from here down ─────────────────────────────────
  if (row.expiryStatus) {
    return {
      ...none, issue: "pendingFaNoAnchor",
      why: `classed ${row.expiryStatus} with no expiry year — the read path is falling back to "term <= 1" to call him pending, so anchoring him would silently sign him again`,
    };
  }

  if (row.yearsRemaining >= MAX_CBA_TERM) {
    return {
      ...none, issue: "atMaxTerm",
      why: `${row.yearsRemaining} years is the CBA maximum, which is only true of a deal signed this offseason — more likely the term at signing was stored instead of the term remaining`,
    };
  }

  if (row.yearsRemaining <= 0) {
    return {
      ...none, issue: "zeroTermNoStatus",
      why: "no term and no free-agency class — nothing here says when the deal ends",
    };
  }

  return {
    issue: "noAnchor",
    suggestedExpiryYear: seasonStartYear + row.yearsRemaining,
    backfillable: true,
    reconciledYears: null,
    why: `reaches the market in ${seasonStartYear + row.yearsRemaining}`,
  };
}

export interface TermAudit {
  seasonStartYear: number;
  total: number;
  counts: Record<TermIssue | "ok", number>;
  /** Rows by issue, worst first within each bucket by cap hit. */
  byIssue: Record<TermIssue, (TermRow & { verdict: TermVerdict })[]>;
  /** How many rows a backfill would write, and how many a reconcile would move. */
  backfillable: number;
  reconcilable: number;
}

const EMPTY_COUNTS = (): Record<TermIssue | "ok", number> => ({
  ok: 0, overMaxTerm: 0, atMaxTerm: 0, anchorDisagrees: 0,
  pendingFaNoAnchor: 0, zeroTermNoStatus: 0, noAnchor: 0,
});

export function auditTerms(rows: TermRow[], seasonStartYear = SEASON_START_YEAR): TermAudit {
  const counts = EMPTY_COUNTS();
  const byIssue = {
    overMaxTerm: [], atMaxTerm: [], anchorDisagrees: [],
    pendingFaNoAnchor: [], zeroTermNoStatus: [], noAnchor: [],
  } as TermAudit["byIssue"];
  let backfillable = 0;
  let reconcilable = 0;

  for (const row of rows) {
    const verdict = auditTerm(row, seasonStartYear);
    counts[verdict.issue ?? "ok"]++;
    if (verdict.issue) byIssue[verdict.issue].push({ ...row, verdict });
    if (verdict.backfillable) backfillable++;
    if (verdict.reconciledYears != null && verdict.reconciledYears !== row.yearsRemaining) reconcilable++;
  }

  // Money first. An unanchored fourth-liner is housekeeping; an unanchored
  // $9M contract moves a team's whole cap picture.
  for (const list of Object.values(byIssue)) list.sort((a, b) => b.capHit - a.capHit);

  return { seasonStartYear, total: rows.length, counts, byIssue, backfillable, reconcilable };
}
