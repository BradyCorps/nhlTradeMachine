import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq, sql } from "drizzle-orm";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/app/db/schema";
import { SEASON_SNAPSHOT_TABLE_STATEMENTS } from "@/app/db/ensure-schema";
import { getProductionAnalytic } from "@/app/lib/production-analytics";
import {
  LabsRegistrationAuthorizationError,
  LabsRegistrationConflictError,
  registerCandidateAndProtocol,
  type CandidateProtocolRegistrationInput,
} from "@/app/lib/labs-registration.server";

const BATCH_ID = "snapshot:2025-26:2026-09-13:X-NAV-4.2:5af40ed576d53014";
const BATCH_DIGEST = "5af40ed576d53014d16f1048a1977a84f865a5019631ea19615e5cf2b44e0b39";
const COMMIT = "e232d9684f43d8ed21e384ca3f812c7db2261618";
const MIGRATIONS = ["0009_add_labs_candidate_foundation.sql", "0010_add_labs_evaluation_evidence.sql"].flatMap(file =>
  readFileSync(join(process.cwd(), "drizzle", file), "utf8")
    .split("--> statement-breakpoint")
    .map(statement => statement.trim())
    .filter(Boolean),
);

async function fixtureDb() {
  const client = createClient({ url: `file:/tmp/labs-registration-${crypto.randomUUID()}.db` });
  const db = drizzle(client, { schema });
  for (const statement of SEASON_SNAPSHOT_TABLE_STATEMENTS) await db.run(sql.raw(statement));
  for (const statement of MIGRATIONS) await db.run(sql.raw(statement));
  await db.insert(schema.seasonSnapshotBatches).values({
    id: BATCH_ID, season: "2025-26", snapshotKind: "completed", asOf: "2026-09-13", coverage: "completed-season",
    statsSeason: "2025-26", contractSeason: "2026-27", modelVersion: "X-NAV 4.2", status: "COMPLETE",
    expectedPlayers: 1417, capturedPlayers: 1417, expectedTeams: 32, capturedTeams: 32, skippedPlayers: 0,
    source: "isolated-test", population: "isolated-test", integrityHash: BATCH_DIGEST, createdBy: "test", createdAction: "test",
    createdAt: 1, completedAt: 1, failureReason: null,
  });
  return db;
}

const TEST_ADMIN_KEY = "isolated-labs-registration-test-key";
const previousAdminKey = process.env.ADMIN_KEY;
const authorizedRequest = () => new Request("https://admin.example/labs", { headers: { "x-admin-key": TEST_ADMIN_KEY } });

