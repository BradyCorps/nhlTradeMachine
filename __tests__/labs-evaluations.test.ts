import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/app/db/schema";
import { SEASON_SNAPSHOT_TABLE_STATEMENTS } from "@/app/db/ensure-schema";
import {
  LabsEvaluationIntegrityError,
  fingerprintEvaluationProtocol,
  getEvaluationRun,
  isEvaluationProductionResolvable,
  listEvaluationProtocols,
  listEvaluationRuns,
  type EvaluationProtocol,
} from "@/app/lib/labs-evaluations";
import { getProductionAnalytic } from "@/app/lib/production-analytics";

const BATCH_ID = "snapshot:2025-26:2026-09-13:X-NAV-4.2:5af40ed576d53014";
const DIGEST = "5af40ed576d53014d16f1048a1977a84f865a5019631ea19615e5cf2b44e0b39";
const COMMIT = "e232d9684f43d8ed21e384ca3f812c7db2261618";
const MIGRATIONS = ["0009_add_labs_candidate_foundation.sql", "0010_add_labs_evaluation_evidence.sql"].flatMap(file =>
  readFileSync(join(process.cwd(), "drizzle", file), "utf8").split("--> statement-breakpoint").map(statement => statement.trim()).filter(Boolean),
);

async function fixtureDb() {
  const client = createClient({ url: `file:/tmp/labs-evaluations-${crypto.randomUUID()}.db` });
  const db = drizzle(client, { schema });
  for (const statement of SEASON_SNAPSHOT_TABLE_STATEMENTS) await db.run(sql.raw(statement));
  for (const statement of MIGRATIONS) await db.run(sql.raw(statement));
  await db.insert(schema.seasonSnapshotBatches).values({
    id: BATCH_ID, season: "2025-26", snapshotKind: "completed", asOf: "2026-09-13", coverage: "completed-season",
    statsSeason: "2025-26", contractSeason: "2026-27", modelVersion: "X-NAV 4.2", status: "COMPLETE",
    expectedPlayers: 1417, capturedPlayers: 1417, expectedTeams: 32, capturedTeams: 32, skippedPlayers: 0,
    source: "isolated-test", population: "isolated-test", integrityHash: DIGEST, createdBy: "test", createdAction: "test",
    createdAt: 1, completedAt: 1, failureReason: null,
  });
  return db;
}

const metricDefinitions = [{
  id: "metric.mae-delta", name: "MAE improvement", unit: "cap-share-pp", requiredCohorts: ["defense", "forward", "goalie", "overall"],
  definition: "Baseline MAE minus candidate MAE; positive is better.", metadataSchemaVersion: 1,
}] as const;
const gateDefinitions = [
  { id: "gate.overall-improvement", metricId: "metric.mae-delta", cohortId: "overall", operator: "GTE", thresholdValue: 0.1, unit: "cap-share-pp", required: true, description: "Overall improvement must meet the frozen floor.", metadataSchemaVersion: 1 },
  { id: "gate.forward", metricId: "metric.mae-delta", cohortId: "forward", operator: "GT", thresholdValue: 0, unit: "cap-share-pp", required: true, description: "Forward result retained separately.", metadataSchemaVersion: 1 },
  { id: "gate.defense", metricId: "metric.mae-delta", cohortId: "defense", operator: "GTE", thresholdValue: 0, unit: "cap-share-pp", required: true, description: "Defense result retained separately.", metadataSchemaVersion: 1 },
  { id: "gate.goalie", metricId: "metric.mae-delta", cohortId: "goalie", operator: "GT", thresholdValue: 0, unit: "cap-share-pp", required: true, description: "Goalie result retained separately.", metadataSchemaVersion: 1 },
] as const;

function protocolFixture(): EvaluationProtocol {
  const base = {
    id: "protocol.nav-market.v1", targetAnalyticId: "nav.defense", name: "Market calibration evaluation", version: "v1",
    purpose: "Isolated frozen evidence fixture", populationDefinition: "Eligible negotiated contracts", exclusions: "No post-signing features",
    trainDefinition: "Prior seasons", validationDefinition: "Frozen validation cohort", holdoutDefinition: "Independent holdout cohort",
    randomSeedPolicy: "Fixed seed recorded per run", leakageControls: "No outcome or post-signing inputs", minimumCoverage: "F, D, G and overall cohorts",
    schemaVersion: 1, createdAt: 10, createdBy: "test", createdSource: "isolated-test",
    metrics: metricDefinitions, gates: gateDefinitions,
  } as const;
  return { ...base, fingerprint: fingerprintEvaluationProtocol(base) };
}

