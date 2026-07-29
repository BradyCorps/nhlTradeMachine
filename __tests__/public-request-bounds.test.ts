import { describe, expect, it } from "vitest";
import { z } from "zod";
import {
  PUBLIC_LIMITS,
  finiteNumber,
  idString,
  invalidRequest,
  nameString,
  publicAssetSchema,
  publicNavMapSchema,
  publicTeamSchema,
} from "../app/lib/public-request-bounds";

describe("id and name bounds", () => {
  it("accepts a real id", () => {
    expect(idString.safeParse("8484153").success).toBe(true);
    expect(idString.safeParse("pick-WPG-2027-1").success).toBe(true);
  });

  it("rejects an empty id — routes index on it", () => {
    expect(idString.safeParse("").success).toBe(false);
  });

  it("rejects an id past the ceiling", () => {
    expect(idString.safeParse("x".repeat(PUBLIC_LIMITS.MAX_ID + 1)).success).toBe(false);
  });

  it("bounds names", () => {
    expect(nameString.safeParse("x".repeat(PUBLIC_LIMITS.MAX_NAME + 1)).success).toBe(false);
  });
});

// JSON.parse produces NaN and Infinity happily; both then propagate through the
// valuation engine as poisoned arithmetic rather than failing loudly.
describe("finite numbers", () => {
  it("accepts ordinary values", () => {
    expect(finiteNumber.safeParse(8.5).success).toBe(true);
    expect(finiteNumber.safeParse(-3).success).toBe(true);
  });

  it("rejects NaN and infinities", () => {
    expect(finiteNumber.safeParse(Number.NaN).success).toBe(false);
    expect(finiteNumber.safeParse(Number.POSITIVE_INFINITY).success).toBe(false);
    expect(finiteNumber.safeParse(Number.NEGATIVE_INFINITY).success).toBe(false);
  });
});

describe("publicAssetSchema", () => {
  it("requires an id", () => {
    expect(publicAssetSchema.safeParse({ name: "No Id" }).success).toBe(false);
  });

  // Permissive on fields by design: the engine reads ~30 optional inputs no
  // route enumerates, and stripping them would silently degrade valuations.
  it("passes unknown engine fields through untouched", () => {
    const parsed = publicAssetSchema.safeParse({
      id: "a", edgeSpeedMaxMph: 22.4, hdFinishingDelta: 0.03,
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect((parsed.data as Record<string, unknown>).edgeSpeedMaxMph).toBe(22.4);
    }
  });

  it("rejects a non-finite cap hit", () => {
    expect(publicAssetSchema.safeParse({ id: "a", capHit: Number.NaN }).success).toBe(false);
  });

  it("rejects a non-finite age", () => {
    expect(publicAssetSchema.safeParse({ id: "a", age: Number.POSITIVE_INFINITY }).success).toBe(false);
  });
});

describe("publicTeamSchema", () => {
  it("requires an id and bounds the numbers", () => {
    expect(publicTeamSchema.safeParse({ id: "WPG", capSpace: 5.1, standing: 12 }).success).toBe(true);
    expect(publicTeamSchema.safeParse({ id: "WPG", capSpace: Number.NaN }).success).toBe(false);
  });
});

describe("publicNavMapSchema", () => {
  it("accepts a normal lookup", () => {
    expect(publicNavMapSchema.safeParse({ a: { total: 120 }, b: { total: -4 } }).success).toBe(true);
  });

  it("rejects a non-finite total", () => {
    expect(publicNavMapSchema.safeParse({ a: { total: Number.NaN } }).success).toBe(false);
  });

  // An unbounded record is the easiest way to hand a route a hundred thousand
  // keys to iterate over.
  it("caps the number of entries", () => {
    const huge = Object.fromEntries(
      Array.from({ length: PUBLIC_LIMITS.MAX_NAV_ENTRIES + 1 }, (_, i) => [`p${i}`, { total: 1 }]),
    );
    expect(publicNavMapSchema.safeParse(huge).success).toBe(false);
  });

  it("accepts a lookup exactly at the cap", () => {
    const atCap = Object.fromEntries(
      Array.from({ length: PUBLIC_LIMITS.MAX_NAV_ENTRIES }, (_, i) => [`p${i}`, { total: 1 }]),
    );
    expect(publicNavMapSchema.safeParse(atCap).success).toBe(true);
  });
});

describe("limits are ordered sensibly", () => {
  it("keeps a package smaller than a roster, and a roster smaller than the league", () => {
    expect(PUBLIC_LIMITS.MAX_PACKAGE).toBeLessThan(PUBLIC_LIMITS.MAX_ROSTER);
    expect(PUBLIC_LIMITS.MAX_ROSTER).toBeLessThan(PUBLIC_LIMITS.MAX_PLAYERS);
    expect(PUBLIC_LIMITS.MAX_PLAYERS).toBeLessThanOrEqual(PUBLIC_LIMITS.MAX_NAV_ENTRIES);
  });
});

describe("invalidRequest", () => {
  it("labels the route and carries the field detail", () => {
    const err = z.object({ id: z.string() }).safeParse({});
    if (err.success) throw new Error("expected a parse failure");
    const body = invalidRequest("match", err.error);
    expect(body.error).toBe("Invalid match request");
    expect(body.details).toBeDefined();
  });
});
