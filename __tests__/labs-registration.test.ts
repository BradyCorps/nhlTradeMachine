import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { eq, sql } from "drizzle-orm";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/app/db/schema";
import { SEASON_SNAPSHOT_TABLE_STATEMENTS } from "@/app/db/ensure-schema";
import { getProductionAnalytic } from "@/app/lib/production-analytics";
import {
  LabsRegistrationAuthorizationError,
  LabsRegistrationConflictError,
  registerCandidateAndProtocol,
  transitionCandidateToRegistered,
  type CandidateProtocolRegistrationInput,
  type CandidateRegisteredTransitionInput,
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
  const path = `/tmp/labs-registration-${crypto.randomUUID()}.db`;
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
const previousAdminKey = process.env.ADMIN_KEY;
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

describe("Phase 5A.2 isolated DRAFT to REGISTERED transition", () => {
  let db: Awaited<ReturnType<typeof fixtureDb>>;
  let input: CandidateRegisteredTransitionInput;
  beforeEach(async () => {
    vi.stubEnv("ADMIN_KEY", TEST_ADMIN_KEY);
    vi.stubEnv("ADMIN_DISABLE_AUTH", "0");
    db = await fixtureDb();
    const draft = await registerCandidateAndProtocol(authorizedRequest(), db, registration());
    input = {
      candidateId: draft.candidate.id, protocolId: draft.protocol.id,
      protocolFingerprint: draft.protocol.fingerprint, eventId: "event.registration.registered.v1",
      occurredAt: registration().candidate.createdAt + 1, actor: "labs.reviewer",
      source: "isolated-transition-test", note: "Planning metadata checked.",
    };
  });

  it("rejects missing and incorrect authorization before any database access", async () => {
    const transaction = vi.fn();
    const select = vi.fn();
    for (const request of [new Request("https://admin.example/labs"), new Request("https://admin.example/labs", { headers: { "x-admin-key": "incorrect" } })]) {
      await expect(transitionCandidateToRegistered(request, { transaction, select, insert: vi.fn() }, input))
        .rejects.toBeInstanceOf(LabsRegistrationAuthorizationError);
    }
    expect(transaction).not.toHaveBeenCalled();
    expect(select).not.toHaveBeenCalled();
    expect((await counts(db)).events).toBe(1);
  });

  it("appends one protocol-bound event and makes exact retries immutable no-ops", async () => {
    const before = await counts(db);
    const first = await transitionCandidateToRegistered(authorizedRequest(), db, input);
    expect(first.created).toBe(true);
    expect(first.candidate.lifecycleStatus).toBe("REGISTERED");
    expect(first.candidate.lifecycleHistory[1]).toMatchObject({
      id: input.eventId, sequence: 2, eventType: "REGISTERED", previousStatus: "DRAFT",
      actor: input.actor, source: input.source,
      evidenceReference: JSON.stringify({ protocolId: input.protocolId, fingerprint: input.protocolFingerprint }),
    });
    const second = await transitionCandidateToRegistered(authorizedRequest(), db, input);
    expect(second).toEqual({ ...first, created: false });
    expect(await counts(db)).toEqual({ ...before, events: 2 });
  });

  it.each([
    { eventId: "event.other.registered.v1" }, { actor: "other.operator" },
    { source: "different-source" }, { note: "Changed note" }, { occurredAt: 42 },
    { protocolFingerprint: "c".repeat(64) },
  ])("rejects a changed retry %j without another event", async change => {
    await transitionCandidateToRegistered(authorizedRequest(), db, input);
    await expect(transitionCandidateToRegistered(authorizedRequest(), db, { ...input, ...change }))
      .rejects.toBeInstanceOf(LabsRegistrationConflictError);
    expect((await counts(db)).events).toBe(2);
  });

  it("arbitrates exact concurrent retries across independent connections", async () => {
    const path = resources[0]!.path;
    const client = createClient({ url: `file:${path}` });
    resources.push({ client, path });
    const peer = drizzle(client, { schema });
    const results = await Promise.all([
      transitionCandidateToRegistered(authorizedRequest(), db, input),
      transitionCandidateToRegistered(authorizedRequest(), peer, input),
    ]);
    expect(results.map(result => result.created).sort()).toEqual([false, true]);
    expect(results[0]!.candidate).toEqual(results[1]!.candidate);
    expect((await counts(db)).events).toBe(2);
  });

  it("allows only one of two competing transitions across independent connections", async () => {
    const path = resources[0]!.path;
    const client = createClient({ url: `file:${path}` });
    resources.push({ client, path });
    const peer = drizzle(client, { schema });
    const results = await Promise.allSettled([
      transitionCandidateToRegistered(authorizedRequest(), db, input),
      transitionCandidateToRegistered(authorizedRequest(), peer, { ...input, eventId: "event.competing.registered.v1" }),
    ]);
    expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
    const loser = results.find(result => result.status === "rejected") as PromiseRejectedResult;
    expect(loser.reason).toBeInstanceOf(LabsRegistrationConflictError);
    expect((await counts(db)).events).toBe(2);
  });

  it("rolls back an event when a database failure occurs after its insertion", async () => {
    const before = await db.select().from(schema.labsCandidateLifecycleEvents);
    const failingDb = {
      select: db.select.bind(db),
      insert: db.insert.bind(db),
      transaction: async <T>(operation: (tx: any) => Promise<T>): Promise<T> => db.transaction(async tx => {
        const result = await operation(tx);
        // Fail only after the write, allowing the subsequent retry inspection.
        if ((await tx.select().from(schema.labsCandidateLifecycleEvents)).length > before.length) {
          throw new Error("Injected pre-commit failure");
        }
        return result;
      }),
    };
    await expect(transitionCandidateToRegistered(authorizedRequest(), failingDb, input)).rejects.toThrow("Injected pre-commit failure");
    expect(await db.select().from(schema.labsCandidateLifecycleEvents)).toEqual(before);
    expect((await transitionCandidateToRegistered(authorizedRequest(), db, input)).created).toBe(true);
  });

  it.each(["FAILED", "CAPTURING", "count-mismatch", "legacy"])("rejects %s dataset provenance with no transition", async kind => {
    if (kind === "legacy") {
      // Deliberately corrupt only this disposable fixture to exercise the reader.
      await db.run(sql.raw("PRAGMA foreign_keys = OFF"));
      await db.update(schema.labsCandidates).set({ datasetBatchId: "2025-26" }).where(eq(schema.labsCandidates.id, input.candidateId));
    } else {
      await db.update(schema.seasonSnapshotBatches)
        .set(kind === "count-mismatch" ? { capturedPlayers: 1 } : { status: kind })
        .where(eq(schema.seasonSnapshotBatches.id, BATCH_ID));
    }
    await expect(transitionCandidateToRegistered(authorizedRequest(), db, input)).rejects.toThrow(/not COMPLETE|incomplete/);
    expect((await counts(db)).events).toBe(1);
  });

  it("rejects mismatched implementation provenance and missing frozen protocols", async () => {
    await db.update(schema.labsCandidates).set({ implementationIdentity: "different.implementation" }).where(eq(schema.labsCandidates.id, input.candidateId));
    await expect(transitionCandidateToRegistered(authorizedRequest(), db, input)).rejects.toThrow(/implementation identity/);
    await expect(transitionCandidateToRegistered(authorizedRequest(), db, { ...input, protocolId: "protocol.missing.v1" })).rejects.toThrow();
    expect((await counts(db)).events).toBe(1);
  });

  it("rejects a valid frozen protocol for a different analytic", async () => {
    const other = registration();
    const target = getProductionAnalytic("nav.forward");
    other.candidate = {
      ...other.candidate, id: "candidate.other.registration.v1", targetAnalyticId: target.id,
      baseAnalyticVersion: target.version.value, baseImplementationIdentity: target.implementation,
    };
    other.protocol = { ...other.protocol, id: "protocol.other.registration.v1", targetAnalyticId: target.id };
    other.initialLifecycleEvent = { ...other.initialLifecycleEvent, id: "event.other.draft.v1" };
    const registered = await registerCandidateAndProtocol(authorizedRequest(), db, other);
    const before = await counts(db);
    await expect(transitionCandidateToRegistered(authorizedRequest(), db, {
      ...input, protocolId: registered.protocol.id, protocolFingerprint: registered.protocol.fingerprint,
    })).rejects.toThrow(/same analytic/);
    expect(await counts(db)).toEqual(before);
  });

  it("rejects retired candidates, even when the protocol and provenance remain valid", async () => {
    await db.insert(schema.labsCandidateLifecycleEvents).values({
      id: "event.registration.retired.v1", candidateId: input.candidateId, sequence: 2,
      eventType: "RETIRED", previousStatus: "DRAFT", resultingStatus: "RETIRED",
      occurredAt: input.occurredAt, actor: input.actor, source: input.source,
      note: null, evidenceReference: null, metadataSchemaVersion: 1,
    });
    await expect(transitionCandidateToRegistered(authorizedRequest(), db, input))
      .rejects.toBeInstanceOf(LabsRegistrationConflictError);
    expect((await counts(db)).events).toBe(2);
  });

  it("fails closed when transactional database support is absent", async () => {
    await expect(transitionCandidateToRegistered(authorizedRequest(), { ...db, transaction: undefined } as any, input))
      .rejects.toThrow(/transactional database support/);
    expect((await counts(db)).events).toBe(1);
  });

  it("leaves production resolution, frozen records and evaluation evidence untouched", async () => {
    const target = getProductionAnalytic("nav.defense");
    const frozen = await Promise.all([
      db.select().from(schema.labsCandidates), db.select().from(schema.labsArtifacts),
      db.select().from(schema.labsCandidateArtifacts), db.select().from(schema.labsEvaluationProtocols),
      db.select().from(schema.labsEvaluationProtocolMetrics), db.select().from(schema.labsEvaluationProtocolGates),
      db.select().from(schema.seasonSnapshotBatches),
    ]);
    const result = await transitionCandidateToRegistered(authorizedRequest(), db, input);
    expect(result.candidate.productionResolvable).toBe(false);
    expect(getProductionAnalytic("nav.defense")).toEqual(target);
    expect(() => getProductionAnalytic(input.candidateId)).toThrow();
    expect(await Promise.all([
      db.select().from(schema.labsCandidates), db.select().from(schema.labsArtifacts),
      db.select().from(schema.labsCandidateArtifacts), db.select().from(schema.labsEvaluationProtocols),
      db.select().from(schema.labsEvaluationProtocolMetrics), db.select().from(schema.labsEvaluationProtocolGates),
      db.select().from(schema.seasonSnapshotBatches),
    ])).toEqual(frozen);
    expect(await db.select().from(schema.labsEvaluationRuns)).toEqual([]);
    expect(await db.select().from(schema.labsEvaluationMetricObservations)).toEqual([]);
    expect(await db.select().from(schema.labsEvaluationGateResults)).toEqual([]);
  });
});
