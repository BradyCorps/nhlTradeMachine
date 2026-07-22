// ── Perf: /api/league/players cache health guard ─────────────────
import { describe, it, expect } from "vitest";
import { isHealthyRoster } from "@/app/lib/roster-health";

const skater = (ops: number | null, dps: number | null) =>
  ({ position: "C", ops, dps });

describe("isHealthyRoster", () => {
  it("accepts a full roster where point-shares loaded", () => {
    const players = Array.from({ length: 300 }, () => skater(2.1, 1.4));
    expect(isHealthyRoster(players)).toBe(true);
  });

  it("rejects a roster where point-shares failed (OPS/DPS blank) — won't poison the cache", () => {
    const players = Array.from({ length: 300 }, () => skater(null, null));
    expect(isHealthyRoster(players)).toBe(false);
  });

  it("rejects a too-thin roster (assembly likely degraded)", () => {
    const players = Array.from({ length: 40 }, () => skater(2, 1));
    expect(isHealthyRoster(players)).toBe(false);
  });

  it("ignores picks and goalies when judging skater coverage", () => {
    const players = [
      ...Array.from({ length: 150 }, () => skater(2, 1)),
      ...Array.from({ length: 50 }, () => ({ position: "Pick" })),
      ...Array.from({ length: 40 }, () => ({ position: "G" })),
    ];
    expect(isHealthyRoster(players)).toBe(true);
  });

  it("requires at least half the skaters to have a point-share value", () => {
    const players = [
      ...Array.from({ length: 60 }, () => skater(2, 1)),
      ...Array.from({ length: 140 }, () => skater(null, null)),
    ];
    expect(isHealthyRoster(players)).toBe(false); // 60/200 = 30%
  });
});
