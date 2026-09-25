// ── Analytics Labs controlled registration (Phase 5A.1) ───────────────────
//
// This is a server-only service boundary, deliberately not an API route or a
// Server Action. A later separately-authorized entry point may call it only
// after supplying an authenticated Request. It writes metadata transactionally
// but never imports candidate code, evaluates a model, or selects production
// runtime behaviour.

import { and, eq } from "drizzle-orm";
import { isDeepStrictEqual } from "node:util";
import {
  labsArtifacts,
  labsCandidateArtifacts,
  labsCandidateLifecycleEvents,
  labsCandidates,
  labsEvaluationProtocolGates,
  labsEvaluationProtocolMetrics,
  labsEvaluationProtocols,
} from "@/app/db/schema";
import { requireAdmin } from "@/app/lib/admin-auth";
import {
  LABS_METADATA_SCHEMA_VERSION,
  LabsCandidateIntegrityError,
  validateArtifactDefinition,
  validateCandidateLifecycleHistory,
  validateCandidateTarget,
  getLabCandidate,
  type ArtifactKind,
  type CandidateExposure,
  type CandidateLifecycleEvent,
  type LabArtifactDefinition,
  type LabCandidate,
} from "@/app/lib/labs-candidates";
import {
  LABS_EVALUATION_SCHEMA_VERSION,
  LabsEvaluationIntegrityError,
  fingerprintEvaluationProtocol,
  getEvaluationProtocol,
  validateEvaluationProtocol,
  type EvaluationProtocol,
} from "@/app/lib/labs-evaluations";
import { requireCompleteSeasonSnapshotBatch } from "@/app/lib/season-snapshot";

const STABLE_ID = /^[a-z][a-z0-9._:-]{2,127}$/;

type LabsWriteDb = {
  select: (...args: any[]) => any;
  insert: (...args: any[]) => any;
  transaction: <T>(operation: (tx: any) => Promise<T>) => Promise<T>;
};

export class LabsRegistrationAuthorizationError extends Error {
  constructor() {
    super("Admin authorization is required for Analytics Labs registration.");
    this.name = "LabsRegistrationAuthorizationError";
  }
}

export class LabsRegistrationConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LabsRegistrationConflictError";
  }
}

export interface CandidateRegistrationDefinition {
  id: string;
  targetAnalyticId: string;
  name: string;
  revision: string;
  implementationIdentity: string;
  baseAnalyticVersion: string;
  baseImplementationIdentity: string;
  exposure: CandidateExposure;
  datasetBatchId: string;
  description: string | null;
  hypothesis: string | null;
  metadataSchemaVersion: number;
  createdAt: number;
}

export interface CandidateArtifactRegistrationReference {
  artifact: LabArtifactDefinition;
  role: ArtifactKind;
  attachedAt: number;
}

export interface InitialCandidateLifecycleRegistration {
  id: string;
  occurredAt: number;
  note: string | null;
  evidenceReference: string | null;
}

export interface CandidateProtocolRegistrationInput {
  /** Explicit provenance for every record written in this one transaction. */
  actor: string;
  source: string;
  candidate: CandidateRegistrationDefinition;
  artifacts: readonly CandidateArtifactRegistrationReference[];
  initialLifecycleEvent: InitialCandidateLifecycleRegistration;
  /** The service calculates its canonical fingerprint; callers cannot supply one. */
  protocol: Omit<EvaluationProtocol, "fingerprint" | "createdBy" | "createdSource">;
}

export interface CandidateProtocolRegistrationResult {
  candidate: LabCandidate;
  protocol: EvaluationProtocol;
  /** False means a byte-for-byte equivalent retry reused immutable records. */
  created: boolean;
}

function assertStableId(label: string, value: string): void {
  if (!STABLE_ID.test(value)) throw new LabsCandidateIntegrityError(`${label} must be a stable lowercase ID.`);
}

function assertNonEmpty(label: string, value: string): void {
  if (!value.trim()) throw new LabsCandidateIntegrityError(`${label} is required.`);
}

