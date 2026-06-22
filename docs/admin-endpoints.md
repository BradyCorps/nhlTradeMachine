# Admin Curl-Only Endpoints

These routes are intentionally not surfaced in the admin UI. They remain available for
operator use through authenticated requests only; unauthenticated calls return `401`.

- `GET /api/admin/clear-cache` — legacy cache flush route. The admin Settings page uses
  `POST /api/admin/settings` with `{ "action": "clear_cache" }` for the same normal UI flow.
- `POST /api/admin/import-draft-class` — bulk imports a draft class from a reviewed payload.
- `DELETE /api/admin/import-draft-class` — removes an imported draft class by `draftYear`.
- `GET /api/admin/prune-stale` — dry-run stale player pruning and reports source health.
- `DELETE /api/admin/prune-stale` — executes stale player pruning only when upstream source
  health and catastrophic-delete guards pass.
- `GET /api/admin/db-info` — reports masked database target/debug metadata.
- `GET /api/admin/development-profile` — diagnostic development-profile lookup.
- `POST /api/admin/development-profile` — diagnostic development-profile lookup with
  optional external timeline rows.
