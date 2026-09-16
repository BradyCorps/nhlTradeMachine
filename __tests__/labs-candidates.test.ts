import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { sql } from "drizzle-orm";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it } from "vitest";
import * as schema from "@/app/db/schema";
import { SEASON_SNAPSHOT_TABLE_STATEMENTS } from "@/app/db/ensure-schema";
import {
  LabsCandidateIntegrityError,
  MAX_LABS_CANDIDATE_OVERVIEW,
  getLabCandidate,
  isCandidateProductionResolvable,
  listLabCandidates,
  validateArtifactDefinition,
  validateCandidateLifecycleHistory,
  validateCandidateTarget,
} from "@/app/lib/labs-candidates";
import { getProductionAnalytic } from "@/app/lib/production-analytics";

const COMPLETE_BATCH_ID = "snapshot:2025-26:2026-09-13:X-NAV-4.2:5af40ed576d53014";
const DIGEST = "5af40ed576d53014d16f1048a1977a84f865a5019631ea19615e5cf2b44e0b39";
const SECOND_DIGEST = "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
const COMMIT = "65fb36a540a766be47cad63823cc977cadce1a54";
const MIGRATION = readFileSync(join(process.cwd(), "drizzle/0009_add_labs_candidate_foundation.sql"), "utf8")
  .split("--> statement-breakpoint")
  .map(statement => statement.trim())
  .filter(Boolean);

async function fixtureDb() {
  const client = createClient({ url: `file:/tmp/labs-candidates-${crypto.randomUUID()}.db` });
  const db = drizzle(client, { schema });
  for (const statement of SEASON_SNAPSHOT_TABLE_STATEMENTS) await db.run(sql.raw(statement));
  for (const statement of MIGRATION) await db.run(sql.raw(statement));
  await db.insert(schema.seasonSnapshotBatches).values({
    id: COMPLETE_BATCH_ID,
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
    source: "test source",
    population: "test population",
    integrityHash: DIGEST,
    createdBy: "test",
    createdAction: "test",
    createdAt: 1_789_264_480_075,
    completedAt: 1_789_264_480_075,
    failureReason: null,
  });
  return db;
}

function candidateRow(overrides: Partial<typeof schema.labsCandidates.$inferInsert> = {}) {
  const target = getProductionAnalytic("nav.defense");
  return {
    id: "candidate.nav-defense.role-aware.v1",
    targetAnalyticId: target.id,
    name: "Role-aware D-NAV research candidate",
    revision: "role-aware-v1",
    implementationIdentity: "research.role-aware-defense-nav",
    baseAnalyticVersion: target.version.value,
    baseImplementationIdentity: target.implementation,
    exposure: "research" as const,
    datasetBatchId: COMPLETE_BATCH_ID,
    description: "Isolated fixture only",
    hypothesis: "A future evaluation may test a role-aware correction.",
    schemaVersion: 1,
    createdAt: 1_789_300_000_000,
    createdBy: "test-admin",
    createdSource: "isolated-test",
    ...overrides,
  };
}