function assertTimestamp(label: string, value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new LabsCandidateIntegrityError(`${label} must be a non-negative integer timestamp.`);
  }
}

function sameJson(left: unknown, right: unknown): boolean {
  return isDeepStrictEqual(left, right);
}

function buildProtocol(input: CandidateProtocolRegistrationInput): EvaluationProtocol {
  const protocol = {
    ...input.protocol,
    createdBy: input.actor,
    createdSource: input.source,
    metrics: [...input.protocol.metrics]
      .map(metric => ({ ...metric, requiredCohorts: [...metric.requiredCohorts].sort() }))
      .sort((left, right) => left.id.localeCompare(right.id)),
    gates: [...input.protocol.gates]
      .map(gate => ({ ...gate }))
      .sort((left, right) => left.id.localeCompare(right.id)),
  };
  return {
    ...protocol,
    fingerprint: fingerprintEvaluationProtocol(protocol),
  };
}

function assertImmutableArtifactReference(artifact: LabArtifactDefinition): void {
  const repositoryReference = artifact.repositoryCommit !== null && artifact.repositoryPath !== null;
  const digestReference = artifact.immutableReference === `sha256:${artifact.contentDigest}`;
  if (!repositoryReference && !digestReference) {
    throw new LabsCandidateIntegrityError(
      `Artifact ${artifact.id} requires a repository commit/path pair or a sha256: immutable reference matching its digest.`,
    );
  }
}

function buildInitialLifecycleEvent(input: CandidateProtocolRegistrationInput): CandidateLifecycleEvent {
  return {
    id: input.initialLifecycleEvent.id,
    candidateId: input.candidate.id,
    sequence: 1,
    eventType: "DRAFT_CREATED",
    previousStatus: null,
    resultingStatus: "DRAFT",
    occurredAt: input.initialLifecycleEvent.occurredAt,
    actor: input.actor,
    source: input.source,
    note: input.initialLifecycleEvent.note,
    evidenceReference: input.initialLifecycleEvent.evidenceReference,
    metadataSchemaVersion: LABS_METADATA_SCHEMA_VERSION,
  };
}

