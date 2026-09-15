// ── Analytics Labs candidate provenance (Phase 3) ──────────────────────────
//
// This module is deliberately a read-only domain boundary. It validates
// candidate metadata and immutable provenance but never imports candidate code,
// selects a calculator, evaluates a model, or changes production state.

import {
  labsArtifacts,
  labsCandidateArtifacts,
  labsCandidateLifecycleEvents,
  labsCandidates,
} from "@/app/db/schema";
import {
  getAnalyticDefinition,
  type AnalyticDefinition,
} from "@/app/lib/production-analytics";
import {
  requireCompleteSeasonSnapshotBatch,
  type SeasonSnapshotBatch,
} from "@/app/lib/season-snapshot";

export const LABS_METADATA_SCHEMA_VERSION = 1 as const;

export const CANDIDATE_LIFECYCLE_STATUSES = ["DRAFT", "REGISTERED", "RETIRED"] as const;
export type CandidateLifecycleStatus = typeof CANDIDATE_LIFECYCLE_STATUSES[number];

export const CANDIDATE_LIFECYCLE_EVENT_TYPES = ["DRAFT_CREATED", "REGISTERED", "RETIRED"] as const;
export type CandidateLifecycleEventType = typeof CANDIDATE_LIFECYCLE_EVENT_TYPES[number];

export const CANDIDATE_EXPOSURES = ["internal", "research"] as const;
export type CandidateExposure = typeof CANDIDATE_EXPOSURES[number];

export const ARTIFACT_KINDS = ["implementation", "fitted-model", "configuration", "report"] as const;
export type ArtifactKind = typeof ARTIFACT_KINDS[number];

const STABLE_ID = /^[a-z][a-z0-9._:-]{2,127}$/;
const SHA_256 = /^[a-f0-9]{64}$/;
const GIT_COMMIT = /^[a-f0-9]{40}$/;

type LabsReadDb = {
  select: (...args: any[]) => any;
};

export class LabsCandidateIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LabsCandidateIntegrityError";
  }
}

export interface LabArtifactDefinition {
  id: string;
  kind: ArtifactKind;
  contentDigest: string;
  implementationIdentity: string;
  mediaType: string;
  artifactSchemaVersion: string;
  repositoryCommit: string | null;
  repositoryPath: string | null;
  immutableReference: string | null;
  byteSize: number | null;
  metadataSchemaVersion: number;
  createdAt: number;
  createdBy: string;
  createdSource: string;
}

export interface CandidateLifecycleEvent {
  id: string;
  candidateId: string;
  sequence: number;
  eventType: CandidateLifecycleEventType;
  previousStatus: CandidateLifecycleStatus | null;
  resultingStatus: CandidateLifecycleStatus;
  occurredAt: number;
  actor: string;
  source: string;
  note: string | null;
  evidenceReference: string | null;
  metadataSchemaVersion: number;
}

export interface LabCandidateArtifactReference {
  artifact: LabArtifactDefinition;
  role: ArtifactKind;
  attachedAt: number;
  attachedBy: string;
}

export interface LabCandidate {
  id: string;
  targetAnalytic: AnalyticDefinition;
  name: string;
  revision: string;
  implementationIdentity: string;
  baseAnalyticVersion: string;
  baseImplementationIdentity: string;
  exposure: CandidateExposure;
  dataset: SeasonSnapshotBatch;
  description: string | null;
  hypothesis: string | null;
  metadataSchemaVersion: number;
  createdAt: number;
  createdBy: string;
  createdSource: string;
  artifacts: readonly LabCandidateArtifactReference[];
  lifecycleHistory: readonly CandidateLifecycleEvent[];
  lifecycleStatus: CandidateLifecycleStatus;
  /** Always false in Phase 3; candidate metadata cannot resolve as production. */
  productionResolvable: false;
}

const includes = <T extends readonly string[]>(values: T, value: string): value is T[number] =>
  (values as readonly string[]).includes(value);

function assertStableId(label: string, value: string): void {
  if (!STABLE_ID.test(value)) throw new LabsCandidateIntegrityError(`${label} must be a stable lowercase ID.`);
}

function assertMetadataSchemaVersion(value: number): void {
  if (value !== LABS_METADATA_SCHEMA_VERSION) {
    throw new LabsCandidateIntegrityError(`Unsupported Labs metadata schema version: ${value}.`);
  }
}

