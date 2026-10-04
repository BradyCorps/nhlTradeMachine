import { describe, expect, it } from "vitest";
import {
  aavFromTotal, totalFromAav, formatMillions, parseExtensionInput, validateSigningDate,
  resolveExtensionTiming, buildExtensionPreview, seasonLabelFromStartYear,
} from "../app/lib/extension-terms";

describe("total / AAV conversion", () => {
  it("6 years and $75M total is $12.5M annual, never a $75M cap hit", () => {
    expect(aavFromTotal(75, 6)).toBe(12.5);
    expect(totalFromAav(12.5, 6)).toBe(75);
    const p = parseExtensionInput({ mode: "total", value: 75, years: 6 });
    expect(p).toMatchObject({ ok: true, aav: 12.5, total: 75, years: 6, exact: true });
  });

  it("5 years at $7.25M AAV is $36.25M total", () => {
    expect(parseExtensionInput({ mode: "aav", value: 7.25, years: 5 }))
      .toMatchObject({ ok: true, aav: 7.25, total: 36.25, exact: true });
  });

  it("rounds an uneven AAV to the dollar and says it is not exact", () => {
    const p = parseExtensionInput({ mode: "total", value: 75, years: 7 });
    expect(p).toMatchObject({ ok: true, aav: 10.714286, total: 75, exact: false });
    expect(formatMillions(10.714286)).toBe("$10.714286M");
    expect(formatMillions(12.5)).toBe("$12.5M");
    expect(formatMillions(3.85)).toBe("$3.85M");
  });

  it("refuses a total typed into the annual box", () => {
    const p = parseExtensionInput({ mode: "aav", value: 75, years: 6 });
    expect(p.ok).toBe(false);
    if (!p.ok) expect(p.errors.join(" ")).toMatch(/total/i);
  });

  it("rejects fractional, zero, negative, missing and oversized terms and values", () => {
    for (const years of [5.5, 0, -1, 9, NaN, null, "6"]) {
      expect(parseExtensionInput({ mode: "aav", value: 5, years }).ok).toBe(false);
    }
    for (const value of [0, -3, NaN, Infinity, null, "5", 0.1]) {
      expect(parseExtensionInput({ mode: "aav", value, years: 3 }).ok).toBe(false);
    }
    expect(parseExtensionInput({ mode: "total", value: 1, years: 8 }).ok).toBe(false); // $0.125M a year
  });
});

describe("signing date", () => {
  const now = Date.UTC(2026, 9, 4);
  it("accepts a real past date and today", () => {
    expect(validateSigningDate("2026-07-29", now)).toEqual({ ok: true, date: "2026-07-29" });
    expect(validateSigningDate("2026-10-04", now).ok).toBe(true);
  });
  it("rejects impossible, malformed, future and pre-CBA dates", () => {
    for (const v of ["2026-02-30", "2026-13-01", "07/29/2026", "2026-7-1", "", 5, null, "2026-10-09", "1999-01-01"]) {
      expect(validateSigningDate(v, now).ok).toBe(false);
    }
  });
});

describe("derived extension timing", () => {
  const base = { term: 6, expiryYear: 2027 };
  it("is pending before its start season and names it", () => {
    const t = resolveExtensionTiming({ ...base, offseasonYear: 2026 });
    expect(t).toMatchObject({ state: "PENDING", remaining: 6, startSeason: "2027-28", endSeason: "2032-33", flags: [] });
  });
  it("activates when its start season arrives, with the full term", () => {
    expect(resolveExtensionTiming({ ...base, offseasonYear: 2027 }))
      .toMatchObject({ state: "ACTIVE", remaining: 6 });
  });
  it("counts the term down in later seasons rather than regaining it", () => {
    expect(resolveExtensionTiming({ ...base, offseasonYear: 2028 }).remaining).toBe(5);
    expect(resolveExtensionTiming({ ...base, offseasonYear: 2030 }).remaining).toBe(3);
  });
  it("final season has one left, then expires", () => {
    expect(resolveExtensionTiming({ ...base, offseasonYear: 2032 })).toMatchObject({ state: "ACTIVE", remaining: 1 });
    expect(resolveExtensionTiming({ ...base, offseasonYear: 2033 })).toMatchObject({ state: "EXPIRED", remaining: 0 });
  });
  it("does not guess a start without an expiry year", () => {
    for (const expiryYear of [null, undefined, 0, 1900, 2100]) {
      const t = resolveExtensionTiming({ term: 5, expiryYear, offseasonYear: 2026 });
      expect(t.startSeason).toBeNull();
      expect(t.state).toBe("PENDING");
      expect(t.flags).toContain("NO_ANCHOR");
    }
    const fb = resolveExtensionTiming({ term: 5, expiryYear: null, offseasonYear: 2026, fallbackExpired: true });
    expect(fb).toMatchObject({ state: "ACTIVE", remaining: 5 });
    expect(fb.flags).toEqual(expect.arrayContaining(["NO_ANCHOR", "ELAPSED_UNKNOWN"]));
  });
  it("flags a stored term that contradicts the anchor, and a signing after the start", () => {
    const t = resolveExtensionTiming({ ...base, offseasonYear: 2026, yearsRemaining: 3, signedAt: "2027-08-01" });
    expect(t.flags).toEqual(expect.arrayContaining(["TERM_ANCHOR_MISMATCH", "SIGNED_AFTER_START"]));
    expect(t.startSeason).toBe("2027-28"); // the anchor wins; nothing is re-guessed
  });
  it("flags a missing term instead of silently assuming one", () => {
    const t = resolveExtensionTiming({ term: null, expiryYear: 2027, offseasonYear: 2026 });
    expect(t.term).toBe(1);
    expect(t.flags).toContain("TERM_MISSING");
  });
  it("labels seasons", () => {
    expect(seasonLabelFromStartYear(2099)).toBe("2099-00");
    expect(seasonLabelFromStartYear(2027)).toBe("2027-28");
  });
});

