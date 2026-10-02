// Server-only internal planning boundary. No route, action, loader or execution.
import { and, eq, or } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import { labsEvaluationRunArtifacts, labsEvaluationRuns } from "@/app/db/schema";
import { requireAdmin } from "@/app/lib/admin-auth";
import { getLabCandidate } from "@/app/lib/labs-candidates";
import {
  getEvaluationProtocol, getEvaluationRun, LABS_EVALUATION_SCHEMA_VERSION,
  LabsEvaluationIntegrityError, type LabEvaluationRun,
} from "@/app/lib/labs-evaluations";
import { verifyCandidateRegistrationMetadata } from "@/app/lib/labs-registration.server";
import { getProductionAnalytic } from "@/app/lib/production-analytics";

type LabsPlanningDb = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  transaction: <T>(operation: (tx: any) => Promise<T>) => Promise<T>;
};

export class LabsPlanningAuthorizationError extends Error {
  constructor() {
    super("Admin authorization is required for Analytics Labs planning.");
    this.name = "LabsPlanningAuthorizationError";
  }
}

export class LabsPlanningConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LabsPlanningConflictError";
  }
}

export interface PlannedEvaluationRunInput {
  id: string;
  candidateId: string;
  candidateRevision: string;
  registrationEventId: string;
  protocolId: string;
  protocolFingerprint: string;
  datasetBatchId: string;
  baselineAnalyticId: string;
  baselineVersion: string;
  baselineImplementation: string;
  implementationCommit: string;
  /** A planned seed, never a claim that the seed has been used. */
  deterministicSeed: string;
  /** Required planned runtime/toolchain/dependency identities, not observed execution. */
  environment: { runtime: string; toolchain: string; dependencyDigest: string };
  artifacts: readonly { artifactId: string; contentDigest: string }[];
  createdAt: number;
  actor: string;
  source: string;
}

function isBusy(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const databaseError = error as { code?: string; cause?: unknown };
  return databaseError.code === "SQLITE_BUSY" || isBusy(databaseError.cause);
}

