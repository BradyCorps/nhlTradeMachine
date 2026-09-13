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

## Journaled Phase 1A migrations

`drizzle/meta/_journal.json` is the authoritative Drizzle journal for the
Phase 1A migration baseline. It contains exactly:

1. `0006_add_season_snapshots`
2. `0007_add_season_snapshot_batches`
3. `0008_add_snapshot_batch_member_uniqueness`

Earlier repository SQL files predate the controlled journal and are not
retroactively replayed. `0006` is idempotent against the pre-existing legacy
snapshot tables; `0007` and `0008` are applied only when their journal hashes
are absent. An unknown database journal hash is a hard stop rather than a
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
