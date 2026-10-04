import { describe, expect, it } from "vitest";
import { deriveContractStatus, resolveLiveContractFields } from "../app/lib/roster-assembly";

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

// ── Extension lifecycle ───────────────────────────────────────────────────────
// Start timing comes from the expiry anchor and the application's season, not
// from the UFA/RFA class. A SIGNED row (no class) with a good expiry year used
// to be unable to activate, and an active extension used to regain its full
// term every season.
describe("deriveContractStatus — extension lifecycle (SIGNED/null status)", () => {
  // Current $3.85M deal, final season 2026-27 (expiryYear 2027), six years at $12.5M after.
  const signed = {
    expiryStatus: null, expiryYear: 2027, yearsRemaining: 1,
    extensionCapHit: 12.5, extensionYears: 6,
  };
  const at = (offseasonYear: number, extra: object = {}) =>
    deriveContractStatus({ ...signed, offseasonYear, ...extra });

  it("is pending in 2026-27 and the current deal stands", () => {
    const r = at(2026);
    expect(r.extension).toEqual({ state: "PENDING", aav: 12.5, term: 6 });
    expect(r.extensionTiming).toMatchObject({ startSeason: "2027-28", endSeason: "2032-33", flags: [] });
    expect(r.contractStatus).toBe("SIGNED");
    expect(r.expiresThisOffseason).toBe(false);
  });

  it("activates in 2027-28 even though there is no RFA/UFA class", () => {
    const r = at(2027);
    expect(r.extension).toEqual({ state: "ACTIVE", aav: 12.5, term: 6 });
    expect(r.contractStatus).toBe("SIGNED");
    expect(r.expiresThisOffseason).toBe(false);
  });

  it("counts the remaining term down in later seasons", () => {
    expect(at(2028).extension).toEqual({ state: "ACTIVE", aav: 12.5, term: 5 });
    expect(at(2031).extension).toEqual({ state: "ACTIVE", aav: 12.5, term: 2 });
  });

  it("is in its final season with one year left, then expires", () => {
    expect(at(2032).extension).toEqual({ state: "ACTIVE", aav: 12.5, term: 1 });
    expect(at(2033).extension.state).toBe("EXPIRED");
  });

  it("a finished extension on a classed player reads as a pending free agent again", () => {
    const r = at(2033, { expiryStatus: "UFA" });
    expect(r.extension.state).toBe("EXPIRED");
    expect(r.contractStatus).toBe("UFA");
    expect(r.expiresThisOffseason).toBe(true);
  });

  it("an Evangelista-style $3M deal with a five-year $7.25M AAV extension", () => {
    const e = { expiryStatus: null, expiryYear: 2027, yearsRemaining: 1, extensionCapHit: 7.25, extensionYears: 5 };
    expect(deriveContractStatus({ ...e, offseasonYear: 2026 }).extension).toEqual({ state: "PENDING", aav: 7.25, term: 5 });
    expect(deriveContractStatus({ ...e, offseasonYear: 2027 }).extension).toEqual({ state: "ACTIVE", aav: 7.25, term: 5 });
    expect(deriveContractStatus({ ...e, offseasonYear: 2031 }).extensionTiming).toMatchObject({ remaining: 1, endSeason: "2031-32" });
  });

  it("flags missing or contradictory dates instead of guessing", () => {
    const none = deriveContractStatus({ ...signed, expiryYear: null, offseasonYear: 2026 });
    expect(none.extension.state).toBe("PENDING");
    expect(none.extensionTiming?.flags).toContain("NO_ANCHOR");
    const zero = deriveContractStatus({ ...signed, expiryYear: 0, offseasonYear: 2026 });
    expect(zero.extensionTiming?.flags).toContain("NO_ANCHOR");
    const conflict = deriveContractStatus({ ...signed, yearsRemaining: 4, offseasonYear: 2026 });
    expect(conflict.extensionTiming?.flags).toContain("TERM_ANCHOR_MISMATCH");
    expect(conflict.extensionTiming?.startSeason).toBe("2027-28");
    const late = deriveContractStatus({ ...signed, offseasonYear: 2026, extensionSignedAt: "2027-08-01" });
    expect(late.extensionTiming?.flags).toContain("SIGNED_AFTER_START");
  });
});

// ── Integrated roster contract fields across the extension's whole life ───────
// The original deal ($3.85M, one year, expiryYear 2027, no class on record) with
// a six-year $12.5M extension, read in each application season. Asserts the
// fields a roster row actually carries, not just the extension state.
describe("roster contract fields across an extension lifecycle (SIGNED/null class)", () => {
  const input = {
    expiryStatus: null, expiryYear: 2027, yearsRemaining: 1,
    extensionCapHit: 12.5, extensionYears: 6,
  };
  const fieldsAt = (offseasonYear: number, expiryStatus: string | null = null) => {
    const d = deriveContractStatus({ ...input, expiryStatus, offseasonYear });
    const live = resolveLiveContractFields({
      extension: d.extension, expiresThisOffseason: d.expiresThisOffseason,
      isLikelyELC: false, elcCapHit: 0.925, storedCapHit: 3.85,
    });
    return {
      state: d.extension.state,
      contractStatus: d.contractStatus,
      expires: d.expiresThisOffseason,
      capHit: live.rawCapHit,
      lastCapHit: live.lastCapHitRaw,
      // Stored term (1) stands when the helper has no verdict.
      years: live.years ?? 1,
    };
  };

  it("pending: the original deal stands, signed", () => {
    expect(fieldsAt(2026)).toEqual({ state: "PENDING", contractStatus: "SIGNED", expires: false, capHit: 3.85, lastCapHit: 3.85, years: 1 });
  });

  it("active from its start season: extension salary and full term", () => {
    expect(fieldsAt(2027)).toEqual({ state: "ACTIVE", contractStatus: "SIGNED", expires: false, capHit: 12.5, lastCapHit: 3.85, years: 6 });
  });

  it("final active season: extension salary, one year left, still signed", () => {
    expect(fieldsAt(2032)).toEqual({ state: "ACTIVE", contractStatus: "SIGNED", expires: false, capHit: 12.5, lastCapHit: 3.85, years: 1 });
  });

  it("expired (2033-34): does not resurrect the $3.85M deal or read as signed, and does not invent a class", () => {
    const f = fieldsAt(2033);
    expect(f.state).toBe("EXPIRED");
    expect(f.expires).toBe(true);           // known contract end
    expect(f.contractStatus).toBeNull();    // class unknown — not SIGNED, not a guessed UFA/RFA
    expect(f.capHit).toBe(0);               // nothing under contract
    expect(f.years).toBe(0);
    expect(f.lastCapHit).toBe(12.5);        // last real contract was the extension, not $3.85M
    expect(fieldsAt(2036)).toEqual(f);      // stays coherent in later seasons
  });

  it("expired with a recorded class keeps that class", () => {
    expect(fieldsAt(2033, "UFA")).toMatchObject({ contractStatus: "UFA", expires: true, capHit: 0, years: 0, lastCapHit: 12.5 });
    expect(fieldsAt(2033, "RFA").contractStatus).toBe("RFA");
  });

  it("a plain SIGNED/null deal with no extension is unchanged", () => {
    const d = deriveContractStatus({ expiryStatus: null, expiryYear: 2027, yearsRemaining: 1, offseasonYear: 2033 });
    expect(d).toMatchObject({ contractStatus: "SIGNED", expiresThisOffseason: false });
  });
});
