import { describe, expect, it } from "vitest";
import {
  MAX_RETENTION_SLOTS,
  addRetention,
  retainedSlotsInTrade,
  retentionCheck,
  rollRetentionLedger,
  type RetentionEntry,
} from "@/app/lib/retention-ledger";

// DATA-05: this rule used to live only inside cup-run.ts, so only the
// Armchair GM simulation ever enforced the three-slot CBA limit. Trade
// Machine's /api/evaluate checked the 50%-per-contract rule but had no idea
// the slot limit existed at all.
describe("retention-ledger (shared CBA rule)", () => {
  it("rejects a single retention above 50%", () => {
    const result = retentionCheck([], [
      { playerId: "a", playerName: "A", pct: 0.6, capHit: 8, yearsRemaining: 3 },
    ], 104);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain("50%");
  });

  it("hard-vetoes a fourth retention when three slots are already active", () => {
    const ledger: RetentionEntry[] = [
      { playerId: "a", playerName: "A", pct: 0.5, aavRetained: 2, yearsRemaining: 2 },
      { playerId: "b", playerName: "B", pct: 0.5, aavRetained: 2, yearsRemaining: 1 },
      { playerId: "c", playerName: "C", pct: 0.5, aavRetained: 2, yearsRemaining: 3 },
    ];
    const result = retentionCheck(ledger, [
      { playerId: "d", playerName: "D", pct: 0.3, capHit: 4, yearsRemaining: 1 },
    ], 104);
    expect(result.ok).toBe(false);
    expect(result.reason).toContain(`3 of ${MAX_RETENTION_SLOTS}`);
  });

  it("a four-retained-contract stress test in one proposal is a hard veto", () => {
    const result = retentionCheck([], [
      { playerId: "a", playerName: "A", pct: 0.3, capHit: 3, yearsRemaining: 1 },
      { playerId: "b", playerName: "B", pct: 0.3, capHit: 3, yearsRemaining: 1 },
      { playerId: "c", playerName: "C", pct: 0.3, capHit: 3, yearsRemaining: 1 },
      { playerId: "d", playerName: "D", pct: 0.3, capHit: 3, yearsRemaining: 1 },
    ], 104);
    expect(result.ok).toBe(false);
  });

  it("allows exactly three retentions", () => {
    const result = retentionCheck([], [
      { playerId: "a", playerName: "A", pct: 0.3, capHit: 3, yearsRemaining: 1 },
      { playerId: "b", playerName: "B", pct: 0.3, capHit: 3, yearsRemaining: 1 },
      { playerId: "c", playerName: "C", pct: 0.3, capHit: 3, yearsRemaining: 1 },
    ], 104);
    expect(result.ok).toBe(true);
  });

  it("frees a slot once its term rolls out", () => {
    const ledger: RetentionEntry[] = [
      { playerId: "a", playerName: "A", pct: 0.5, aavRetained: 2, yearsRemaining: 1 },
    ];
    const rolled = rollRetentionLedger(ledger);
    expect(rolled).toHaveLength(0);
  });

  it("addRetention floors term at 1 and rounds the retained dollar figure", () => {
    const ledger = addRetention([], [
      { playerId: "a", playerName: "A", pct: 0.333, capHit: 9, yearsRemaining: 0 },
    ]);
    expect(ledger[0].yearsRemaining).toBe(1);
    expect(ledger[0].aavRetained).toBeCloseTo(3.0, 1);
  });

  describe("retainedSlotsInTrade — single-proposal slot count", () => {
    it("counts only assets actually carrying retention", () => {
      const assets = [
        { retainedPct: 0.5 }, { retainedPct: 0 }, { retainedPct: null }, { retainedPct: 0.2 },
      ];
      expect(retainedSlotsInTrade(assets)).toBe(2);
    });

    it("is zero for a trade with no retention at all", () => {
      expect(retainedSlotsInTrade([{ retainedPct: 0 }, {}])).toBe(0);
    });
  });
});
