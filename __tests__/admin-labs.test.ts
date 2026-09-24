import React from "react";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import LabsOverview from "@/app/admin/labs/LabsOverview";
import type { LabCandidate } from "@/app/lib/labs-candidates";
import type { EvaluationProtocol, LabEvaluationRun } from "@/app/lib/labs-evaluations";
import { ANALYTIC_CATALOG } from "@/app/lib/production-analytics";
import type { SeasonSnapshotBatch } from "@/app/lib/season-snapshot";

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

const verifiedBatch: SeasonSnapshotBatch = {
  id: "snapshot:2025-26:2026-09-13:X-NAV 4.2:5af40ed576d53014",
  season: "2025-26",
  snapshotKind: "completed",
  asOf: "2026-09-13",
  coverage: "completed-season",
  statsSeason: "2025-26",
  contractSeason: "2026-27",
  modelVersion: "X-NAV 4.2",
  status: "COMPLETE",
  expectedPlayers: 1417,
  capturedPlayers: 1417,
  expectedTeams: 32,
  capturedTeams: 32,
  skippedPlayers: 0,
  source: "fixture source",
  population: "fixture population",
  integrityHash: "5af40ed576d53014d16f1048a1977a84f865a5019631ea19615e5cf2b44e0b39",
  createdBy: "fixture",
  createdAction: "fixture",
  createdAt: 1789264480075,
  completedAt: 1789264480075,
  failureReason: null,
};

const candidateFixture: LabCandidate = {
  id: "candidate.nav-defense.role-aware.v1",
  targetAnalytic: ANALYTIC_CATALOG.find(analytic => analytic.id === "nav.defense")!,
  name: "Role-aware D-NAV research candidate",
  revision: "role-aware-v1",
  implementationIdentity: "research.role-aware-defense-nav",
  baseAnalyticVersion: "X-NAV 4.2",
  baseImplementationIdentity: "calcNAV.defense-dispatch",
  exposure: "research",
  dataset: verifiedBatch,
  description: "Fixture candidate",
  hypothesis: "Future evaluation only.",
  metadataSchemaVersion: 1,
  createdAt: 1789264480075,
  createdBy: "fixture",
  createdSource: "isolated-test",
  artifacts: [{
    artifact: {
      id: "artifact.role-aware-defense-nav.v1",
      kind: "configuration",
      contentDigest: verifiedBatch.integrityHash,
      implementationIdentity: "research.role-aware-defense-nav",
      mediaType: "application/json",
      artifactSchemaVersion: "fixture-v1",
      repositoryCommit: "65fb36a540a766be47cad63823cc977cadce1a54",
      repositoryPath: "docs/analytics/example.json",
      immutableReference: null,
      byteSize: 128,
      metadataSchemaVersion: 1,
      createdAt: 1789264480075,
      createdBy: "fixture",
      createdSource: "isolated-test",
    },
    role: "configuration",
    attachedAt: 1789264480075,
    attachedBy: "fixture",
  }],
  lifecycleHistory: [{
    id: "event.role-aware-defense-nav.draft",
    candidateId: "candidate.nav-defense.role-aware.v1",
    sequence: 1,
    eventType: "DRAFT_CREATED",
    previousStatus: null,
    resultingStatus: "DRAFT",
    occurredAt: 1789264480075,
    actor: "fixture",
    source: "isolated-test",
    note: null,
    evidenceReference: null,
    metadataSchemaVersion: 1,
  }],
  lifecycleStatus: "DRAFT",
  productionResolvable: false,
};

