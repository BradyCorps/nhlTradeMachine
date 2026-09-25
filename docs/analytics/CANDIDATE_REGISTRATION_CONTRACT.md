# Controlled candidate and protocol registration — Phase 5A.1

## Scope

`app/lib/labs-registration.server.ts` is the sole Phase 5A.1 write boundary.
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

The initial state is deliberately `DRAFT`, not `REGISTERED`. Creating a record
does not assert evaluation readiness. A later Phase 5A.2 authorization may add
the separately audited `DRAFT → REGISTERED` lifecycle transition; only then can
a future evaluation-run boundary consider the candidate eligible. No Phase
5A.1 record is production-resolvable.

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

## Deferred to Phase 5A.2

Phase 5A.1 intentionally leaves out an operator route or form, lifecycle
advancement to `REGISTERED`, evaluation-run creation, execution isolation,
metrics, validation evidence, human approval, promotion, rollback, and flag
controls. The protected `/admin/labs` surface remains read-only.
