import { describe, expect, it } from "vitest";
import { deriveContractStatus } from "../app/lib/roster-assembly";

// The read path now resolves free-agency status from the DB's stored expiry
// facts via this pure helper. These cases pin the orthogonal behavior.
describe("deriveContractStatus", () => {
  const OFFSEASON = 2026;

  it("marks a UFA expiring this offseason as a pending free agent", () => {
    const r = deriveContractStatus({ expiryStatus: "UFA", expiryYear: 2026, offseasonYear: OFFSEASON });
    expect(r).toEqual({ contractStatus: "UFA", expiresThisOffseason: true, normExpiry: "UFA" });
  });

  it("marks an RFA expiring this offseason as a pending free agent", () => {
    const r = deriveContractStatus({ expiryStatus: "RFA", expiryYear: 2026, offseasonYear: OFFSEASON });
    expect(r.contractStatus).toBe("RFA");
    expect(r.expiresThisOffseason).toBe(true);
  });

  it("treats a future-expiry UFA as SIGNED (not pending yet)", () => {
    const r = deriveContractStatus({ expiryStatus: "UFA", expiryYear: 2028, offseasonYear: OFFSEASON });
    expect(r.contractStatus).toBe("SIGNED");
    expect(r.expiresThisOffseason).toBe(false);
  });

  it("treats a player with no expiry status as SIGNED", () => {
    const r = deriveContractStatus({ expiryStatus: null, expiryYear: null, offseasonYear: OFFSEASON });
    expect(r.contractStatus).toBe("SIGNED");
    expect(r.expiresThisOffseason).toBe(false);
  });

  it("suppresses FA for an ELC draftee (both draftOverall + isELC)", () => {
    const r = deriveContractStatus({ expiryStatus: "RFA", expiryYear: 2026, draftOverall: 5, isELC: true, offseasonYear: OFFSEASON });
    expect(r.expiresThisOffseason).toBe(false);
  });

  it("allows a draftee without ELC flag to expire as RFA", () => {
    const r = deriveContractStatus({ expiryStatus: "RFA", expiryYear: 2026, draftOverall: 5, offseasonYear: OFFSEASON });
    expect(r.expiresThisOffseason).toBe(true);
  });

  it("allows an ELC player without draftOverall to expire as RFA", () => {
    const r = deriveContractStatus({ expiryStatus: "RFA", expiryYear: 2026, isELC: true, offseasonYear: OFFSEASON });
    expect(r.expiresThisOffseason).toBe(true);
  });

  it("falls back to the final-year heuristic when no expiry year is known", () => {
    expect(deriveContractStatus({ expiryStatus: "UFA", expiryYear: null, yearsRemaining: 1, offseasonYear: OFFSEASON }).expiresThisOffseason).toBe(true);
    expect(deriveContractStatus({ expiryStatus: "UFA", expiryYear: null, yearsRemaining: 3, offseasonYear: OFFSEASON }).expiresThisOffseason).toBe(false);
  });
});