async function seedCompleteRun(db: Awaited<ReturnType<typeof fixtureDb>>) {
  const candidate = {
    id: "candidate.nav-defense.evaluation.v1", targetAnalyticId: "nav.defense", name: "Evaluation fixture candidate", revision: "evaluation-v1",
    implementationIdentity: "research.evaluation-fixture", baseAnalyticVersion: "X-NAV 4.2", baseImplementationIdentity: "calcNAV.defense-dispatch",
    exposure: "research" as const, datasetBatchId: BATCH_ID, description: null, hypothesis: null, schemaVersion: 1,
    createdAt: 10, createdBy: "test", createdSource: "isolated-test",
  };
  await db.insert(schema.labsCandidates).values(candidate);
  await db.insert(schema.labsCandidateLifecycleEvents).values([
    { id: "event.evaluation.draft", candidateId: candidate.id, sequence: 1, eventType: "DRAFT_CREATED", previousStatus: null, resultingStatus: "DRAFT", occurredAt: 10, actor: "test", source: "isolated-test", note: null, evidenceReference: null, metadataSchemaVersion: 1 },
    { id: "event.evaluation.registered", candidateId: candidate.id, sequence: 2, eventType: "REGISTERED", previousStatus: "DRAFT", resultingStatus: "REGISTERED", occurredAt: 11, actor: "test", source: "isolated-test", note: null, evidenceReference: null, metadataSchemaVersion: 1 },
  ]);
  await db.insert(schema.labsArtifacts).values({
    id: "artifact.evaluation.report.v1", kind: "report", contentDigest: DIGEST, implementationIdentity: candidate.implementationIdentity,
    mediaType: "application/json", artifactSchemaVersion: "report-v1", repositoryCommit: COMMIT, repositoryPath: "docs/analytics/fixture.json",
    immutableReference: null, byteSize: 1, metadataSchemaVersion: 1, createdAt: 10, createdBy: "test", createdSource: "isolated-test",
  });
  const protocol = protocolFixture();
  await db.insert(schema.labsEvaluationProtocols).values({ ...protocol, fingerprint: protocol.fingerprint });
  await db.insert(schema.labsEvaluationProtocolMetrics).values(protocol.metrics.map(metric => ({
    protocolId: protocol.id, metricId: metric.id, name: metric.name, unit: metric.unit,
    requiredCohorts: JSON.stringify([...metric.requiredCohorts].sort()), definition: metric.definition, metadataSchemaVersion: metric.metadataSchemaVersion,
  })));
  await db.insert(schema.labsEvaluationProtocolGates).values(protocol.gates.map(gate => ({
    protocolId: protocol.id, gateId: gate.id, metricId: gate.metricId, cohortId: gate.cohortId, operator: gate.operator,
    thresholdValue: gate.thresholdValue, unit: gate.unit, required: gate.required ? 1 : 0, description: gate.description, metadataSchemaVersion: gate.metadataSchemaVersion,
  })));
  await db.insert(schema.labsEvaluationRuns).values({
    id: "run.nav-market.fixture.v1", candidateId: candidate.id, candidateRevision: candidate.revision, candidateLifecycleStatus: "REGISTERED", protocolId: protocol.id,
    protocolFingerprint: protocol.fingerprint, datasetBatchId: BATCH_ID, baselineAnalyticId: "nav.defense", baselineVersion: "X-NAV 4.2",
    baselineImplementation: "calcNAV.defense-dispatch", implementationCommit: COMMIT, deterministicSeed: "42", environmentMetadata: "isolated fixture",
    status: "COMPLETED", startedAt: 12, completedAt: 13, resultSetFingerprint: DIGEST, failureReason: null, invalidationReason: null,
    schemaVersion: 1, createdAt: 12, createdBy: "test", createdSource: "isolated-test",
  });
  await db.insert(schema.labsEvaluationRunArtifacts).values({ runId: "run.nav-market.fixture.v1", artifactId: "artifact.evaluation.report.v1", contentDigest: DIGEST, role: "evidence", attachedAt: 13, attachedBy: "test" });
  const observations = [["overall", 0.0334], ["forward", 0.0551], ["defense", -0.2356], ["goalie", 0.7093]] as const;
  await db.insert(schema.labsEvaluationMetricObservations).values(observations.map(([cohortId, observedValue]) => ({
    id: `observation.${cohortId}`, runId: "run.nav-market.fixture.v1", metricId: "metric.mae-delta", cohortId, observedValue,
    unit: "cap-share-pp", sampleSize: 10, uncertaintyLower: observedValue - 0.1, uncertaintyUpper: observedValue + 0.1,
    calculationIdentity: "fixture-v1", evidenceArtifactId: "artifact.evaluation.report.v1", metadataSchemaVersion: 1,
  })));
  await db.insert(schema.labsEvaluationGateResults).values([
    { id: "outcome.overall", runId: "run.nav-market.fixture.v1", gateId: "gate.overall-improvement", observedValue: 0.0334, evidenceArtifactId: "artifact.evaluation.report.v1", result: "FAIL", reason: "Below frozen floor", evaluatorIdentity: "fixture-v1", metadataSchemaVersion: 1 },
    { id: "outcome.forward", runId: "run.nav-market.fixture.v1", gateId: "gate.forward", observedValue: 0.0551, evidenceArtifactId: "artifact.evaluation.report.v1", result: "PASS", reason: "Positive", evaluatorIdentity: "fixture-v1", metadataSchemaVersion: 1 },
    { id: "outcome.defense", runId: "run.nav-market.fixture.v1", gateId: "gate.defense", observedValue: -0.2356, evidenceArtifactId: "artifact.evaluation.report.v1", result: "FAIL", reason: "Regression retained", evaluatorIdentity: "fixture-v1", metadataSchemaVersion: 1 },
    { id: "outcome.goalie", runId: "run.nav-market.fixture.v1", gateId: "gate.goalie", observedValue: 0.7093, evidenceArtifactId: "artifact.evaluation.report.v1", result: "PASS", reason: "Positive", evaluatorIdentity: "fixture-v1", metadataSchemaVersion: 1 },
  ]);
  return { candidate, protocol };
}