/** Authenticated atomic PLANNED creation; exact retries perform reads only. */
export async function planEvaluationRun(
  request: Request,
  db: LabsPlanningDb,
  input: PlannedEvaluationRunInput,
): Promise<{ run: LabEvaluationRun; created: boolean }> {
  const denied = await requireAdmin(request);
  if (denied) throw new LabsPlanningAuthorizationError();
  if (typeof db.transaction !== "function") throw new LabsPlanningConflictError("Labs planning requires transactional database support.");

  const fields = ["id", "candidateId", "candidateRevision", "registrationEventId", "protocolId", "protocolFingerprint",
    "datasetBatchId", "baselineAnalyticId", "baselineVersion", "baselineImplementation", "implementationCommit",
    "deterministicSeed", "environment", "artifacts", "createdAt", "actor", "source"];
  if (Object.keys(input).some(key => !fields.includes(key))
    || Object.keys(input.environment).some(key => !["runtime", "toolchain", "dependencyDigest"].includes(key))
    || input.artifacts.some(reference => Object.keys(reference).some(key => !["artifactId", "contentDigest"].includes(key)))) {
    throw new LabsEvaluationIntegrityError("Planning accepts only frozen planning fields; execution and result metadata are forbidden.");
  }
  // Copy caller-owned metadata before the first database await.
  const frozen = {
    id: input.id, candidateId: input.candidateId, candidateRevision: input.candidateRevision,
    registrationEventId: input.registrationEventId, protocolId: input.protocolId,
    protocolFingerprint: input.protocolFingerprint, datasetBatchId: input.datasetBatchId,
    baselineAnalyticId: input.baselineAnalyticId, baselineVersion: input.baselineVersion,
    baselineImplementation: input.baselineImplementation, implementationCommit: input.implementationCommit,
    deterministicSeed: input.deterministicSeed,
    environment: { runtime: input.environment.runtime, toolchain: input.environment.toolchain, dependencyDigest: input.environment.dependencyDigest },
    artifacts: input.artifacts.map(reference => ({ artifactId: reference.artifactId, contentDigest: reference.contentDigest }))
      .sort((a, b) => a.artifactId < b.artifactId ? -1 : a.artifactId > b.artifactId ? 1 : 0),
    createdAt: input.createdAt, actor: input.actor, source: input.source,
  };
  for (const value of [frozen.id, frozen.candidateId, frozen.candidateRevision, frozen.registrationEventId, frozen.protocolId]) {
    if (!/^[a-z][a-z0-9._:-]{2,127}$/.test(value)) throw new LabsEvaluationIntegrityError("Planning identities must be stable lowercase IDs.");
  }
  if (!/^[a-f0-9]{40}$/.test(frozen.implementationCommit)
    || !/^[a-f0-9]{64}$/.test(frozen.protocolFingerprint)
    || !/^[a-f0-9]{64}$/.test(frozen.environment.dependencyDigest)
    || !Number.isSafeInteger(frozen.createdAt) || frozen.createdAt < 0
    || [frozen.actor, frozen.source, frozen.deterministicSeed, frozen.environment.runtime, frozen.environment.toolchain]
      .some(value => typeof value !== "string" || !value.trim())) {
    throw new LabsEvaluationIntegrityError("Planning requires complete reproducibility and creation provenance.");
  }

  async function persist(tx: any): Promise<{ run: LabEvaluationRun; created: boolean }> {
    const candidate = await getLabCandidate(tx, frozen.candidateId);
    const protocol = await getEvaluationProtocol(tx, frozen.protocolId);
    await verifyCandidateRegistrationMetadata(tx, candidate, protocol);
    const registration = candidate.lifecycleHistory[1];
    if (candidate.lifecycleStatus !== "REGISTERED" || candidate.lifecycleHistory.length !== 2
      || registration?.eventType !== "REGISTERED" || registration.id !== frozen.registrationEventId
      || registration.evidenceReference !== JSON.stringify({ protocolId: protocol.id, fingerprint: protocol.fingerprint })
      || protocol.fingerprint !== frozen.protocolFingerprint || candidate.revision !== frozen.candidateRevision
      || candidate.dataset.id !== frozen.datasetBatchId || frozen.createdAt < registration.occurredAt) {
      throw new LabsPlanningConflictError("Planning must bind the current REGISTERED candidate and its exact frozen protocol, revision and dataset.");
    }
    const baseline = getProductionAnalytic(frozen.baselineAnalyticId);
    if (baseline.version.value !== frozen.baselineVersion || baseline.implementation !== frozen.baselineImplementation
      || baseline.family !== candidate.targetAnalytic.family || baseline.calculationRole !== candidate.targetAnalytic.calculationRole
      || (candidate.targetAnalytic.lifecycle === "PRODUCTION" && baseline.id !== candidate.targetAnalytic.id)) {
      throw new LabsPlanningConflictError("Planning baseline must be an eligible coherent production identity.");
    }
    const artifacts = candidate.artifacts.map(({ artifact }) => ({ artifactId: artifact.id, contentDigest: artifact.contentDigest }))
      .sort((a, b) => a.artifactId < b.artifactId ? -1 : a.artifactId > b.artifactId ? 1 : 0);
    if (!isDeepStrictEqual(artifacts, frozen.artifacts)
      || candidate.artifacts.some(({ artifact }) => artifact.kind === "implementation"
        && artifact.repositoryCommit !== null && artifact.repositoryCommit !== frozen.implementationCommit)) {
      throw new LabsPlanningConflictError("Planning artifact digests and implementation commit must match the frozen candidate.");
    }
    // The existing immutable-reference envelope stores the exact append-only
    // registration fact without adding a column or claiming execution.
    const environmentMetadata = JSON.stringify({
      schema: "labs-planned-environment/1", registrationEvent: registration,
      plannedEnvironment: frozen.environment, randomSeedPolicy: protocol.randomSeedPolicy,
    });
    const row: typeof labsEvaluationRuns.$inferInsert = {
      id: frozen.id, candidateId: candidate.id, candidateRevision: candidate.revision,
      candidateLifecycleStatus: "REGISTERED", protocolId: protocol.id, protocolFingerprint: protocol.fingerprint,
      datasetBatchId: candidate.dataset.id, baselineAnalyticId: baseline.id,
      baselineVersion: baseline.version.value, baselineImplementation: baseline.implementation,
      implementationCommit: frozen.implementationCommit, deterministicSeed: frozen.deterministicSeed,
      environmentMetadata, status: "PLANNED", startedAt: null, completedAt: null,
      resultSetFingerprint: null, failureReason: null, invalidationReason: null,
      schemaVersion: LABS_EVALUATION_SCHEMA_VERSION, createdAt: frozen.createdAt,
      createdBy: frozen.actor, createdSource: frozen.source,
    };
    const references = artifacts.map(artifact => ({
      runId: row.id, ...artifact, role: "candidate-input", attachedAt: row.createdAt, attachedBy: row.createdBy,
    }));
    const existing = await tx.select().from(labsEvaluationRuns).where(or(eq(labsEvaluationRuns.id, row.id), and(
      eq(labsEvaluationRuns.candidateId, row.candidateId), eq(labsEvaluationRuns.candidateRevision, row.candidateRevision),
      eq(labsEvaluationRuns.protocolId, row.protocolId), eq(labsEvaluationRuns.protocolFingerprint, row.protocolFingerprint),
      eq(labsEvaluationRuns.datasetBatchId, row.datasetBatchId), eq(labsEvaluationRuns.implementationCommit, row.implementationCommit),
    )));
    if (existing.length > 0) {
      const storedReferences = await tx.select().from(labsEvaluationRunArtifacts)
        .where(eq(labsEvaluationRunArtifacts.runId, row.id));
      storedReferences.sort((a: { artifactId: string }, b: { artifactId: string }) => a.artifactId < b.artifactId ? -1 : a.artifactId > b.artifactId ? 1 : 0);
      if (existing.length !== 1 || !isDeepStrictEqual(existing[0], row) || !isDeepStrictEqual(storedReferences, references)) {
        throw new LabsPlanningConflictError("Evaluation run identity already exists with different frozen planning metadata.");
      }
      return Object.freeze({ run: await getEvaluationRun(tx, row.id), created: false });
    }
    await tx.insert(labsEvaluationRuns).values(row);
    await tx.insert(labsEvaluationRunArtifacts).values(references);
    // Integrity failures here or during commit roll back the entire plan.
    return Object.freeze({ run: await getEvaluationRun(tx, row.id), created: true });
  }

  for (let attempt = 0; ; attempt++) {
    try {
      return await db.transaction(persist);
    } catch (error) {
      if (!isBusy(error) || attempt >= 6) throw error;
      // Restart validation on a fresh transaction after a competing commit.
      await new Promise(resolve => setTimeout(resolve, 10 * 2 ** attempt));
    }
  }
}
