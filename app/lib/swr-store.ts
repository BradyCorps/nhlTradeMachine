// ── Redis adapter for swrCache ───────────────────────────────────
// Kept out of swr-cache.ts so the policy stays testable with a fake and has no
// dependency on a client. Shared by every route that reads through the cache,
// so the lock semantics can't drift between them.

import { redis } from "@/app/lib/redis";
import type { SwrStore } from "@/app/lib/swr-cache";

export const swrStore: SwrStore | null = redis
  ? {
      get: (key) => redis!.get(key) as Promise<any>,
      setex: (key, ttl, value) => redis!.setex(key, ttl, value),
      // NX + EX is the atomic "acquire a refresh lock" primitive; without it a
      // burst of stale requests each start their own rebuild.
      setnx: async (key, ttl, value) =>
        (await redis!.set(key, value, { nx: true, ex: ttl })) === "OK",
    }
  : null;
