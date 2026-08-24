// ── Shared store adapter for swrCache ────────────────────────────
// Redis is durable across instances. The TTL memory fallback keeps a warm
// process fast when Redis is unavailable (local development or a degraded
// deployment) instead of turning every request into a full roster rebuild.

import { redis } from "@/app/lib/redis";
import type { SwrStore } from "@/app/lib/swr-cache";

type MemoryEntry = { value: unknown; expiresAt: number };
const memory = new Map<string, MemoryEntry>();

const memorySwrStore: SwrStore = {
  get: async <T>(key: string) => {
    const entry = memory.get(key);
    if (!entry) return null;
    if (entry.expiresAt <= Date.now()) {
      memory.delete(key);
      return null;
    }
    return entry.value as T;
  },
  setex: async (key, ttl, value) => {
    memory.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
    return "OK";
  },
  setnx: async (key, ttl, value) => {
    const current = memory.get(key);
    if (current && current.expiresAt > Date.now()) return false;
    memory.set(key, { value, expiresAt: Date.now() + ttl * 1000 });
    return true;
  },
};

export const swrStore: SwrStore = redis
  ? {
      get: (key) => redis!.get(key) as Promise<any>,
      setex: (key, ttl, value) => redis!.setex(key, ttl, value),
      // NX + EX is the atomic "acquire a refresh lock" primitive; without it a
      // burst of stale requests each start their own rebuild.
      setnx: async (key, ttl, value) =>
        (await redis!.set(key, value, { nx: true, ex: ttl })) === "OK",
    }
  : memorySwrStore;