const protocolFixture: EvaluationProtocol = {
  id: "protocol.nav-defense.fixture.v1",
  targetAnalyticId: "nav.defense",
  name: "Frozen D-NAV evidence protocol",
  version: "v1",
  purpose: "Fixture only",
  populationDefinition: "Fixture population",
  exclusions: "Fixture exclusions",
  trainDefinition: "Fixture train",
  validationDefinition: "Fixture validation",
  holdoutDefinition: "Fixture holdout",
  randomSeedPolicy: "Fixed fixture seed",
  leakageControls: "No fixture leakage",
  minimumCoverage: "Overall and position cohorts",
  fingerprint: verifiedBatch.integrityHash,
  schemaVersion: 1,
  createdAt: verifiedBatch.createdAt,
  createdBy: "fixture",
  createdSource: "isolated-test",
  metrics: [{ id: "metric.fixture", name: "Fixture metric", unit: "cap-share-pp", requiredCohorts: ["overall"], definition: "Fixture definition", metadataSchemaVersion: 1 }],
  gates: [{ id: "gate.fixture", metricId: "metric.fixture", cohortId: "overall", operator: "GTE", thresholdValue: 0.1, unit: "cap-share-pp", required: true, description: "Fixture gate", metadataSchemaVersion: 1 }],
};

const runFixture: LabEvaluationRun = {
  id: "run.nav-defense.fixture.v1",
  candidate: { ...candidateFixture, lifecycleStatus: "REGISTERED" },
  candidateLifecycleStatusAtRegistration: "REGISTERED",
  protocol: protocolFixture,
  dataset: verifiedBatch,
  baseline: ANALYTIC_CATALOG.find(analytic => analytic.id === "nav.defense")! as LabEvaluationRun["baseline"],
  implementationCommit: "e232d9684f43d8ed21e384ca3f812c7db2261618",
  deterministicSeed: "42",
  environmentMetadata: "fixture",
  status: "COMPLETED",
  startedAt: verifiedBatch.createdAt,
  completedAt: verifiedBatch.createdAt,
  resultSetFingerprint: verifiedBatch.integrityHash,
  failureReason: null,
  invalidationReason: null,
  metadataSchemaVersion: 1,
  createdAt: verifiedBatch.createdAt,
  createdBy: "fixture",
  createdSource: "isolated-test",
  artifacts: [],
  observations: [{ id: "observation.fixture", metricId: "metric.fixture", cohortId: "overall", observedValue: 0.0334, unit: "cap-share-pp", sampleSize: 10, uncertaintyLower: -0.0701, uncertaintyUpper: 0.1546, calculationIdentity: "fixture", evidenceArtifactId: null, metadataSchemaVersion: 1 }],
  gateOutcomes: [{ id: "outcome.fixture", gateId: "gate.fixture", observedValue: 1, evidenceArtifactId: null, result: "FAIL", reason: "Fixture failure", evaluatorIdentity: "fixture", metadataSchemaVersion: 1 }],
  productionResolvable: false,
};