/**
 * Candidate targets are metadata references to the code-backed catalog, never
 * database copies or runtime selector keys. Gravity v4 may be studied as a
 * diagnostic research target; research-only and display aggregation records
 * cannot be candidate targets because neither describes a candidate calculator.
 */
export function validateCandidateTarget(targetAnalyticId: string): AnalyticDefinition {
  const target = getAnalyticDefinition(targetAnalyticId);
  if (target.calculationRole === "display-aggregation") {
    throw new LabsCandidateIntegrityError(`Display aggregation ${targetAnalyticId} cannot be a candidate target.`);
  }
  if (target.lifecycle === "RESEARCH") {
    throw new LabsCandidateIntegrityError(`Research record ${targetAnalyticId} cannot be a candidate target.`);
  }
  return target;
}

export function validateArtifactDefinition(artifact: LabArtifactDefinition): void {
  assertStableId("Artifact ID", artifact.id);
  if (!includes(ARTIFACT_KINDS, artifact.kind)) throw new LabsCandidateIntegrityError(`Unknown artifact kind: ${artifact.kind}.`);
  if (!SHA_256.test(artifact.contentDigest)) throw new LabsCandidateIntegrityError(`Artifact ${artifact.id} must carry a lowercase SHA-256 digest.`);
  if (!artifact.implementationIdentity || !artifact.mediaType || !artifact.artifactSchemaVersion) {
    throw new LabsCandidateIntegrityError(`Artifact ${artifact.id} is missing immutable identity metadata.`);
  }
  if (artifact.repositoryCommit !== null && !GIT_COMMIT.test(artifact.repositoryCommit)) {
    throw new LabsCandidateIntegrityError(`Artifact ${artifact.id} has an invalid immutable repository commit.`);
  }
  if (artifact.repositoryPath !== null && artifact.repositoryCommit === null && artifact.immutableReference === null) {
    throw new LabsCandidateIntegrityError(`Artifact ${artifact.id} cannot use a mutable repository path as its only reference.`);
  }
  if (artifact.byteSize !== null && (!Number.isInteger(artifact.byteSize) || artifact.byteSize < 0)) {
    throw new LabsCandidateIntegrityError(`Artifact ${artifact.id} has an invalid byte size.`);
  }
  assertMetadataSchemaVersion(artifact.metadataSchemaVersion);
}

function validateLifecycleEventShape(event: CandidateLifecycleEvent): void {
  assertStableId("Lifecycle event ID", event.id);
  if (!Number.isInteger(event.sequence) || event.sequence < 1) {
    throw new LabsCandidateIntegrityError(`Lifecycle event ${event.id} has an invalid sequence.`);
  }
  if (!includes(CANDIDATE_LIFECYCLE_EVENT_TYPES, event.eventType)) {
    throw new LabsCandidateIntegrityError(`Lifecycle event ${event.id} has an unknown event type.`);
  }
  if (event.previousStatus !== null && !includes(CANDIDATE_LIFECYCLE_STATUSES, event.previousStatus)) {
    throw new LabsCandidateIntegrityError(`Lifecycle event ${event.id} has an unknown previous status.`);
  }
  if (!includes(CANDIDATE_LIFECYCLE_STATUSES, event.resultingStatus)) {
    throw new LabsCandidateIntegrityError(`Lifecycle event ${event.id} has an unknown resulting status.`);
  }
  assertMetadataSchemaVersion(event.metadataSchemaVersion);
}

