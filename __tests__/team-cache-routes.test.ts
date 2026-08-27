import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { SEASON } from "../app/lib/season-config";
import { teamCacheKey } from "../app/lib/team-cache";

const state = vi.hoisted(() => ({
  deletedKeys: [] as string[],
  siteSettings: [] as any[],
  teams: [] as any[],
}));

vi.mock("@/app/lib/admin-auth", () => ({
  requireAdmin: vi.fn(async () => null),
}));

vi.mock("@/app/lib/redis", () => ({
  redis: {
    del: async (key: string) => {
      state.deletedKeys.push(key);
      return 1;
    },
  },
}));

function rowsForTable(table: any): any[] {
  switch (getTableName(table)) {
    case "site_settings": return state.siteSettings;
    case "teams":         return state.teams;
    default:              return [];
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
          where: vi.fn(async () => rows),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(async () => undefined),
      })),
    })),
    insert: vi.fn(() => ({
      values: vi.fn(async () => undefined),
    })),
  },
}));

describe("admin team cache invalidation", () => {
  beforeEach(() => {
    vi.resetModules();
    state.deletedKeys = [];
    state.siteSettings = [{ key: "cap_ceiling", value: "102.3" }];
    state.teams = [{ id: "WPG", name: "Winnipeg Jets", phaseOverride: null, standingOverride: null }];
  });

  it("clears cap-specific trade-team caches after a team override", async () => {
    const { POST } = await import("../app/api/admin/teams/route");
    const response = await POST(new Request("http://localhost/api/admin/teams", {
      method: "POST",
      body: JSON.stringify({ id: "WPG", phaseOverride: "Contender", standingOverride: 4 }),
    }));

    expect(response.status).toBe(200);
    expect(state.deletedKeys).toEqual(expect.arrayContaining([
      "cache:league:teams:v1",
      "cache:trade:teams:v1",
      // DATA-06: this key is now wrapped through manifestCacheKey (snapshot
      // date + model version), so build the expectation from the real
      // function rather than pinning its internal string shape here.
      teamCacheKey(SEASON.capCeiling),
      teamCacheKey(95.5),
      teamCacheKey(102.3),
    ]));
  });

  it("clears cap-specific trade-team caches from the admin cache flush", async () => {
    const { GET } = await import("../app/api/admin/clear-cache/route");
    const response = await GET(new Request("http://localhost/api/admin/clear-cache"));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.cleared).toEqual(expect.arrayContaining([
      "cache:league:teams:v1",
      "cache:trade:teams:v1",
      // DATA-06: this key is now wrapped through manifestCacheKey (snapshot
      // date + model version), so build the expectation from the real
      // function rather than pinning its internal string shape here.
      teamCacheKey(SEASON.capCeiling),
      teamCacheKey(95.5),
      teamCacheKey(102.3),
    ]));
  });
});