/** Validate all semantic facts before any transaction can begin. */
async function validateRegistrationInput(db: LabsWriteDb, input: CandidateProtocolRegistrationInput): Promise<{
  protocol: EvaluationProtocol;
  lifecycleEvent: CandidateLifecycleEvent;
}> {
  assertNonEmpty("Registration actor", input.actor);
  assertNonEmpty("Registration source", input.source);
  const candidate = input.candidate;
  assertStableId("Candidate ID", candidate.id);
  assertStableId("Candidate revision", candidate.revision);
  assertNonEmpty("Candidate name", candidate.name);
  assertNonEmpty("Candidate implementation identity", candidate.implementationIdentity);
  assertTimestamp("Candidate creation timestamp", candidate.createdAt);
  if (candidate.metadataSchemaVersion !== LABS_METADATA_SCHEMA_VERSION) {
    throw new LabsCandidateIntegrityError("Candidate metadata schema version is unsupported.");
  }
  if (candidate.exposure !== "internal" && candidate.exposure !== "research") {
    throw new LabsCandidateIntegrityError("Candidate exposure must remain internal or research.");
  }
  const target = validateCandidateTarget(candidate.targetAnalyticId);
  if (candidate.baseAnalyticVersion !== target.version.value || candidate.baseImplementationIdentity !== target.implementation) {
    throw new LabsCandidateIntegrityError("Candidate base identity must match the current declared catalog target.");
  }
  if (target.lifecycle === "DIAGNOSTIC" && candidate.exposure !== "research") {
    throw new LabsCandidateIntegrityError("Diagnostic targets may be registered only as research candidates.");
  }
  await requireCompleteSeasonSnapshotBatch(db as any, candidate.datasetBatchId);

  if (input.artifacts.length === 0 || !input.artifacts.some(reference => reference.role === "implementation")) {
    throw new LabsCandidateIntegrityError("Candidate registration requires an immutable implementation artifact.");
  }
  const artifactIds = new Set<string>();
  const artifactDigests = new Set<string>();
  for (const reference of input.artifacts) {
    validateArtifactDefinition(reference.artifact);
    assertTimestamp("Artifact attachment timestamp", reference.attachedAt);
    assertTimestamp("Artifact creation timestamp", reference.artifact.createdAt);
    assertImmutableArtifactReference(reference.artifact);
    if (!reference.artifact.createdBy.trim() || !reference.artifact.createdSource.trim()) {
      throw new LabsCandidateIntegrityError(`Artifact ${reference.artifact.id} is missing immutable provenance metadata.`);
    }
    if (reference.attachedAt !== candidate.createdAt) {
      throw new LabsCandidateIntegrityError(`Artifact ${reference.artifact.id} attachment timestamp must match the atomic registration timestamp.`);
    }
    if (reference.artifact.implementationIdentity !== candidate.implementationIdentity || reference.role !== reference.artifact.kind) {
      throw new LabsCandidateIntegrityError(`Artifact ${reference.artifact.id} does not match the candidate implementation identity and role.`);
    }
    if (artifactIds.has(reference.artifact.id) || artifactDigests.has(reference.artifact.contentDigest)) {
      throw new LabsCandidateIntegrityError("Candidate registration cannot repeat an artifact ID or immutable digest.");
    }
    artifactIds.add(reference.artifact.id);
    artifactDigests.add(reference.artifact.contentDigest);
  }

  const lifecycleEvent = buildInitialLifecycleEvent(input);
  assertStableId("Lifecycle event ID", lifecycleEvent.id);
  assertTimestamp("Lifecycle event timestamp", lifecycleEvent.occurredAt);
  if (lifecycleEvent.occurredAt !== candidate.createdAt) {
    throw new LabsCandidateIntegrityError("Initial lifecycle timestamp must match the atomic registration timestamp.");
  }
  validateCandidateLifecycleHistory(candidate.id, [lifecycleEvent]);

  const protocol = buildProtocol(input);
  if (protocol.targetAnalyticId !== candidate.targetAnalyticId) {
    throw new LabsEvaluationIntegrityError("A registration protocol must target the same analytic as its candidate.");
  }
  if (protocol.schemaVersion !== LABS_EVALUATION_SCHEMA_VERSION) {
    throw new LabsEvaluationIntegrityError("Evaluation protocol schema version is unsupported.");
  }
  if (protocol.createdAt !== candidate.createdAt) {
    throw new LabsEvaluationIntegrityError("Candidate and frozen protocol must share the registration timestamp.");
  }
  validateEvaluationProtocol(protocol);
  return { protocol, lifecycleEvent };
}

function candidateMatches(
  candidate: LabCandidate,
  input: CandidateProtocolRegistrationInput,
  lifecycleEvent: CandidateLifecycleEvent,
): boolean {
  const expected = input.candidate;
  if (
    candidate.id !== expected.id
    || candidate.targetAnalytic.id !== expected.targetAnalyticId
    || candidate.name !== expected.name
    || candidate.revision !== expected.revision
    || candidate.implementationIdentity !== expected.implementationIdentity
    || candidate.baseAnalyticVersion !== expected.baseAnalyticVersion
    || candidate.baseImplementationIdentity !== expected.baseImplementationIdentity
    || candidate.exposure !== expected.exposure
    || candidate.dataset.id !== expected.datasetBatchId
    || candidate.description !== expected.description
    || candidate.hypothesis !== expected.hypothesis
    || candidate.metadataSchemaVersion !== expected.metadataSchemaVersion
    || candidate.createdAt !== expected.createdAt
    || candidate.createdBy !== input.actor
    || candidate.createdSource !== input.source
    || candidate.lifecycleStatus !== "DRAFT"
    || candidate.lifecycleHistory.length !== 1
    || !sameJson(candidate.lifecycleHistory[0], lifecycleEvent)
    || candidate.artifacts.length !== input.artifacts.length
  ) return false;

  const expectedArtifacts = [...input.artifacts].sort((left, right) => left.artifact.id.localeCompare(right.artifact.id));
  const actualArtifacts = [...candidate.artifacts].sort((left, right) => left.artifact.id.localeCompare(right.artifact.id));
  return actualArtifacts.every((actual, index) => {
    const expectedArtifact = expectedArtifacts[index]!;
    return actual.role === expectedArtifact.role
      && actual.attachedAt === expectedArtifact.attachedAt
      && actual.attachedBy === input.actor
      && sameJson(actual.artifact, expectedArtifact.artifact);
  });
}