/** Sequence is authoritative; timestamps are descriptive provenance only. */
export function validateCandidateLifecycleHistory(
  candidateId: string,
  history: readonly CandidateLifecycleEvent[],
): CandidateLifecycleStatus {
  if (history.length === 0) throw new LabsCandidateIntegrityError(`Candidate ${candidateId} has no lifecycle history.`);
  const ordered = [...history].sort((a, b) => a.sequence - b.sequence);
  let current: CandidateLifecycleStatus | null = null;
  for (const [index, event] of ordered.entries()) {
    validateLifecycleEventShape(event);
    if (event.candidateId !== candidateId) throw new LabsCandidateIntegrityError(`Lifecycle event ${event.id} belongs to another candidate.`);
    if (event.sequence !== index + 1) throw new LabsCandidateIntegrityError(`Candidate ${candidateId} lifecycle sequence is not contiguous.`);
    if (index === 0) {
      if (event.eventType !== "DRAFT_CREATED" || event.previousStatus !== null || event.resultingStatus !== "DRAFT") {
        throw new LabsCandidateIntegrityError(`Candidate ${candidateId} must begin with a DRAFT_CREATED event.`);
      }
    } else if (event.eventType === "REGISTERED") {
      if (current !== "DRAFT" || event.previousStatus !== "DRAFT" || event.resultingStatus !== "REGISTERED") {
        throw new LabsCandidateIntegrityError(`Candidate ${candidateId} has an incoherent REGISTERED transition.`);
      }
    } else if (event.eventType === "RETIRED") {
      if ((current !== "DRAFT" && current !== "REGISTERED") || event.previousStatus !== current || event.resultingStatus !== "RETIRED") {
        throw new LabsCandidateIntegrityError(`Candidate ${candidateId} has an incoherent RETIRED transition.`);
      }
    } else {
      throw new LabsCandidateIntegrityError(`Candidate ${candidateId} cannot repeat its initial lifecycle event.`);
    }
    current = event.resultingStatus;
  }
  return current!;
}

function asArtifact(row: typeof labsArtifacts.$inferSelect): LabArtifactDefinition {
  const artifact: LabArtifactDefinition = {
    id: row.id,
    kind: row.kind as ArtifactKind,
    contentDigest: row.contentDigest,
    implementationIdentity: row.implementationIdentity,
    mediaType: row.mediaType,
    artifactSchemaVersion: row.artifactSchemaVersion,
    repositoryCommit: row.repositoryCommit,
    repositoryPath: row.repositoryPath,
    immutableReference: row.immutableReference,
    byteSize: row.byteSize,
    metadataSchemaVersion: row.metadataSchemaVersion,
    createdAt: row.createdAt,
    createdBy: row.createdBy,
    createdSource: row.createdSource,
  };
  validateArtifactDefinition(artifact);
  return Object.freeze(artifact);
}

function asLifecycleEvent(row: typeof labsCandidateLifecycleEvents.$inferSelect): CandidateLifecycleEvent {
  return Object.freeze({
    id: row.id,
    candidateId: row.candidateId,
    sequence: row.sequence,
    eventType: row.eventType as CandidateLifecycleEventType,
    previousStatus: row.previousStatus as CandidateLifecycleStatus | null,
    resultingStatus: row.resultingStatus as CandidateLifecycleStatus,
    occurredAt: row.occurredAt,
    actor: row.actor,
    source: row.source,
    note: row.note,
    evidenceReference: row.evidenceReference,
    metadataSchemaVersion: row.metadataSchemaVersion,
  });
}

function validateCandidateRow(row: typeof labsCandidates.$inferSelect, target: AnalyticDefinition): void {
  assertStableId("Candidate ID", row.id);
  assertStableId("Candidate revision", row.revision);
  if (!includes(CANDIDATE_EXPOSURES, row.exposure)) throw new LabsCandidateIntegrityError(`Candidate ${row.id} has an invalid exposure.`);
  if (!row.name || !row.implementationIdentity || !row.createdBy || !row.createdSource) {
    throw new LabsCandidateIntegrityError(`Candidate ${row.id} is missing required provenance metadata.`);
  }
  if (row.baseAnalyticVersion !== target.version.value || row.baseImplementationIdentity !== target.implementation) {
    throw new LabsCandidateIntegrityError(`Candidate ${row.id} does not challenge the current declared target identity.`);
  }
  assertMetadataSchemaVersion(row.schemaVersion);
}

function freezeCandidate(candidate: Omit<LabCandidate, "productionResolvable">): LabCandidate {
  return Object.freeze({
    ...candidate,
    artifacts: Object.freeze(candidate.artifacts.map(reference => Object.freeze({
      ...reference,
      artifact: Object.freeze({ ...reference.artifact }),
    }))),
    lifecycleHistory: Object.freeze(candidate.lifecycleHistory.map(event => Object.freeze({ ...event }))),
    productionResolvable: false as const,
  });
}

/**
 * Server-only read boundary. Any missing artifact, incoherent history, unknown
 * catalog identity, or non-COMPLETE dataset causes the record to fail closed.
 */
