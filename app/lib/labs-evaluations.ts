// ── Analytics Labs evaluation evidence (Phase 4) ───────────────────────────
// This server-only read boundary validates immutable planning and result
// metadata. It intentionally never imports candidate code, calculates a
// metric, selects production code, or creates/updates Labs records.

import { createHash } from "node:crypto";
import { asc, desc, eq, inArray } from "drizzle-orm";
import {
  labsArtifacts,
  labsEvaluationGateResults,
  labsEvaluationMetricObservations,
  labsEvaluationProtocolGates,
  labsEvaluationProtocolMetrics,
  labsEvaluationProtocols,
  labsEvaluationRunArtifacts,
  labsEvaluationRuns,
} from "@/app/db/schema";
import {
  LabsCandidateIntegrityError,
  getLabCandidate,
  validateCandidateTarget,
  type LabArtifactDefinition,
  type LabCandidate,
} from "@/app/lib/labs-candidates";
import { getProductionAnalytic, type ProductionAnalyticDefinition } from "@/app/lib/production-analytics";
import { requireCompleteSeasonSnapshotBatch, type SeasonSnapshotBatch } from "@/app/lib/season-snapshot";

export const LABS_EVALUATION_SCHEMA_VERSION = 1 as const;
export const MAX_LABS_EVALUATION_PROTOCOL_OVERVIEW = 100;
export const MAX_LABS_EVALUATION_RUN_OVERVIEW = 100;
const MAX_PROTOCOL_CHILDREN = 1_000;
const MAX_RUN_CHILDREN = 5_000;

export const EVALUATION_RUN_STATUSES = ["PLANNED", "COMPLETED", "FAILED", "INVALIDATED"] as const;
export type EvaluationRunStatus = typeof EVALUATION_RUN_STATUSES[number];
export const GATE_RESULTS = ["PASS", "FAIL", "INCONCLUSIVE"] as const;
export type GateResult = typeof GATE_RESULTS[number];
export const GATE_OPERATORS = ["GT", "GTE", "LT", "LTE", "EQ"] as const;
export type GateOperator = typeof GATE_OPERATORS[number];

const STABLE_ID = /^[a-z][a-z0-9._:-]{2,127}$/;
const SHA_256 = /^[a-f0-9]{64}$/;
const GIT_COMMIT = /^[a-f0-9]{40}$/;

type LabsReadDb = { select: (...args: any[]) => any };
const includes = <T extends readonly string[]>(values: T, value: string): value is T[number] =>
  (values as readonly string[]).includes(value);

export class LabsEvaluationIntegrityError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "LabsEvaluationIntegrityError";
  }
}

export interface EvaluationMetricDefinition {
  id: string;
  name: string;
  unit: string;
  requiredCohorts: readonly string[];
  definition: string;
  metadataSchemaVersion: number;
}

export interface EvaluationGateDefinition {
  id: string;
  metricId: string;
  cohortId: string;
  operator: GateOperator;
  thresholdValue: number;
  unit: string;
  required: boolean;
  description: string;
  metadataSchemaVersion: number;
}

export interface EvaluationProtocol {
  id: string;
  targetAnalyticId: string;
  name: string;
  version: string;
  purpose: string;
  populationDefinition: string;
  exclusions: string;
  trainDefinition: string;
  validationDefinition: string;
  holdoutDefinition: string;
  randomSeedPolicy: string;
  leakageControls: string;
  minimumCoverage: string;
  fingerprint: string;
  schemaVersion: number;
  createdAt: number;
  createdBy: string;
  createdSource: string;
  metrics: readonly EvaluationMetricDefinition[];
  gates: readonly EvaluationGateDefinition[];
}

export interface EvaluationMetricObservation {
  id: string;
  metricId: string;
  cohortId: string;
  observedValue: number;
  unit: string;
  sampleSize: number;
  uncertaintyLower: number | null;
  uncertaintyUpper: number | null;
  calculationIdentity: string;
  evidenceArtifactId: string | null;
  metadataSchemaVersion: number;
}

export interface EvaluationGateOutcome {
  id: string;
  gateId: string;
  observedValue: number | null;
  evidenceArtifactId: string | null;
  result: GateResult;
  reason: string;
  evaluatorIdentity: string;
  metadataSchemaVersion: number;
}

