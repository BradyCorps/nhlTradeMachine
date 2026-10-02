import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { SEASON } from "../app/lib/season-config";

const state = vi.hoisted(() => ({
  draftPickOverrides: [] as any[],
  siteSettings: [] as any[],
  teams: [] as any[],
  capMoves: {} as any,
}));

vi.mock("@/app/lib/cached-roster", () => ({ getCachedRoster: async () => ({ value: { publishedTradeCapMoves: state.capMoves } }) }));

vi.mock("@/app/lib/swr-store", () => ({ swrStore: null }));
vi.mock("@/app/lib/redis", () => ({ redis: null }));

vi.mock("@/app/db/ensure-schema", () => ({
  ensureNewTables: vi.fn(async () => undefined),
}));

function rowsForTable(table: any): any[] {
  switch (getTableName(table)) {
    case "draft_pick_overrides": return state.draftPickOverrides;
    case "site_settings":        return state.siteSettings;
    case "teams":                return state.teams;
    default:                     return [];
  }
}

vi.mock("@/app/db/client", () => ({
  db: {
    select: vi.fn(() => ({
      from: vi.fn((table: any) => {
        const rows = rowsForTable(table);
        return {
          then: (resolve: (value: any[]) => unknown) => Promise.resolve(resolve(rows)),
          catch: () => Promise.resolve(rows),
        };
      }),
    })),
  },
}));

describe("league teams route", () => {
  beforeEach(() => {
    vi.resetModules();
    state.draftPickOverrides = [];
    state.siteSettings = [];
    state.teams = [];
    state.capMoves = {};
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ data: [] })));
  });

  it("applies the canonical roster cap overlay once in the split Trade Machine payload", async () => {
    const { GET } = await import("../app/api/league/teams/route");
    const before = await (await GET()).json();
    state.capMoves = { TOR: { outgoing: [{ capHit: 7.75 }] }, CBJ: { incoming: [{ capHit: 7.75 }] } };
    const after = await (await GET()).json();
    for (const [id, delta] of [["TOR", 7.75], ["CBJ", -7.75]] as const) {
      expect(after.teams.find((t: any) => t.id === id).capSpace).toBe(Math.round((before.teams.find((t: any) => t.id === id).capSpace + delta) * 10) / 10);
    }
  });

  it("returns draft-pick ownership overrides in the main trade UI payload", async () => {
    state.draftPickOverrides = [{
      id: `pick-CGY-${SEASON.firstTradablePickYear}-1`,
      currentOwnerId: "WPG",
      originalOwnerId: "CGY",
      round: 1,
      year: SEASON.firstTradablePickYear,
      isProtected: false,
      conditions: null,
    }];

    const { GET } = await import("../app/api/league/teams/route");
    const response = await GET();
    const body = await response.json();

    const movedPick = body.picks.find((pick: any) => pick.id === `pick-CGY-${SEASON.firstTradablePickYear}-1`);
    expect(movedPick).toMatchObject({
      teamId: "WPG",
      name: `${SEASON.firstTradablePickYear} 1st Round Pick via CGY`,
    });
  });
});
