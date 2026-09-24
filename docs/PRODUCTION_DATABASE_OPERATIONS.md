# Production database operations (PL-7)

This runbook is for the Turso/libSQL production database. It is an operational
procedure, not an application startup path. It never uses `db:push` or
`ensureSeasonSnapshotTables()`.

## Secret handling

Keep database URLs, database tokens, Vercel secrets, and Turso API credentials
in the operator's secret store or process environment. Do not put values in
shell history, terminal transcripts, issue trackers, source files, `.env*`
files, or commits. The commands below deliberately accept
`MIGRATION_DATABASE_URL` and `MIGRATION_DATABASE_AUTH_TOKEN` only from the
already-secure environment; they never load dotenv files and never print either
value.

## Identify the target and recovery window

Before each maintenance window, an authenticated Turso operator records only
the production database name, organization, group, primary region, plan, and
PITR retention. Do not copy a connection URL into the change record.

Confirm that the database selected for the window is the database configured in
the Vercel **Production** environment. A preview deployment must have an
independent preview/branch database before anyone sends it a stateful request.
GitHub deployment metadata proves branch-to-deployment association; it does not
prove a Vercel environment-variable boundary. Stop if the Vercel project
configuration cannot establish that boundary.

Turso PITR restores into a new database rather than replacing the source. The
Starter plan has a 24-hour recovery window; allow for Turso's documented
checkpoint lag when choosing the restore timestamp. Branch/PITR copies count
against the database quota, so leave capacity for both the pre-migration
recovery copy and any rollback copy.

## Pre-migration recoverability test

1. Choose a UTC restore timestamp inside the current PITR window, at least 15
   seconds before the recorded operation start.
2. Create an isolated restoration target; the source production database is
   read-only for this operation:

   ```sh
   turso db create <restore-verification-db> --from-db <production-db> --timestamp <utc-rfc3339> --wait
   ```

3. On that isolated target only, record aggregate legacy player/team row and
   distinct-ID counts, inspect `sqlite_master` and `PRAGMA table_info`, and run
   the migration status command below. Do not query raw player payloads.
4. Apply and verify migrations on the isolated target. A successful check proves
   that restoration creates an independently usable copy without replacing
   production.
5. Destroy the disposable target after the change evidence has been recorded:

   ```sh
   turso db destroy <restore-verification-db> --yes
   ```

If a production recovery is later required, repeat step 2 with a new recovery
database at the selected timestamp, verify it exactly as above, change the
Vercel Production database secret through the approved secret-management path,
and deploy/redeploy the selected application revision. Do not overwrite the
original production database. Retain it until the recovered deployment passes
read-only health and data checks.

## Journaled snapshot and Labs migrations

`drizzle/meta/_journal.json` is the authoritative Drizzle journal for the
snapshot and Labs migration baseline. It contains, in order:

1. `0006_add_season_snapshots`
2. `0007_add_season_snapshot_batches`
3. `0008_add_snapshot_batch_member_uniqueness`
4. `0009_add_labs_candidate_foundation`
5. `0010_add_labs_evaluation_evidence`

Earlier repository SQL files predate the controlled journal and are not
retroactively replayed. `0006` is idempotent against the pre-existing legacy
snapshot tables; each later journaled migration, including `0007`, `0008`, and
`0009`, is applied only when its journal hash is absent. An unknown database
journal hash is a hard stop rather than a
best-effort repair.

`npm run db:push` is unsuitable for production: it reconciles a schema instead
of applying a reviewed journal, and its config loads dotenv files. It must not
be used for this procedure.

The commands use Drizzle's supported libSQL migrator. They require all
configuration to be injected by the secure operator environment, fail closed
when configuration is missing, and produce only target labels, migration tags,
and aggregate counts.

```sh
# Read-only: lists known applied and pending journal tags.
MIGRATION_TARGET=isolated npm run db:migration-status

# Isolated target only: applies journaled migrations that are still missing.
MIGRATION_TARGET=isolated npm run db:migrate

# Production additionally requires a deliberate acknowledgement.
MIGRATION_TARGET=production CONFIRM_PRODUCTION_MIGRATION=APPLY npm run db:migrate

# Read-only pre-capture schema and legacy-inventory verification.
MIGRATION_TARGET=isolated npm run db:verify-season-snapshot-schema
```

The secure environment must also supply `MIGRATION_DATABASE_URL` and
`MIGRATION_DATABASE_AUTH_TOKEN`; never type their values into the command line.
The migrator reads the journal, refuses unknown applied hashes, applies only
pending entries using Drizzle/libSQL, and then requires every journal hash to be
recorded in `__drizzle_migrations`. Repeating it must report no newly applied
migrations.

For the Phase 1A pre-capture state, schema verification requires:

