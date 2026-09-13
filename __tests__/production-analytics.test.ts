import { describe, expect, it } from "vitest";
import { calculateAssetNAV, toAssetInput, type AssetNavSource } from "@/app/lib/asset-nav";
import {
  ANALYTIC_CATALOG,
  getAnalyticDefinition,
  getProductionAnalytic,
  listProductionAnalytics,
  ProductionAnalyticResolutionError,
} from "@/app/lib/production-analytics";
import { rosterNavByPosition } from "@/app/lib/team-nav-split";
import { calcNAV } from "@/app/lib/xnav-engine";

const asset: AssetNavSource = {
  id: "registry-boundary-forward",
  name: "Registry Boundary Forward",
  position: "RW",
  age: 27,
  games: 82,
  ptsPace: 80,
  xGPace: 25,
  defRate: 0.06,
  avgTOI: 19,
  qocIndex: 60,
  capHit: 5,
  yearsRemaining: 3,
  hasLiveStats: true,
};

describe("Phase 1B production analytics identity catalog", () => {
  it("has one unique stable identity for every known analytic", () => {
    const ids = ANALYTIC_CATALOG.map(analytic => analytic.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("resolves every production identity to its existing implementation and version", () => {
    expect(getProductionAnalytic("nav.asset")).toMatchObject({
      implementation: "calculateAssetNAV",
      executionBoundary: "calculateAssetNAV -> calcNAV",
      version: { value: "X-NAV 4.2", kind: "explicit" },
    });
    expect(getProductionAnalytic("nav.forward").implementation).toBe("calcNAV.forward-dispatch");
    expect(getProductionAnalytic("nav.defense").implementation).toBe("calcNAV.defense-dispatch");
    expect(getProductionAnalytic("nav.goalie").implementation).toBe("calcNAV.goalie-dispatch");
    expect(getProductionAnalytic("nav.team-aggregation").implementation).toBe("rosterNavByPosition");
    expect(getProductionAnalytic("gravity.v3").lifecycle).toBe("PRODUCTION");
    expect(getProductionAnalytic("simulation.season").deterministicForFixedInputs).toBe("seeded");
  });

  it("fails closed for unknown, diagnostic, and research identities", () => {
    expect(() => getProductionAnalytic("not.an.analytic")).toThrow(ProductionAnalyticResolutionError);
    expect(() => getProductionAnalytic("gravity.v4")).toThrow(/not a production analytic/i);
    expect(() => getProductionAnalytic("nav01.phase5-calibration")).toThrow(/not a production analytic/i);
  });

  it("keeps Gravity v4 diagnostic and flag-controlled, never public NAV", () => {
    const gravityV4 = getAnalyticDefinition("gravity.v4");
    expect(gravityV4).toMatchObject({
      lifecycle: "DIAGNOSTIC",
      exposure: "diagnostic",
      executionBoundary: "gravity-v4 diagnostic loader",
      artifact: { manifestExport: "GRAVITY_V4_ARTIFACT_MANIFEST" },
      featureFlags: [{ key: "GRAVITY_V4_ENABLED", failsClosed: true }],
    });
    expect(listProductionAnalytics().map(analytic => analytic.id)).not.toContain("gravity.v4");
  });

  it("retains NAV-01 Phase 5 only as failed research evidence", () => {
    expect(getAnalyticDefinition("nav01.phase5-calibration")).toMatchObject({
      lifecycle: "RESEARCH",
      recordKind: "research-candidate",
      datasetReferencePolicy: "candidate-requires-complete-snapshot-batch",
    });
  });

  it("leaves the canonical public NAV calculation and team aggregation unchanged", () => {
    const asOf = "2026-09-11";
    const publicResult = calculateAssetNAV(asset, 104, asOf);
    const engineResult = calcNAV(toAssetInput(asset, 104));
    expect(publicResult.total).toBe(engineResult.total);
    expect(publicResult.snapshot?.asOf).toBe(asOf);
    expect(rosterNavByPosition([{ position: "W", nav: publicResult.total }, { position: "G", nav: -5 }]))
      .toEqual({ xnav: publicResult.total, f: publicResult.total, d: 0, g: 0, signed: { f: publicResult.total, d: 0, g: -5, total: publicResult.total - 5 } });
  });

  it("contains no runtime snapshot-batch selector metadata", () => {
    expect(ANALYTIC_CATALOG.every(analytic => analytic.datasetReferencePolicy === "none-at-runtime" || analytic.recordKind === "research-candidate")).toBe(true);
    expect(getProductionAnalytic("nav.asset")).not.toHaveProperty("snapshotBatchId");
  });
});
