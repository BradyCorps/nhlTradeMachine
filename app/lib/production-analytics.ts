// ── Production analytics identity catalog ────────────────────────────────
//
// This is metadata about the implementations already selected by committed
// production code. It is deliberately not a calculator, plugin loader, or
// feature-flag evaluator. In particular, public raw-asset NAV stays on its
// established calculateAssetNAV -> calcNAV boundary.

import { XNAV_MODEL_VERSION } from "@/app/lib/data-context";
import {
  GRAVITY_V3_DISPLAY_FEATURE_FLAG,
  GRAVITY_V3_SIMULATION_FEATURE_FLAG,
  GRAVITY_V3_XNAV_FEATURE_FLAG,
} from "@/app/lib/gravity-feature-flags";

export type AnalyticId =
  | "nav.asset"
  | "nav.forward"
  | "nav.defense"
  | "nav.goalie"
  | "nav.team-aggregation"
  | "gravity.v3"
  | "gravity.v4"
  | "simulation.season"
  | "nav01.phase5-calibration";

export type AnalyticFamily = "nav" | "gravity" | "simulation";
export type AnalyticLifecycle = "PRODUCTION" | "DIAGNOSTIC" | "RESEARCH";
export type AnalyticExposure = "public" | "internal" | "diagnostic";
export type AnalyticRecordKind =
  | "production-analytic"
  | "diagnostic-analytic"
  | "research-candidate";
export type AnalyticVersionKind = "explicit" | "implicit";
export type AnalyticDeterminism = "fixed-inputs" | "seeded";

export type AnalyticImplementationId =
  | "calculateAssetNAV"
  | "calcNAV.forward-dispatch"
  | "calcNAV.defense-dispatch"
  | "calcNAV.goalie-dispatch"
  | "rosterNavByPosition"
  | "computeGravity.v3"
  | "gravity-v4.runtime-artifact"
  | "simulateLeague"
  | "nav01.phase5-research-evidence";

export type AnalyticExecutionBoundary =
  | "calculateAssetNAV -> calcNAV"
  | "calcNAV position dispatch"
  | "rosterNavByPosition display aggregation"
  | "gravity-channels"
  | "gravity-v4 diagnostic loader"
  | "POST /api/simulate"
  | "research-only no runtime boundary";

export type AnalyticFeatureFlag =
  | typeof GRAVITY_V3_DISPLAY_FEATURE_FLAG
  | typeof GRAVITY_V3_XNAV_FEATURE_FLAG
  | typeof GRAVITY_V3_SIMULATION_FEATURE_FLAG
  | "GRAVITY_V4_ENABLED";

export interface AnalyticVersionIdentity {
  /** Explicit means repository evidence names a version; implicit means it does not. */
  kind: AnalyticVersionKind;
  value: string;
  evidence: string;
}

export interface AnalyticArtifactIdentity {
  kind: "bundled-fitted-artifact";
  path: string;
  /** The manifest remains the authoritative checksum/schema source. */
  manifestModule: "app/lib/gravity-v4/artifact-manifest.ts";
  manifestExport: "GRAVITY_V4_ARTIFACT_MANIFEST";
}

export interface AnalyticFeatureFlagMetadata {
  key: AnalyticFeatureFlag;
  /** Every current analytical flag must be explicitly true to enable its channel. */
  failsClosed: true;
  scope: "display" | "xnav" | "simulation" | "diagnostic";
}

export interface AnalyticDefinition {
  id: AnalyticId;
  name: string;
  family: AnalyticFamily;
  lifecycle: AnalyticLifecycle;
  recordKind: AnalyticRecordKind;
  exposure: AnalyticExposure;
  implementation: AnalyticImplementationId;
  implementationModule: string;
  executionBoundary: AnalyticExecutionBoundary;
  version: AnalyticVersionIdentity;
  deterministicForFixedInputs: AnalyticDeterminism;
  immediateConsumers: readonly string[];
  artifact?: AnalyticArtifactIdentity;
  featureFlags?: readonly AnalyticFeatureFlagMetadata[];
  /** Dataset provenance is a future Labs concern, never a public-runtime selector here. */
  datasetReferencePolicy: "none-at-runtime" | "candidate-requires-complete-snapshot-batch";
}

export type ProductionAnalyticDefinition = AnalyticDefinition & {
  lifecycle: "PRODUCTION";
  recordKind: "production-analytic";
};