function registration(overrides: Partial<CandidateProtocolRegistrationInput> = {}): CandidateProtocolRegistrationInput {
  const target = getProductionAnalytic("nav.defense");
  const createdAt = 1_790_000_000_000;
  return {
    actor: "labs.operator",
    source: "isolated-test",
    candidate: {
      id: "candidate.nav-defense.registration.v1",
      targetAnalyticId: target.id,
      name: "Registration-only D-NAV candidate",
      revision: "registration-v1",
      implementationIdentity: "research.registration-only-defense-nav",
      baseAnalyticVersion: target.version.value,
      baseImplementationIdentity: target.implementation,
      exposure: "research",
      datasetBatchId: BATCH_ID,
      description: "Isolated registration fixture",
      hypothesis: "Metadata registration must not execute a candidate.",
      metadataSchemaVersion: 1,
      createdAt,
    },
    artifacts: [
      {
        artifact: {
          id: "artifact.registration.implementation.v1",
          kind: "implementation",
          contentDigest: "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
          implementationIdentity: "research.registration-only-defense-nav",
          mediaType: "text/plain",
          artifactSchemaVersion: "implementation-v1",
          repositoryCommit: COMMIT,
          repositoryPath: "docs/analytics/registration-fixture.txt",
          immutableReference: null,
          byteSize: 1,
          metadataSchemaVersion: 1,
          createdAt,
          createdBy: "labs.operator",
          createdSource: "isolated-test",
        },
        role: "implementation",
        attachedAt: createdAt,
      },
      {
        artifact: {
          id: "artifact.registration.configuration.v1",
          kind: "configuration",
          contentDigest: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
          implementationIdentity: "research.registration-only-defense-nav",
          mediaType: "application/json",
          artifactSchemaVersion: "configuration-v1",
          repositoryCommit: COMMIT,
          repositoryPath: "docs/analytics/registration-fixture.json",
          immutableReference: null,
          byteSize: 2,
          metadataSchemaVersion: 1,
          createdAt,
          createdBy: "labs.operator",
          createdSource: "isolated-test",
        },
        role: "configuration",
        attachedAt: createdAt,
      },
    ],
    initialLifecycleEvent: {
      id: "event.registration.draft.v1",
      occurredAt: createdAt,
      note: "Initial registration only; no execution authorization.",
      evidenceReference: null,
    },
    protocol: {
      id: "protocol.nav-defense.registration.v1",
      targetAnalyticId: target.id,
      name: "Registration D-NAV protocol",
      version: "registration-v1",
      purpose: "Freeze a future evaluation plan without running it.",
      populationDefinition: "Canonical completed-season roster cohort.",
      exclusions: "No unverified or pseudo-team snapshot rows.",
      trainDefinition: "Historical training cohort defined before evaluation.",
      validationDefinition: "Frozen validation cohort.",
      holdoutDefinition: "Independent holdout cohort.",
      randomSeedPolicy: "Record a deterministic seed in a future run.",
      leakageControls: "No post-outcome or holdout-derived inputs.",
      minimumCoverage: "Overall, forward, defense, and goalie cohorts.",
      schemaVersion: 1,
      createdAt,
      metrics: [{
        id: "metric.registration.mae-delta",
        name: "MAE improvement",
        unit: "cap-share-pp",
        requiredCohorts: ["defense", "forward", "goalie", "overall"],
        definition: "Baseline MAE minus candidate MAE; positive is better.",
        metadataSchemaVersion: 1,
      }],
      gates: [{
        id: "gate.registration.overall",
        metricId: "metric.registration.mae-delta",
        cohortId: "overall",
        operator: "GTE",
        thresholdValue: 0.1,
        unit: "cap-share-pp",
        required: true,
        description: "Overall improvement must meet the frozen floor.",
        metadataSchemaVersion: 1,
      }],
    },
    ...overrides,
  };
}

async function counts(db: Awaited<ReturnType<typeof fixtureDb>>) {
  const [candidates, artifacts, references, events, protocols, metrics, gates, runs] = await Promise.all([
    db.select().from(schema.labsCandidates), db.select().from(schema.labsArtifacts),
    db.select().from(schema.labsCandidateArtifacts), db.select().from(schema.labsCandidateLifecycleEvents),
    db.select().from(schema.labsEvaluationProtocols), db.select().from(schema.labsEvaluationProtocolMetrics),
    db.select().from(schema.labsEvaluationProtocolGates), db.select().from(schema.labsEvaluationRuns),
  ]);
  return { candidates: candidates.length, artifacts: artifacts.length, references: references.length, events: events.length, protocols: protocols.length, metrics: metrics.length, gates: gates.length, runs: runs.length };
}

