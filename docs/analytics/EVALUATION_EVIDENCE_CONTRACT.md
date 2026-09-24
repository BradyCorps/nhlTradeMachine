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

`labs_evaluation_protocols` stores a stable ID, target analytic, planning definitions, reproducibility controls, and a canonical SHA-256 fingerprint. Its metric and gate definitions are normalized child records. A protocol is immutable at registration; any changed gate, threshold, cohort, or leakage rule requires a new protocol ID and fingerprint.

An evaluation run freezes its candidate ID/revision and `REGISTERED` lifecycle fact, protocol ID/fingerprint, verified snapshot batch, production baseline identity/version/implementation, implementation commit, seed policy result, environment metadata, and candidate artifact digests. The run reader accepts a run only when the candidate was registered, the snapshot batch passes `requireCompleteSeasonSnapshotBatch`, the protocol target agrees with the candidate target, and the baseline remains an eligible code-backed production analytic. A retired candidate remains readable as history; it is not eligible for a future run.

## Evidence semantics

Run states are deliberately limited to `PLANNED`, `COMPLETED`, `FAILED`, and `INVALIDATED`. None represents validation, approval, public availability, or promotion. Gate outcomes are `PASS`, `FAIL`, or `INCONCLUSIVE`.

Metric observations must have finite values, declared units, non-negative sample sizes, and a metric/cohort pair defined by the frozen protocol. Completed runs must supply every protocol-required cohort and every required gate result. A PASS needs a numeric observation and must agree with the stored operator and threshold. Missing evidence therefore fails closed during completed-run reads; it cannot become a PASS through prose or an aggregate average. Position-specific cohorts remain separate observations and gates.

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

Foreign keys use `ON DELETE RESTRICT`; no cascade can erase planning or evidence history. SQLite checks constrain statuses, gate operators, result labels, digests, commit identity, primary/unique identities, and association uniqueness. Triggers prevent protocol/definition rewrites, completed-run and frozen-identity rewrites, and deletion or rewriting of recorded evidence.

The server-only reader enforces semantic coherence that SQLite cannot express: code-backed catalog identity, COMPLETE-batch eligibility, lifecycle chain, canonical protocol fingerprint, candidate-artifact freeze, unit/cohort matching, finite numbers, threshold outcomes, and required-evidence completeness. There is intentionally no Phase 4 write API; future execution and review services must preserve these checks rather than bypass them.

## Read-only Admin boundary and later work

`/admin/labs` reads bounded protocol/run summaries only on the authenticated server. Missing tables, malformed records, and database errors render an explicit unavailable state rather than an empty inventory. Presentation receives validated domain records, not raw database rows. There is no public Labs API, mutation control, candidate runner, artifact loader, or production dispatch.

A future isolated execution phase may add a write service that records a planned/completed/failed/invalidated run and its immutable evidence. A later human-review and promotion phase must be separate: it may reference this evidence, but cannot turn a candidate or a PASS gate into production selection without an adapter at the existing canonical execution boundary.