/**
 * The sole typed source of truth for known production, diagnostic, and failed
 * research identities. It describes selection that remains in committed code;
 * it must not be used to dispatch a candidate implementation at runtime.
 */
export const ANALYTIC_CATALOG: readonly AnalyticDefinition[] = [
  {
    id: "nav.asset",
    name: "X-NAV asset valuation",
    family: "nav",
    lifecycle: "PRODUCTION",
    recordKind: "production-analytic",
    exposure: "public",
    implementation: "calculateAssetNAV",
    implementationModule: "app/lib/asset-nav.ts",
    executionBoundary: "calculateAssetNAV -> calcNAV",
    version: { kind: "explicit", value: XNAV_MODEL_VERSION, evidence: "app/lib/data-context.ts" },
    deterministicForFixedInputs: "fixed-inputs",
    immediateConsumers: ["Players", "Teams", "trade evaluation", "league NAV map"],
    datasetReferencePolicy: "none-at-runtime",
  },
  {
    id: "nav.forward",
    name: "F-NAV",
    family: "nav",
    lifecycle: "PRODUCTION",
    recordKind: "production-analytic",
    exposure: "public",
    implementation: "calcNAV.forward-dispatch",
    implementationModule: "app/lib/xnav-engine.ts",
    executionBoundary: "calcNAV position dispatch",
    version: { kind: "explicit", value: XNAV_MODEL_VERSION, evidence: "docs/analytics/MODEL_CARD_NAV.md" },
    deterministicForFixedInputs: "fixed-inputs",
    immediateConsumers: ["calcNAV", "calculateAssetNAV"],
    datasetReferencePolicy: "none-at-runtime",
  },
  {
    id: "nav.defense",
    name: "D-NAV",
    family: "nav",
    lifecycle: "PRODUCTION",
    recordKind: "production-analytic",
    exposure: "public",
    implementation: "calcNAV.defense-dispatch",
    implementationModule: "app/lib/xnav-engine.ts",
    executionBoundary: "calcNAV position dispatch",
    version: { kind: "explicit", value: XNAV_MODEL_VERSION, evidence: "docs/analytics/MODEL_CARD_NAV.md" },
    deterministicForFixedInputs: "fixed-inputs",
    immediateConsumers: ["calcNAV", "calculateAssetNAV"],
    datasetReferencePolicy: "none-at-runtime",
  },
  {
    id: "nav.goalie",
    name: "G-NAV",
    family: "nav",
    lifecycle: "PRODUCTION",
    recordKind: "production-analytic",
    exposure: "public",
    implementation: "calcNAV.goalie-dispatch",
    implementationModule: "app/lib/xnav-engine.ts",
    executionBoundary: "calcNAV position dispatch",
    version: { kind: "explicit", value: XNAV_MODEL_VERSION, evidence: "docs/analytics/MODEL_CARD_NAV.md" },
    deterministicForFixedInputs: "fixed-inputs",
    immediateConsumers: ["calcNAV", "calculateAssetNAV"],
    datasetReferencePolicy: "none-at-runtime",
  },
  {
    id: "nav.team-aggregation",
    name: "Roster X-NAV position aggregation",
    family: "nav",
    lifecycle: "PRODUCTION",
    recordKind: "production-analytic",
    exposure: "public",
    implementation: "rosterNavByPosition",
    implementationModule: "app/lib/team-nav-split.ts",
    executionBoundary: "rosterNavByPosition display aggregation",
    version: { kind: "implicit", value: "committed implementation", evidence: "No independent model version exists." },
    deterministicForFixedInputs: "fixed-inputs",
    immediateConsumers: ["Teams roster X-NAV chart", "season snapshot rows"],
    datasetReferencePolicy: "none-at-runtime",
  },
  {
    id: "gravity.v3",
    name: "Gravity v3",
    family: "gravity",
    lifecycle: "PRODUCTION",
    recordKind: "production-analytic",
    exposure: "public",
    implementation: "computeGravity.v3",
    implementationModule: "app/lib/gravity.ts",
    executionBoundary: "gravity-channels",
    version: { kind: "explicit", value: "Gravity v3", evidence: "docs/GRAVITY_MODEL_CARD.md" },
    deterministicForFixedInputs: "fixed-inputs",
    immediateConsumers: ["player dossier", "team Gravity display", "trending display"],
    featureFlags: [
      { key: GRAVITY_V3_DISPLAY_FEATURE_FLAG, failsClosed: true, scope: "display" },
      { key: GRAVITY_V3_XNAV_FEATURE_FLAG, failsClosed: true, scope: "xnav" },
      { key: GRAVITY_V3_SIMULATION_FEATURE_FLAG, failsClosed: true, scope: "simulation" },
    ],
    datasetReferencePolicy: "none-at-runtime",
  },
  {
    id: "gravity.v4",
    name: "Gravity v4 diagnostic profile",
    family: "gravity",
    lifecycle: "DIAGNOSTIC",
    recordKind: "diagnostic-analytic",
    exposure: "diagnostic",
    implementation: "gravity-v4.runtime-artifact",
    implementationModule: "app/lib/gravity-v4/runtime-artifact.ts",
    executionBoundary: "gravity-v4 diagnostic loader",
    version: { kind: "explicit", value: "Gravity v4.0", evidence: "app/lib/gravity-v4/artifact-manifest.ts" },
    deterministicForFixedInputs: "fixed-inputs",
    immediateConsumers: ["player dossier diagnostic panel", "admin Gravity v4 route"],
    artifact: {
      kind: "bundled-fitted-artifact",
      path: "app/lib/gravity-v4/fitted-artifact.json",
      manifestModule: "app/lib/gravity-v4/artifact-manifest.ts",
      manifestExport: "GRAVITY_V4_ARTIFACT_MANIFEST",
    },
    featureFlags: [{ key: "GRAVITY_V4_ENABLED", failsClosed: true, scope: "diagnostic" }],
    datasetReferencePolicy: "none-at-runtime",
  },
  {
    id: "simulation.season",
    name: "Armchair GM season simulation",
    family: "simulation",
    lifecycle: "PRODUCTION",
    recordKind: "production-analytic",
    exposure: "internal",
    implementation: "simulateLeague",
    implementationModule: "app/api/simulate/route.ts",
    executionBoundary: "POST /api/simulate",
    version: { kind: "implicit", value: "committed implementation", evidence: "No independent simulation version exists." },
    deterministicForFixedInputs: "seeded",
    immediateConsumers: ["Armchair GM", "Cup Run"],
    featureFlags: [{ key: GRAVITY_V3_SIMULATION_FEATURE_FLAG, failsClosed: true, scope: "simulation" }],
    datasetReferencePolicy: "none-at-runtime",
  },
  {
    id: "nav01.phase5-calibration",
    name: "NAV-01 Phase 5 calibration",
    family: "nav",
    lifecycle: "RESEARCH",
    recordKind: "research-candidate",
    exposure: "internal",
    implementation: "nav01.phase5-research-evidence",
    implementationModule: "docs/analytics/NAV01_PHASE5_REMEDIATION.md",
    executionBoundary: "research-only no runtime boundary",
    version: { kind: "implicit", value: "failed Phase 5 research evidence", evidence: "docs/analytics/NAV01_PHASE5_REMEDIATION.md" },
    deterministicForFixedInputs: "fixed-inputs",
    immediateConsumers: [],
    datasetReferencePolicy: "candidate-requires-complete-snapshot-batch",
  },
];

