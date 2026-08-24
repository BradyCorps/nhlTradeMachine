// ── Cold-load performance ────────────────────────────────────────
// Measured: ~20-25s to interactive on the trade machine, ~30s on team
// analytics. Cause was cache-or-block — a 15-minute TTL over a ~40-second
// roster assembly, so whoever arrived first after it lapsed paid the full cost.
// On a site without constant traffic that is most visitors, not a rare one.
import { describe, expect, it, vi } from "vitest";
import { cacheDecision, swrCache, type SwrStore } from "@/app/lib/swr-cache";

const SEC = 1000;

describe("cacheDecision", () => {
  const base = { now: 100_000 * SEC, freshSeconds: 900, staleSeconds: 86_400 };

  it("serves a recent build without refreshing", () => {
    expect(cacheDecision({ ...base, builtAt: base.now - 60 * SEC })).toBe("fresh");
  });

  it("serves an older build while refreshing behind it", () => {
    expect(cacheDecision({ ...base, builtAt: base.now - 1800 * SEC })).toBe("stale");
  });

  it("refuses to serve something a day old", () => {
    expect(cacheDecision({ ...base, builtAt: base.now - 90_000 * SEC })).toBe("expired");
  });

  it("treats nothing cached as a miss", () => {
    expect(cacheDecision({ ...base, builtAt: null })).toBe("miss");
    expect(cacheDecision({ ...base, builtAt: undefined })).toBe("miss");
    expect(cacheDecision({ ...base, builtAt: NaN })).toBe("miss");
  });

  it("trusts a future timestamp rather than rebuilding on clock skew", () => {
    expect(cacheDecision({ ...base, builtAt: base.now + 5 * SEC })).toBe("fresh");
  });

  it("puts the fresh/stale boundary exactly on the TTL", () => {
    expect(cacheDecision({ ...base, builtAt: base.now - 900 * SEC })).toBe("fresh");
    expect(cacheDecision({ ...base, builtAt: base.now - 901 * SEC })).toBe("stale");
  });
});

/** In-memory store with the same surface as the Redis wrapper. */
function fakeStore(seed: Record<string, unknown> = {}): SwrStore & { data: Record<string, unknown> } {
  const data: Record<string, unknown> = { ...seed };
  return {
    data,
    async get<T>(key: string) { return (data[key] as T) ?? null; },
    async setex(key: string, _ttl: number, value: unknown) { data[key] = value; return "OK"; },
    async setnx(key: string, _ttl: number, value: unknown) {
      if (key in data) return false;
      data[key] = value;
      return true;
    },
  };
}

const flush = () => new Promise(r => setTimeout(r, 0));

