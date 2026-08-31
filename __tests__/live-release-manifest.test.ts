import { describe, expect, it } from "vitest";
import { buildLiveReleaseManifest } from "@/app/lib/live-release-manifest";
import type { Asset } from "@/app/lib/trade-types";

const asset = (id: string, over: Partial<Asset> = {}): Asset => ({
  id, teamId: "WPG", name: id, position: "C", age: 26, games: 78, ptsPace: 40,
  xGPace: 14, defRate: 0.08, avgTOI: 15, capHit: 2, yearsRemaining: 3,
  hasNMC: false, hasNTC: false, canRetain: true, retainedPct: 0, multiplier: 1,
  contractStatus: "SIGNED", expiryStatus: null, expiryYear: null,
  ...over,
});

describe("DATA-06: live release manifest", () => {
  it("wires roster, contracts, valuation, and teamModel — the domains a plain snapshot can actually verify", () => {
    const manifest = buildLiveReleaseManifest({
      players: [asset("a", { name: "Connor McDavid" }), asset("b", { name: "Mark Scheifele" })],
      generatedAt: "2026-08-31T12:00:00Z",
      capCeiling: 104,
    });
    expect(manifest.domains.roster).toBeDefined();
    expect(manifest.domains.contracts).toBeDefined();
    expect(manifest.domains.valuation).toBeDefined();
    expect(manifest.domains.teamModel).toBeDefined();
    expect(manifest.domains.roster!.gates.length).toBeGreaterThan(0);
    expect(manifest.domains.contracts!.gates.length).toBeGreaterThan(0);
    expect(manifest.domains.valuation!.gates.length).toBeGreaterThan(0);
    expect(manifest.domains.teamModel!.gates.length).toBeGreaterThan(0);
  });

  it("does not fabricate the domains a plain roster snapshot cannot verify — they stay unwired and degraded, never silently live", () => {
    const manifest = buildLiveReleaseManifest({
      players: [asset("a")],
      generatedAt: "2026-08-31T12:00:00Z",
    });
    expect(manifest.domains.stats).toBeUndefined();
    expect(manifest.domains.picks).toBeUndefined();
    expect(manifest.domains.fantasy).toBeUndefined();
    expect(manifest.domains.simulation).toBeUndefined();
  });

  it("carries the last successful ingest and today's snapshot date through", () => {
    const manifest = buildLiveReleaseManifest({
      players: [asset("a")],
      generatedAt: "2026-08-31T12:00:00Z",
    });
    expect(manifest.domains.roster!.lastSuccessfulIngest).toBe("2026-08-31T12:00:00Z");
    expect(manifest.snapshotDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  describe("roster domain", () => {
    it("reads live for a clean, alias-distinct roster", () => {
      const manifest = buildLiveReleaseManifest({
        players: [asset("a", { name: "Connor McDavid" }), asset("b", { name: "Leon Draisaitl" })],
        generatedAt: null,
      });
      expect(manifest.domains.roster!.status).toBe("live");
    });

    it("reads down when two different NHL IDs collapse to the same canonical name", () => {
      const manifest = buildLiveReleaseManifest({
        players: [asset("a", { name: "Alexis Lafrenière" }), asset("b", { name: "Alexis Lafreniere" })],
        generatedAt: null,
      });
      expect(manifest.domains.roster!.status).toBe("down");
    });
  });

  describe("contracts domain", () => {
    it("reads down for an asserted RFA/UFA with no expiryYear behind it", () => {
      const manifest = buildLiveReleaseManifest({
        players: [asset("a", { contractStatus: "SIGNED", expiryStatus: "RFA", expiryYear: null })],
        generatedAt: null,
      });
      expect(manifest.domains.contracts!.status).toBe("down");
    });

    it("reads down when a free agent still reads as SIGNED — the DATA-01 consistency gate", () => {
      const manifest = buildLiveReleaseManifest({
        players: [asset("a", { teamId: "FA_POOL", contractStatus: "SIGNED" })],
        generatedAt: null,
      });
      expect(manifest.domains.contracts!.status).toBe("down");
    });

    it("reads live for ordinary signed and pending-market players", () => {
      const manifest = buildLiveReleaseManifest({
        players: [
          asset("a", { contractStatus: "SIGNED" }),
          asset("b", { contractStatus: "UFA", expiryYear: 2027 }),
          asset("c", { teamId: "FA_POOL", contractStatus: "UFA" }),
        ],
        generatedAt: null,
      });
      expect(manifest.domains.contracts!.status).toBe("live");
    });
  });

  describe("valuation domain", () => {
    it("reads live — two independently-computed surfaces agree by construction on the same day", () => {
      const manifest = buildLiveReleaseManifest({
        players: [asset("a"), asset("b", { name: "Second Player" })],
        generatedAt: null,
        capCeiling: 104,
      });
      expect(manifest.domains.valuation!.status).toBe("live");
    });
  });

  describe("teamModel domain", () => {
    it("reads down when no team can ice a legal lineup (the general case for a partial fixture)", () => {
      const manifest = buildLiveReleaseManifest({
        players: [asset("a")],
        generatedAt: null,
      });
      expect(manifest.domains.teamModel!.status).toBe("down");
      expect(manifest.domains.teamModel!.coverage).toContain("32 team");
    });
  });
});