export class ProductionAnalyticResolutionError extends Error {
  constructor(id: string, reason: "unknown" | "not-production") {
    super(reason === "unknown"
      ? `Unknown analytic ID: ${id}`
      : `Analytic ${id} is not a production analytic.`);
    this.name = "ProductionAnalyticResolutionError";
  }
}

/** Return a known record without treating registration as production approval. */
export function getAnalyticDefinition(id: string): AnalyticDefinition {
  const analytic = ANALYTIC_CATALOG.find(candidate => candidate.id === id);
  if (!analytic) throw new ProductionAnalyticResolutionError(id, "unknown");
  return analytic;
}

/**
 * The only resolver this catalog offers for a production identity. It returns
 * metadata only; the canonical implementation remains selected in code.
 */
export function getProductionAnalytic(id: string): ProductionAnalyticDefinition {
  const analytic = getAnalyticDefinition(id);
  if (analytic.lifecycle !== "PRODUCTION" || analytic.recordKind !== "production-analytic") {
    throw new ProductionAnalyticResolutionError(id, "not-production");
  }
  return analytic as ProductionAnalyticDefinition;
}

export function listProductionAnalytics(): readonly ProductionAnalyticDefinition[] {
  return ANALYTIC_CATALOG.filter((analytic): analytic is ProductionAnalyticDefinition =>
    analytic.lifecycle === "PRODUCTION" && analytic.recordKind === "production-analytic",
  );
}