async function seedCandidate(db: Awaited<ReturnType<typeof fixtureDb>>, options: {
  candidate?: Partial<typeof schema.labsCandidates.$inferInsert>;
  artifact?: boolean;
  events?: Array<Partial<typeof schema.labsCandidateLifecycleEvents.$inferInsert>>;
} = {}) {
  const candidate = candidateRow(options.candidate);
  await db.insert(schema.labsCandidates).values(candidate);
  if (options.artifact !== false) {
    await db.insert(schema.labsArtifacts).values({
      id: "artifact.role-aware-defense-nav.v1",
      kind: "configuration",
      contentDigest: DIGEST,
      implementationIdentity: candidate.implementationIdentity,
      mediaType: "application/json",
      artifactSchemaVersion: "candidate-config-v1",
      repositoryCommit: COMMIT,
      repositoryPath: "docs/analytics/example.json",
      immutableReference: null,
      byteSize: 128,
      metadataSchemaVersion: 1,
      createdAt: candidate.createdAt,
      createdBy: "test-admin",
      createdSource: "isolated-test",
    });
    await db.insert(schema.labsCandidateArtifacts).values({
      candidateId: candidate.id,
      artifactId: "artifact.role-aware-defense-nav.v1",
      role: "configuration",
      attachedAt: candidate.createdAt,
      attachedBy: "test-admin",
    });
  }
  const events = options.events ?? [{
    id: "event.role-aware-defense-nav.draft",
    sequence: 1,
    eventType: "DRAFT_CREATED",
    previousStatus: null,
    resultingStatus: "DRAFT",
  }];
  for (const event of events) {
    await db.insert(schema.labsCandidateLifecycleEvents).values({
      id: event.id ?? `event.${crypto.randomUUID()}`,
      candidateId: candidate.id,
      sequence: event.sequence ?? 1,
      eventType: event.eventType ?? "DRAFT_CREATED",
      previousStatus: event.previousStatus ?? null,
      resultingStatus: event.resultingStatus ?? "DRAFT",
      occurredAt: event.occurredAt ?? candidate.createdAt,
      actor: event.actor ?? "test-admin",
      source: event.source ?? "isolated-test",
      note: event.note ?? null,
      evidenceReference: event.evidenceReference ?? null,
      metadataSchemaVersion: event.metadataSchemaVersion ?? 1,
    });
  }
  return candidate;
}

