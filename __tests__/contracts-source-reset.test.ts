import { beforeEach, describe, expect, it, vi } from "vitest";
import { getTableName } from "drizzle-orm";
import { teamCacheKey } from "../app/lib/team-cache";

const state = vi.hoisted(() => ({
  deletedKeys: [] as string[],
  players: [] as any[],
  siteSettings: [] as any[],
  updateSets: [] as Record<string, any>[],
}));

vi.mock("@/app/lib/admin-auth", () => ({
  requireAdmin: vi.fn(async () => null),
}));

vi.mock("@/app/db/ensure-schema", () => ({
  ensurePlayerTable: vi.fn(async () => undefined),
  ensurePlayerColumns: vi.fn(async () => undefined),
  ensureTeamTable: vi.fn(async () => undefined),
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
    case "players":       return state.players;
    case "site_settings": return state.siteSettings;
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
          where: vi.fn(async () => rows.filter((row) => row.source === "editor")),
        };
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((updates: Record<string, any>) => {
        state.updateSets.push(updates);
        return {
          where: vi.fn(async () => undefined),
        };
      }),
    })),
  },
}));

describe("admin contract source reset", () => {
  beforeEach(() => {
    vi.resetModules();
    state.deletedKeys = [];
    state.updateSets = [];
    state.siteSettings = [{ key: "cap_ceiling", value: "102.3" }];
    state.players = [
      { id: "editor-one", source: "editor" },
      { id: "editor-two", source: "editor" },
      { id: "sync-one", source: "sync" },
    ];
  });

  it("bulk-resets editor rows to sync and clears roster caches", async () => {
    const { POST } = await import("../app/api/admin/contracts/route");
    const response = await POST(new Request("http://localhost/api/admin/contracts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "reset-source", clearCurated: true }),
    }));
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, updated: 2, scope: "all" });
    expect(state.updateSets).toContainEqual({
      source: "sync",
      expiryStatus: null,
      expiryYear: null,
      excludeFromRoster: false,
    });
    expect(body.clearedCacheKeys).toEqual(expect.arrayContaining([
      "cache:league:teams:v1",
      "cache:trade:teams:v1",
      // DATA-06: wrapped through manifestCacheKey now (snapshot date + model
      // version) — build the expectation from the real function.
      teamCacheKey(102.3),
      "cache:contracts:v2",
    ]));
  });
});
