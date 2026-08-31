import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Asset } from "@/app/lib/trade-types";

const state = vi.hoisted(() => ({
  cachedRoster: vi.fn(),
}));

vi.mock("@/app/lib/admin-auth", () => ({
  requireAdmin: vi.fn(async () => null),
}));

vi.mock("@/app/lib/cached-roster", () => ({
  getCachedRoster: state.cachedRoster,
}));

const asset = (id: string, over: Partial<Asset> = {}): Asset => ({
  id, teamId: "WPG", name: id, position: "C", age: 26, games: 78, ptsPace: 40,
  xGPace: 14, defRate: 0.08, avgTOI: 15, capHit: 2, yearsRemaining: 3,
  hasNMC: false, hasNTC: false, canRetain: true, retainedPct: 0, multiplier: 1,
  contractStatus: "SIGNED", expiryStatus: null, expiryYear: null,
  ...over,
});

async function get() {
  const { GET } = await import("../app/api/admin/release-manifest/route");
  return GET(new Request("http://localhost/api/admin/release-manifest"));
}

describe("admin release manifest route", () => {
  beforeEach(() => {
    vi.resetModules();
    state.cachedRoster.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("publishes a manifest built from the same cached roster every other route reads", async () => {
    state.cachedRoster.mockResolvedValue({
      value: {
        players: [asset("a", { name: "Connor McDavid" }), asset("b", { name: "Mark Scheifele" })],
        generatedAt: "2026-08-31T12:00:00Z",
        capCeiling: 104,
      },
      state: "fresh",
      blocked: false,
    });

    const response = await get();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
    expect(body.manifest.domains.roster).toBeDefined();
    expect(body.manifest.domains.contracts).toBeDefined();
    expect(body.manifest.domains.valuation).toBeDefined();
    expect(body.manifest.domains.teamModel).toBeDefined();
    // Two-player fixture can't ice a legal lineup on any of the 32 real
    // teams, so this deployment's manifest is correctly not publishable —
    // proving the route doesn't sand off a real failed domain.
    expect(body.publishable).toBe(false);
    expect(body.failedDomains).toContain("teamModel");
  });

  it("reports a build failure rather than an empty manifest that reads as 'nothing to diagnose'", async () => {
    state.cachedRoster.mockRejectedValue(new Error("roster assembly failed"));

    const response = await get();
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.ok).toBe(false);
    expect(body.error).toContain("roster assembly failed");
  });
});
