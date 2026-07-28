// ── Stale-while-revalidate cache ─────────────────────────────────
//
// The league routes were cache-or-block: a hit served instantly, a miss awaited
// the whole rebuild. With a 15-minute TTL and a ~40-second roster assembly, that
// means every 15 minutes the next visitor to arrive pays 40 seconds — and on a
// site without constant traffic, that visitor is most visitors. Measured cold
// load was 20-25s on the trade machine and ~30s on team analytics.
//
// Serving stale data instantly is strictly better than serving fresh data in 40
// seconds: the underlying feeds (rosters, contracts, MoneyPuck) change on the
// order of hours, not minutes, so the "stale" payload is almost always
// identical to what the rebuild would produce.
//
// Only two cases still block: the very first request after a deploy or flush
// (nothing to serve), and data so old it would be misleading.

export type CacheState = "fresh" | "stale" | "expired" | "miss";

export interface CacheEnvelope<T> {
  value: T;
  builtAt: number;
}

/**
 * What to do with a cached payload, given its age.
 *
 * Pure, so the policy is testable without Redis or a clock.
 */
export function cacheDecision(args: {
  builtAt: number | null | undefined;
  now: number;
  freshSeconds: number;
  staleSeconds: number;
}): CacheState {
  const { builtAt, now, freshSeconds, staleSeconds } = args;
  if (builtAt == null || !Number.isFinite(builtAt)) return "miss";
  const ageSec = (now - builtAt) / 1000;
  if (ageSec < 0) return "fresh";             // clock skew — trust the payload
  if (ageSec <= freshSeconds) return "fresh";
  if (ageSec <= staleSeconds) return "stale";
  return "expired";
}

/** Minimal surface so this is testable with a fake and works with any client. */
export interface SwrStore {
  get<T>(key: string): Promise<T | null>;
  setex(key: string, ttlSeconds: number, value: unknown): Promise<unknown>;
  /** Set only if absent. Used as a refresh lock; returns true when acquired. */
  setnx?(key: string, ttlSeconds: number, value: unknown): Promise<boolean>;
}

export interface SwrResult<T> {
  value: T;
  state: CacheState;
  /** True when this request paid for the rebuild. */
  blocked: boolean;
}

/**
 * Read through a cache, refreshing in the background when the value is stale.
 *
 * A refresh lock stops a burst of stale requests all triggering their own
 * rebuild. The background refresh is deliberately not awaited — if the platform
 * terminates the invocation first, the lock simply expires and the next stale
 * request tries again. The cost of that is data staying stale slightly longer;
 * the cost of awaiting it is a 40-second page, which is the thing being fixed.
 */
export async function swrCache<T>(args: {
  store: SwrStore | null;
  key: string;
  freshSeconds: number;
  staleSeconds: number;
  build: () => Promise<T>;
  /** Refuse to cache a bad build (an empty roster, a failed upstream). */
  isCacheable?: (value: T) => boolean;
  now?: () => number;
}): Promise<SwrResult<T>> {
  const {
    store, key, freshSeconds, staleSeconds, build,
    isCacheable = () => true, now = Date.now,
  } = args;

  if (!store) {
    return { value: await build(), state: "miss", blocked: true };
  }

  const envelope = await store.get<CacheEnvelope<T>>(key).catch(() => null);
  const state = cacheDecision({
    builtAt: envelope?.builtAt, now: now(), freshSeconds, staleSeconds,
  });

  const write = async (value: T) => {
    if (!isCacheable(value)) return;
    await store.setex(key, staleSeconds, { value, builtAt: now() }).catch(() => {});
  };

  if (state === "fresh" && envelope) {
    return { value: envelope.value, state, blocked: false };
  }

  if (state === "stale" && envelope) {
    // One refresher at a time. Without the lock a quiet site wakes up, ten
    // requests arrive together, and all ten start the 40-second assembly.
    const lockKey = `${key}:refreshing`;
    const acquired = store.setnx
      ? await store.setnx(lockKey, 120, 1).catch(() => false)
      : true;
    if (acquired) {
      void build()
        .then(async value => { await write(value); })
        .catch(() => {})
        .finally(() => { void store.setex(lockKey, 1, 1).catch(() => {}); });
    }
    return { value: envelope.value, state, blocked: false };
  }

  // "miss" or "expired": nothing safe to serve, so this request pays.
  const value = await build();
  await write(value);
  return { value, state, blocked: true };
}