describe("Phase 5A.1 controlled Labs registration", () => {
  let db: Awaited<ReturnType<typeof fixtureDb>>;
  beforeEach(async () => {
    process.env.ADMIN_KEY = TEST_ADMIN_KEY;
    db = await fixtureDb();
  });
  afterAll(() => {
    if (previousAdminKey === undefined) delete process.env.ADMIN_KEY;
    else process.env.ADMIN_KEY = previousAdminKey;
  });

  it("authenticates, atomically freezes candidate/artifact/lifecycle/protocol metadata, and never creates a run", async () => {
    const result = await registerCandidateAndProtocol(authorizedRequest(), db, registration());
    expect(result.created).toBe(true);
    expect(result.candidate.lifecycleStatus).toBe("DRAFT");
    expect(result.candidate.productionResolvable).toBe(false);
    expect(result.protocol.fingerprint).toMatch(/^[a-f0-9]{64}$/);
    expect(result.protocol.targetAnalyticId).toBe(result.candidate.targetAnalytic.id);
    expect(await counts(db)).toEqual({ candidates: 1, artifacts: 2, references: 2, events: 1, protocols: 1, metrics: 1, gates: 1, runs: 0 });
    expect(getProductionAnalytic("nav.defense").implementation).toBe("calcNAV.defense-dispatch");
  });

  it("makes an identical authenticated retry an exact immutable no-op", async () => {
    const input = registration();
    const first = await registerCandidateAndProtocol(authorizedRequest(), db, input);
    const before = await counts(db);
    const second = await registerCandidateAndProtocol(authorizedRequest(), db, input);
    expect(first.created).toBe(true);
    expect(second).toMatchObject({ created: false, candidate: { id: first.candidate.id }, protocol: { fingerprint: first.protocol.fingerprint } });
    expect(await counts(db)).toEqual(before);
  });

  it("rejects unauthenticated requests before any write", async () => {
    await expect(registerCandidateAndProtocol(new Request("https://admin.example/labs"), db, registration()))
      .rejects.toBeInstanceOf(LabsRegistrationAuthorizationError);
    expect(await counts(db)).toEqual({ candidates: 0, artifacts: 0, references: 0, events: 0, protocols: 0, metrics: 0, gates: 0, runs: 0 });
  });

  it("rolls back every related write when a lifecycle identity conflict occurs during the transaction", async () => {
    await db.insert(schema.labsCandidates).values({
      ...registration().candidate,
      id: "candidate.seed.conflict.v1",
      revision: "seed-conflict-v1",
      schemaVersion: 1,
      createdBy: "seed",
      createdSource: "isolated-test",
    });
    await db.insert(schema.labsCandidateLifecycleEvents).values({
      id: "event.registration.draft.v1", candidateId: "candidate.seed.conflict.v1", sequence: 1,
      eventType: "DRAFT_CREATED", previousStatus: null, resultingStatus: "DRAFT", occurredAt: 1_790_000_000_000,
      actor: "seed", source: "isolated-test", note: null, evidenceReference: null, metadataSchemaVersion: 1,
    });
    const before = await counts(db);
    await expect(registerCandidateAndProtocol(authorizedRequest(), db, registration())).rejects.toThrow();
    expect(await counts(db)).toEqual(before);
  });

  it("fails closed for non-canonical targets, non-COMPLETE provenance, public exposure, and mutable artifact references", async () => {
    const displayOnly = registration({ candidate: { ...registration().candidate, targetAnalyticId: "nav.team-aggregation" } });
    await expect(registerCandidateAndProtocol(authorizedRequest(), db, displayOnly)).rejects.toThrow(/Display aggregation/);
    const legacyDataset = registration({ candidate: { ...registration().candidate, datasetBatchId: "2025-26" } });
    await expect(registerCandidateAndProtocol(authorizedRequest(), db, legacyDataset)).rejects.toThrow(/not COMPLETE/);
    const publicExposure = registration({ candidate: { ...registration().candidate, exposure: "public" as any } });
    await expect(registerCandidateAndProtocol(authorizedRequest(), db, publicExposure)).rejects.toThrow(/internal or research/);
    const mutableArtifact = registration();
    mutableArtifact.artifacts[0]!.artifact.repositoryCommit = null;
    mutableArtifact.artifacts[0]!.artifact.repositoryPath = null;
    mutableArtifact.artifacts[0]!.artifact.immutableReference = "https://example.invalid/main/model.json";
    await expect(registerCandidateAndProtocol(authorizedRequest(), db, mutableArtifact)).rejects.toThrow(/immutable reference/);
  });

  it("keeps diagnostic targets research-only, rejects conflicting retries, and has no route or execution import", async () => {
    const diagnostic = registration();
    diagnostic.candidate = { ...diagnostic.candidate, targetAnalyticId: "gravity.v4", baseAnalyticVersion: "artifact-backed diagnostic implementation", baseImplementationIdentity: "gravity-v4.runtime-artifact", exposure: "internal" };
    diagnostic.protocol = { ...diagnostic.protocol, targetAnalyticId: "gravity.v4" };
    await expect(registerCandidateAndProtocol(authorizedRequest(), db, diagnostic)).rejects.toThrow(/research candidates/);
    const first = registration();
    await registerCandidateAndProtocol(authorizedRequest(), db, first);
    const conflict = registration({ candidate: { ...first.candidate, name: "Changed immutable candidate" } });
    await expect(registerCandidateAndProtocol(authorizedRequest(), db, conflict)).rejects.toBeInstanceOf(LabsRegistrationConflictError);
    const source = readFileSync(join(process.cwd(), "app/lib/labs-registration.server.ts"), "utf8");
    expect(existsSync(join(process.cwd(), "app/api/admin/labs"))).toBe(false);
    expect(source).toContain("requireAdmin(request)");
    expect(source).not.toMatch(/calculateAssetNAV|calcNAV|simulateLeague|import\(|require\(|INSERT\s+INTO|UPDATE\s+labs_|DELETE\s+FROM/);
  });
});