function protocolMatches(protocol: EvaluationProtocol, expected: EvaluationProtocol): boolean {
  return sameJson(protocol, expected);
}

async function readEquivalentRegistration(
  db: LabsWriteDb,
  input: CandidateProtocolRegistrationInput,
  protocol: EvaluationProtocol,
  lifecycleEvent: CandidateLifecycleEvent,
): Promise<CandidateProtocolRegistrationResult | null> {
  try {
    const [candidate, persistedProtocol] = await Promise.all([
      getLabCandidate(db as any, input.candidate.id),
      getEvaluationProtocol(db as any, protocol.id),
    ]);
    if (!candidateMatches(candidate, input, lifecycleEvent) || !protocolMatches(persistedProtocol, protocol)) {
      throw new LabsRegistrationConflictError("The requested candidate or protocol identity already exists with different immutable metadata.");
    }
    return Object.freeze({ candidate, protocol: persistedProtocol, created: false });
  } catch (error) {
    if (error instanceof LabsRegistrationConflictError) throw error;
    return null;
  }
}

async function assertNoConflictingIdentity(tx: any, input: CandidateProtocolRegistrationInput, protocol: EvaluationProtocol): Promise<ReadonlySet<string>> {
  const [candidateByRevision, protocolByVersion] = await Promise.all([
    tx.select({ id: labsCandidates.id }).from(labsCandidates)
      .where(and(eq(labsCandidates.targetAnalyticId, input.candidate.targetAnalyticId), eq(labsCandidates.revision, input.candidate.revision))),
    tx.select({ id: labsEvaluationProtocols.id }).from(labsEvaluationProtocols)
      .where(and(eq(labsEvaluationProtocols.targetAnalyticId, protocol.targetAnalyticId), eq(labsEvaluationProtocols.version, protocol.version))),
  ]);
  if (candidateByRevision[0] || protocolByVersion[0]) {
    throw new LabsRegistrationConflictError("Candidate revision or protocol version is already bound to a different immutable identity.");
  }
  const existingArtifactIds = new Set<string>();
  for (const reference of input.artifacts) {
    const [byId, byDigest] = await Promise.all([
      tx.select().from(labsArtifacts).where(eq(labsArtifacts.id, reference.artifact.id)),
      tx.select().from(labsArtifacts).where(eq(labsArtifacts.contentDigest, reference.artifact.contentDigest)),
    ]);
    if (byId[0] && byDigest[0] && byId[0].id !== byDigest[0].id) {
      throw new LabsRegistrationConflictError(`Artifact ID and digest resolve to different immutable records for ${reference.artifact.id}.`);
    }
    const existing = byId[0] ?? byDigest[0];
    if (existing && !sameJson({
      id: existing.id, kind: existing.kind, contentDigest: existing.contentDigest,
      implementationIdentity: existing.implementationIdentity, mediaType: existing.mediaType,
      artifactSchemaVersion: existing.artifactSchemaVersion, repositoryCommit: existing.repositoryCommit,
      repositoryPath: existing.repositoryPath, immutableReference: existing.immutableReference,
      byteSize: existing.byteSize, metadataSchemaVersion: existing.metadataSchemaVersion,
      createdAt: existing.createdAt, createdBy: existing.createdBy, createdSource: existing.createdSource,
    }, reference.artifact)) {
      throw new LabsRegistrationConflictError(`Artifact immutable identity conflicts for ${reference.artifact.id}.`);
    }
    if (existing) existingArtifactIds.add(existing.id);
  }
  return existingArtifactIds;
}

