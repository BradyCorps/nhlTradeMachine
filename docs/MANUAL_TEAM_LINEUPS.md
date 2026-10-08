# Manual team projected lineups — 2026-10-08

## Behavior and editing

The user chose a maintained per-team lineup that stays visible until updated,
with its as-of date shown. This is a projection, not a verified game sheet.
Admin → Lineups (`/admin/lineups`) offers four LW/C/RW forward lines, three
left/right defence pairs, two goalies in projected order, and reported scratches.
A partial lineup may be saved; empty slots say Unfilled. Goalie order never
announces a confirmed starter. Source/reporter and an HTTP(S) link are optional.

Choose the team and competition, enter the as-of date and available reporting,
arrange the players, and save. Save or discard edits before changing teams.
The editor targets the current default observed season. Storage is isolated by
team, observed season and regular season/playoffs; historical pages cannot
inherit a current-season lineup. There is no automatic expiry or game-date match.
Update the date when reviewing news, even if combinations have not changed.

Public team pages and expanded Teams cards prefer a saved manual projection.
Readers can select Model depth chart separately. With no saved projection, the
existing model is shown. Remove manual lineup restores that fallback. A visible
page refreshes manual data every minute and on focus; reloading shows a save
immediately without clearing league, statistics or model caches.

Player choices come from the existing canonical assigned roster, including
rookies without prior-season model production. Missing players, team ownership
and exclusions must first be corrected through Contracts, then the editor's
roster reloaded. Saving rejects wrong-team, wrong-position-group and duplicate
players, including duplicates between lines and scratches. Any forward may fill
LW/C/RW; model position/ranking does not dictate reported combinations.

If a saved player later leaves the current assigned roster, the public display
shows an unavailable slot and a review notice; it does not restore that player.
A storage failure is labelled separately from an absent manual lineup. Failed
refreshes may retain only the last successfully loaded lineup for that same
team/season/competition and explicitly label it stale.

## Storage and boundaries

The existing `site_settings` key/value table is sufficient: one versioned JSON
record under `manual-lineup:v1:<season>:<gameType>:<team>`. No migration or
new dependency is needed. This is mutable editorial data, not append-only
statistical evidence. Each save creates a server timestamp and revision UUID;
atomic compare-and-set rejects stale saves/removals with HTTP 409. Reload and
reapply changes after a conflict. An ambiguous response should be reconciled by
reloading; repeating the old revision cannot overwrite a newer save.

Admin GET/POST/DELETE authorize before importing or initializing roster/database
work. Storage initializes inside the guarded read boundary, so even a missing
database configuration yields labelled unavailability rather than a module-load
crash. Public GET is
read-only. Both use no-store responses. The new writer only changes its own
setting key; it never changes roster rows, observations, contracts, valuation,
model ranking, capture settings or historical evidence. This feature does not
establish persisted historical capture health or fix a stale canonical roster.

## Verification and delivery

Focused tests use a disposable libSQL database and fixture roster, covering
validation, authorization-before-work, persistence, team/season/competition
isolation, concurrency, duplicate retries, removal and corrupt storage. Browser
checks use local fixtures; they do not create a Production lineup.

Local verification: `npm test` passed 2,898/2,898 across 228 files; the initial 15 new
focused tests passed. A subsequent hosted initialization correction passed all
16 focused tests, including an import-time database failure fixture. Typecheck, changed-file ESLint and production build passed.
Eleven fixture browser journeys passed against the local production build:
keyboard save, reopen, 320px editor, manual/model views at 320/412/1280px,
failed refresh, removed player, other team, removal fallback and storage failure.
An initial harness mismatch in native-select labels and existing model markup
was corrected without changing application code. Generated malformed dev types
were cleared from this worktree before the successful clean build.

Actual local HTTP checks against an isolated database returned public
`200 {"lineup":null}` with `Cache-Control: no-store`, and Admin GET/POST/DELETE
returned 401 without credentials. Hosted authenticated save/removal and
Production lineups have not been exercised. The first Preview smoke check
found its missing database configuration caused an import-time failure; this
was corrected with lazy initialization, without changing any environment.
Expect labelled public 503 in a Preview without database access and Admin 401
without app credentials; a configured database is required for hosted saves.

Delivery uses a separate PR from the model forward-group coverage correction
(PR #50). Neither merge nor Production edits are part of this task. After normal
merge/deployment, sign into Admin, reconcile roster membership if needed, enter
current reported lines, then verify the as-of date, player links, scratches and
model toggle on the public team page. No checkpoint flag or migration step is
needed for manual lineups.

## Release correction — October 8

The initial final-head browser matrix timed out on `/teams/edm` because the
client rejected HTTP 503 before consuming its response body. The fallback
rendered correctly, but Chromium retained a pending request and never reached
network idle. Consume the body before inspecting HTTP status; schema parsing
and unavailable/stale behavior remain unchanged. The actual local production
build reproduced the failure before correction. Against real isolated HTTP 503
responses, the corrected page reached network idle in 1.8–3.0 seconds at
320/412/1280px. A mocked finite response alone had missed this transport issue.
