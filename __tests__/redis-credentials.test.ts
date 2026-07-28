import { describe, expect, it } from "vitest";
import { resolveRedisCredentials } from "../app/lib/redis-credentials";

const REST_URL = "https://example-12345.upstash.io";

describe("resolveRedisCredentials", () => {
  it("reads the hand-provisioned UPSTASH_ names", () => {
    expect(resolveRedisCredentials({
      UPSTASH_REDIS_REST_URL: REST_URL,
      UPSTASH_REDIS_REST_TOKEN: "tok",
    })).toEqual({ url: REST_URL, token: "tok" });
  });

  // The Vercel marketplace integration provisions the same database but names
  // the variables KV_*. Reading only UPSTASH_* left redis null with no error.
  it("reads the Vercel integration's KV_ names", () => {
    expect(resolveRedisCredentials({
      KV_REST_API_URL: REST_URL,
      KV_REST_API_TOKEN: "tok",
    })).toEqual({ url: REST_URL, token: "tok" });
  });

  it("prefers explicit UPSTASH_ values when both are present", () => {
    expect(resolveRedisCredentials({
      UPSTASH_REDIS_REST_URL: REST_URL,
      UPSTASH_REDIS_REST_TOKEN: "explicit",
      KV_REST_API_URL: "https://other.upstash.io",
      KV_REST_API_TOKEN: "integration",
    })).toEqual({ url: REST_URL, token: "explicit" });
  });

  it("returns null when nothing is configured", () => {
    expect(resolveRedisCredentials({})).toBeNull();
  });

  it("returns null on a half-configured pair rather than a broken client", () => {
    expect(resolveRedisCredentials({ KV_REST_API_URL: REST_URL })).toBeNull();
    expect(resolveRedisCredentials({ KV_REST_API_TOKEN: "tok" })).toBeNull();
  });

  it("ignores blank and whitespace-only values", () => {
    expect(resolveRedisCredentials({
      KV_REST_API_URL: "   ",
      KV_REST_API_TOKEN: "tok",
    })).toBeNull();
  });

  // KV_URL and REDIS_URL sit in the same panel and look like credentials, but
  // they are TCP connection strings; @upstash/redis speaks HTTP. Failing here
  // beats failing on every request at runtime.
  it("rejects a rediss:// connection string pasted into the REST slot", () => {
    expect(resolveRedisCredentials({
      UPSTASH_REDIS_REST_URL: "rediss://default:pw@example-12345.upstash.io:6379",
      UPSTASH_REDIS_REST_TOKEN: "tok",
    })).toBeNull();
  });

  // Deliberately NOT accepted: the read-only token would let every read
  // succeed and every cache write fail silently.
  it("does not fall back to the read-only token", () => {
    expect(resolveRedisCredentials({
      KV_REST_API_URL: REST_URL,
      KV_REST_API_READ_ONLY_TOKEN: "readonly",
    })).toBeNull();
  });
});
