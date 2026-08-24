import { attachTodayDocketGrades } from "@/app/lib/docket-today";
import { buildDocketEntries } from "@/app/lib/docket-view";
import { listPublishedTrades } from "@/app/lib/trades";
import { DOCKET_ENTRIES_CACHE_KEY } from "@/app/lib/team-cache";
import { swrCache } from "@/app/lib/swr-cache";
import { swrStore } from "@/app/lib/swr-store";

const DOCKET_FRESH_TTL = 5 * 60;
const DOCKET_STALE_TTL = 6 * 60 * 60;
const DOCKET_DB_TIMEOUT_MS = 8_000;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timer = setTimeout(() => reject(new Error(`Docket database read exceeded ${ms}ms`)), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function buildDocketEntriesFromDatabase() {
  const trades = await withTimeout(listPublishedTrades(), DOCKET_DB_TIMEOUT_MS);
  return buildDocketEntries(trades);
}

export async function getCachedDocketEntries() {
  try {
    return await swrCache({
      store: swrStore,
      key: DOCKET_ENTRIES_CACHE_KEY,
      freshSeconds: DOCKET_FRESH_TTL,
      staleSeconds: DOCKET_STALE_TTL,
      isCacheable: Array.isArray,
      build: buildDocketEntriesFromDatabase,
    });
  } catch (error) {
    console.warn("[Docket] published trade load failed:", error instanceof Error ? error.message : error);
    return { value: [], state: "miss" as const, blocked: true };
  }
}

export async function precomputeDocketCache() {
  const entries = await buildDocketEntriesFromDatabase();
  const value = await attachTodayDocketGrades(entries);
  await swrStore.setex(DOCKET_ENTRIES_CACHE_KEY, DOCKET_STALE_TTL, {
    value,
    builtAt: Date.now(),
  });
  return { cached: true, entryCount: value.length };
}
