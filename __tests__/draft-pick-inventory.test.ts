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
      id: `pick-CGY-${SEASON.draftYear}-1`,
      currentOwnerId: "WPG",
      originalOwnerId: "CGY",
      round: 1,
      year: SEASON.draftYear,
      isProtected: true,
      conditions: "top-10 protected",
    }];

    const { buildDraftPickInventory } = await import("../app/lib/draft-pick-inventory");
    const picks = await buildDraftPickInventory([
      { id: "CGY", phase: "Tanking", standing: 32 },
      { id: "WPG", phase: "Contender", standing: 1 },
    ]);

    const moved = picks.find((pick: any) => pick.id === `pick-CGY-${SEASON.draftYear}-1`);
    expect(moved).toMatchObject({
      teamId: "WPG",
      name: `${SEASON.draftYear} 1st Round Pick via CGY`,
      isProtected: true,
      conditions: "top-10 protected",
    });
  });
});
