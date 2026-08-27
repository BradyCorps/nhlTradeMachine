import { beforeEach, describe, expect, it, vi } from "vitest";
import { SEASON } from "../app/lib/season-config";

const state = vi.hoisted(() => ({
  overrides: [] as any[],
}));

vi.mock("@/app/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn(async () => state.overrides),
    })),
  },
}));

vi.mock("@/app/db/ensure-schema", () => ({
  ensureNewTables: vi.fn(async () => undefined),
}));

describe("draft pick inventory", () => {
  beforeEach(() => {
    state.overrides = [];
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
    }];

    const { buildDraftPickInventory } = await import("../app/lib/draft-pick-inventory");
    const picks = await buildDraftPickInventory([
      { id: "CGY", phase: "Tanking", standing: 32 },
      { id: "WPG", phase: "Contender", standing: 1 },
    ]);

    const moved = picks.find((pick: any) => pick.id === `pick-CGY-${SEASON.firstTradablePickYear}-1`);
    expect(moved).toMatchObject({
      teamId: "WPG",
      name: `${SEASON.firstTradablePickYear} 1st Round Pick via CGY`,
      isProtected: true,
      conditions: "top-10 protected",
    });
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