- `season_snapshot_batches` exists;
- both snapshot tables have nullable `batch_id` columns;
- both partial unique batch-member indexes exist;
- every existing legacy row still has `batch_id IS NULL`;
- no snapshot batch exists.

Capture is a separate, explicitly authorized operation and is never part of
this runbook.

## Production change sequence and stop conditions

1. Verify the Vercel Production database mapping and deployment branch.
2. Create and test a PITR restoration copy as above; record its identifier and
   UTC timestamp in the maintenance evidence.
3. Run the read-only status command against production. Stop for an unknown
   journal hash, an already-present unjournaled Phase 1A column/index, an
   ambiguous database identity, or a missing recovery copy.
4. Run the explicit production migration command once during the approved
   maintenance window.
5. Run the read-only schema verifier and compare legacy aggregate counts and
   distinct IDs to the pre-migration record. Stop on any difference or any
   fabricated batch.
6. Deploy only the reviewed Git commit, then make authenticated read-only API
   and public-health requests. Do not call the snapshot capture endpoint.

If the application deploy fails but the schema is healthy, roll back through
the Vercel/Git deployment mechanism to the last known-good commit; do not undo
the additive schema manually. If database recovery is required, use the new
PITR database procedure above and point the approved production deployment at
the verified recovery copy. If neither option is safe, stop and escalate rather
than editing snapshot rows or issuing ad-hoc DDL.

## Phase 3 candidate-foundation rollout

Vercel's Git deployment builds the application (`next build`) but does not run
Drizzle migrations. The Labs overview is dynamically rendered and reads the
Labs tables only at authenticated request time. Old application revisions do
not query those tables, so `0009` is backward-compatible. Deploying the Phase
3 application before `0009` intentionally shows an unavailable candidate
inventory rather than treating a missing table as an empty inventory; it is not
the approved rollout order.

Before the first Phase 3 production registration, use this order:

1. Verify the reviewed PR head and read-only status: production must have only
   `0009_add_labs_candidate_foundation` pending.
2. Create a fresh, independently readable PITR recovery database immediately
   before the maintenance window. Record its UTC restore timestamp, source
   database identity, migration journal, aggregate legacy and verified snapshot
   counts, and snapshot identity fingerprint. Verify that it includes the
   current COMPLETE batch before proceeding.
3. Apply the journaled migration once through the explicit production command;
   never use `db:push` or ad-hoc SQL.
4. Run `MIGRATION_TARGET=production npm run db:verify-labs-candidate-schema`.
   It fails closed on a pending migration, missing Labs table/index/trigger, or
   foreign-key violation and reports only aggregate snapshot counts plus an
   identity fingerprint. Before any future write phase, all four Labs-table
   counts must be zero.
5. Compare the recorded snapshot counts and fingerprint to the recovery-point
   evidence, merge the reviewed PR, and let Vercel deploy the resulting main
   commit. Then verify the authenticated `/admin/labs` page and public health.

The retained `hockey-ledger-db-phase1a4a-recovery-20260912t235530z` recovery
database predates the verified 2025-26 capture and is therefore not a sufficient
Phase 3 rollback point. Retain it, but create and verify a new recovery target
under separately authorized production maintenance before applying `0009`.

## Phase 4 evaluation-evidence rollout

Vercel does not run Drizzle migrations. The Phase 4 overview reads its new
tables only at authenticated request time, so old application revisions are
compatible with the additive empty schema. The approved future order is: verify
the reviewed PR and journal state; create and independently verify a fresh PITR
recovery database containing the current COMPLETE batch and legacy fingerprint;
apply `0010_add_labs_evaluation_evidence` once using `db:migrate`; run
`db:verify-labs-evaluation-schema`; verify all seven new tables are empty and
snapshot fingerprints unchanged; then merge and deploy the reviewed commit.

If the application fails after the additive migration, roll back the application
only through the documented Git/Vercel workflow. Do not hand-edit or reverse
the evidence schema, and do not create production evidence records as a
verification fixture. The read-only verifier checks the journal, schema objects,
foreign-key integrity, and aggregate Phase 4 table counts without printing
credentials or raw records.

## Vercel Git deployment procedure

The repository's Vercel Git integration creates a **Preview** deployment for a
feature-branch commit. The explicit production branch is `main`; a reviewed
merge to `main` produces the Vercel **Production** deployment. Before a rollout,
use GitHub deployment metadata to verify the deployment environment, deployment
identifier, and exact commit SHA. For an application rollback, redeploy or
re-promote the prior known-good `main` commit through the same Git/Vercel
workflow and verify its GitHub deployment metadata.

Vercel CLI authentication is not required for commit/deployment association.
It is required only if the operator cannot otherwise inspect the protected
Vercel environment-variable scope. Do not infer preview database isolation from
the deployment label alone.