export interface EvaluationRunArtifactReference {
  artifact: LabArtifactDefinition;
  contentDigest: string;
  role: "candidate-input" | "evidence";
  attachedAt: number;
  attachedBy: string;
}

export interface LabEvaluationRun {
  id: string;
  candidate: LabCandidate;
  candidateLifecycleStatusAtRegistration: "REGISTERED";
  protocol: EvaluationProtocol;
  dataset: SeasonSnapshotBatch;
  baseline: ProductionAnalyticDefinition;
  implementationCommit: string;
  deterministicSeed: string | null;
  environmentMetadata: string;
  status: EvaluationRunStatus;
  startedAt: number | null;
  completedAt: number | null;
  resultSetFingerprint: string | null;
  failureReason: string | null;
  invalidationReason: string | null;
  metadataSchemaVersion: number;
  createdAt: number;
  createdBy: string;
  createdSource: string;
  artifacts: readonly EvaluationRunArtifactReference[];
  observations: readonly EvaluationMetricObservation[];
  gateOutcomes: readonly EvaluationGateOutcome[];
  /** Always false: Phase 4 evidence cannot select a production implementation. */
  productionResolvable: false;
}

function assertStableId(label: string, value: string): void {
  if (!STABLE_ID.test(value)) throw new LabsEvaluationIntegrityError(`${label} must be a stable lowercase ID.`);
}

function assertFinite(label: string, value: number): void {
  if (!Number.isFinite(value)) throw new LabsEvaluationIntegrityError(`${label} must be finite.`);
}

function assertSchemaVersion(value: number): void {
  if (value !== LABS_EVALUATION_SCHEMA_VERSION) {
    throw new LabsEvaluationIntegrityError(`Unsupported Labs evaluation schema version: ${value}.`);
  }
}

/** Protocol fingerprints are locale-free and ignore presentation whitespace. */
function canonicalText(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function canonicalNumber(value: number): number {
  if (!Number.isFinite(value)) throw new LabsEvaluationIntegrityError("Protocol fingerprint contains a non-finite number.");
  return Object.is(value, -0) ? 0 : value;
}

/** Stable byte-wise order; unlike localeCompare this cannot vary by host locale. */
function compareStableIds(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function parseCohorts(value: string, metricId: string): readonly string[] {
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed) || parsed.length === 0 || parsed.some(cohort => typeof cohort !== "string" || !STABLE_ID.test(cohort))) {
      throw new Error();
    }
    const sorted = [...parsed].sort();
    if (new Set(sorted).size !== sorted.length || JSON.stringify(sorted) !== value) throw new Error();
    return Object.freeze(sorted);
  } catch {
    throw new LabsEvaluationIntegrityError(`Metric ${metricId} has invalid canonical required cohorts.`);
  }
}

/**
 * Deterministic protocol identity over frozen metadata. Object keys are
 * constructed in one fixed order; definition rows and cohorts are sorted;
 * insignificant whitespace and -0 are normalized; JSON numbers are locale
 * independent. Gate comparisons deliberately use exact IEEE-754 semantics.
 */
