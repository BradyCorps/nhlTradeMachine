import { describe, expect, it } from "vitest";
import {
  TERM_VERIFICATION_STALE_DAYS,
  auditVerification,
  classifyVerification,
  daysSinceVerified,
} from "@/app/lib/contract-verification";

describe("daysSinceVerified", () => {
  it("returns null when never verified", () => {
    expect(daysSinceVerified(null)).toBeNull();
    expect(daysSinceVerified(undefined)).toBeNull();
  });

  it("returns null for an unparseable timestamp rather than a false zero", () => {
    expect(daysSinceVerified("not-a-date")).toBeNull();
  });

  it("counts whole days elapsed", () => {
    const asOf = new Date("2026-08-31T00:00:00Z");
    expect(daysSinceVerified("2026-08-01T00:00:00Z", asOf)).toBe(30);
    expect(daysSinceVerified("2026-08-31T00:00:00Z", asOf)).toBe(0);
  });

  it("never returns negative — a future timestamp reads as just-verified", () => {
    const asOf = new Date("2026-08-31T00:00:00Z");
    expect(daysSinceVerified("2026-09-15T00:00:00Z", asOf)).toBe(0);
  });
});

describe("classifyVerification", () => {
  const asOf = new Date("2026-08-31T00:00:00Z");

  it("is unverified with no timestamp — never silently reads as healthy", () => {
    expect(classifyVerification(null, asOf)).toBe("unverified");
  });

  it("is fresh within the stale window", () => {
    expect(classifyVerification("2026-08-01T00:00:00Z", asOf)).toBe("fresh");
  });

  it("is stale past the window", () => {
    const old = new Date(asOf.getTime() - (TERM_VERIFICATION_STALE_DAYS + 1) * 86_400_000).toISOString();
    expect(classifyVerification(old, asOf)).toBe("stale");
  });

  it("is exactly fresh at the boundary", () => {
    const boundary = new Date(asOf.getTime() - TERM_VERIFICATION_STALE_DAYS * 86_400_000).toISOString();
    expect(classifyVerification(boundary, asOf)).toBe("fresh");
  });
});

describe("auditVerification", () => {
  const asOf = new Date("2026-08-31T00:00:00Z");

  it("counts unverified, stale, and fresh separately", () => {
    const audit = auditVerification([
      { id: "a", name: "A", capHit: 1, termVerifiedAt: null },
      { id: "b", name: "B", capHit: 2, termVerifiedAt: "2020-01-01T00:00:00Z" },
      { id: "c", name: "C", capHit: 3, termVerifiedAt: "2026-08-20T00:00:00Z" },
    ], asOf);
    expect(audit.total).toBe(3);
    expect(audit.unverified).toBe(1);
    expect(audit.stale).toBe(1);
    expect(audit.fresh).toBe(1);
  });

  it("excludes retired players — their term is history, not a live claim", () => {
    const audit = auditVerification([
      { id: "a", name: "A", capHit: 5, termVerifiedAt: null, retired: true },
    ], asOf);
    expect(audit.total).toBe(0);
    expect(audit.worklist).toHaveLength(0);
  });

  it("orders the worklist unverified-first, then by cap hit within each state", () => {
    const audit = auditVerification([
      { id: "cheap-stale", name: "Cheap Stale", capHit: 1, termVerifiedAt: "2020-01-01T00:00:00Z" },
      { id: "expensive-unverified", name: "Expensive Unverified", capHit: 9, termVerifiedAt: null },
      { id: "cheap-unverified", name: "Cheap Unverified", capHit: 0.9, termVerifiedAt: null },
      { id: "expensive-stale", name: "Expensive Stale", capHit: 8, termVerifiedAt: "2019-01-01T00:00:00Z" },
    ], asOf);
    expect(audit.worklist.map((r) => r.id)).toEqual([
      "expensive-unverified", "cheap-unverified", "expensive-stale", "cheap-stale",
    ]);
  });

  it("never puts a fresh row in the worklist", () => {
    const audit = auditVerification([
      { id: "a", name: "A", capHit: 10, termVerifiedAt: "2026-08-25T00:00:00Z" },
    ], asOf);
    expect(audit.fresh).toBe(1);
    expect(audit.worklist).toHaveLength(0);
  });

  // The finding this module exists for: proven against a live production
  // export, 436 of 1,640 players share a self-consistent-but-unverified
  // contract-term shape that auditTerm's own logic reads as "ok."
  it("flags a Korchinski-shaped row (plausible term, never independently confirmed) as unverified", () => {
    const audit = auditVerification([
      { id: "aaronekblad", name: "Aaron Ekblad", capHit: 6.1, termVerifiedAt: null },
    ], asOf);
    expect(audit.worklist[0]).toMatchObject({ id: "aaronekblad", state: "unverified" });
  });
});
