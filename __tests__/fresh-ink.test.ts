// ── PA8 — dated Hot Off the Press feed ───────────────────────────
import { describe, it, expect } from "vitest";
import { orderFreshInk, signedAav, signedRecency, signedTerm } from "@/app/lib/fresh-ink";

const ext = (name: string, cap: number, signedAt?: string | null) => ({
  name, hasExtension: true, extensionCapHit: cap, extensionSignedAt: signedAt ?? null,
});

describe("orderFreshInk", () => {
  it("orders dated signings newest-first regardless of AAV", () => {
    const out = orderFreshInk([
      ext("Old Big Deal", 12, "2026-07-01"),
      ext("New Small Deal", 2, "2026-07-20"),
      ext("Mid Deal", 6, "2026-07-10"),
    ]);
    expect(out.map(p => p.name)).toEqual(["New Small Deal", "Mid Deal", "Old Big Deal"]);
  });

  it("floats dated signings above undated ones, then falls back to AAV", () => {
    const out = orderFreshInk([
      ext("Undated Huge", 15, null),
      ext("Dated Small", 3, "2026-07-18"),
      ext("Undated Medium", 8, null),
    ]);
    expect(out.map(p => p.name)).toEqual(["Dated Small", "Undated Huge", "Undated Medium"]);
  });

  it("excludes players without a real extension and caps the list", () => {
    const many = Array.from({ length: 8 }, (_, i) => ext(`P${i}`, 8 - i, `2026-07-${10 + i}`));
    const out = orderFreshInk([
      ...many,
      { name: "No Ext", hasExtension: false, extensionCapHit: 0, extensionSignedAt: null },
      { name: "Zero Cap", hasExtension: true, extensionCapHit: 0, extensionSignedAt: "2026-07-22" },
    ]);
    expect(out).toHaveLength(5);
    expect(out.some(p => p.name === "No Ext" || p.name === "Zero Cap")).toBe(false);
  });

  it("does not mutate the caller's array", () => {
    const input = [ext("A", 5, "2026-07-01"), ext("B", 5, "2026-07-05")];
    const snapshot = input.map(p => p.name);
    orderFreshInk(input);
    expect(input.map(p => p.name)).toEqual(snapshot);
  });
});

describe("signedRecency", () => {
  const now = new Date("2026-07-22T12:00:00").getTime();
  it("labels recent signings relatively", () => {
    expect(signedRecency("2026-07-22", now)).toBe("Today");
    expect(signedRecency("2026-07-21", now)).toBe("Yesterday");
    expect(signedRecency("2026-07-19", now)).toBe("3d ago");
  });
  it("labels older signings absolutely", () => {
    expect(signedRecency("2026-07-10", now)).toBe("Jul 10");
  });
  it("returns empty for garbage input", () => {
    expect(signedRecency("not-a-date", now)).toBe("");
  });
});

// Once an extension takes effect the roster folds it into capHit/yearsRemaining
// and clears the extension fields, so the valuation engine does not read the
// live AAV as a raise still to come. The feed must not lose the signing at that
// moment — a deal beginning is not a deal being un-signed.
describe("a signing that has taken effect", () => {
  const live = {
    id: "carlsson", name: "Leo Carlsson", hasExtension: false,
    extensionCapHit: null, extensionYears: null,
    extensionSignedAt: "2026-07-01", capHit: 18.8, yearsRemaining: 5,
  };

  it("still appears in the feed", () => {
    const out = orderFreshInk([live]);
    expect(out).toHaveLength(1);
  });

  it("reports the live contract's terms", () => {
    expect(signedAav(live)).toBe(18.8);
    expect(signedTerm(live)).toBe(5);
  });

  it("prefers the extension's own terms while it is still future money", () => {
    const pending = { ...live, hasExtension: true, extensionCapHit: 9.5, extensionYears: 6, capHit: 0.925, yearsRemaining: 1 };
    expect(signedAav(pending)).toBe(9.5);
    expect(signedTerm(pending)).toBe(6);
  });

  it("does not sweep in an ordinary signed player with no signing on record", () => {
    // The gate is a signing date or an extension flag, not merely a cap hit.
    expect(orderFreshInk([{ id: "x", name: "Nobody", capHit: 7.5, yearsRemaining: 4 }])).toHaveLength(0);
  });

  it("omits a term it does not have rather than printing a zero", () => {
    expect(signedTerm({ ...live, yearsRemaining: 0 })).toBeNull();
  });
});
