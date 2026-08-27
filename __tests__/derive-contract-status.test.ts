import { describe, expect, it } from "vitest";
import { deriveContractStatus } from "../app/lib/roster-assembly";

// The read path now resolves free-agency status from the DB's stored expiry
// facts via this pure helper. These cases pin the orthogonal behavior.
describe("deriveContractStatus", () => {
  const OFFSEASON = 2026;

  it("marks a UFA expiring this offseason as a pending free agent", () => {
    const r = deriveContractStatus({ expiryStatus: "UFA", expiryYear: 2026, offseasonYear: OFFSEASON });
    expect(r).toEqual({ contractStatus: "UFA", expiresThisOffseason: true, normExpiry: "UFA", extension: { state: "NONE" } });
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

  it("DATA-01: an expired-ELC row (Korchinski-shaped) reaches the market as RFA, not SIGNED", () => {
    // Real shape from the corrected league seed: a stale bundled contract
    // (capHit/yearsRemaining captured at signing, never rolled forward) with
    // an FA-class expiryStatus/expiryYear now layered on top. isELC is false
    // here because a bundled/DB contract match exists — the read path only
    // treats a player as a live ELC guess when no stored contract was found.
    const r = deriveContractStatus({
      expiryStatus: "RFA", expiryYear: 2026, yearsRemaining: 3,
      isELC: false, offseasonYear: OFFSEASON,
    });
    expect(r.contractStatus).toBe("RFA");
    expect(r.expiresThisOffseason).toBe(true);
  });

  it("falls back to the final-year heuristic when no expiry year is known", () => {
    expect(deriveContractStatus({ expiryStatus: "UFA", expiryYear: null, yearsRemaining: 1, offseasonYear: OFFSEASON }).expiresThisOffseason).toBe(true);
    expect(deriveContractStatus({ expiryStatus: "UFA", expiryYear: null, yearsRemaining: 3, offseasonYear: OFFSEASON }).expiresThisOffseason).toBe(false);
  });
});

// ── Recorded (admin-entered) extensions ──────────────────────────
//
// The reported bug: Carlsson and Celebrini both signed long-term deals that
// were entered in the admin contracts panel, and both still showed up in
// Armchair GM as RFAs about to hit the market. The extension reached the
// valuation engine and nothing else — the contract logic never asked about it.
describe("deriveContractStatus — recorded extensions", () => {
  const OFFSEASON = 2026;
  // An ELC running out this offseason, with the extension already on record.
  const carlsson = {
    expiryStatus: "RFA", expiryYear: 2026, isELC: true, offseasonYear: OFFSEASON,
    extensionCapHit: 18.8, extensionYears: 5,
  };

  it("does not send an extended player to the market", () => {
    const r = deriveContractStatus(carlsson);
    expect(r.expiresThisOffseason).toBe(false);
    expect(r.contractStatus).toBe("SIGNED");
  });

  it("reports the extension as ACTIVE once the old deal has run out", () => {
    // The deal it follows has ended, so it is the contract now, not a promise.
    expect(deriveContractStatus(carlsson).extension).toEqual({
      state: "ACTIVE", aav: 18.8, term: 5,
    });
  });

  it("reports the extension as PENDING while the current deal still runs", () => {
    const r = deriveContractStatus({
      expiryStatus: "UFA", expiryYear: 2029, offseasonYear: OFFSEASON,
      extensionCapHit: 9.5, extensionYears: 6,
    });
    expect(r.extension).toEqual({ state: "PENDING", aav: 9.5, term: 6 });
    expect(r.contractStatus).toBe("SIGNED");
  });

  it("keeps the expiry status he would have carried", () => {
    // The record of what he was is not destroyed by signing — it is what makes
    // "would have been an RFA" sayable, and what prices the extension.
    expect(deriveContractStatus(carlsson).normExpiry).toBe("RFA");
  });

  it("ignores a cleared or zero extension", () => {
    for (const extensionCapHit of [null, undefined, 0]) {
      const r = deriveContractStatus({ ...carlsson, extensionCapHit });
      expect(r.extension.state).toBe("NONE");
      expect(r.expiresThisOffseason).toBe(true);
    }
  });

  it("falls back to a one-year term when only an AAV was entered", () => {
    const r = deriveContractStatus({ ...carlsson, extensionYears: null });
    expect(r.extension).toEqual({ state: "ACTIVE", aav: 18.8, term: 1 });
  });

  it("changes nothing for a player with no extension", () => {
    const plain = { expiryStatus: "UFA", expiryYear: 2026, offseasonYear: OFFSEASON };
    expect(deriveContractStatus(plain)).toEqual({
      contractStatus: "UFA", expiresThisOffseason: true, normExpiry: "UFA",
      extension: { state: "NONE" },
    });
  });
});