describe("swrCache", () => {
  it("blocks only when there is nothing to serve", async () => {
    const store = fakeStore();
    const build = vi.fn().mockResolvedValue({ players: [1, 2, 3] });
    const res = await swrCache({
      store, key: "k", freshSeconds: 900, staleSeconds: 86_400, build,
    });
    expect(res.state).toBe("miss");
    expect(res.blocked).toBe(true);
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("serves a fresh payload without rebuilding", async () => {
    const store = fakeStore({ k: { value: "cached", builtAt: Date.now() } });
    const build = vi.fn();
    const res = await swrCache({
      store, key: "k", freshSeconds: 900, staleSeconds: 86_400, build,
    });
    expect(res.value).toBe("cached");
    expect(res.blocked).toBe(false);
    expect(build).not.toHaveBeenCalled();
  });

  it("returns stale data immediately instead of making the user wait", async () => {
    // The whole point: the visitor gets a page now, not in 40 seconds.
    const store = fakeStore({ k: { value: "old", builtAt: Date.now() - 3600_000 } });
    let resolveBuild: (v: unknown) => void = () => {};
    const build = vi.fn(() => new Promise(r => { resolveBuild = r; }));

    const res = await swrCache({
      store, key: "k", freshSeconds: 900, staleSeconds: 86_400, build: build as never,
    });

    expect(res.value).toBe("old");
    expect(res.state).toBe("stale");
    expect(res.blocked).toBe(false);   // did NOT await the rebuild
    expect(build).toHaveBeenCalledTimes(1);
    resolveBuild({ fresh: true });
  });

  it("writes the refreshed value back", async () => {
    const store = fakeStore({ k: { value: "old", builtAt: Date.now() - 3600_000 } });
    await swrCache({
      store, key: "k", freshSeconds: 900, staleSeconds: 86_400,
      build: async () => "new",
    });
    await flush();
    expect((store.data.k as { value: string }).value).toBe("new");
  });

  it("lets only one request rebuild when a quiet site wakes up", async () => {
    // Ten visitors arriving together must not start ten 40-second assemblies.
    const store = fakeStore({ k: { value: "old", builtAt: Date.now() - 3600_000 } });
    const build = vi.fn().mockResolvedValue("new");
    await Promise.all(Array.from({ length: 10 }, () =>
      swrCache({ store, key: "k", freshSeconds: 900, staleSeconds: 86_400, build })));
    expect(build).toHaveBeenCalledTimes(1);
  });

  it("blocks again once the data is too old to trust", async () => {
    const store = fakeStore({ k: { value: "ancient", builtAt: Date.now() - 200_000_000 } });
    const res = await swrCache({
      store, key: "k", freshSeconds: 900, staleSeconds: 86_400,
      build: async () => "rebuilt",
    });
    expect(res.state).toBe("expired");
    expect(res.blocked).toBe(true);
    expect(res.value).toBe("rebuilt");
  });

  it("never caches a build that failed its health check", async () => {
    // A half-empty roster served for 24 hours is worse than a slow rebuild.
    const store = fakeStore();
    const res = await swrCache({
      store, key: "k", freshSeconds: 900, staleSeconds: 86_400,
      build: async () => ({ players: [] }),
      isCacheable: (v: { players: unknown[] }) => v.players.length > 0,
    });
    expect(res.value).toEqual({ players: [] });
    expect(store.data.k).toBeUndefined();
  });

  it("still works with no cache configured at all", async () => {
    const res = await swrCache({
      store: null, key: "k", freshSeconds: 900, staleSeconds: 86_400,
      build: async () => "direct",
    });
    expect(res.value).toBe("direct");
    expect(res.blocked).toBe(true);
  });

  it("survives a failing background rebuild without breaking the response", async () => {
    const store = fakeStore({ k: { value: "old", builtAt: Date.now() - 3600_000 } });
    const res = await swrCache({
      store, key: "k", freshSeconds: 900, staleSeconds: 86_400,
      build: async () => { throw new Error("upstream down"); },
    });
    await flush();
    expect(res.value).toBe("old");
    expect((store.data.k as { value: string }).value).toBe("old");  // not overwritten
  });
});

// ── Route wiring ─────────────────────────────────────────────────
import fs from "fs";
import path from "path";
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

// The players route delegates its SWR policy to `cached-roster.ts` so the
// server-component player pages can read through the very same cache
// instead of calling assembleCanonicalRoster() themselves. The guarantees
// below are about the players ENTRY POINT, so they follow that delegation
// rather than insisting the policy sit literally in the route file.
const playersPolicy = () =>
  read("app/api/league/players/route.ts") + "\n" + read("app/lib/cached-roster.ts");

describe("both league routes read through the same policy", () => {
  it("uses one shared store, so lock semantics cannot drift", () => {
    for (const [label, src] of [
      ["app/api/league/players/route.ts", playersPolicy()],
      ["app/api/league/teams/route.ts", read("app/api/league/teams/route.ts")],
    ] as const) {
      expect(src, label).toContain("swrCache");
      expect(src, label).toContain("store: swrStore");
    }
    // The lock is what stops a quiet site starting N rebuilds at once.
    expect(read("app/lib/swr-store.ts")).toContain("nx: true");
  });

  it("falls back to a TTL memory store instead of rebuilding on every Redis-less request", () => {
    const store = read("app/lib/swr-store.ts");
    expect(store).toContain("memorySwrStore");
    expect(store).toContain(": memorySwrStore");
    expect(store).toContain("expiresAt <= Date.now()");
  });

  it("caches the whole teams response, not just the inner team list", () => {
    // The warm path still hit the DB twice and rebuilt ~800 pick objects.
    const src = read("app/api/league/teams/route.ts");
    expect(src).toContain("LEAGUE_TEAMS_PAYLOAD_CACHE_KEY");
    expect(src).toContain("buildDraftPickInventory");
    expect(src).toMatch(/build: buildTeamsPayload/);
  });

  it("drops the teams payload on every roster mutation", () => {
    // Otherwise an admin cap change leaves a day-old ceiling in the response.
    const cache = read("app/lib/team-cache.ts");
    expect(cache).toContain("LEAGUE_TEAMS_PAYLOAD_CACHE_KEY");
    expect(cache).toMatch(/teamCacheKeys[\s\S]*LEAGUE_TEAMS_PAYLOAD_CACHE_KEY/);
  });

  it("refuses to cache an empty league", () => {
    expect(read("app/api/league/teams/route.ts")).toMatch(/isCacheable[\s\S]{0,200}teams\.length > 0/);
    expect(playersPolicy()).toContain("isHealthyRoster");
  });
});
