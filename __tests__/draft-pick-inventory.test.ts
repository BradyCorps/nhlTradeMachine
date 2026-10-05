import { beforeEach, describe, expect, it, vi } from "vitest";
import { SEASON } from "../app/lib/season-config";

const state = vi.hoisted(() => ({
  overrides: [] as any[],
  failed: false,
}));

vi.mock("@/app/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(async () => { if (state.failed) throw new Error("isolated DB failure"); return state.overrides; }),
    })),
  },
}));

vi.mock("@/app/db/ensure-schema", () => ({
  ensureNewTables: vi.fn(async () => undefined),
}));
vi.mock("@/app/lib/trades", () => ({ listPublishedTrades: vi.fn(async () => []) }));

describe("draft pick inventory", () => {
  beforeEach(() => {
    state.overrides = [];
    state.failed = false;
  });

  it("applies DB ownership overrides while preserving original-owner pick context", async () => {
    state.overrides = [{
      id: `pick-CGY-${SEASON.firstTradablePickYear}-1`,
      currentOwnerId: "WPG",
      originalOwnerId: "CGY",
      round: 1,
      year: SEASON.firstTradablePickYear,
      isProtected: true,
      conditions: "top-10 protected",
      updatedAt: Date.parse("2026-10-06"),
    }];

    const { buildDraftPickInventory } = await import("../app/lib/draft-pick-inventory");
    const picks = await buildDraftPickInventory([
      { id: "CGY", phase: "Tanking", standing: 32 },
      { id: "WPG", phase: "Contender", standing: 1 },
    ]);

    const moved = picks.find((pick: any) => pick.id === `pick-CGY-${SEASON.firstTradablePickYear}-1`);
    expect(moved).toMatchObject({
      teamId: "",
      currentOwnerId: "WPG",
      pickOwnership: "conditional",
      isProtected: true,
      conditions: "top-10 protected",
    });
  });

  it("does not recreate original ownership if the ledger read fails", async () => {
    state.failed = true;
    const { buildDraftPickInventory } = await import("../app/lib/draft-pick-inventory");
    const picks = await buildDraftPickInventory([]);
    expect(picks).toHaveLength(32 * 5 * 7);
    expect(picks.every(p => p.teamId === "" && p.pickOwnership === "unverified")).toBe(true);
  });

  // DATA-04: rounds 6-7 were silently omitted — only [1,2,3,4,5] were ever
  // generated, so a real trade involving a 6th or 7th had no tradable asset
  // to represent it.
  it("generates all seven rounds, not just the first five", async () => {
    const { buildDraftPickInventory } = await import("../app/lib/draft-pick-inventory");
    const picks = await buildDraftPickInventory([{ id: "CGY", phase: "Tanking", standing: 32 }]);

    const cgyFirstYearRounds = picks
      .filter((p: any) => p.id.startsWith(`pick-CGY-${SEASON.firstTradablePickYear}-`))
      .map((p: any) => p.round)
      .sort((a: number, b: number) => a - b);
    expect(cgyFirstYearRounds).toEqual([1, 2, 3, 4, 5, 6, 7]);

    const seventh = picks.find((p: any) => p.id === `pick-CGY-${SEASON.firstTradablePickYear}-7`);
    expect(seventh).toMatchObject({ round: 7, name: expect.stringContaining("7th Round Pick") });
  });
});