describe("Phase 2 Analytics Labs Admin overview", () => {
  it("renders production metadata, verified provenance, and explicit legacy warning without mutation controls", () => {
    const html = renderToStaticMarkup(React.createElement(LabsOverview, {
      analytics: ANALYTIC_CATALOG,
      verifiedBatches: [verifiedBatch],
      legacyInventory: { players: 1428, teams: 33 },
      snapshotState: "available",
      candidates: [],
      candidateState: "available",
      protocols: [],
      runs: [],
      evaluationState: "available",
    }));

    expect(html).toContain("ANALYTICS LABS");
    expect(html).toContain("calculateAssetNAV → calcNAV");
    expect(html).toContain("nav.asset");
    expect(html).toContain("gravity.v4");
    expect(html).toContain("nav01.phase5-calibration");
    expect(html).toContain("Not Labs-eligible");
    expect(html).toContain("1,417 / 1,417 players");
    expect(html).toContain("32 / 32 teams");
    expect(html).toContain("5af40ed576d53014…");
    expect(html).toContain(`Full SHA-256 integrity fingerprint ${verifiedBatch.integrityHash}`);
    expect(html).toContain("No candidates are registered. Registration will not imply validation or promotion.");
    expect(html).toContain("No evaluation protocols are registered. This page cannot create or revise one.");
    expect(html).toContain("No evaluation runs are recorded. This page cannot run or rerun a candidate.");
    expect(html).not.toContain("<button");
    expect(html).not.toContain("player_season_snapshots");
  });

  it("renders an explicit empty verified-dataset state and preserves long identifiers accessibly", () => {
    const html = renderToStaticMarkup(React.createElement(LabsOverview, {
      analytics: ANALYTIC_CATALOG,
      verifiedBatches: [],
      legacyInventory: { players: 0, teams: 0 },
      snapshotState: "unavailable",
      candidates: [],
      candidateState: "unavailable",
      protocols: [],
      runs: [],
      evaluationState: "unavailable",
    }));

    expect(html).toContain("No verified COMPLETE snapshot batch is currently available.");
    expect(html).toContain("Inventory unavailable");
    expect(html).toContain("Candidate inventory unavailable. No candidate is treated as production-ready.");
    expect(html).toContain("Evaluation evidence inventory unavailable. No missing record is treated as a pass.");
    expect(read("app/globals.css")).toMatch(/\.admin-labs-safe-text\s*\{[\s\S]*?overflow-wrap:\s*anywhere/);
    expect(read("app/globals.css")).toMatch(/\.admin-labs-id\s*,[\s\S]*?word-break:\s*break-word/);
  });

  it("renders registered candidate provenance and lifecycle history without candidate controls", () => {
    const html = renderToStaticMarkup(React.createElement(LabsOverview, {
      analytics: ANALYTIC_CATALOG,
      verifiedBatches: [verifiedBatch],
      legacyInventory: { players: 1428, teams: 33 },
      snapshotState: "available",
      candidates: [candidateFixture],
      candidateState: "available",
      protocols: [],
      runs: [],
      evaluationState: "available",
    }));

    expect(html).toContain("Role-aware D-NAV research candidate");
    expect(html).toContain("candidate.nav-defense.role-aware.v1");
    expect(html).toContain("DRAFT · research");
    expect(html).toContain(verifiedBatch.id);
    expect(html).toContain("artifact.role-aware-defense-nav.v1");
    expect(html).toContain("1 append-only event · latest DRAFT_CREATED");
    expect(html).not.toContain("Create Candidate");
    expect(html).not.toContain("<button");
  });

  it("renders read-only frozen protocol and run evidence without mutation controls", () => {
    const html = renderToStaticMarkup(React.createElement(LabsOverview, {
      analytics: ANALYTIC_CATALOG, verifiedBatches: [verifiedBatch], legacyInventory: { players: 1428, teams: 33 }, snapshotState: "available",
      candidates: [candidateFixture], candidateState: "available", protocols: [protocolFixture], runs: [runFixture], evaluationState: "available",
    }));
    expect(html).toContain("EVALUATION PROTOCOLS");
    expect(html).toContain("Frozen D-NAV evidence protocol");
    expect(html).toContain("run.nav-defense.fixture.v1");
    expect(html).toContain("1 metrics · 1 gates (0 pass · 1 fail · 0 inconclusive)");
    expect(html).toContain("metric.fixture");
    expect(html).toContain("overall · 0.0334 cap-share-pp");
    expect(html).toContain("gate.fixture");
    expect(html).toContain("· FAIL");
    expect(html).not.toMatch(/Create Candidate|Run Candidate|Promote Candidate|Approve Candidate|Delete Candidate/);
    expect(html).not.toContain("<button");
  });

  it("uses server-side inventory and the COMPLETE guard without adding a Labs mutation endpoint", () => {
    const page = read("app/admin/labs/page.tsx");
    const navigation = read("app/admin/layout.tsx");

    expect(page).toContain('seasonSnapshotBatchInventory(db)');
    expect(page).toContain('seasonSnapshotInventory(db, { unbatchedOnly: true })');
    expect(page).toContain('requireCompleteSeasonSnapshotBatch(db, batch.id)');
    expect(page).not.toMatch(/fetch\(|ensureSeasonSnapshotTables|POST|PUT|PATCH|DELETE/);
    expect(navigation).toContain('{ href: "/admin/labs",          label: "ANALYTICS LABS" }');
    expect(existsSync(join(process.cwd(), "app/api/admin/labs"))).toBe(false);
    expect(read("scripts/admin-labs-accessibility.mjs")).toContain("MOB_ADMIN_SESSION_COOKIE is required");
    expect(read("scripts/admin-labs-accessibility.mjs")).toContain("wcag2aa");
    expect(read("scripts/admin-labs-accessibility.mjs")).toContain("smallTargets");
  });
});
