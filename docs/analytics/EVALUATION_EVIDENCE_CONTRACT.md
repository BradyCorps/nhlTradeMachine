# Analytics Labs evaluation evidence contract

Phase 4 records evaluation plans and evidence for internal Analytics Labs inspection. It does not execute a candidate, calculate a player value, validate or approve an implementation, select production code, or change a feature flag. Registration and a completed run are evidence facts, not promotion decisions.

## Domain boundary

| Record | Meaning | Does not mean |
| --- | --- | --- |
| Production analytic | Code-backed Phase 1B catalog identity | A database-selected calculator |
| Candidate | Phase 3 proposed implementation metadata | A validated or runtime-available implementation |
| Artifact | Immutable external/repository-backed identity metadata | Downloadable or executable candidate code |
| Evaluation protocol | Frozen rules, cohorts, metrics, leakage controls, and gates | A result or approval |
| Evaluation run | Immutable record of a planned or observed candidate evaluation | Promotion or activation |
| Metric observation | A numeric result for one frozen metric/cohort | Sufficient validation evidence by itself |
| Gate outcome | PASS, FAIL, or INCONCLUSIVE comparison against a frozen gate | A human promotion decision |

Public valuation remains `calculateAssetNAV → calcNAV`. Neither the protocol nor the run reader is imported by that boundary, and no Labs record is a runtime calculator selector.

## Frozen chain of custody

```
code catalog ──target/baseline metadata──┐
candidate ──immutable candidate artifacts─┼─ evaluation run ── observations
COMPLETE snapshot batch ──────────────────┤        │
frozen protocol + SHA-256 ────────────────┘        ├─ gate outcomes
                                                     └─ immutable evidence artifacts
```

`labs_evaluation_protocols` stores a stable ID, target analytic, planning definitions, reproducibility controls, and a canonical SHA-256 fingerprint. Its metric and gate definitions are normalized child records. A protocol is immutable at registration; any changed target, gate, threshold, cohort, metric/unit, split, exclusion, leakage rule, minimum-coverage rule, seed policy, or schema version requires a new protocol ID and fingerprint. Canonical serialization uses fixed object-key order, sorted definition/cohort identities, collapsed presentation whitespace, locale-independent JSON numbers, and normalized `-0`; it rejects non-finite thresholds. Optional protocol fields are not part of this version of the contract.

An evaluation run freezes its candidate ID/revision and `REGISTERED` lifecycle fact, protocol ID/fingerprint, verified snapshot batch, production baseline identity/version/implementation, implementation commit, planned deterministic seed, environment metadata, and candidate artifact digests. The run reader accepts a run only when the candidate was registered, the snapshot batch passes `requireCompleteSeasonSnapshotBatch`, the protocol target agrees with the candidate target, and the baseline remains an eligible code-backed production analytic. A retired candidate remains readable as history; it is not eligible for a future run.

## Evidence semantics

Run states are deliberately limited to `PLANNED`, `COMPLETED`, `FAILED`, and `INVALIDATED`. None represents validation, approval, public availability, or promotion. `PLANNED` has no execution timestamps, result fingerprint, observations, or gate outcomes. `COMPLETED` requires ordered start/completion timestamps, a result-set fingerprint, every required observation and gate outcome, and no failure/invalidation reason. `FAILED` requires ordered timestamps and a failure reason and cannot carry a PASS outcome. `INVALIDATED` requires an invalidation reason and remains visible only as unusable historical evidence. Gate outcomes are `PASS`, `FAIL`, or `INCONCLUSIVE`.

Metric observations must have finite values, declared units, non-negative sample sizes, ordered uncertainty bounds in that same unit, and a metric/cohort pair defined by the frozen protocol. Completed runs must supply every protocol-required cohort and every required gate result. A PASS needs a numeric observation and must agree with the stored operator and threshold. Gate comparisons use exact IEEE-754 `GT`, `GTE`, `LT`, `LTE`, and `EQ` semantics with no undocumented tolerance. Missing evidence therefore fails closed during completed-run reads; it cannot become a PASS through prose or an aggregate average. Position-specific cohorts remain separate observations and gates.

