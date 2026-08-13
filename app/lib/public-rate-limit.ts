// ── public-rate-limit.ts ─────────────────────────────────────────
//
// A request ceiling for the public compute endpoints.
//
// `/api/claude` has had one since it was written, because it spends money on
// every call and the cost of not having one is a bill. `/api/evaluate` and
// `/api/simulate` never did — they are free to run, so the failure mode is
// quieter and slower: they are the two most expensive things this app
// computes, they authenticate nobody, and a loop pointed at either one burns
// the serverless budget and starves every real reader on the site.
//
// That was survivable while nobody knew the site existed. It stops being
// survivable on the day of a launch post.
//
// WHAT THIS IS NOT
//
// Not a security boundary. The per-IP window is bypassable by rotating
// `X-Forwarded-For`, which is why the global windows exist and are the real
// protection. It is a guard against accidents and casual abuse, sized so that
// no human clicking around the site will ever meet it.
//
// Degrades rather than fails: without Redis it falls back to a per-instance
// in-memory counter, and if Redis throws mid-request the request is ALLOWED.
// A limiter that takes the site down when its own datastore hiccups has
// inverted the thing it was for.

import { redis } from "@/app/lib/redis";

export interface RateLimitPolicy {
  /** Cache-key namespace, so two endpoints never share a counter. */
  name: string;
  perIpPerMinute: number;
  globalPerMinute: number;
  /** Omit for endpoints that cost nothing but compute. */
  globalPerDay?: number;
}

export type RateLimitVerdict = { ok: true } | { ok: false; reason: string; retryAfter: number };

/**
 * Sized for a launch: generous enough that a person hammering the trade
 * machine never notices, tight enough that a script does.
 */
export const EVALUATE_LIMITS: RateLimitPolicy = {
  name: "evaluate", perIpPerMinute: 60, globalPerMinute: 600,
};

/** Simulations are heavier than evaluations, so the per-person window is tighter. */
export const SIMULATE_LIMITS: RateLimitPolicy = {
  name: "simulate", perIpPerMinute: 30, globalPerMinute: 300,
};

/**
 * The caller's address, as well as it can be known behind a proxy.
 *
 * Spoofable. See the note above: this identifies a client well enough to stop
 * an accident, and the global windows are what stop the rest.
 */
export function clientIp(req: Request): string {
  const fwd = req.headers.get("x-forwarded-for");
  if (fwd) return fwd.split(",")[0].trim().slice(0, 64) || "unknown";
  return req.headers.get("x-real-ip")?.slice(0, 64) || "unknown";
}

const memory = new Map<string, { count: number; resetAt: number }>();

function withinMemory(key: string, limit: number, windowMs: number): boolean {
  const now = Date.now();
  // Prune on the way through, so a long-lived instance cannot grow a map with
  // one entry per address it has ever seen.
  for (const [k, v] of memory) if (now > v.resetAt) memory.delete(k);
  const entry = memory.get(key);
  if (!entry || now > entry.resetAt) {
    memory.set(key, { count: 1, resetAt: now + windowMs });
    return true;
  }
  if (entry.count >= limit) return false;
  entry.count++;
  return true;
}

async function withinRedis(key: string, limit: number, ttlSeconds: number): Promise<boolean> {
  const count = await redis!.incr(key);
  if (count === 1) await redis!.expire(key, ttlSeconds);
  return count <= limit;
}

export async function checkPublicRateLimit(
  req: Request,
  policy: RateLimitPolicy,
): Promise<RateLimitVerdict> {
  const ip = clientIp(req);

  if (redis) {
    try {
      const minute = Math.floor(Date.now() / 60_000);
      const day = Math.floor(Date.now() / 86_400_000);
      const checks: Promise<boolean>[] = [
        withinRedis(`rl:${policy.name}:ip:${ip}:${minute}`, policy.perIpPerMinute, 60),
        withinRedis(`rl:${policy.name}:global:min:${minute}`, policy.globalPerMinute, 60),
      ];
      if (policy.globalPerDay != null) {
        checks.push(withinRedis(`rl:${policy.name}:global:day:${day}`, policy.globalPerDay, 86_400));
      }
      const [ipOk, ...globals] = await Promise.all(checks);
      if (!ipOk) {
        return { ok: false, reason: "Too many requests — try again in a minute.", retryAfter: 60 };
      }
      if (globals.some(ok => !ok)) {
        return { ok: false, reason: "The site is busy right now — try again shortly.", retryAfter: 60 };
      }
      return { ok: true };
    } catch (e) {
      // Allow. A limiter that closes the door when its own datastore is having
      // a moment has become the outage it was meant to prevent.
      console.warn(`[${policy.name}] rate limiter unavailable, falling back:`, (e as Error).message);
    }
  }

  return withinMemory(`${policy.name}:${ip}`, policy.perIpPerMinute, 60_000)
    ? { ok: true }
    : { ok: false, reason: "Too many requests — try again in a minute.", retryAfter: 60 };
}

/** The 429 to return when a check fails, with the header a client should obey. */
export function rateLimitResponse(verdict: { reason: string; retryAfter: number }): Response {
  return new Response(JSON.stringify({ error: verdict.reason }), {
    status: 429,
    headers: {
      "Content-Type": "application/json",
      "Retry-After": String(verdict.retryAfter),
    },
  });
}