export function fingerprintEvaluationProtocol(protocol: Omit<EvaluationProtocol, "fingerprint">): string {
  const canonical = JSON.stringify({
    id: canonicalText(protocol.id),
    targetAnalyticId: canonicalText(protocol.targetAnalyticId),
    name: canonicalText(protocol.name),
    version: canonicalText(protocol.version),
    purpose: canonicalText(protocol.purpose),
    populationDefinition: canonicalText(protocol.populationDefinition),
    exclusions: canonicalText(protocol.exclusions),
    trainDefinition: canonicalText(protocol.trainDefinition),
    validationDefinition: canonicalText(protocol.validationDefinition),
    holdoutDefinition: canonicalText(protocol.holdoutDefinition),
    randomSeedPolicy: canonicalText(protocol.randomSeedPolicy),
    leakageControls: canonicalText(protocol.leakageControls),
    minimumCoverage: canonicalText(protocol.minimumCoverage),
    schemaVersion: protocol.schemaVersion,
    metrics: [...protocol.metrics].map(metric => ({
      id: canonicalText(metric.id), name: canonicalText(metric.name), unit: canonicalText(metric.unit),
      requiredCohorts: [...metric.requiredCohorts].map(canonicalText).sort(), definition: canonicalText(metric.definition),
      metadataSchemaVersion: metric.metadataSchemaVersion,
    })).sort((a, b) => compareStableIds(a.id, b.id)),
    gates: [...protocol.gates].map(gate => ({
      id: canonicalText(gate.id), metricId: canonicalText(gate.metricId), cohortId: canonicalText(gate.cohortId), operator: gate.operator,
      thresholdValue: canonicalNumber(gate.thresholdValue), unit: canonicalText(gate.unit), required: gate.required,
      description: canonicalText(gate.description), metadataSchemaVersion: gate.metadataSchemaVersion,
    })).sort((a, b) => compareStableIds(a.id, b.id)),
  });
  return createHash("sha256").update(canonical).digest("hex");
}

function freezeProtocol(protocol: EvaluationProtocol): EvaluationProtocol {
  return Object.freeze({
    ...protocol,
    metrics: Object.freeze(protocol.metrics.map(metric => Object.freeze({ ...metric, requiredCohorts: Object.freeze([...metric.requiredCohorts]) }))),
    gates: Object.freeze(protocol.gates.map(gate => Object.freeze({ ...gate }))),
  });
}

function validateProtocol(protocol: EvaluationProtocol): void {
  assertStableId("Protocol ID", protocol.id);
  assertStableId("Protocol target analytic ID", protocol.targetAnalyticId);
  validateCandidateTarget(protocol.targetAnalyticId);
  if (!protocol.name || !protocol.version || !protocol.purpose || !protocol.populationDefinition || !protocol.trainDefinition || !protocol.validationDefinition || !protocol.holdoutDefinition || !protocol.randomSeedPolicy || !protocol.leakageControls || !protocol.minimumCoverage) {
    throw new LabsEvaluationIntegrityError(`Protocol ${protocol.id} is missing frozen planning metadata.`);
  }
  if (!SHA_256.test(protocol.fingerprint)) throw new LabsEvaluationIntegrityError(`Protocol ${protocol.id} has an invalid SHA-256 fingerprint.`);
  assertSchemaVersion(protocol.schemaVersion);
  if (protocol.metrics.length === 0 || protocol.gates.length === 0) {
    throw new LabsEvaluationIntegrityError(`Protocol ${protocol.id} requires frozen metric and gate definitions.`);
  }
  const metricIds = new Set<string>();
  for (const metric of protocol.metrics) {
    assertStableId("Protocol metric ID", metric.id);
    if (metricIds.has(metric.id) || !metric.name || !metric.unit || !metric.definition) throw new LabsEvaluationIntegrityError(`Protocol ${protocol.id} has an invalid metric definition.`);
    metricIds.add(metric.id);
    assertSchemaVersion(metric.metadataSchemaVersion);
    if (metric.requiredCohorts.length === 0) throw new LabsEvaluationIntegrityError(`Metric ${metric.id} has no required cohort.`);
  }
  const gateIds = new Set<string>();
  for (const gate of protocol.gates) {
    assertStableId("Protocol gate ID", gate.id);
    if (gateIds.has(gate.id) || !metricIds.has(gate.metricId) || !includes(GATE_OPERATORS, gate.operator) || !Number.isFinite(gate.thresholdValue) || !gate.unit || !gate.description || typeof gate.required !== "boolean") {
      throw new LabsEvaluationIntegrityError(`Protocol ${protocol.id} has an invalid frozen gate.`);
    }
    gateIds.add(gate.id);
    assertSchemaVersion(gate.metadataSchemaVersion);
    const metric = protocol.metrics.find(item => item.id === gate.metricId)!;
    if (metric.unit !== gate.unit || !metric.requiredCohorts.includes(gate.cohortId)) {
      throw new LabsEvaluationIntegrityError(`Protocol gate ${gate.id} does not match its metric definition.`);
    }
  }
  const expected = fingerprintEvaluationProtocol({ ...protocol, metrics: protocol.metrics, gates: protocol.gates });
  if (expected !== protocol.fingerprint) throw new LabsEvaluationIntegrityError(`Protocol ${protocol.id} fingerprint does not match frozen definitions.`);
}

