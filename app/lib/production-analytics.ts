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
export type AnalyticCalculationRole =
  | "asset-valuation"
  | "position-valuation"
  | "display-aggregation"
  | "descriptive-model"
  | "season-simulation"
  | "research-evidence";

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
  | typeof GRAVITY_V3_SIMULATION_FEATURE_FLAG;

export interface AnalyticSourceReference {
  module: string;
  exportName?: string;
  detail?: string;
}

export interface AnalyticVersionIdentity {
  /** Explicit means repository evidence names a version; implicit means it does not. */
  kind: AnalyticVersionKind;
  value: string;
  source: AnalyticSourceReference;
}

export interface AnalyticArtifactIdentity {
  kind: "bundled-fitted-artifact";
  path: string;
  /** The manifest remains the authoritative checksum/schema source. */
  manifestModule: "app/lib/gravity-v4/artifact-manifest.ts";
  manifestExport: "GRAVITY_V4_ARTIFACT_MANIFEST";
}

export interface AnalyticFeatureFlagMetadata {
  /** Present only when importing the exported key does not widen a runtime boundary. */
  key?: AnalyticFeatureFlag;
  source: AnalyticSourceReference;
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
  calculationRole: AnalyticCalculationRole;
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

export type ProductionPlayerValuationAnalytic = ProductionAnalyticDefinition & {
  calculationRole: "asset-valuation" | "position-valuation";
};

/**
 * The sole typed source of truth for known production, diagnostic, and failed
 * research identities. It describes selection that remains in committed code;
 * it must not be used to dispatch a candidate implementation at runtime.
 */
const ANALYTIC_CATALOG_DEFINITIONS: readonly AnalyticDefinition[] = [
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
    calculationRole: "asset-valuation",
    version: { kind: "explicit", value: XNAV_MODEL_VERSION, source: { module: "app/lib/data-context.ts", exportName: "XNAV_MODEL_VERSION" } },
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
    calculationRole: "position-valuation",
    version: { kind: "explicit", value: XNAV_MODEL_VERSION, source: { module: "app/lib/data-context.ts", exportName: "XNAV_MODEL_VERSION" } },
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
    calculationRole: "position-valuation",
    version: { kind: "explicit", value: XNAV_MODEL_VERSION, source: { module: "app/lib/data-context.ts", exportName: "XNAV_MODEL_VERSION" } },
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
    calculationRole: "position-valuation",
    version: { kind: "explicit", value: XNAV_MODEL_VERSION, source: { module: "app/lib/data-context.ts", exportName: "XNAV_MODEL_VERSION" } },
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
    calculationRole: "display-aggregation",
    version: { kind: "implicit", value: "committed implementation", source: { module: "app/lib/team-nav-split.ts", detail: "No independent model version exists." } },
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
    calculationRole: "descriptive-model",
    version: { kind: "explicit", value: "Gravity v3", source: { module: "docs/GRAVITY_MODEL_CARD.md", detail: "Model-card title is the authoritative named version." } },
    deterministicForFixedInputs: "fixed-inputs",
    immediateConsumers: ["player dossier", "team Gravity display", "trending display"],
    featureFlags: [
      { key: GRAVITY_V3_DISPLAY_FEATURE_FLAG, source: { module: "app/lib/gravity-feature-flags.ts", exportName: "GRAVITY_V3_DISPLAY_FEATURE_FLAG" }, failsClosed: true, scope: "display" },
      { key: GRAVITY_V3_XNAV_FEATURE_FLAG, source: { module: "app/lib/gravity-feature-flags.ts", exportName: "GRAVITY_V3_XNAV_FEATURE_FLAG" }, failsClosed: true, scope: "xnav" },
      { key: GRAVITY_V3_SIMULATION_FEATURE_FLAG, source: { module: "app/lib/gravity-feature-flags.ts", exportName: "GRAVITY_V3_SIMULATION_FEATURE_FLAG" }, failsClosed: true, scope: "simulation" },
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
    calculationRole: "descriptive-model",
    version: { kind: "implicit", value: "artifact-backed diagnostic implementation", source: { module: "app/lib/gravity-v4/artifact-manifest.ts", exportName: "GRAVITY_V4_ARTIFACT_MANIFEST", detail: "No separate exported v4 semantic-version constant exists." } },
    deterministicForFixedInputs: "fixed-inputs",
    immediateConsumers: ["player dossier diagnostic panel", "admin Gravity v4 route"],
    artifact: {
      kind: "bundled-fitted-artifact",
      path: "app/lib/gravity-v4/fitted-artifact.json",
      manifestModule: "app/lib/gravity-v4/artifact-manifest.ts",
      manifestExport: "GRAVITY_V4_ARTIFACT_MANIFEST",
    },
    // Keep this a reference rather than importing the v4 feature module: the
    // v4 isolation contract permits runtime imports only in diagnostic paths.
    featureFlags: [{ source: { module: "app/lib/gravity-v4/feature-flag.ts", exportName: "GRAVITY_V4_FEATURE_FLAG" }, failsClosed: true, scope: "diagnostic" }],
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
    calculationRole: "season-simulation",
    version: { kind: "implicit", value: "committed implementation", source: { module: "app/api/simulate/route.ts", detail: "No independent simulation version exists." } },
    deterministicForFixedInputs: "seeded",
    immediateConsumers: ["Armchair GM", "Cup Run"],
    featureFlags: [{ key: GRAVITY_V3_SIMULATION_FEATURE_FLAG, source: { module: "app/lib/gravity-feature-flags.ts", exportName: "GRAVITY_V3_SIMULATION_FEATURE_FLAG" }, failsClosed: true, scope: "simulation" }],
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
    calculationRole: "research-evidence",
    version: { kind: "implicit", value: "failed Phase 5 research evidence", source: { module: "docs/analytics/NAV01_PHASE5_REMEDIATION.md", detail: "Development-only spent evidence; no implementation version is authoritative." } },
    deterministicForFixedInputs: "fixed-inputs",
    immediateConsumers: [],
    datasetReferencePolicy: "candidate-requires-complete-snapshot-batch",
  },
];

function freezeAnalyticDefinition(analytic: AnalyticDefinition): AnalyticDefinition {
  return Object.freeze({
    ...analytic,
    version: Object.freeze({ ...analytic.version, source: Object.freeze({ ...analytic.version.source }) }),
    immediateConsumers: Object.freeze([...analytic.immediateConsumers]),
    artifact: analytic.artifact === undefined ? undefined : Object.freeze({ ...analytic.artifact }),
    featureFlags: analytic.featureFlags === undefined
      ? undefined
      : Object.freeze(analytic.featureFlags.map(flag => Object.freeze({
        ...flag,
        source: Object.freeze({ ...flag.source }),
      }))),
  });
}

/** Runtime immutability prevents a consumer from altering metadata after import. */
export const ANALYTIC_CATALOG: readonly AnalyticDefinition[] = Object.freeze(
  ANALYTIC_CATALOG_DEFINITIONS.map(freezeAnalyticDefinition),
);

export class ProductionAnalyticCatalogError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionAnalyticCatalogError";
  }
}

/** Validate catalog structure without selecting or executing any implementation. */
export function validateAnalyticCatalog(catalog: readonly AnalyticDefinition[]): void {
  const ids = new Set<string>();
  for (const analytic of catalog) {
    if (ids.has(analytic.id)) throw new ProductionAnalyticCatalogError(`Duplicate analytic ID: ${analytic.id}`);
    ids.add(analytic.id);
    const isProduction = analytic.lifecycle === "PRODUCTION";
    if (isProduction !== (analytic.recordKind === "production-analytic")) {
      throw new ProductionAnalyticCatalogError(`Lifecycle and record kind disagree for ${analytic.id}`);
    }
  }
}

validateAnalyticCatalog(ANALYTIC_CATALOG);

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

/** Metadata-only guard for callers that require a player/asset valuation identity. */
export function getProductionPlayerValuationAnalytic(id: string): ProductionPlayerValuationAnalytic {
  const analytic = getProductionAnalytic(id);
  if (analytic.calculationRole !== "asset-valuation" && analytic.calculationRole !== "position-valuation") {
    throw new ProductionAnalyticResolutionError(id, "not-production");
  }
  return analytic as ProductionPlayerValuationAnalytic;
}