describe("Phase 3 Analytics Labs candidate foundation", () => {
  let db: Awaited<ReturnType<typeof fixtureDb>>;
  beforeEach(async () => { db = await fixtureDb(); });

  it("reads a candidate only with COMPLETE batch provenance, immutable artifacts, and coherent append-only history", async () => {
    const seeded = await seedCandidate(db);
    const candidate = await getLabCandidate(db, seeded.id);

    expect(candidate).toMatchObject({
      id: seeded.id,
      lifecycleStatus: "DRAFT",
      exposure: "research",
      dataset: { id: COMPLETE_BATCH_ID, status: "COMPLETE" },
      artifacts: [{ artifact: { id: "artifact.role-aware-defense-nav.v1", contentDigest: DIGEST } }],
    });
    expect(candidate.productionResolvable).toBe(false);
    expect(isCandidateProductionResolvable(candidate)).toBe(false);
    expect(Object.isFrozen(candidate)).toBe(true);
    expect(Object.isFrozen(candidate.artifacts)).toBe(true);
    expect(Object.isFrozen(candidate.lifecycleHistory)).toBe(true);
  });

  it("rejects unknown, research-only, and display-only catalog targets while allowing diagnostic research targets", () => {
    expect(() => validateCandidateTarget("missing.analytic")).toThrow(/Unknown analytic ID/);
    expect(() => validateCandidateTarget("nav01.phase5-calibration")).toThrow(/cannot be a candidate target/);
    expect(() => validateCandidateTarget("nav.team-aggregation")).toThrow(/Display aggregation/);
    expect(validateCandidateTarget("gravity.v4")).toMatchObject({ lifecycle: "DIAGNOSTIC", exposure: "diagnostic" });
    expect(() => getProductionAnalytic("gravity.v4")).toThrow(/not a production analytic/);
  });

  it("derives current lifecycle status from a coherent sequence and fails closed for invalid chains", () => {
    const history = [
      { id: "event.lifecycle.draft", candidateId: "candidate.lifecycle.v1", sequence: 1, eventType: "DRAFT_CREATED", previousStatus: null, resultingStatus: "DRAFT", occurredAt: 1, actor: "test", source: "test", note: null, evidenceReference: null, metadataSchemaVersion: 1 },
      { id: "event.lifecycle.registered", candidateId: "candidate.lifecycle.v1", sequence: 2, eventType: "REGISTERED", previousStatus: "DRAFT", resultingStatus: "REGISTERED", occurredAt: 1, actor: "test", source: "test", note: null, evidenceReference: null, metadataSchemaVersion: 1 },
    ] as const;
    expect(validateCandidateLifecycleHistory("candidate.lifecycle.v1", history)).toBe("REGISTERED");
    expect(() => validateCandidateLifecycleHistory("candidate.lifecycle.v1", [{ ...history[0], resultingStatus: "REGISTERED" }])).toThrow(/must begin/);
    expect(() => validateCandidateLifecycleHistory("candidate.lifecycle.v1", [{ ...history[0] }, { ...history[1], previousStatus: "REGISTERED" }])).toThrow(/incoherent/);
    expect(validateCandidateLifecycleHistory("candidate.lifecycle.v1", [
      history[0],
      { ...history[1], id: "event.lifecycle.retired-from-draft", eventType: "RETIRED", previousStatus: "DRAFT", resultingStatus: "RETIRED" },
    ])).toBe("RETIRED");
    expect(validateCandidateLifecycleHistory("candidate.lifecycle.v1", [
      ...history,
      { ...history[1], id: "event.lifecycle.retired-from-registered", sequence: 3, eventType: "RETIRED", previousStatus: "REGISTERED", resultingStatus: "RETIRED" },
    ])).toBe("RETIRED");
    expect(() => validateCandidateLifecycleHistory("candidate.lifecycle.v1", [
      ...history,
      { ...history[1], id: "event.lifecycle.reactivate", sequence: 3, eventType: "REGISTERED", previousStatus: "RETIRED", resultingStatus: "REGISTERED" },
    ])).toThrow(/incoherent/);
    expect(() => validateCandidateLifecycleHistory("candidate.lifecycle.v1", [
      ...history,
      { ...history[0], id: "event.lifecycle.duplicate-initial", sequence: 3 },
    ])).toThrow(/cannot repeat/);
    expect(() => validateCandidateLifecycleHistory("candidate.lifecycle.v1", [
      { ...history[0], resultingStatus: "PUBLIC" as never },
    ])).toThrow(/unknown resulting status/);
  });

  it("rejects missing, legacy-shaped, and non-COMPLETE dataset references", async () => {
    // The production foreign key prevents this state. Disable it only in this
    // isolated fixture to prove the read boundary fails closed on corrupted or
    // legacy-shaped provenance rather than treating a season label as a batch.
    await db.run(sql.raw("PRAGMA foreign_keys = OFF"));
    const missing = await seedCandidate(db, { candidate: { datasetBatchId: "2025-26" }, artifact: false });
    await db.run(sql.raw("PRAGMA foreign_keys = ON"));
    await expect(listLabCandidates(db)).rejects.toThrow(`Season snapshot batch ${missing.datasetBatchId} is not COMPLETE`);

    db = await fixtureDb();
    await db.insert(schema.seasonSnapshotBatches).values({
      id: "snapshot:capturing", season: "2025-26", snapshotKind: "completed", asOf: "2026-09-13", coverage: "completed-season",
      statsSeason: "2025-26", contractSeason: "2026-27", modelVersion: "X-NAV 4.2", status: "CAPTURING",
      expectedPlayers: 1, capturedPlayers: 0, expectedTeams: 1, capturedTeams: 0, skippedPlayers: 0,
      source: "test", population: "test", integrityHash: DIGEST, createdBy: "test", createdAction: "test", createdAt: 1, completedAt: null, failureReason: null,
    });
    await seedCandidate(db, { candidate: { datasetBatchId: "snapshot:capturing" }, artifact: false });
    await expect(listLabCandidates(db)).rejects.toThrow(/not COMPLETE/);
  });

  it("requires immutable artifact identity and lets database triggers reject artifact/history rewrites", async () => {
    expect(() => validateArtifactDefinition({
      id: "artifact.mutable-ref.v1", kind: "report", contentDigest: "not-a-digest", implementationIdentity: "test",
      mediaType: "text/plain", artifactSchemaVersion: "v1", repositoryCommit: null, repositoryPath: "main/report.txt",
      immutableReference: null, byteSize: null, metadataSchemaVersion: 1, createdAt: 1, createdBy: "test", createdSource: "test",
    })).toThrow(/SHA-256/);
    expect(() => validateArtifactDefinition({
      id: "artifact.mutable-ref.v1", kind: "report", contentDigest: DIGEST, implementationIdentity: "test",
      mediaType: "text/plain", artifactSchemaVersion: "v1", repositoryCommit: null, repositoryPath: "main/report.txt",
      immutableReference: null, byteSize: null, metadataSchemaVersion: 1, createdAt: 1, createdBy: "test", createdSource: "test",
    })).toThrow(/mutable repository path/);

    await seedCandidate(db);
    await expect(db.run(sql.raw("UPDATE labs_candidates SET revision = 'rewritten-v2' WHERE id = 'candidate.nav-defense.role-aware.v1'"))).rejects.toThrow();
    await expect(db.run(sql.raw("UPDATE labs_artifacts SET media_type = 'text/plain' WHERE id = 'artifact.role-aware-defense-nav.v1'"))).rejects.toThrow();
    await expect(db.run(sql.raw("DELETE FROM labs_candidate_lifecycle_events WHERE id = 'event.role-aware-defense-nav.draft'"))).rejects.toThrow();
  });

  it("fails closed for corrupt public exposure and a bounded candidate overview", async () => {
    await db.run(sql.raw("PRAGMA ignore_check_constraints = ON"));
    await seedCandidate(db, { candidate: { exposure: "public" as never }, artifact: false });
    await db.run(sql.raw("PRAGMA ignore_check_constraints = OFF"));
    await expect(listLabCandidates(db)).rejects.toThrow(/invalid exposure/);

    db = await fixtureDb();
    const candidates = Array.from({ length: MAX_LABS_CANDIDATE_OVERVIEW + 1 }, (_, index) => candidateRow({
      id: `candidate.bulk-${index}`,
      revision: `bulk-${index}`,
    }));
    await db.insert(schema.labsCandidates).values(candidates);
    await db.insert(schema.labsCandidateLifecycleEvents).values(candidates.map((candidate, index) => ({
      id: `event.bulk-${index}`,
      candidateId: candidate.id,
      sequence: 1,
      eventType: "DRAFT_CREATED",
      previousStatus: null,
      resultingStatus: "DRAFT",
      occurredAt: candidate.createdAt,
      actor: "test-admin",
      source: "isolated-test",
      note: null,
      evidenceReference: null,
      metadataSchemaVersion: 1,
    })));
    await expect(listLabCandidates(db)).rejects.toThrow(/safety limit/);
  });

  it("keeps candidate reads out of production resolution and exposes no Labs mutation route", async () => {
    const before = getProductionAnalytic("nav.defense");
    await seedCandidate(db);
    await listLabCandidates(db);
    expect(getProductionAnalytic("nav.defense")).toBe(before);
    expect(existsSync(join(process.cwd(), "app/api/admin/labs"))).toBe(false);
    const source = readFileSync(join(process.cwd(), "app/lib/labs-candidates.ts"), "utf8");
    expect(source).not.toMatch(/import\(|require\(|calculateAssetNAV|calcNAV|UPDATE\s+labs_candidates|INSERT\s+INTO\s+labs_candidates/);
  });

  it("enforces candidate and artifact uniqueness in the isolated migration schema", async () => {
    const candidate = await seedCandidate(db);
    await expect(db.insert(schema.labsCandidates).values(candidateRow({ id: candidate.id }))).rejects.toThrow();
    await expect(db.insert(schema.labsCandidates).values(candidateRow({
      id: "candidate.nav-defense.same-revision.v1",
    }))).rejects.toThrow();
    await expect(db.insert(schema.labsArtifacts).values({
      id: "artifact.duplicate-digest.v1", kind: "report", contentDigest: DIGEST, implementationIdentity: "test", mediaType: "text/plain",
      artifactSchemaVersion: "v1", repositoryCommit: COMMIT, repositoryPath: "docs/report.txt", immutableReference: null, byteSize: 1,
      metadataSchemaVersion: 1, createdAt: 1, createdBy: "test", createdSource: "test",
    })).rejects.toThrow();
    await expect(db.insert(schema.labsArtifacts).values({
      id: "artifact.role-aware-defense-nav.v1", kind: "report", contentDigest: SECOND_DIGEST, implementationIdentity: "test", mediaType: "text/plain",
      artifactSchemaVersion: "v1", repositoryCommit: COMMIT, repositoryPath: "docs/report.txt", immutableReference: null, byteSize: 1,
      metadataSchemaVersion: 1, createdAt: 1, createdBy: "test", createdSource: "test",
    })).rejects.toThrow();
  });
});