/** Exact, tolerance-free threshold comparison for a frozen gate. */
export function evaluateGateThreshold(operator: GateOperator, observed: number, threshold: number): boolean {
  if (!includes(GATE_OPERATORS, operator)) throw new LabsEvaluationIntegrityError(`Unknown gate operator: ${operator}.`);
  assertFinite("Gate observation", observed);
  assertFinite("Gate threshold", threshold);
  if (operator === "GT") return observed > threshold;
  if (operator === "GTE") return observed >= threshold;
  if (operator === "LT") return observed < threshold;
  if (operator === "LTE") return observed <= threshold;
  return observed === threshold;
}

function artifactFromRow(row: typeof labsArtifacts.$inferSelect): LabArtifactDefinition {
  // Candidate reads already own the full artifact identity validation. Runs use
  // that same immutable metadata shape but never load it as executable code.
  if (!SHA_256.test(row.contentDigest)) throw new LabsEvaluationIntegrityError(`Artifact ${row.id} has an invalid digest.`);
  return Object.freeze({
    id: row.id, kind: row.kind as LabArtifactDefinition["kind"], contentDigest: row.contentDigest,
    implementationIdentity: row.implementationIdentity, mediaType: row.mediaType, artifactSchemaVersion: row.artifactSchemaVersion,
    repositoryCommit: row.repositoryCommit, repositoryPath: row.repositoryPath, immutableReference: row.immutableReference,
    byteSize: row.byteSize, metadataSchemaVersion: row.metadataSchemaVersion, createdAt: row.createdAt,
    createdBy: row.createdBy, createdSource: row.createdSource,
  });
}

async function readProtocols(db: LabsReadDb, protocolId?: string): Promise<readonly EvaluationProtocol[]> {
  const rows = protocolId
    ? await db.select().from(labsEvaluationProtocols).where(eq(labsEvaluationProtocols.id, protocolId))
    : await db.select().from(labsEvaluationProtocols).orderBy(desc(labsEvaluationProtocols.createdAt), asc(labsEvaluationProtocols.id)).limit(MAX_LABS_EVALUATION_PROTOCOL_OVERVIEW + 1);
  if (!protocolId && rows.length > MAX_LABS_EVALUATION_PROTOCOL_OVERVIEW) throw new LabsEvaluationIntegrityError("Evaluation protocol overview exceeds its read safety limit.");
  if (rows.length === 0) return Object.freeze([]);
  const ids = rows.map((row: typeof labsEvaluationProtocols.$inferSelect) => row.id);
  const [metricRows, gateRows] = await Promise.all([
    db.select().from(labsEvaluationProtocolMetrics).where(inArray(labsEvaluationProtocolMetrics.protocolId, ids)).orderBy(asc(labsEvaluationProtocolMetrics.protocolId), asc(labsEvaluationProtocolMetrics.metricId)).limit(MAX_PROTOCOL_CHILDREN + 1),
    db.select().from(labsEvaluationProtocolGates).where(inArray(labsEvaluationProtocolGates.protocolId, ids)).orderBy(asc(labsEvaluationProtocolGates.protocolId), asc(labsEvaluationProtocolGates.gateId)).limit(MAX_PROTOCOL_CHILDREN + 1),
  ]);
  if (metricRows.length > MAX_PROTOCOL_CHILDREN || gateRows.length > MAX_PROTOCOL_CHILDREN) throw new LabsEvaluationIntegrityError("Evaluation protocol definitions exceed the read safety limit.");
  return Object.freeze((rows as Array<typeof labsEvaluationProtocols.$inferSelect>).map(row => {
    const metrics = (metricRows as Array<typeof labsEvaluationProtocolMetrics.$inferSelect>).filter(metric => metric.protocolId === row.id).map(metric => ({
      id: metric.metricId, name: metric.name, unit: metric.unit, requiredCohorts: parseCohorts(metric.requiredCohorts, metric.metricId), definition: metric.definition, metadataSchemaVersion: metric.metadataSchemaVersion,
    }));
    const gates = (gateRows as Array<typeof labsEvaluationProtocolGates.$inferSelect>).filter(gate => gate.protocolId === row.id).map(gate => ({
      id: gate.gateId, metricId: gate.metricId, cohortId: gate.cohortId, operator: gate.operator as GateOperator, thresholdValue: gate.thresholdValue, unit: gate.unit, required: gate.required === 1, description: gate.description, metadataSchemaVersion: gate.metadataSchemaVersion,
    }));
    const protocol = freezeProtocol({
      id: row.id, targetAnalyticId: row.targetAnalyticId, name: row.name, version: row.version, purpose: row.purpose,
      populationDefinition: row.populationDefinition, exclusions: row.exclusions, trainDefinition: row.trainDefinition,
      validationDefinition: row.validationDefinition, holdoutDefinition: row.holdoutDefinition, randomSeedPolicy: row.randomSeedPolicy,
      leakageControls: row.leakageControls, minimumCoverage: row.minimumCoverage, fingerprint: row.fingerprint, schemaVersion: row.schemaVersion,
      createdAt: row.createdAt, createdBy: row.createdBy, createdSource: row.createdSource, metrics, gates,
    });
    validateProtocol(protocol);
    return protocol;
  }).sort((a, b) => b.createdAt - a.createdAt || compareStableIds(a.id, b.id)));
}

