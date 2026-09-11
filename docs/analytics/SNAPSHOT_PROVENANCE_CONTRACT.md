# Snapshot provenance contract — Analytics Labs Phase 1A

## Rule

> Analytics Labs may reference a season snapshot only by a verified
> `COMPLETE` snapshot batch ID, never by a season label, an as-of date, or the
> existence of individual player/team rows.

This is an additive extension of the existing DATA-06 Drizzle/libSQL snapshot
architecture. It does not select an analytic, alter a calculation, or expose a
new public output.

## Batch model

`season_snapshot_batches` identifies one coherent capture. Its stable ID is
derived from season context plus the first 16 hexadecimal characters of an
integrity fingerprint. The full SHA-256 fingerprint covers the immutable
capture context, sorted player membership/value-envelope fields, sorted team
aggregate fields, and skipped canonical IDs.

Each batch records:

- season, `completed`/`projected` context, as-of date, coverage, stats season,
  contract season, and model version;
- `CAPTURING`, `COMPLETE`, or `FAILED` lifecycle status;
- expected and captured player/team counts, plus skipped eligible-roster IDs;
- current repository provenance (`source`, `population`), fingerprint, capture
  timestamp, and the authenticated action provenance (`createdBy`,
  `createdAction`);
- completion time or failure reason.

New `player_season_snapshots` and `team_season_snapshots` rows carry the same
`batch_id`. The columns are nullable only for pre-Phase-1A DATA-06 rows.

## Completion definition

A batch starts `CAPTURING` inside one libSQL transaction and becomes `COMPLETE`
only after all of the following are true in that transaction:

1. required context/provenance fields are present;
2. canonical player IDs, team IDs, and row IDs are unique;
3. every row has the requested season/as-of/coverage/model context;
4. inserted player and team counts equal the eligible canonical population
   derived from the cached roster and its NAV map;
5. persisted player and team rows both carry the batch ID and belong to the
   declared season.

Any failed validation rolls back the capture rows and records a `FAILED` batch
with a reason. A completed batch is immutable: an identical request returns
the existing batch without rewriting rows; a non-identical same-day capture
cannot adopt colliding immutable rows and fails explicitly.

`requireCompleteSeasonSnapshotBatch` is the future Labs provenance gate. It
rejects missing, failed, capturing, or count-mismatched batches.

## Capture and inventory

The existing authenticated route remains the only mutation path:

```text
POST /api/admin/season-snapshots
{ "season": "completed" | "projected" | "both" }
```

It uses `requireAdmin(req)`, `ensureSeasonSnapshotTables()`, and the cached
roster where the production Turso credentials and canonical NAV map already
exist. `GET /api/admin/season-snapshots` now returns verified batch inventory
and a separate unbatched legacy inventory. No scheduler or automatic rollover
capture was added.

A controlled authenticated call can now create a complete current
completed-season batch through the repository's production-compatible path,
provided the cached roster produces a complete eligible NAV map. This phase did
not call production or claim that any existing database has a complete batch.

## Legacy rows and rollover

Existing DATA-06 rows are preserved with `batch_id = NULL`. They are explicitly
legacy/unverified: no migration infers membership from matching season, date,
or model version, and they are ineligible for Labs provenance.

At season rollover, an operator must intentionally capture the completed
season before changing the season configuration, then capture the next
projected-season baseline when appropriate. The batch records the distinct
stats and contract seasons; it does not invent historical contracts or games.
Automatic scheduling remains deferred.

## Phase 1B prerequisite

Before a broader production-registry contract references snapshot data, an
operator must run and inspect a real authenticated capture. Only the returned
`COMPLETE` batch ID—not a season label—may be stored as a dataset reference.