The NAV-01 Phase 5 material is only a fixture/reference for this contract: its overall failure, F/G partial results, D failure, and uncertainty information can be represented without claiming an overall PASS. It is not seeded into any database and remains spent research evidence.

## Persistence and enforcement

Migration `0010_add_labs_evaluation_evidence.sql` is additive and introduces:

```
labs_evaluation_protocols
  ├─ labs_evaluation_protocol_metrics
  └─ labs_evaluation_protocol_gates
labs_candidates ── labs_evaluation_runs ── labs_evaluation_run_artifacts ── labs_artifacts
                                  ├─ labs_evaluation_metric_observations
                                  └─ labs_evaluation_gate_results
```

Foreign keys use `ON DELETE RESTRICT`; no cascade can erase planning or evidence history. SQLite checks constrain statuses, gate operators, result labels, digests, commit identity, primary/unique identities, and association uniqueness. Triggers prevent protocol/definition rewrites, terminal-run and frozen-identity rewrites, and insertion, deletion, or rewriting of recorded evidence after a run becomes terminal. Database constraints cannot prove protocol/catalog coherence, canonical fingerprints, lifecycle validity, unit/cohort membership, threshold semantics, or evidence completeness; the server reader validates those facts before presentation. Phase 5B.1 adds the authenticated planning service below; execution-transition authorization remains deferred to a future isolated writer that must preserve these invariants.

The server-only reader enforces semantic coherence that SQLite cannot express: code-backed catalog identity, COMPLETE-batch eligibility, lifecycle chain, canonical protocol fingerprint, candidate-artifact freeze, unit/cohort matching, finite numbers, threshold outcomes, and required-evidence completeness. There is intentionally no Phase 4 write API; future execution and review services must preserve these checks rather than bypass them.

## Phase 5B.1 authenticated planning contract

- [x] Implement and verify authenticated PLANNED evaluation-run creation.

`app/lib/labs-planning.server.ts#planEvaluationRun(request, db, input)` is an
internal server-only service, following the existing registration placement and
Node-only import boundary. It has no mutation API, Server Action, operator UI,
or caller in `/admin/labs`. `requireAdmin` runs before any database access,
including retries, and rejects unauthorized requests without reads or writes.
The database must support transactions. Actor/source are explicit provenance
from the authorized caller, not identities inferred from the shared Admin key.

The caller supplies the stable run ID; candidate ID/revision; exact REGISTERED
event ID; bound protocol ID/fingerprint; COMPLETE snapshot batch ID; baseline
analytic ID/version/implementation; implementation commit; planned deterministic
seed; planned runtime and toolchain identities plus a dependency SHA-256 digest;
complete candidate artifact ID/digest set; and creation timestamp/actor/source.
Unknown fields, including execution or result metadata, fail closed. A seed is
required even for fixed-input implementations so planning never guesses how to
interpret the protocol's free-text seed policy. The evaluator must later check
that declared seed policy against its actual execution procedure.

Within one libSQL write transaction, the service:

1. Reads candidate and protocol through their existing fail-closed readers and
   reuses the complete registration-readiness validator shared with Phase 5A.2.
   This verifies current target/base catalog identity, exposure, COMPLETE batch
   provenance, immutable artifact references, implementation identity/roles,
   registration provenance, protocol definitions and canonical fingerprint.
2. Requires a currently REGISTERED candidate and its exact sequence-two event.
   The event's canonical `evidenceReference` must bind precisely the supplied
   protocol ID and fingerprint. Candidate revision and batch must agree with
   the caller; planning creation cannot precede registration.
3. Requires a code-backed eligible production baseline with matching version
   and implementation, analytic family and calculation role. A production
   target requires the same baseline ID; a diagnostic Gravity v4 research
   target can compare with the production Gravity v3 descriptive baseline.
4. Freezes every candidate artifact as `candidate-input`, requiring the exact
   ID/digest set, with no extra evidence artifacts. A repository-backed
   implementation artifact's commit must equal the planned implementation
   commit. Digest-backed artifacts retain their existing immutable-reference
   contract. No artifact bytes are fetched, hashed, imported or executed.
