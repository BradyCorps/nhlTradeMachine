import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq, sql } from "drizzle-orm";
import { readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/app/db/schema";
import { SEASON_SNAPSHOT_TABLE_STATEMENTS } from "@/app/db/ensure-schema";
import { getProductionAnalytic } from "@/app/lib/production-analytics";
import {
  registerCandidateAndProtocol,
  transitionCandidateToRegistered,
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

const resources: Array<{ client: ReturnType<typeof createClient>; path: string }> = [];
async function fixtureDb() {
  const path = `/tmp/labs-planning-${crypto.randomUUID()}.db`;
  const client = createClient({ url: `file:${path}` });
  resources.push({ client, path });
  const db = drizzle(client, { schema });
  await db.run(sql.raw("PRAGMA journal_mode = WAL"));
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
const authorizedRequest = () => new Request("https://admin.example/labs", { headers: { "x-admin-key": TEST_ADMIN_KEY } });

afterEach(() => {
  for (const { client, path } of resources.splice(0)) {
    client.close();
    for (const suffix of ["", "-wal", "-shm"]) rmSync(`${path}${suffix}`, { force: true });
  }
  vi.unstubAllEnvs();
});

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

import { getEvaluationRun } from "@/app/lib/labs-evaluations";
import {
  planEvaluationRun, LabsPlanningAuthorizationError, LabsPlanningConflictError,
  type PlannedEvaluationRunInput,
} from "@/app/lib/labs-planning.server";

async function inventory(db: Awaited<ReturnType<typeof fixtureDb>>) {
  return Promise.all([
    db.select().from(schema.labsCandidates), db.select().from(schema.labsArtifacts),
    db.select().from(schema.labsCandidateArtifacts), db.select().from(schema.labsCandidateLifecycleEvents),
    db.select().from(schema.labsEvaluationProtocols), db.select().from(schema.labsEvaluationProtocolMetrics),
    db.select().from(schema.labsEvaluationProtocolGates), db.select().from(schema.seasonSnapshotBatches),
    db.select().from(schema.labsEvaluationRuns), db.select().from(schema.labsEvaluationRunArtifacts),
    db.select().from(schema.labsEvaluationMetricObservations), db.select().from(schema.labsEvaluationGateResults),
  ]);
}

describe("Phase 5B.1 authenticated PLANNED evaluation runs", () => {
  let db: Awaited<ReturnType<typeof fixtureDb>>;
  let input: PlannedEvaluationRunInput;
  beforeEach(async () => {
    vi.stubEnv("ADMIN_KEY", TEST_ADMIN_KEY);
    vi.stubEnv("ADMIN_DISABLE_AUTH", "0");
    db = await fixtureDb();
    const draft = await registerCandidateAndProtocol(authorizedRequest(), db, registration());
    const registered = await transitionCandidateToRegistered(authorizedRequest(), db, {
      candidateId: draft.candidate.id, protocolId: draft.protocol.id,
      protocolFingerprint: draft.protocol.fingerprint, eventId: "event.planning.registered.v1",
      occurredAt: draft.candidate.createdAt + 1, actor: "labs.reviewer", source: "isolated-test", note: null,
    });
    input = {
      id: "run.planning.v1", candidateId: registered.candidate.id,
      candidateRevision: registered.candidate.revision, registrationEventId: registered.candidate.lifecycleHistory[1]!.id,
      protocolId: registered.protocol.id, protocolFingerprint: registered.protocol.fingerprint,
      datasetBatchId: BATCH_ID, baselineAnalyticId: registered.candidate.targetAnalytic.id,
      baselineVersion: registered.candidate.baseAnalyticVersion,
      baselineImplementation: registered.candidate.baseImplementationIdentity, implementationCommit: COMMIT,
      deterministicSeed: "planning-seed-v1",
      environment: { runtime: "node-24", toolchain: "typescript-5.5.4", dependencyDigest: "c".repeat(64) },
      artifacts: registered.candidate.artifacts.map(({ artifact }) => ({ artifactId: artifact.id, contentDigest: artifact.contentDigest })),
      createdAt: registered.candidate.createdAt + 2, actor: "labs.operator", source: "isolated-test",
    };
  });

  it("rejects missing and wrong authentication before database access, including retries", async () => {
    await planEvaluationRun(authorizedRequest(), db, input);
    const before = await inventory(db);
    const transaction = vi.spyOn(db, "transaction");
    const select = vi.spyOn(db, "select");
    for (const request of [new Request("https://admin.example/labs"), new Request("https://admin.example/labs", { headers: { "x-admin-key": "wrong" } })]) {
      await expect(planEvaluationRun(request, db, input)).rejects.toBeInstanceOf(LabsPlanningAuthorizationError);
    }
    expect(transaction).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect(await inventory(db)).toEqual(before);
  });

  it("creates an accepted PLANNED run, freezing the exact event and all artifacts without execution", async () => {
    const before = await inventory(db);
    const result = await planEvaluationRun(authorizedRequest(), db, input);
    expect(result.created).toBe(true);
    expect(await getEvaluationRun(db, input.id)).toEqual(result.run);
    expect(result.run).toMatchObject({
      status: "PLANNED", startedAt: null, completedAt: null, resultSetFingerprint: null,
      failureReason: null, invalidationReason: null, observations: [], gateOutcomes: [], productionResolvable: false,
      implementationCommit: COMMIT, deterministicSeed: input.deterministicSeed,
    });
    expect(JSON.parse(result.run.environmentMetadata)).toEqual({
      schema: "labs-planned-environment/1", registrationEvent: result.run.candidate.lifecycleHistory[1],
      plannedEnvironment: input.environment, randomSeedPolicy: result.run.protocol.randomSeedPolicy,
    });
    expect(result.run.artifacts).toHaveLength(2);
    expect(result.run.artifacts.every(ref => ref.role === "candidate-input" && ref.attachedBy === input.actor && ref.attachedAt === input.createdAt)).toBe(true);
    const after = await inventory(db);
    expect(after.slice(0, 8)).toEqual(before.slice(0, 8));
    expect(after.slice(10)).toEqual([[], []]);
    expect(getProductionAnalytic("nav.defense")).toEqual(result.run.baseline);
    expect(() => getProductionAnalytic(input.id)).toThrow();
    expect(() => getProductionAnalytic(input.candidateId)).toThrow();
  });

  it("reuses an exact authenticated retry with no inserts or updates", async () => {
    const first = await planEvaluationRun(authorizedRequest(), db, input);
    const before = await inventory(db);
    const retryDb = {
      select: db.select.bind(db), insert: db.insert.bind(db),
      transaction: async <T>(operation: (tx: any) => Promise<T>) => db.transaction(async tx => {
        const insert = vi.spyOn(tx, "insert");
        const update = vi.spyOn(tx, "update");
        const result = await operation(tx);
        expect(insert).not.toHaveBeenCalled();
        expect(update).not.toHaveBeenCalled();
        return result;
      }),
    };
    expect(await planEvaluationRun(authorizedRequest(), retryDb, { ...input, artifacts: [...input.artifacts].reverse() }))
      .toEqual({ ...first, created: false });
    expect(await inventory(db)).toEqual(before);
  });

  it.each([
    { id: "run.changed-id.v1" }, { candidateRevision: "changed-revision" },
    { registrationEventId: "event.changed.registered.v1" }, { protocolFingerprint: "d".repeat(64) },
    { datasetBatchId: "2025-26" }, { baselineAnalyticId: "nav.forward" },
    { baselineVersion: "other-version" }, { baselineImplementation: "other.implementation" },
    { implementationCommit: "d".repeat(40) }, { deterministicSeed: "other-seed" },
    { environment: { runtime: "node-other", toolchain: "other", dependencyDigest: "d".repeat(64) } },
    { createdAt: 1_790_000_000_003 }, { actor: "other.operator" }, { source: "other-source" },
    { artifacts: [] },
  ])("rejects changed retries %j and preserves every record", async change => {
    await planEvaluationRun(authorizedRequest(), db, input);
    const before = await inventory(db);
    await expect(planEvaluationRun(authorizedRequest(), db, { ...input, ...change })).rejects.toBeInstanceOf(LabsPlanningConflictError);
    expect(await inventory(db)).toEqual(before);
  });

  it("rejects a same-target protocol that was not bound by registration", async () => {
    const other = registration();
    other.candidate = { ...other.candidate, id: "candidate.other.planning.v1", revision: "other-revision" };
    other.protocol = { ...other.protocol, id: "protocol.other.planning.v1", version: "other-version" };
    other.initialLifecycleEvent = { ...other.initialLifecycleEvent, id: "event.other.draft.v1" };
    const draft = await registerCandidateAndProtocol(authorizedRequest(), db, other);
    const before = await inventory(db);
    await expect(planEvaluationRun(authorizedRequest(), db, { ...input, protocolId: draft.protocol.id, protocolFingerprint: draft.protocol.fingerprint }))
      .rejects.toBeInstanceOf(LabsPlanningConflictError);
    expect(await inventory(db)).toEqual(before);
  });

  it.each(["DRAFT", "RETIRED"])("rejects a %s candidate without writes", async status => {
    if (status === "DRAFT") {
      const other = registration();
      other.candidate = { ...other.candidate, id: "candidate.draft.planning.v1", revision: "draft-revision" };
      other.protocol = { ...other.protocol, id: "protocol.draft.planning.v1", version: "draft-version" };
      other.initialLifecycleEvent = { ...other.initialLifecycleEvent, id: "event.draft.planning.v1" };
      const draft = await registerCandidateAndProtocol(authorizedRequest(), db, other);
      input = { ...input, candidateId: draft.candidate.id, candidateRevision: draft.candidate.revision, protocolId: draft.protocol.id, protocolFingerprint: draft.protocol.fingerprint };
    } else {
      await db.insert(schema.labsCandidateLifecycleEvents).values({
        id: "event.retired.planning.v1", candidateId: input.candidateId, sequence: 3,
        eventType: "RETIRED", previousStatus: "REGISTERED", resultingStatus: "RETIRED",
        occurredAt: input.createdAt, actor: input.actor, source: input.source,
        note: null, evidenceReference: null, metadataSchemaVersion: 1,
      });
    }
    const before = await inventory(db);
    await expect(planEvaluationRun(authorizedRequest(), db, input)).rejects.toBeInstanceOf(LabsPlanningConflictError);
    expect(await inventory(db)).toEqual(before);
  });

  it.each(["FAILED", "CAPTURING", "count-mismatch", "legacy"])("rejects %s snapshot provenance without writes", async kind => {
    if (kind === "legacy") {
      await db.run(sql.raw("PRAGMA foreign_keys = OFF"));
      await db.update(schema.labsCandidates).set({ datasetBatchId: "2025-26" }).where(eq(schema.labsCandidates.id, input.candidateId));
    } else {
      await db.update(schema.seasonSnapshotBatches).set(kind === "count-mismatch" ? { capturedPlayers: 1 } : { status: kind });
    }
    const before = await inventory(db);
    await expect(planEvaluationRun(authorizedRequest(), db, input)).rejects.toThrow(/not COMPLETE|incomplete/);
    expect(await inventory(db)).toEqual(before);
  });

  it.each(["digest", "missing", "extra", "implementation"])("rejects %s artifact mismatch without writes", async kind => {
    if (kind === "digest") input.artifacts = input.artifacts.map(ref => ({ ...ref, contentDigest: "d".repeat(64) }));
    if (kind === "missing") input.artifacts = input.artifacts.slice(1);
    if (kind === "extra") input.artifacts = [...input.artifacts, { artifactId: "artifact.extra.v1", contentDigest: "d".repeat(64) }];
    if (kind === "implementation") await db.update(schema.labsCandidates).set({ implementationIdentity: "other.implementation" });
    const before = await inventory(db);
    await expect(planEvaluationRun(authorizedRequest(), db, input)).rejects.toThrow();
    expect(await inventory(db)).toEqual(before);
  });

  it.each(["gravity.v4", "nav01.phase5-calibration", "nav.team-aggregation", "simulation.season"])("rejects ineligible or incoherent baseline %s", async baselineAnalyticId => {
    const before = await inventory(db);
    await expect(planEvaluationRun(authorizedRequest(), db, { ...input, baselineAnalyticId })).rejects.toThrow();
    expect(await inventory(db)).toEqual(before);
  });

  it.each(["after-run", "after-references", "after-reader"])("rolls back every write on failure %s", async point => {
    const before = await inventory(db);
    if (point !== "after-reader") {
      const table = point === "after-run" ? "labs_evaluation_runs" : "labs_evaluation_run_artifacts";
      await db.run(sql.raw(`CREATE TRIGGER injected_planning_failure AFTER INSERT ON ${table} BEGIN SELECT RAISE(ABORT, 'Injected pre-commit failure'); END`));
      await expect(planEvaluationRun(authorizedRequest(), db, input)).rejects.toThrow();
      await db.run(sql.raw("DROP TRIGGER injected_planning_failure"));
    } else {
      const failingDb = {
        select: db.select.bind(db), insert: db.insert.bind(db),
        transaction: async <T>(operation: (tx: any) => Promise<T>) => db.transaction(async tx => {
          await operation(tx);
          throw new Error("Injected pre-commit failure");
        }),
      };
      await expect(planEvaluationRun(authorizedRequest(), failingDb, input)).rejects.toThrow("Injected pre-commit failure");
    }
    expect(await inventory(db)).toEqual(before);
    expect((await planEvaluationRun(authorizedRequest(), db, input)).created).toBe(true);
  });

  function independentConnection() {
    const path = resources[0]!.path;
    const client = createClient({ url: `file:${path}` });
    resources.push({ client, path });
    return drizzle(client, { schema });
  }

  it("creates one run and reuses it for concurrent identical requests on independent connections", async () => {
    const peer = independentConnection();
    const results = await Promise.all([
      planEvaluationRun(authorizedRequest(), db, input), planEvaluationRun(authorizedRequest(), peer, input),
    ]);
    expect(results.map(result => result.created).sort()).toEqual([false, true]);
    expect(results[0]!.run).toEqual(results[1]!.run);
    expect(await db.select().from(schema.labsEvaluationRuns)).toHaveLength(1);
    expect(await db.select().from(schema.labsEvaluationRunArtifacts)).toHaveLength(2);
  });

  it.each(["same-id", "unique-composite"])("selects one winner and one conflict for concurrent competing %s requests", async kind => {
    const peer = independentConnection();
    const results = await Promise.allSettled([
      planEvaluationRun(authorizedRequest(), db, input),
      planEvaluationRun(authorizedRequest(), peer, { ...input, id: kind === "same-id" ? input.id : "run.competing.v1", actor: "competing.operator" }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    expect((results.find(result => result.status === "rejected") as PromiseRejectedResult).reason).toBeInstanceOf(LabsPlanningConflictError);
    expect(await db.select().from(schema.labsEvaluationRuns)).toHaveLength(1);
    expect(await db.select().from(schema.labsEvaluationRunArtifacts)).toHaveLength(2);
  });

  it("fails closed without transactions or required reproducibility metadata", async () => {
    const before = await inventory(db);
    await expect(planEvaluationRun(authorizedRequest(), { ...db, transaction: undefined } as any, input)).rejects.toThrow(/transactional/);
    for (const change of [
      { deterministicSeed: " " }, { implementationCommit: "bad" }, { createdAt: NaN },
      { environment: { ...input.environment, runtime: "" } }, { environment: { ...input.environment, dependencyDigest: "bad" } },
    ]) await expect(planEvaluationRun(authorizedRequest(), db, { ...input, ...change })).rejects.toThrow(/reproducibility/);
    expect(await inventory(db)).toEqual(before);
  });

  it("rejects execution or extra metadata even on a retry, without writes", async () => {
    await planEvaluationRun(authorizedRequest(), db, input);
    const before = await inventory(db);
    for (const change of [
      { startedAt: input.createdAt }, { observations: [] }, { status: "COMPLETED" },
      { environment: { ...input.environment, executionValidated: true } },
    ]) await expect(planEvaluationRun(authorizedRequest(), db, { ...input, ...change } as any)).rejects.toThrow(/only frozen planning/);
    expect(await inventory(db)).toEqual(before);
  });

  it("rolls back if candidate state changes after validation but before the final read", async () => {
    const before = await inventory(db);
    const changingDb = {
      select: db.select.bind(db), insert: db.insert.bind(db),
      transaction: async <T>(operation: (tx: any) => Promise<T>) => db.transaction(async tx => {
        // Exercise the final reader rather than merely injecting an exception.
        await tx.run(sql.raw(`CREATE TEMP TRIGGER retire_during_plan AFTER INSERT ON labs_evaluation_runs
          BEGIN INSERT INTO labs_candidate_lifecycle_events
            (id, candidate_id, sequence, event_type, previous_status, resulting_status, occurred_at, actor, source, note, evidence_reference, metadata_schema_version)
          VALUES ('event.concurrent.retirement.v1', NEW.candidate_id, 3, 'RETIRED', 'REGISTERED', 'RETIRED', NEW.created_at, 'test', 'test', NULL, NULL, 1); END`));
        return operation(tx);
      }),
    };
    await expect(planEvaluationRun(authorizedRequest(), changingDb, input)).rejects.toThrow(/registered coherent candidate/);
    expect(await inventory(db)).toEqual(before);
  });

  it("serializes independent retirement behind planning validation and commit", async () => {
    const peer = independentConnection();
    let competing: Promise<unknown> | undefined;
    const serializedDb = {
      select: db.select.bind(db), insert: db.insert.bind(db),
      transaction: async <T>(operation: (tx: any) => Promise<T>) => db.transaction(async tx => {
        // Called when the run insert is reached, after readiness has been read.
        const insert = tx.insert.bind(tx);
        tx.insert = ((table: unknown) => {
          if (table === schema.labsEvaluationRuns) {
            competing = peer.insert(schema.labsCandidateLifecycleEvents).values({
              id: "event.blocked.retirement.v1", candidateId: input.candidateId, sequence: 3,
              eventType: "RETIRED", previousStatus: "REGISTERED", resultingStatus: "RETIRED",
              occurredAt: input.createdAt, actor: "peer", source: "test", note: null,
              evidenceReference: null, metadataSchemaVersion: 1,
            }).then(() => "committed", (error: unknown) => error);
          }
          return insert(table as any);
        }) as typeof tx.insert;
        const result = await operation(tx);
        // Independent writers cannot alter readiness while this transaction owns the lock.
        const outcome = await competing;
        expect(outcome).not.toBe("committed");
        expect(String(outcome)).toMatch(/SQLITE_BUSY|locked/);
        return result;
      }),
    };
    expect((await planEvaluationRun(authorizedRequest(), serializedDb, input)).created).toBe(true);
    expect(await db.select().from(schema.labsCandidateLifecycleEvents)).toHaveLength(2);
    expect(await getEvaluationRun(db, input.id)).toMatchObject({ status: "PLANNED" });
  });
});
