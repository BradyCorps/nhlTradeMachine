# Issue reporting — text-only first release

## Public and Admin contract

`/report-issue` is reachable from the global footer and the homepage feedback invitation. Required description is 10–4,000 characters; optional steps 4,000, page URL 2,048, email 254. A browser-generated UUID identifies one attempt. A server SHA-256 fingerprint of normalized submission fields prevents changed requests reusing that identity. A unique database primary key arbitrates simultaneous submissions. Exact retries confirm the original report without rewriting its creation time or Admin review fields. The browser keeps text and the same captured viewport/id after a failed acknowledgement; the synchronous submission lock prevents double clicks before React updates the disabled button. Starting another report generates another identity.

Only server submission time, a bounded User-Agent and viewport dimensions are captured. No cookies, credentials, session values or browser storage are copied into reports. Automatic and submitted URLs remove credentials, fragments and all query parameters except numeric `season`, `gameType` and `player`. The originating link resolves its URL at activation. No submitted URL is fetched. Visitors are reminded not to include passwords/private information; arbitrary report text cannot be guaranteed free of secrets supplied by the sender.

Public API: `POST /api/issue-reports`. No public list or detail API. Strict server validation rejects unknown fields (including attachments), wrong content type, spam-trap content and bodies over 32 KiB, including chunked bodies. Existing public rate limiting uses a dedicated namespace: 3 new reports/IP/minute, 20 globally/minute, 200 globally/day. Known exact retries bypass creation quotas. The existing Redis limiter falls back to per-instance per-IP memory when Redis is unavailable: distributed/global limits are not guaranteed during that fallback; IP identity is only as trustworthy as the proxy headers. No image/text report content goes into Redis.

Admin list/detail/update/delete use the existing signed-session authorization (and existing operator header authorization), independent of the page proxy. All responses are `no-store`. Newest-first lists are bounded to 50 records with paging. Statuses: New, Investigating, Resolved, Dismissed. Internal notes are bounded to 4,000 characters. Description/contact/source context stay unchanged by review updates. Delete requires confirmation and removes the database row; cancel and failed deletion retain the record. There are no attachments to orphan in this release. List paging can shift if new reports arrive; refresh starts from the currently selected page.

## Screenshot support: unavailable, explicitly disclosed

The repository has Turso/libSQL and Redis, but no configured private upload abstraction/client or direct image-decoding dependency. This release does **not** provide a file control, public bucket, image base64 in Redis, or pretend uploads succeeded. Both public and Admin screens explain that screenshots were unavailable. Attachment access/image-processing tests are not applicable; unsupported attachment payloads are rejected. No storage service was provisioned and no billing changed.

Smallest follow-up: supply an operator-owned private object bucket and server-only upload/read/delete credentials (or an approved private file-storage integration), then add a bounded attachment boundary. It must validate actual JPEG/PNG/WebP content, decoded dimensions/pixel count and size (maximum two images, 5 MB each), reject SVG/non-images, re-encode to remove metadata, and serve images only through authenticated Admin access. Upload failure compensation and deletion/retry bookkeeping must be tested before enabling the control; a database attachment manifest must coordinate stored objects so partial failures are visible and recoverable. This requires separately reviewed storage configuration and implementation; this PR does not invent a configured storage service.

## Migration / rollout — requires later authorization

Migration `0011_add_issue_reports.sql` adds only `issue_reports` and its newest-first index. It is appended to the existing Drizzle journal. There is no runtime CREATE TABLE or automatic Production migration. Existing migration hashes and historical snapshot definitions are unchanged; upgrade tests check snapshot preservation while applying the appended journal entry.

After review and separate rollout authorization:

1. Inspect `npm run db:migration-status` with `MIGRATION_TARGET=production`, `MIGRATION_DATABASE_URL` and `MIGRATION_DATABASE_AUTH_TOKEN` supplied privately through the established operator environment. Confirm the existing journal is compatible and the only new pending migration is 0011.
2. Apply with `CONFIRM_PRODUCTION_MIGRATION=APPLY npm run db:migrate` and those same privately configured migration variables. Never place credentials in command text, committed files or screenshots.
3. Recheck the journal, then merge/deploy normally after exact-head CI/Preview approval. Existing runtime `DATABASE_URL`/`DATABASE_AUTH_TOKEN`, Admin secret/session and optional Redis credentials suffice; no new text-reporting configuration is needed.
4. Verify form access and authenticated empty/list reads. Obtain explicit authorization before any real Production test submission. This pass created no Production records.

If the table is absent, submission and Admin listing report an explicit unavailable error; text remains in the browser. Roll back the application through the ordinary deployment rollback; retain the additive table and received reports. Do not drop the table as part of an application rollback. Delete is irreversible through the application and requires an external database backup for recovery.

## AI recap pause

A separate commit reuses PR #41's pause because origin/main did not contain it. Successful single-season and Cup Run simulations return deterministic results without automatically calling `/api/claude`. The results panel explains the pause and keeps Season Review. No enabled recap action promises a narrative. Trade-memo AI is a separate existing action, unchanged; no AI issue processing is introduced. Re-enable the recap switch only after explicit authorization and service verification.

## Verification

Focused tests use a disposable in-memory libSQL database and the journaled migrations. The browser harness starts a built app with its own disposable file database, a fixture signed Admin session and both Redis credential pairs blank; it neither contacts nor writes Production. At 320, 412 and 1440px it checks validation, originating URL stripping, optional fields, lost success acknowledgement/retry, synchronous double click prevention, signed Admin read/update/delete, cancelled/failed deletion, visible keyboard focus, page overflow and application errors. The existing Season Review harness additionally asserts zero recap requests and intact simulation/review interaction at 320, 412, 1024 and 1440px.

Screenshots in this directory are local isolated fixtures, not authenticated Preview or Production evidence. Preview availability alone is not a live authenticated Admin pass.

| Width | Public form | Protected Admin detail |
| --- | --- | --- |
| 320px | [Form](public-form-320.png) | [Review](admin-detail-320.png) |
| 412px | [Form](public-form-412.png) | [Review](admin-detail-412.png) |
| 1440px | [Form](public-form-1440.png) | [Review](admin-detail-1440.png) |

The committed [browser receipt](report.json) records the isolated journey outcomes. Screenshot fixtures use a dummy email and local URLs; they contain no real reports or Admin credentials.