describe("Phase 4 Analytics Labs evaluation evidence", () => {
  let db: Awaited<ReturnType<typeof fixtureDb>>;
  beforeEach(async () => { db = await fixtureDb(); });

  it("reads frozen mixed NAV-01-shaped evidence without turning positive subgroups into an overall pass", async () => {
    await seedCompleteRun(db);
    const run = await getEvaluationRun(db, "run.nav-market.fixture.v1");
    expect(run.status).toBe("COMPLETED");
    expect(run.gateOutcomes.find(outcome => outcome.gateId === "gate.overall-improvement")?.result).toBe("FAIL");
    expect(run.gateOutcomes.find(outcome => outcome.gateId === "gate.forward")?.result).toBe("PASS");
    expect(run.gateOutcomes.find(outcome => outcome.gateId === "gate.defense")?.result).toBe("FAIL");
    expect(run.gateOutcomes.find(outcome => outcome.gateId === "gate.goalie")?.result).toBe("PASS");
    expect(run.dataset.status).toBe("COMPLETE");
    expect(run.candidate.lifecycleStatus).toBe("REGISTERED");
    expect(run.baseline).toBe(getProductionAnalytic("nav.defense"));
    expect(isEvaluationProductionResolvable(run)).toBe(false);
    expect(Object.isFrozen(run)).toBe(true);
    expect(Object.isFrozen(run.gateOutcomes)).toBe(true);
  });

  it("fails closed for rewritten protocol fingerprints, missing cohorts, threshold contradictions, and non-production evidence", async () => {
    const { protocol } = await seedCompleteRun(db);
    await expect(db.run(sql.raw("UPDATE labs_evaluation_protocols SET name = 'rewritten'"))).rejects.toThrow();
    await expect(db.run(sql.raw("UPDATE labs_evaluation_metric_observations SET observed_value = 10"))).rejects.toThrow();
    await expect(db.run(sql.raw("DELETE FROM labs_evaluation_gate_results"))).rejects.toThrow();
    await expect(db.run(sql.raw("UPDATE labs_evaluation_runs SET baseline_analytic_id = 'gravity.v4'"))).rejects.toThrow();
    expect(() => getProductionAnalytic("gravity.v4")).toThrow(/not a production analytic/);
    expect(() => fingerprintEvaluationProtocol({ ...protocol, gates: [...protocol.gates, { ...protocol.gates[0]!, id: "gate.changed", thresholdValue: 0.2 }] })).not.toBe(protocol.fingerprint);
  });

  it("keeps an honest empty protocol/run inventory distinct from malformed evidence", async () => {
    await expect(listEvaluationProtocols(db)).resolves.toEqual([]);
    await expect(listEvaluationRuns(db)).resolves.toEqual([]);
    await db.run(sql.raw("PRAGMA ignore_check_constraints = ON"));
    await db.insert(schema.labsEvaluationProtocols).values({
      id: "protocol.bad.v1", targetAnalyticId: "nav.defense", name: "bad", version: "v1", purpose: "bad", populationDefinition: "bad", exclusions: "bad",
      trainDefinition: "bad", validationDefinition: "bad", holdoutDefinition: "bad", randomSeedPolicy: "bad", leakageControls: "bad", minimumCoverage: "bad",
      fingerprint: DIGEST, schemaVersion: 99, createdAt: 1, createdBy: "test", createdSource: "test",
    });
    await db.run(sql.raw("PRAGMA ignore_check_constraints = OFF"));
    await expect(listEvaluationProtocols(db)).rejects.toBeInstanceOf(LabsEvaluationIntegrityError);
  });

  it("has no Phase 4 mutation route, candidate execution import, or production dispatch boundary", () => {
    const source = readFileSync(join(process.cwd(), "app/lib/labs-evaluations.ts"), "utf8");
    expect(existsSync(join(process.cwd(), "app/api/admin/labs"))).toBe(false);
    expect(source).not.toMatch(/calculateAssetNAV|calcNAV|simulateLeague|import\(|require\(|INSERT\s+INTO|UPDATE\s+labs_evaluation|DELETE\s+FROM/);
  });
});