describe("preview", () => {
  const current = { capHit: 3.85, yearsRemaining: 1, expiryYear: 2027, expiryStatus: null };
  it("shows the six-year $75M example against a $3.85M deal ending 2026-27", () => {
    const p = buildExtensionPreview({
      current, stored: null, input: { mode: "total", value: 75, years: 6 },
      signedAt: undefined, offseasonYear: 2026,
    });
    expect(p.errors).toEqual([]);
    expect(p.currentLine).toBe("Current: $3.85M through 2026-27.");
    expect(p.extensionLine).toContain("$12.5M annually, 2027-28 through 2032-33");
    expect(p.extensionLine).toContain("$75M total");
    expect(p.statusLine).toBe("Status: signed, starts next season.");
    expect(p.changes.map(c => c.field)).toEqual(["extensionCapHit ($M, annual)", "extensionYears"]);
    // Current-contract columns are listed as untouched, and the date is not written.
    expect(p.changes.find(c => c.field === "extensionSignedAt")).toBeUndefined();
    expect(p.unchanged.map(u => u.field)).toEqual(expect.arrayContaining(["capHit ($M)", "yearsRemaining", "expiryYear"]));
  });
  it("shows an Evangelista-style $3M deal with a five-year $7.25M AAV extension", () => {
    const p = buildExtensionPreview({
      current: { capHit: 3, yearsRemaining: 1, expiryYear: 2027, expiryStatus: null },
      stored: null, input: { mode: "aav", value: 7.25, years: 5 }, signedAt: undefined, offseasonYear: 2026,
    });
    expect(p.currentLine).toBe("Current: $3M through 2026-27.");
    expect(p.extensionLine).toContain("$7.25M annually, 2027-28 through 2031-32");
  });
  it("writes a date only when one was supplied, and an unchanged save writes nothing", () => {
    const stored = { extensionCapHit: 12.5, extensionYears: 6, extensionSignedAt: "2026-07-29" };
    const same = buildExtensionPreview({ current, stored, input: { mode: "aav", value: 12.5, years: 6 }, signedAt: undefined, offseasonYear: 2026 });
    expect(same.changes).toEqual([]);
    const redated = buildExtensionPreview({ current, stored, input: { mode: "aav", value: 12.5, years: 6 }, signedAt: "2026-07-30", offseasonYear: 2026 });
    expect(redated.changes).toEqual([{ field: "extensionSignedAt", from: "2026-07-29", to: "2026-07-30" }]);
  });
  it("reports errors and an unknown start rather than guessing", () => {
    const bad = buildExtensionPreview({ current, stored: null, input: { mode: "aav", value: 75, years: 6 }, signedAt: undefined, offseasonYear: 2026 });
    expect(bad.errors.length).toBeGreaterThan(0);
    expect(bad.changes).toEqual([]);
    const noAnchor = buildExtensionPreview({
      current: { ...current, expiryYear: null }, stored: null,
      input: { mode: "total", value: 75, years: 6 }, signedAt: undefined, offseasonYear: 2026,
    });
    expect(noAnchor.flags).toContain("NO_ANCHOR");
    expect(noAnchor.statusLine).toMatch(/start season unknown/);
  });
});
