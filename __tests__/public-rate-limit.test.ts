import { describe, it, expect, vi } from "vitest";

vi.mock("@/app/lib/redis", () => ({ redis: null }));

const {
  checkPublicRateLimit, rateLimitResponse, clientIp,
  EVALUATE_LIMITS, SIMULATE_LIMITS,
} = await import("@/app/lib/public-rate-limit");

const req = (ip: string) =>
  new Request("https://capandcrease.com/api/evaluate", {
    method: "POST",
    headers: { "x-forwarded-for": ip },
  });

describe("public rate limit — the in-memory fallback", () => {
  it("lets a person use the site", async () => {
    // The ceiling has to sit far above anything a human clicking around will
    // reach, or it is a bug that only shows up as "the site is broken".
    const ip = "203.0.113.1";
    for (let i = 0; i < EVALUATE_LIMITS.perIpPerMinute; i++) {
      expect((await checkPublicRateLimit(req(ip), EVALUATE_LIMITS)).ok).toBe(true);
    }
  });

  it("stops a script", async () => {
    const ip = "203.0.113.2";
    for (let i = 0; i < EVALUATE_LIMITS.perIpPerMinute; i++) {
      await checkPublicRateLimit(req(ip), EVALUATE_LIMITS);
    }
    const over = await checkPublicRateLimit(req(ip), EVALUATE_LIMITS);
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.retryAfter).toBe(60);
  });

  it("counts each address separately", async () => {
    const busy = "203.0.113.3";
    for (let i = 0; i < EVALUATE_LIMITS.perIpPerMinute + 5; i++) {
      await checkPublicRateLimit(req(busy), EVALUATE_LIMITS);
    }
    expect((await checkPublicRateLimit(req(busy), EVALUATE_LIMITS)).ok).toBe(false);
    expect((await checkPublicRateLimit(req("203.0.113.4"), EVALUATE_LIMITS)).ok).toBe(true);
  });

  it("keeps the two endpoints in separate buckets", async () => {
    // Sharing a counter would mean running simulations locks you out of the
    // trade machine, which is not a limit anybody asked for.
    const ip = "203.0.113.5";
    for (let i = 0; i < SIMULATE_LIMITS.perIpPerMinute + 2; i++) {
      await checkPublicRateLimit(req(ip), SIMULATE_LIMITS);
    }
    expect((await checkPublicRateLimit(req(ip), SIMULATE_LIMITS)).ok).toBe(false);
    expect((await checkPublicRateLimit(req(ip), EVALUATE_LIMITS)).ok).toBe(true);
  });

  it("holds simulations to a tighter window than evaluations", () => {
    expect(SIMULATE_LIMITS.perIpPerMinute).toBeLessThan(EVALUATE_LIMITS.perIpPerMinute);
  });
});

describe("public rate limit — identifying the caller", () => {
  it("takes the first hop of a forwarded chain", () => {
    const r = new Request("https://x.test", { headers: { "x-forwarded-for": "1.2.3.4, 5.6.7.8" } });
    expect(clientIp(r)).toBe("1.2.3.4");
  });

  it("falls back, and never returns an empty key", () => {
    expect(clientIp(new Request("https://x.test", { headers: { "x-real-ip": "9.9.9.9" } }))).toBe("9.9.9.9");
    expect(clientIp(new Request("https://x.test"))).toBe("unknown");
    expect(clientIp(new Request("https://x.test", { headers: { "x-forwarded-for": "" } }))).toBe("unknown");
  });

  it("truncates a header long enough to be an attack on the cache key", () => {
    const r = new Request("https://x.test", { headers: { "x-forwarded-for": "a".repeat(5000) } });
    expect(clientIp(r).length).toBeLessThanOrEqual(64);
  });
});

describe("public rate limit — the response", () => {
  it("is a 429 that says when to come back", async () => {
    const res = rateLimitResponse({ reason: "Too many requests", retryAfter: 60 });
    expect(res.status).toBe(429);
    expect(res.headers.get("Retry-After")).toBe("60");
    expect(await res.json()).toEqual({ error: "Too many requests" });
  });
});
