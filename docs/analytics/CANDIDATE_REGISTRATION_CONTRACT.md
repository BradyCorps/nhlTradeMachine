# Controlled candidate and protocol registration — Phases 5A.1 and 5A.2

## Scope

`app/lib/labs-registration.server.ts` is the sole registration write boundary.
It is server-only by placement and use: there is no Server Action, no
`/api/admin/labs` route, and no Admin Labs control that invokes it. A later,
separately approved administrative entry point must pass a real `Request`; the
service calls the existing `requireAdmin` guard before reading or writing.

This service registers immutable planning metadata only. It does not import or
execute candidate code, create an evaluation run, calculate a metric, record a
gate outcome, select a production implementation, change a flag, or alter the
public `calculateAssetNAV → calcNAV` boundary.

## One atomic registration

One registration transaction creates the candidate, its attachment records,
initial lifecycle event, and protocol together; it creates new artifact
metadata or reuses an exactly matching immutable artifact record:

```text
candidate ──< candidate-artifact references >── immutable artifacts
    │
    ├── first lifecycle event: DRAFT_CREATED (null → DRAFT)
    │
    └── frozen evaluation protocol ──< metrics and gates
```

The initial state is `DRAFT`. Creating a record does not assert evaluation
readiness. Phase 5A.2 adds the internal `DRAFT → REGISTERED` transition below.
Neither state is production-resolvable.

Before opening the transaction, the service validates:

- a stable candidate ID and revision, immutable implementation identity, and
  base version/implementation matching the current typed production catalog;
- a known non-display, non-research catalog target; diagnostic targets such as
  Gravity v4 are allowed only with `research` exposure;
- a verified `COMPLETE` snapshot batch through
  `requireCompleteSeasonSnapshotBatch`, never a season label or legacy row;
- one or more artifacts, including an `implementation` artifact, with unique
  stable IDs and SHA-256 digests, matching candidate implementation identity;
- immutable artifact provenance, an attachment timestamp bound to the
  registration, plus either an immutable repository commit/path pair or
  `sha256:<contentDigest>` reference;
- exactly one coherent `DRAFT_CREATED` event at sequence one; and
- a target-matched, fully validated Phase 4 protocol. The service derives the
  protocol's canonical SHA-256 fingerprint rather than trusting caller input.

Database constraints provide primary/unique identities, digest uniqueness,
restrictive foreign keys, and artifact/lifecycle/protocol immutability
triggers. The server boundary provides catalog compatibility, COMPLETE dataset
eligibility, cross-record identity matching, exact initial lifecycle semantics,
immutable-reference qualification, and the protocol fingerprint.

## Retry and failure behaviour

Candidate/artifact/reference/lifecycle/protocol/metric/gate writes occur in one
libSQL transaction. A failure rolls back every newly inserted related record.

An identical authenticated retry re-reads the candidate and protocol through
the fail-closed readers and succeeds only when every immutable field, artifact
attachment, lifecycle event, protocol definition, and fingerprint matches. It
returns the same records with `created: false`; it never rewrites them.

Any partial identity collision or changed immutable field is a conflict. A
concurrent retry is accepted only after the same exact re-read; otherwise its
database error remains a failure. This service does not repair or adopt legacy
records.

## Phase 5A.2 service contract

- [x] Implement and verify the isolated, authenticated DRAFT → REGISTERED service.

`transitionCandidateToRegistered(request, db, input)` requires an authorized
admin Request and transactional database support. Its input names the existing
candidate, frozen protocol ID and expected fingerprint, stable event ID,
timestamp, actor, source, and nullable note. Actor/source are explicit operator
provenance supplied by the authorized caller; they are not inferred from the
shared admin key. The service never creates a candidate, artifact, protocol, or
evaluation run.

Within one transaction, it re-reads through the fail-closed candidate/protocol
readers and rechecks the Phase 5A.1 metadata contract: current catalog base
identity, internal/research exposure, diagnostic research restriction,
count-consistent COMPLETE dataset provenance, immutable implementation
artifacts with matching identity/role, attachment and initial-event provenance,
and a target-matched frozen protocol with a recomputed fingerprint. The
protocol must share the original candidate registration timestamp, creator,
and source. No artifact bytes are fetched, hashed, or executed by this service;
these checks qualify declared immutable references and stored metadata.

A successful transition appends exactly one sequence-two `REGISTERED` event
(`DRAFT → REGISTERED`). Its `evidenceReference` is canonical JSON containing
`protocolId` and `fingerprint`, preserving the chosen protocol binding in
append-only history. The candidate row and all frozen definitions remain
unchanged. State is derived from the event sequence, not its timestamp.

The returned `{ candidate, protocol, created }` has `created: true` when this
call appends the event and `false` when an exact retry reuses it. An exact retry
must match every event field, including protocol binding, event ID, actor,
source, timestamp, and note, and must still pass readiness checks. A changed
retry, retired candidate, mismatched fingerprint, or competing transition
fails closed. Primary event identity and unique `(candidate_id, sequence)`
constraints arbitrate concurrent writes; identical concurrent requests yield
one append and one reuse, while competing requests yield one winner and one
conflict. Lock contention is retried at most six times per transaction attempt
with 10–320ms exponential delays; persistent contention remains a failure.
Any pre-commit failure rolls back the append. A fresh transaction may accept
a competing commit only after proving exact equivalence again.

**REGISTERED guarantees that the service checked planning metadata and durably
bound an immutable protocol to the candidate. It does not mean analytically
validated or production-approved.** It supplies a prerequisite for a future
isolated evaluation boundary, not authority to execute a run. It makes no
claim about statistical performance, unspent holdouts, actual artifact byte
integrity, evaluation results, gate passage, certification, or human approval.
Candidates remain `productionResolvable: false`.

Verification uses disposable, uniquely named local libSQL databases with WAL
enabled and two independent connections for concurrency cases. It does not
use application database configuration or create/transition Production
records. Authorization, transition/retry/conflict, rollback, provenance,
retirement, and production isolation tests run alongside the Phase 0 golden
baseline. Earlier schema and frozen-protocol evidence is reused; no migration
or deployed-endpoint operation is required for this service-only change.

## Deferred

An operator route/form, isolated evaluation-run creation and execution,
metrics, validation evidence, human approval, promotion, and flag controls
remain separate work. The protected `/admin/labs` surface remains read-only.
The next smallest step is an internal, isolated evaluation-run planning
boundary that requires REGISTERED history and its exact protocol binding,
then persists a PLANNED run with immutable inputs and execution provenance
without executing candidate code or writing to Production.