async function persistRegistration(
  db: LabsWriteDb,
  input: CandidateProtocolRegistrationInput,
  protocol: EvaluationProtocol,
  lifecycleEvent: CandidateLifecycleEvent,
): Promise<void> {
  await db.transaction(async tx => {
    const [existingCandidate, existingProtocol] = await Promise.all([
      tx.select({ id: labsCandidates.id }).from(labsCandidates).where(eq(labsCandidates.id, input.candidate.id)),
      tx.select({ id: labsEvaluationProtocols.id }).from(labsEvaluationProtocols).where(eq(labsEvaluationProtocols.id, protocol.id)),
    ]);
    if (existingCandidate[0] || existingProtocol[0]) {
      throw new LabsRegistrationConflictError("Candidate and protocol records must be registered atomically; only an exact retry may reuse them.");
    }
    const existingArtifactIds = await assertNoConflictingIdentity(tx, input, protocol);

    await tx.insert(labsCandidates).values({
      ...input.candidate,
      schemaVersion: input.candidate.metadataSchemaVersion,
      createdBy: input.actor,
      createdSource: input.source,
    });
    const newArtifacts = input.artifacts
      .map(reference => reference.artifact)
      .filter(artifact => !existingArtifactIds.has(artifact.id));
    if (newArtifacts.length > 0) await tx.insert(labsArtifacts).values(newArtifacts);
    await tx.insert(labsCandidateArtifacts).values(input.artifacts.map(reference => ({
      candidateId: input.candidate.id,
      artifactId: reference.artifact.id,
      role: reference.role,
      attachedAt: reference.attachedAt,
      attachedBy: input.actor,
    })));
    await tx.insert(labsCandidateLifecycleEvents).values(lifecycleEvent);
    await tx.insert(labsEvaluationProtocols).values({ ...protocol });
    await tx.insert(labsEvaluationProtocolMetrics).values(protocol.metrics.map(metric => ({
      protocolId: protocol.id,
      metricId: metric.id,
      name: metric.name,
      unit: metric.unit,
      requiredCohorts: JSON.stringify([...metric.requiredCohorts].sort()),
      definition: metric.definition,
      metadataSchemaVersion: metric.metadataSchemaVersion,
    })));
    await tx.insert(labsEvaluationProtocolGates).values(protocol.gates.map(gate => ({
      protocolId: protocol.id,
      gateId: gate.id,
      metricId: gate.metricId,
      cohortId: gate.cohortId,
      operator: gate.operator,
      thresholdValue: gate.thresholdValue,
      unit: gate.unit,
      required: gate.required ? 1 : 0,
      description: gate.description,
      metadataSchemaVersion: gate.metadataSchemaVersion,
    })));
  });
}

/**
 * Authenticated, atomic candidate + protocol registration. It creates one
 * DRAFT_CREATED event only; lifecycle advancement is deliberately deferred.
 */
export async function registerCandidateAndProtocol(
  request: Request,
  db: LabsWriteDb,
  input: CandidateProtocolRegistrationInput,
): Promise<CandidateProtocolRegistrationResult> {
  const denied = await requireAdmin(request);
  if (denied) throw new LabsRegistrationAuthorizationError();
  if (typeof db.transaction !== "function") throw new LabsRegistrationConflictError("Labs registration requires transactional database support.");

  const { protocol, lifecycleEvent } = await validateRegistrationInput(db, input);
  const existing = await readEquivalentRegistration(db, input, protocol, lifecycleEvent);
  if (existing) return existing;

  try {
    await persistRegistration(db, input, protocol, lifecycleEvent);
  } catch (error) {
    // A conflicting concurrent retry may have committed first. Only accept it
    // after re-reading every immutable record and proving exact equivalence.
    const retry = await readEquivalentRegistration(db, input, protocol, lifecycleEvent);
    if (retry) return retry;
    throw error;
  }

  const registered = await readEquivalentRegistration(db, input, protocol, lifecycleEvent);
  if (!registered) throw new LabsRegistrationConflictError("Registration committed but could not be re-read as coherent immutable metadata.");
  return Object.freeze({ ...registered, created: true });
}
