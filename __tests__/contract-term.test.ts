import { describe, it, expect } from "vitest";
import { auditTerm, auditTerms, anchorFromTerm, MAX_CBA_TERM, type TermRow } from "@/app/lib/contract-term";

const SEASON = 2026;

const row = (over: Partial<TermRow> = {}): TermRow => ({
  id: "x", name: "A Player", capHit: 3, yearsRemaining: 3,
  expiryYear: null, expiryStatus: null, retired: false,
  ...over,
});

describe("contract-term — the anchor", () => {
  it("reads Hanifin the way PuckPedia does", () => {
    // Year 3 of 8, 24/25 → 31/32, UFA 2032. Six seasons left counting 2026-27,
    // and the anchor is the year he reaches the market — which does not move
    // when the season does.
    const v = auditTerm(row({ name: "Noah Hanifin", capHit: 7.35, yearsRemaining: 6 }), SEASON);
    expect(v.suggestedExpiryYear).toBe(2032);
    expect(v.backfillable).toBe(true);
  });

  it("agrees with itself in both directions", () => {
    const anchored = auditTerm(row({ yearsRemaining: 6, expiryYear: 2032 }), SEASON);
    expect(anchored.issue).toBeNull();
    expect(anchored.reconciledYears).toBe(6);
  });

  it("is idempotent across a season boundary — the whole point of it", () => {
    // Same contract, next season. The anchor does not move; the term falls out
    // of it. Nothing has to remember whether a decrement already ran.
    const anchoredRow = row({ yearsRemaining: 6, expiryYear: 2032 });
    expect(auditTerm(anchoredRow, 2027).reconciledYears).toBe(5);
    expect(auditTerm({ ...anchoredRow, yearsRemaining: 5 }, 2027).issue).toBeNull();
    // And running it again in the same season changes nothing.
    expect(auditTerm({ ...anchoredRow, yearsRemaining: 5 }, 2027).reconciledYears).toBe(5);
  });

  it("reports a term that contradicts its own anchor", () => {
    const v = auditTerm(row({ yearsRemaining: 8, expiryYear: 2032 }), SEASON);
    expect(v.issue).toBe("anchorDisagrees");
    expect(v.reconciledYears).toBe(6);
    // It does not quietly fix it. Which of the two is right is not knowable
    // from the row.
    expect(v.backfillable).toBe(false);
  });
});

describe("contract-term — what it refuses to anchor", () => {
  it("leaves a hand-set pending free agent alone", () => {
    // This is the one that matters. With no anchor, `deriveContractStatus`
    // falls back to "term <= 1" to call him pending — and terms are floored to
    // 1 all through the pipeline. Anchoring him to 2027 would move him a year
    // out and turn a free agent back into a signed player, which is the
    // phantom-bargain bug arriving from the other side.
    const v = auditTerm(row({ yearsRemaining: 1, expiryStatus: "UFA" }), SEASON);
    expect(v.issue).toBe("pendingFaNoAnchor");
    expect(v.backfillable).toBe(false);
    expect(v.suggestedExpiryYear).toBeNull();
  });

  it("flags a term sitting at the CBA maximum", () => {
    // 8 years remaining can only be true of a deal signed this offseason.
    // Anchoring it would make a term-at-signing permanent.
    const v = auditTerm(row({ yearsRemaining: MAX_CBA_TERM }), SEASON);
    expect(v.issue).toBe("atMaxTerm");
    expect(v.backfillable).toBe(false);
  });

  it("still anchors a legitimately new maximum-term deal, once anchored", () => {
    const v = auditTerm(row({ yearsRemaining: 8, expiryYear: 2034 }), SEASON);
    expect(v.issue).toBeNull();
  });

  it("calls a term longer than the CBA allows an error, not a gap", () => {
    expect(auditTerm(row({ yearsRemaining: 9 }), SEASON).issue).toBe("overMaxTerm");
    // Even with an anchor: the term itself is impossible.
    expect(auditTerm(row({ yearsRemaining: 9, expiryYear: 2035 }), SEASON).issue).toBe("overMaxTerm");
  });

  it("flags a row with neither a term nor a class", () => {
    expect(auditTerm(row({ yearsRemaining: 0 }), SEASON).issue).toBe("zeroTermNoStatus");
  });

  it("says nothing about a retired player", () => {
    const v = auditTerm(row({ yearsRemaining: 8, retired: true }), SEASON);
    expect(v.issue).toBeNull();
    expect(v.backfillable).toBe(false);
  });
});