export async function listLabCandidates(db: LabsReadDb): Promise<readonly LabCandidate[]> {
  const [candidateRows, artifactRows, attachmentRows, eventRows] = await Promise.all([
    db.select().from(labsCandidates),
    db.select().from(labsArtifacts),
    db.select().from(labsCandidateArtifacts),
    db.select().from(labsCandidateLifecycleEvents),
  ]);
  const artifactsById = new Map<string, LabArtifactDefinition>(
    (artifactRows as Array<typeof labsArtifacts.$inferSelect>).map(row => [row.id, asArtifact(row)]),
  );
  const attachmentsByCandidate = new Map<string, Array<typeof labsCandidateArtifacts.$inferSelect>>();
  for (const attachment of attachmentRows as Array<typeof labsCandidateArtifacts.$inferSelect>) {
    const current = attachmentsByCandidate.get(attachment.candidateId) ?? [];
    current.push(attachment);
    attachmentsByCandidate.set(attachment.candidateId, current);
  }
  const eventsByCandidate = new Map<string, CandidateLifecycleEvent[]>();
  for (const event of eventRows as Array<typeof labsCandidateLifecycleEvents.$inferSelect>) {
    const current = eventsByCandidate.get(event.candidateId) ?? [];
    current.push(asLifecycleEvent(event));
    eventsByCandidate.set(event.candidateId, current);
  }

  const candidates: LabCandidate[] = [];
  for (const row of candidateRows as Array<typeof labsCandidates.$inferSelect>) {
    const target = validateCandidateTarget(row.targetAnalyticId);
    validateCandidateRow(row, target);
    const dataset = await requireCompleteSeasonSnapshotBatch(db as any, row.datasetBatchId);
    const lifecycleHistory = eventsByCandidate.get(row.id) ?? [];
    const lifecycleStatus = validateCandidateLifecycleHistory(row.id, lifecycleHistory);
    const attachments = attachmentsByCandidate.get(row.id) ?? [];
    const seenArtifactIds = new Set<string>();
    const artifacts = attachments.map(attachment => {
      if (seenArtifactIds.has(attachment.artifactId)) throw new LabsCandidateIntegrityError(`Candidate ${row.id} repeats artifact ${attachment.artifactId}.`);
      seenArtifactIds.add(attachment.artifactId);
      const artifact = artifactsById.get(attachment.artifactId);
      if (!artifact) throw new LabsCandidateIntegrityError(`Candidate ${row.id} references missing artifact ${attachment.artifactId}.`);
      if (attachment.role !== artifact.kind) throw new LabsCandidateIntegrityError(`Candidate ${row.id} assigns artifact ${artifact.id} an incompatible role.`);
      return { artifact, role: attachment.role as ArtifactKind, attachedAt: attachment.attachedAt, attachedBy: attachment.attachedBy };
    });
    candidates.push(freezeCandidate({
      id: row.id,
      targetAnalytic: target,
      name: row.name,
      revision: row.revision,
      implementationIdentity: row.implementationIdentity,
      baseAnalyticVersion: row.baseAnalyticVersion,
      baseImplementationIdentity: row.baseImplementationIdentity,
      exposure: row.exposure as CandidateExposure,
      dataset,
      description: row.description,
      hypothesis: row.hypothesis,
      metadataSchemaVersion: row.schemaVersion,
      createdAt: row.createdAt,
      createdBy: row.createdBy,
      createdSource: row.createdSource,
      artifacts,
      lifecycleHistory: [...lifecycleHistory].sort((a, b) => a.sequence - b.sequence),
      lifecycleStatus,
    }));
  }
  return Object.freeze(candidates.sort((a, b) => b.createdAt - a.createdAt || a.id.localeCompare(b.id)));
}

export async function getLabCandidate(db: LabsReadDb, candidateId: string): Promise<LabCandidate> {
  assertStableId("Candidate ID", candidateId);
  const candidates = await listLabCandidates(db);
  const candidate = candidates.find(record => record.id === candidateId);
  if (!candidate) throw new LabsCandidateIntegrityError(`Unknown Labs candidate: ${candidateId}.`);
  return candidate;
}

/** Metadata-only proof used by tests: candidate reads cannot change production resolution. */
export function isCandidateProductionResolvable(candidate: LabCandidate): false {
  return candidate.productionResolvable;
}
