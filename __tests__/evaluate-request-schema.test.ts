import { describe, expect, it } from "vitest";
import { AssetSchema, EvaluateRequestSchema } from "../app/lib/evaluate-request-schema";
import { PUBLIC_LIMITS } from "../app/lib/public-request-bounds";

const asset = (i: number) => ({
  id: `player-${i}`, name: `Player ${i}`, position: "C",
  age: 27, capHit: 4.5, yearsRemaining: 3,
});

// The production failure: Armchair GM boots by posting the whole league to
// /api/evaluate to price every player at once, and CXH9 capped `assets` at
// MAX_PACKAGE — a trade-package ceiling on a field that carries a league. A
// 3.1 MB body came back 400 and the page had no NAV for anything.
describe("EvaluateRequestSchema — assets is a NAV batch, not a package", () => {
  it("accepts a league-sized NAV batch", () => {
    const league = Array.from({ length: 2400 }, (_, i) => asset(i));
    const parsed = EvaluateRequestSchema.safeParse({ assets: league, capCeiling: 95.5 });
    expect(parsed.success).toBe(true);
  });

  it("accepts a batch at the league ceiling", () => {
    const atCap = Array.from({ length: PUBLIC_LIMITS.MAX_PLAYERS }, (_, i) => asset(i));
    expect(EvaluateRequestSchema.safeParse({ assets: atCap }).success).toBe(true);
  });

  it("still refuses a batch past the league ceiling", () => {
    // Bounded, just at the right ceiling — the endpoint is unauthenticated.
    const overCap = Array.from({ length: PUBLIC_LIMITS.MAX_PLAYERS + 1 }, (_, i) => asset(i));
    expect(EvaluateRequestSchema.safeParse({ assets: overCap }).success).toBe(false);
  });

  it("keeps the trade package tight", () => {
    // The package IS bounded by MAX_PACKAGE — real ones are under ten.
    const many = Array.from({ length: PUBLIC_LIMITS.MAX_PACKAGE + 1 }, (_, i) => asset(i));
    expect(EvaluateRequestSchema.safeParse({ tradeOutgoing: many }).success).toBe(false);
    expect(EvaluateRequestSchema.safeParse({ tradeIncoming: many }).success).toBe(false);
  });

  it("keeps a roster bounded to a roster", () => {
    const huge = Array.from({ length: PUBLIC_LIMITS.MAX_ROSTER + 1 }, (_, i) => asset(i));
    expect(EvaluateRequestSchema.safeParse({ allHomeRoster: huge }).success).toBe(false);
  });

  it("orders the two ceilings the way the fields are used", () => {
    expect(PUBLIC_LIMITS.MAX_PACKAGE).toBeLessThan(PUBLIC_LIMITS.MAX_PLAYERS);
  });
});

describe("EvaluateRequestSchema — a full verdict request", () => {
  it("accepts the shape fetchTradeVerdict actually sends", () => {
    const parsed = EvaluateRequestSchema.safeParse({
      assets: [asset(1), asset(2)],
      tradeOutgoing: [asset(1)],
      tradeIncoming: [asset(2)],
      homeTeam: { id: "WPG", name: "Winnipeg Jets", capSpace: 4.2, standing: 6 },
      partnerTeam: { id: "ANA", name: "Anaheim Ducks", capSpace: 18.1, standing: 27 },
      allHomeRoster: Array.from({ length: 60 }, (_, i) => asset(i)),
      allPartnerRoster: Array.from({ length: 60 }, (_, i) => asset(100 + i)),
      capCeiling: 95.5,
      runTrade: true,
    });
    expect(parsed.success).toBe(true);
  });
});

describe("AssetSchema", () => {
  it("coerces a wing variant rather than rejecting the batch", () => {
    // One bad roster row must not 400 a league-sized NAV request.
    for (const position of ["LW", "RW", "L", "R", "UNKNOWN", "", 7, null]) {
      const parsed = AssetSchema.safeParse({ ...asset(1), position });
      expect(parsed.success, String(position)).toBe(true);
    }
  });

  it("keeps a pick a pick", () => {
    const parsed = AssetSchema.safeParse({ id: "pick-WPG-2027-1", name: "WPG 2027 1st", position: "Pick", round: 1, year: 2027 });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.position).toBe("Pick");
  });

  it("rejects NaN and infinities in the cap fields", () => {
    expect(AssetSchema.safeParse({ ...asset(1), capHit: Number.NaN }).success).toBe(false);
    expect(AssetSchema.safeParse({ ...asset(1), age: Number.POSITIVE_INFINITY }).success).toBe(false);
  });

  it("passes unknown engine fields through untouched", () => {
    const parsed = AssetSchema.safeParse({ ...asset(1), edgeOzPct: 0.54 });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect((parsed.data as Record<string, unknown>).edgeOzPct).toBe(0.54);
  });
});
