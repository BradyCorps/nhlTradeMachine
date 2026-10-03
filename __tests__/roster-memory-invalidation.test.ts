import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/lib/redis", () => ({ redis: null }));

import { swrStore } from "@/app/lib/swr-store";
import { clearTeamCaches, teamCacheKeys } from "@/app/lib/team-cache";

describe("roster mutation invalidation without Redis", () => {
  it("evicts affected payloads and refresh locks while preserving unrelated cached evidence", async () => {
    const database = { select: () => ({ from: () => Promise.resolve([{ key: "cap_ceiling", value: "104" }]) }) };
    const keys = teamCacheKeys(104);
    for (const key of keys) {
      await swrStore!.setex(key, 3600, { value: { teamId: "TOR" }, builtAt: Date.now() });
      await swrStore!.setnx!( `${key}:refreshing`, 60, true);
    }
    const unrelated = "roster-invalidation-fixture:historical-observations:20252026:2";
    await swrStore!.setex(unrelated, 3600, { preserved: true });
    const cleared = await clearTeamCaches(null, database as any);
    expect(cleared).toEqual(expect.arrayContaining(keys));
    for (const key of keys) {
      expect(await swrStore!.get(key)).toBeNull();
      expect(await swrStore!.setnx!(`${key}:refreshing`, 60, true)).toBe(true);
    }
    expect(await swrStore!.get(unrelated)).toEqual({ preserved: true });
  });
});
