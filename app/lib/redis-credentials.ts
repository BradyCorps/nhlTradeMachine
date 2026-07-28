// ── Redis credentials arrive under two different names ───────────
//
// Provisioning Upstash by hand gives you UPSTASH_REDIS_REST_URL / _TOKEN.
// Provisioning the same database through the Vercel marketplace integration
// gives you KV_REST_API_URL / KV_REST_API_TOKEN instead. Reading only the first
// pair meant a correctly provisioned integration still left `redis` null — and
// since every cache write is wrapped in `.catch(() => {})`, that failure is
// completely silent. No error, no log: just a site rebuilding a ~40s roster
// assembly on every request as though no cache had ever been configured.
//
// Three names sit beside those in the same Upstash panel and are NOT
// interchangeable with them:
//
//   KV_URL, REDIS_URL             `rediss://` strings for a TCP client.
//                                 @upstash/redis speaks HTTP and cannot use
//                                 them.
//   KV_REST_API_READ_ONLY_TOKEN   Reads succeed, every write is rejected, and
//                                 the swallowed catch hides it — a cache that
//                                 silently never fills.
//
// So the pairs are matched explicitly rather than by grabbing whatever looks
// URL- or token-shaped.

export interface RedisCredentials {
  url: string;
  token: string;
}

type Env = Record<string, string | undefined>;

const clean = (value: string | undefined): string | undefined => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
};

/**
 * The REST url/token pair for whichever provisioning route was used, or null
 * when Redis is not configured.
 *
 * A `rediss://` value is rejected rather than passed through: it means the TCP
 * connection string was pasted into the REST slot, which fails per-request at
 * runtime instead of here, where it is obvious.
 */
export function resolveRedisCredentials(env: Env): RedisCredentials | null {
  const url = clean(env.UPSTASH_REDIS_REST_URL) ?? clean(env.KV_REST_API_URL);
  const token = clean(env.UPSTASH_REDIS_REST_TOKEN) ?? clean(env.KV_REST_API_TOKEN);

  if (!url || !token) return null;
  if (!/^https?:\/\//i.test(url)) return null;

  return { url, token };
}