export async function listEvaluationProtocols(db: LabsReadDb): Promise<readonly EvaluationProtocol[]> {
  return readProtocols(db);
}

export async function getEvaluationProtocol(db: LabsReadDb, protocolId: string): Promise<EvaluationProtocol> {
  assertStableId("Protocol ID", protocolId);
  const protocol = (await readProtocols(db, protocolId))[0];
  if (!protocol) throw new LabsEvaluationIntegrityError(`Unknown evaluation protocol: ${protocolId}.`);
  return protocol;
}

function validateRunStatus(row: typeof labsEvaluationRuns.$inferSelect): EvaluationRunStatus {
  if (!includes(EVALUATION_RUN_STATUSES, row.status)) throw new LabsEvaluationIntegrityError(`Run ${row.id} has an unknown status.`);
  if (row.status === "COMPLETED" && (row.startedAt === null || row.completedAt === null || row.completedAt < row.startedAt || !row.resultSetFingerprint || !SHA_256.test(row.resultSetFingerprint) || row.failureReason !== null || row.invalidationReason !== null)) {
    throw new LabsEvaluationIntegrityError(`Completed run ${row.id} is missing immutable result provenance.`);
  }
  if (row.status === "PLANNED" && (row.startedAt !== null || row.completedAt !== null || row.resultSetFingerprint !== null || row.failureReason !== null || row.invalidationReason !== null)) throw new LabsEvaluationIntegrityError(`Planned run ${row.id} claims completed evidence.`);
  if (row.status === "FAILED" && (!row.failureReason || row.startedAt === null || row.completedAt === null || row.completedAt < row.startedAt || row.invalidationReason !== null)) throw new LabsEvaluationIntegrityError(`Failed run ${row.id} has incoherent failure provenance.`);
  if (row.status === "INVALIDATED" && (!row.invalidationReason || row.failureReason !== null)) throw new LabsEvaluationIntegrityError(`Invalidated run ${row.id} has incoherent invalidation provenance.`);
  return row.status;
}

