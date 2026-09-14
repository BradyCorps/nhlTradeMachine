import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { calculateAssetNAV, toAssetInput, type AssetNavSource } from "@/app/lib/asset-nav";
import { XNAV_MODEL_VERSION } from "@/app/lib/data-context";
import {
  GRAVITY_V3_DISPLAY_FEATURE_FLAG,
  GRAVITY_V3_SIMULATION_FEATURE_FLAG,
  GRAVITY_V3_XNAV_FEATURE_FLAG,
} from "@/app/lib/gravity-feature-flags";
import { GRAVITY_V4_ARTIFACT_MANIFEST } from "@/app/lib/gravity-v4/artifact-manifest";
import { GRAVITY_V4_FEATURE_FLAG } from "@/app/lib/gravity-v4/feature-flag";
import {
  ANALYTIC_CATALOG,
  getAnalyticDefinition,
  getProductionAnalytic,
  getProductionPlayerValuationAnalytic,
  listProductionAnalytics,
  ProductionAnalyticCatalogError,
  ProductionAnalyticResolutionError,
  validateAnalyticCatalog,
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
  it("validates one unique stable identity for every known analytic", () => {
    const ids = ANALYTIC_CATALOG.map(analytic => analytic.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(() => validateAnalyticCatalog(ANALYTIC_CATALOG)).not.toThrow();
    expect(() => validateAnalyticCatalog([...ANALYTIC_CATALOG, ANALYTIC_CATALOG[0]])).toThrow(ProductionAnalyticCatalogError);
  });

  it("resolves every production identity to its existing implementation and version", () => {
    expect(getProductionAnalytic("nav.asset")).toMatchObject({
      implementation: "calculateAssetNAV",
      executionBoundary: "calculateAssetNAV -> calcNAV",
      version: { value: XNAV_MODEL_VERSION, kind: "explicit", source: { exportName: "XNAV_MODEL_VERSION" } },
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
      version: { kind: "implicit", source: { exportName: "GRAVITY_V4_ARTIFACT_MANIFEST" } },
      artifact: { manifestExport: "GRAVITY_V4_ARTIFACT_MANIFEST" },
      featureFlags: [{ source: { exportName: "GRAVITY_V4_FEATURE_FLAG" }, failsClosed: true }],
    });
    expect(GRAVITY_V4_FEATURE_FLAG).toBe("GRAVITY_V4_ENABLED");
    expect(GRAVITY_V4_ARTIFACT_MANIFEST.sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(listProductionAnalytics().map(analytic => analytic.id)).not.toContain("gravity.v4");
  });

  it("references the exported X-NAV and v3 flag constants rather than copying them", () => {
    for (const id of ["nav.asset", "nav.forward", "nav.defense", "nav.goalie"]) {
      expect(getProductionAnalytic(id).version).toMatchObject({
        value: XNAV_MODEL_VERSION,
        source: { module: "app/lib/data-context.ts", exportName: "XNAV_MODEL_VERSION" },
      });
    }
    expect(getProductionAnalytic("gravity.v3").featureFlags?.map(flag => flag.key)).toEqual([
      GRAVITY_V3_DISPLAY_FEATURE_FLAG,
      GRAVITY_V3_XNAV_FEATURE_FLAG,
      GRAVITY_V3_SIMULATION_FEATURE_FLAG,
    ]);
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

  it("does not let display aggregation masquerade as a player calculator", () => {
    expect(getProductionAnalytic("nav.team-aggregation").calculationRole).toBe("display-aggregation");
    expect(() => getProductionPlayerValuationAnalytic("nav.team-aggregation")).toThrow(/not a production analytic/i);
    expect(getProductionPlayerValuationAnalytic("nav.forward").calculationRole).toBe("position-valuation");
  });

  it("is deeply read-only at runtime", () => {
    const nav = getProductionAnalytic("nav.asset");
    const gravity = getAnalyticDefinition("gravity.v3");
    expect(Object.isFrozen(ANALYTIC_CATALOG)).toBe(true);
    expect(Object.isFrozen(nav)).toBe(true);
    expect(Object.isFrozen(nav.version)).toBe(true);
    expect(Object.isFrozen(nav.immediateConsumers)).toBe(true);
    expect(Object.isFrozen(gravity.featureFlags)).toBe(true);
    expect(Object.isFrozen(gravity.featureFlags?.[0])).toBe(true);
  });

  it("contains no runtime database or snapshot-batch selector", () => {
    const source = readFileSync(join(process.cwd(), "app/lib/production-analytics.ts"), "utf8");
    expect(ANALYTIC_CATALOG.every(analytic => analytic.datasetReferencePolicy === "none-at-runtime" || analytic.recordKind === "research-candidate")).toBe(true);
    expect(getProductionAnalytic("nav.asset")).not.toHaveProperty("snapshotBatchId");
    expect(source).not.toMatch(/@\/app\/(db|lib\/season-snapshot)/);
    expect(source).not.toMatch(/from ["']@\/app\/lib\/gravity-v4/);
  });
});