5. Inserts the PLANNED run and all references atomically, then reads it through
   `getEvaluationRun` before commit. A failed final integrity read or any other
   pre-commit failure rolls back the entire write.

The existing schema is sufficient; there is no migration. Run columns freeze
candidate revision/status, protocol/fingerprint, batch, baseline and commit.
`environmentMetadata` is canonical JSON with the version
`schema: "labs-planned-environment/1"`, the complete exact `registrationEvent`
(including ID, sequence, actor/source, note and protocol binding),
`plannedEnvironment: { runtime, toolchain, dependencyDigest }`, and the frozen
protocol's `randomSeedPolicy`. This is declared planning provenance, not a
measurement of an executed environment or proof of artifact byte integrity.
The existing reader accepts the envelope as opaque environment metadata;
Phase 5B.1 validates its exact equivalence on retries. Existing SQL triggers
protect the core run identities and artifact references; they do not freeze
all PLANNED reproducibility columns against arbitrary direct SQL. This service
has no update path and never rewrites any column.

The return is `{ run, created }`: `true` for creation and `false` for an exact
retry. A retry compares every stored run field and every frozen reference,
including timestamp, actor/source, seed and environment envelope; artifact
input order is irrelevant. Exact authenticated retries perform reads only.
Changed metadata using either the primary run ID or the existing unique tuple
`(candidate_id, candidate_revision, protocol_id, protocol_fingerprint,
dataset_batch_id, implementation_commit)` fails closed as a
`LabsPlanningConflictError`. A different run ID cannot alias that tuple.
Retries still require current readiness and an accepted PLANNED record; they
do not repair legacy records, reset execution, or re-plan a retired candidate.

Transactions serialize state validation and commit. Primary and composite
unique constraints arbitrate independent writers: identical concurrent calls
produce one creation and one reuse; competing calls produce one winner and
one conflict. SQLITE_BUSY contention restarts the complete transaction with
at most six retries and 10–320ms backoff. Persistent contention fails closed.
A failed transaction is never reported as created.

PLANNED always has null start/completion timestamps, result fingerprint,
failure and invalidation reasons, and empty observations/gate outcomes. Creation
and attachment timestamps describe metadata persistence only. The service
creates no candidate, protocol, artifact definition, lifecycle event, snapshot,
Production record, validation approval or promotion. Public dispatch remains
`calculateAssetNAV → calcNAV`, all analytical fixtures and flags remain intact,
and `/admin/labs` stays read-only.

Verification uses disposable local libSQL databases with WAL and independent
connections. Coverage includes authorization/no writes, accepted planning,
exact retry/no inserts or updates, changed retries, registration/protocol
binding, DRAFT/RETIRED rejection, invalid batch provenance, artifact and baseline
mismatch, rollback after run/reference insertion and final reading, identical
and competing concurrency, and retirement attempted during the transaction.
These are isolated service tests, not authenticated Production endpoint proof;
no production inventories or records are written for verification.

The remaining evaluator boundary must load and verify actual artifact bytes
and frozen snapshot inputs, execute one isolated candidate and its production
baseline against identical cohorts/splits under the frozen protocol, record
actual reproducibility/timing provenance, and atomically persist comparison
observations, uncertainty, gate outcomes and immutable evidence artifacts with
a result fingerprint. It must preserve the plan and fail closed on missing or
invalid evidence. Execution, human validation approval and promotion remain
separate authorization boundaries; a PLANNED record grants none of them.

## Read-only Admin boundary and later work

`/admin/labs` reads bounded protocol/run summaries only on the authenticated server. Missing tables, malformed records, and database errors render an explicit unavailable state rather than an empty inventory. Presentation receives validated domain records, not raw database rows. There is no public Labs API, mutation control, candidate runner, artifact loader, or production dispatch.

A future isolated execution phase may add a write service that records completed/failed/invalidated runs and their immutable evidence against an existing plan. A later human-review and promotion phase must be separate: it may reference this evidence, but cannot turn a candidate or a PASS gate into production selection without an adapter at the existing canonical execution boundary.