async function readRuns(db: LabsReadDb, runId?: string): Promise<readonly LabEvaluationRun[]> {
  const rows = runId
    ? await db.select().from(labsEvaluationRuns).where(eq(labsEvaluationRuns.id, runId))
    : await db.select().from(labsEvaluationRuns).orderBy(desc(labsEvaluationRuns.createdAt), asc(labsEvaluationRuns.id)).limit(MAX_LABS_EVALUATION_RUN_OVERVIEW + 1);
  if (!runId && rows.length > MAX_LABS_EVALUATION_RUN_OVERVIEW) throw new LabsEvaluationIntegrityError("Evaluation run overview exceeds its read safety limit.");
  if (rows.length === 0) return Object.freeze([]);
  const ids = rows.map((row: typeof labsEvaluationRuns.$inferSelect) => row.id);
  const [artifactRefs, observations, gateResults] = await Promise.all([
    db.select().from(labsEvaluationRunArtifacts).where(inArray(labsEvaluationRunArtifacts.runId, ids)).orderBy(asc(labsEvaluationRunArtifacts.runId), asc(labsEvaluationRunArtifacts.artifactId)).limit(MAX_RUN_CHILDREN + 1),
    db.select().from(labsEvaluationMetricObservations).where(inArray(labsEvaluationMetricObservations.runId, ids)).orderBy(asc(labsEvaluationMetricObservations.runId), asc(labsEvaluationMetricObservations.metricId), asc(labsEvaluationMetricObservations.cohortId)).limit(MAX_RUN_CHILDREN + 1),
    db.select().from(labsEvaluationGateResults).where(inArray(labsEvaluationGateResults.runId, ids)).orderBy(asc(labsEvaluationGateResults.runId), asc(labsEvaluationGateResults.gateId)).limit(MAX_RUN_CHILDREN + 1),
  ]);
  if (artifactRefs.length > MAX_RUN_CHILDREN || observations.length > MAX_RUN_CHILDREN || gateResults.length > MAX_RUN_CHILDREN) throw new LabsEvaluationIntegrityError("Evaluation evidence exceeds the read safety limit.");
  const artifactIds = [...new Set([
    ...(artifactRefs as Array<typeof labsEvaluationRunArtifacts.$inferSelect>).map(reference => reference.artifactId),
    ...(observations as Array<typeof labsEvaluationMetricObservations.$inferSelect>).flatMap(observation => observation.evidenceArtifactId ? [observation.evidenceArtifactId] : []),
    ...(gateResults as Array<typeof labsEvaluationGateResults.$inferSelect>).flatMap(result => result.evidenceArtifactId ? [result.evidenceArtifactId] : []),
  ])];
  const artifacts = artifactIds.length === 0 ? [] : await db.select().from(labsArtifacts).where(inArray(labsArtifacts.id, artifactIds)).limit(MAX_RUN_CHILDREN + 1);
  if (artifacts.length !== artifactIds.length) throw new LabsEvaluationIntegrityError("Evaluation evidence references a missing artifact.");
  const artifactsById = new Map((artifacts as Array<typeof labsArtifacts.$inferSelect>).map(artifact => [artifact.id, artifactFromRow(artifact)]));
  const protocols = new Map<string, EvaluationProtocol>();
  for (const protocolId of new Set((rows as Array<typeof labsEvaluationRuns.$inferSelect>).map(row => row.protocolId))) protocols.set(protocolId, await getEvaluationProtocol(db, protocolId));
  const candidates = new Map<string, LabCandidate>();
  for (const candidateId of new Set((rows as Array<typeof labsEvaluationRuns.$inferSelect>).map(row => row.candidateId))) candidates.set(candidateId, await getLabCandidate(db as any, candidateId));

  const result: LabEvaluationRun[] = [];
  for (const row of rows as Array<typeof labsEvaluationRuns.$inferSelect>) {
    assertStableId("Evaluation run ID", row.id);
    assertSchemaVersion(row.schemaVersion);
    if (!GIT_COMMIT.test(row.implementationCommit) || !SHA_256.test(row.protocolFingerprint)) throw new LabsEvaluationIntegrityError(`Run ${row.id} has invalid frozen implementation provenance.`);
    const candidate = candidates.get(row.candidateId)!;
    const protocol = protocols.get(row.protocolId)!;
    if (row.candidateLifecycleStatus !== "REGISTERED" || (candidate.lifecycleStatus !== "REGISTERED" && candidate.lifecycleStatus !== "RETIRED") || (row.status === "PLANNED" && candidate.lifecycleStatus !== "REGISTERED") || candidate.revision !== row.candidateRevision || candidate.targetAnalytic.id !== protocol.targetAnalyticId) throw new LabsEvaluationIntegrityError(`Run ${row.id} does not reference a registered coherent candidate.`);
    if (protocol.fingerprint !== row.protocolFingerprint || candidate.dataset.id !== row.datasetBatchId) throw new LabsEvaluationIntegrityError(`Run ${row.id} does not preserve candidate/protocol provenance.`);
    const dataset = await requireCompleteSeasonSnapshotBatch(db as any, row.datasetBatchId);
    const baseline = getProductionAnalytic(row.baselineAnalyticId);
    if (baseline.version.value !== row.baselineVersion || baseline.implementation !== row.baselineImplementation || (candidate.targetAnalytic.lifecycle === "PRODUCTION" && baseline.id !== candidate.targetAnalytic.id)) throw new LabsEvaluationIntegrityError(`Run ${row.id} does not match its frozen production baseline.`);
    const status = validateRunStatus(row);
    const runArtifacts = (artifactRefs as Array<typeof labsEvaluationRunArtifacts.$inferSelect>).filter(reference => reference.runId === row.id).map(reference => {
      const artifact = artifactsById.get(reference.artifactId);
      if (!artifact || artifact.contentDigest !== reference.contentDigest || !SHA_256.test(reference.contentDigest) || (reference.role !== "candidate-input" && reference.role !== "evidence")) throw new LabsEvaluationIntegrityError(`Run ${row.id} has invalid frozen artifact provenance.`);
      return Object.freeze({ artifact, contentDigest: reference.contentDigest, role: reference.role, attachedAt: reference.attachedAt, attachedBy: reference.attachedBy }) as EvaluationRunArtifactReference;
    });
    const frozenCandidateArtifacts = new Map(
      runArtifacts.filter(reference => reference.role === "candidate-input").map(reference => [reference.artifact.id, reference.contentDigest]),
    );
    for (const candidateArtifact of candidate.artifacts) {
      if (frozenCandidateArtifacts.get(candidateArtifact.artifact.id) !== candidateArtifact.artifact.contentDigest) {
        throw new LabsEvaluationIntegrityError(`Run ${row.id} does not freeze candidate artifact ${candidateArtifact.artifact.id}.`);
      }
    }
    const permittedEvidence = new Set(runArtifacts.map(reference => reference.artifact.id));
    const runObservations = (observations as Array<typeof labsEvaluationMetricObservations.$inferSelect>).filter(observation => observation.runId === row.id).map(observation => {
      assertStableId("Observation ID", observation.id); assertFinite(`Observation ${observation.id}`, observation.observedValue);
      if (!Number.isInteger(observation.sampleSize) || observation.sampleSize < 0 || !observation.calculationIdentity || !Number.isFinite(observation.uncertaintyLower ?? 0) || !Number.isFinite(observation.uncertaintyUpper ?? 0) || (observation.uncertaintyLower !== null && observation.uncertaintyUpper !== null && observation.uncertaintyLower > observation.uncertaintyUpper)) throw new LabsEvaluationIntegrityError(`Observation ${observation.id} is malformed.`);
      const metric = protocol.metrics.find(item => item.id === observation.metricId);
      if (!metric || metric.unit !== observation.unit || !metric.requiredCohorts.includes(observation.cohortId) || (observation.evidenceArtifactId && !permittedEvidence.has(observation.evidenceArtifactId))) throw new LabsEvaluationIntegrityError(`Observation ${observation.id} is not defined by the frozen protocol.`);
      assertSchemaVersion(observation.metadataSchemaVersion);
      return Object.freeze({ id: observation.id, metricId: observation.metricId, cohortId: observation.cohortId, observedValue: observation.observedValue, unit: observation.unit, sampleSize: observation.sampleSize, uncertaintyLower: observation.uncertaintyLower, uncertaintyUpper: observation.uncertaintyUpper, calculationIdentity: observation.calculationIdentity, evidenceArtifactId: observation.evidenceArtifactId, metadataSchemaVersion: observation.metadataSchemaVersion });
    });
    const runGateOutcomes = (gateResults as Array<typeof labsEvaluationGateResults.$inferSelect>).filter(gate => gate.runId === row.id).map(outcome => {
      assertStableId("Gate outcome ID", outcome.id); if (!includes(GATE_RESULTS, outcome.result) || !outcome.reason || !outcome.evaluatorIdentity) throw new LabsEvaluationIntegrityError(`Gate outcome ${outcome.id} is malformed.`);
      const gate = protocol.gates.find(item => item.id === outcome.gateId);
      if (!gate || (outcome.evidenceArtifactId && !permittedEvidence.has(outcome.evidenceArtifactId))) throw new LabsEvaluationIntegrityError(`Gate outcome ${outcome.id} does not match the frozen protocol.`);
      if (outcome.observedValue !== null) assertFinite(`Gate outcome ${outcome.id}`, outcome.observedValue);
      if (outcome.result === "PASS" && outcome.observedValue === null) throw new LabsEvaluationIntegrityError(`Gate outcome ${outcome.id} cannot establish PASS from prose alone.`);
      if (outcome.observedValue !== null && (outcome.result === "PASS") !== evaluateGateThreshold(gate.operator, outcome.observedValue, gate.thresholdValue)) throw new LabsEvaluationIntegrityError(`Gate outcome ${outcome.id} contradicts its frozen threshold.`);
      assertSchemaVersion(outcome.metadataSchemaVersion);
      return Object.freeze({ id: outcome.id, gateId: outcome.gateId, observedValue: outcome.observedValue, evidenceArtifactId: outcome.evidenceArtifactId, result: outcome.result, reason: outcome.reason, evaluatorIdentity: outcome.evaluatorIdentity, metadataSchemaVersion: outcome.metadataSchemaVersion });
    });
    if (status === "PLANNED" && (runObservations.length > 0 || runGateOutcomes.length > 0)) {
      throw new LabsEvaluationIntegrityError(`Planned run ${row.id} cannot present observations or gate outcomes.`);
    }
    if (status === "FAILED" && runGateOutcomes.some(outcome => outcome.result === "PASS")) {
      throw new LabsEvaluationIntegrityError(`Failed run ${row.id} cannot present a successful validation outcome.`);
    }
    if (status === "COMPLETED") {
      for (const metric of protocol.metrics) for (const cohort of metric.requiredCohorts) {
        if (!runObservations.some(observation => observation.metricId === metric.id && observation.cohortId === cohort)) throw new LabsEvaluationIntegrityError(`Completed run ${row.id} is missing required ${metric.id}/${cohort} evidence.`);
      }
      for (const gate of protocol.gates.filter(gate => gate.required)) {
        if (!runGateOutcomes.some(outcome => outcome.gateId === gate.id)) throw new LabsEvaluationIntegrityError(`Completed run ${row.id} is missing required gate evidence.`);
      }
    }
    result.push(Object.freeze({
      id: row.id, candidate, candidateLifecycleStatusAtRegistration: "REGISTERED" as const, protocol, dataset, baseline, implementationCommit: row.implementationCommit, deterministicSeed: row.deterministicSeed,
      environmentMetadata: row.environmentMetadata, status, startedAt: row.startedAt, completedAt: row.completedAt, resultSetFingerprint: row.resultSetFingerprint,
      failureReason: row.failureReason, invalidationReason: row.invalidationReason, metadataSchemaVersion: row.schemaVersion,
      createdAt: row.createdAt, createdBy: row.createdBy, createdSource: row.createdSource,
      artifacts: Object.freeze(runArtifacts), observations: Object.freeze(runObservations), gateOutcomes: Object.freeze(runGateOutcomes), productionResolvable: false as const,
    }));
  }
  return Object.freeze(result.sort((a, b) => b.createdAt - a.createdAt || compareStableIds(a.id, b.id)));
}

export async function listEvaluationRuns(db: LabsReadDb): Promise<readonly LabEvaluationRun[]> { return readRuns(db); }
export async function getEvaluationRun(db: LabsReadDb, runId: string): Promise<LabEvaluationRun> {
  assertStableId("Evaluation run ID", runId);
  const run = (await readRuns(db, runId))[0];
  if (!run) throw new LabsEvaluationIntegrityError(`Unknown evaluation run: ${runId}.`);
  return run;
}

/** Metadata-only proof used by tests: evaluation evidence can never dispatch production code. */
export function isEvaluationProductionResolvable(run: LabEvaluationRun): false { return run.productionResolvable; }