describe("contract-term — a term implies its anchor", () => {
  // One statement of the rule, because three callers want it: the editor
  // dialog showing what SAVE will write, the endpoint writing it, and the
  // paste box anchoring a fresh signing.

  it("turns the term the operator typed into a year", () => {
    // Zegras signs 4 × $9.125M. Typing 4 should not leave anyone working out
    // 2030 for themselves, or leaving it blank.
    expect(anchorFromTerm(4, SEASON)).toBe(2030);
    expect(anchorFromTerm(1, SEASON)).toBe(2027);
    expect(anchorFromTerm(MAX_CBA_TERM, SEASON)).toBe(2034);
  });

  it("declines when the term cannot imply one", () => {
    expect(anchorFromTerm(0, SEASON)).toBeNull();
    expect(anchorFromTerm(-2, SEASON)).toBeNull();
    expect(anchorFromTerm(9, SEASON)).toBeNull();
    expect(anchorFromTerm(null, SEASON)).toBeNull();
    expect(anchorFromTerm(NaN, SEASON)).toBeNull();
  });

  it("round-trips against the audit", () => {
    // What the dialog shows is what the audit will later call consistent.
    const anchored = { yearsRemaining: 4, expiryYear: anchorFromTerm(4, SEASON) };
    expect(auditTerm(row(anchored), SEASON).issue).toBeNull();
  });
});

describe("contract-term — the expiry year of nought", () => {
  // The admin editor posts `expiryYear: null` whenever the status is SIGNED,
  // and the endpoint tested `Number.isFinite(Number(value))`. `Number(null)`
  // is 0 and 0 is finite, so every hand-edited signed contract was stamped
  // with an expiry year of zero. Alex Tuch and Trevor Zegras both had one.

  it("does not read a stored 0 as a year", () => {
    const v = auditTerm(row({ name: "Trevor Zegras", capHit: 9.125, yearsRemaining: 4, expiryYear: 0 }), SEASON);
    expect(v.issue).toBe("badAnchor");
    // 0 − 2026 clamps to 0, so the naive reading is "this deal is already
    // over" for a player who just signed for four years.
    expect(v.reconciledYears).toBeNull();
  });

  it("overwrites it when the term behind it is trustworthy", () => {
    const v = auditTerm(row({ name: "Trevor Zegras", yearsRemaining: 4, expiryYear: 0 }), SEASON);
    expect(v.backfillable).toBe(true);
    expect(v.suggestedExpiryYear).toBe(2030);
  });

  it("does not overwrite it when the term behind it is not", () => {
    // Tuch carries eight years, which is the maximum and therefore suspect.
    // A bad anchor is not a reason to write a bad anchor.
    const v = auditTerm(row({ name: "Alex Tuch", capHit: 10.5, yearsRemaining: 8, expiryYear: 0 }), SEASON);
    expect(v.issue).toBe("badAnchor");
    expect(v.backfillable).toBe(false);
    expect(v.why).toMatch(/maximum/);
  });

  it("says why a 0 on a pending free agent is dangerous rather than wrong", () => {
    // `deriveContractStatus` tests `expiryYear <= offseasonYear`, and 0 passes
    // — so the row behaves correctly, by accident, for as long as the class
    // stays. It is still not a year.
    const v = auditTerm(row({ yearsRemaining: 1, expiryYear: 0, expiryStatus: "UFA" }), SEASON);
    expect(v.issue).toBe("badAnchor");
    expect(v.backfillable).toBe(false);
    expect(v.why).toMatch(/already expired/);
  });

  it("rejects anything outside the range a real anchor could fall in", () => {
    expect(auditTerm(row({ yearsRemaining: 3, expiryYear: 1970 }), SEASON).issue).toBe("badAnchor");
    expect(auditTerm(row({ yearsRemaining: 3, expiryYear: 20260 }), SEASON).issue).toBe("badAnchor");
    // But a deal that ended recently is a real anchor, not a broken one.
    expect(auditTerm(row({ yearsRemaining: 1, expiryYear: 2025 }), SEASON).issue).toBe("anchorDisagrees");
  });
});

describe("contract-term — the audit over a table", () => {
  const table = [
    row({ id: "a", name: "Anchored", yearsRemaining: 6, expiryYear: 2032 }),
    row({ id: "b", name: "Needs anchor", capHit: 9, yearsRemaining: 2 }),
    row({ id: "c", name: "Cheap gap", capHit: 0.9, yearsRemaining: 2 }),
    row({ id: "d", name: "Max term", yearsRemaining: 8 }),
    row({ id: "e", name: "Pending FA", yearsRemaining: 1, expiryStatus: "UFA" }),
    row({ id: "f", name: "Contradicts", yearsRemaining: 3, expiryYear: 2032 }),
  ];

  it("counts every row exactly once", () => {
    const a = auditTerms(table, SEASON);
    const summed = Object.values(a.counts).reduce((s, n) => s + n, 0);
    expect(summed).toBe(table.length);
    expect(a.total).toBe(table.length);
  });

  it("says how much work each action would do", () => {
    const a = auditTerms(table, SEASON);
    expect(a.backfillable).toBe(2);      // b and c
    expect(a.reconcilable).toBe(1);      // f, whose anchor implies 6 not 3
  });

  it("sorts each bucket by money, because that is what makes a gap matter", () => {
    const a = auditTerms(table, SEASON);
    expect(a.byIssue.noAnchor.map(r => r.name)).toEqual(["Needs anchor", "Cheap gap"]);
  });

  it("survives an empty table", () => {
    const a = auditTerms([], SEASON);
    expect(a.total).toBe(0);
    expect(a.backfillable).toBe(0);
  });
});
