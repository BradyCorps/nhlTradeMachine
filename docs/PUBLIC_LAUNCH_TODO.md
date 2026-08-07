# Public Launch TODO

This is the release-readiness queue for taking Cap & Crease from an internal
beta to a public production application. Complete one scoped item at a time and
record each completion at the top of `docs/DEVNOTES.md`.

Legend: `[ ]` to-do · `[~]` in progress · `[x]` complete

## P0 — launch blockers

### [x] PL-1 — Make X-NAV one canonical calculation

Root: public player/team surfaces call `calcNAV` directly while `/api/evaluate`
maintains a second field-by-field adapter and applies the historical pedigree
floor after the engine. The adapter drops valid inputs, local surfaces can use a
different cap ceiling, and the post-engine floor changes the headline without
adding a valuation stage. The same player can therefore receive different NAV
and FMV results on different screens, and the displayed stages need not explain
the headline.

Fix: provide one typed raw-asset adapter used by every public raw-asset caller;
move the pedigree floor into the canonical engine as an explicit stage; preserve
all `AssetInput` fields; use the live cap ceiling consistently; and remove the
route-local valuation wrapper.

Acceptance: route and direct calculation return the same complete `XNAVResult`
for representative skater, goalie, prospect, and pick inputs; baseline TOI,
baseline-season weight, goalie ice time, EDGE, contract, and cap-ceiling inputs
survive the adapter; every returned stage list reconciles to the headline; and
`npm test` plus the production build pass.

### [ ] PL-2 — Put Gravity display, X-NAV, and simulation behind separate gates

Keep Gravity v4 off. Give v3 display, X-NAV contribution, and simulation
contribution independent feature flags. Default unvalidated value propagation
to off for public launch unless held-out evidence clears the documented gates.

### [ ] PL-3 — Gate insufficient Gravity evidence

Return `INSUFFICIENT` with no tier or percentile when sample or coverage is too
thin. Make reliability coverage-constrained so zero evidence cannot produce a
medium score. Recalibrate tiers from an authorized qualified population and
remove unsupported cross-position percentile claims.

### [ ] PL-4 — Upgrade to a supported Next.js release

Migrate Next.js 14 to an Active or Maintenance LTS release in a dedicated PR.
Clear all critical/high production advisories and rerun the complete test,
build, browser-smoke, and deployment checks.

### [ ] PL-5 — Obtain and document data/asset permissions

Complete a source-by-source legal inventory for NHL APIs, statistics, EDGE,
headshots, team marks, MoneyPuck inputs, contract sources, and redistributed
artifacts. Obtain any required written permission and put required attribution
on every page, export, and share image that uses the source.

### [ ] PL-6 — Harden public and administrative endpoints

Rate-limit and bound expensive public routes; add global spend/concurrency
ceilings and upstream timeouts. Add admin brute-force protection, secret policy,
logout/revocation, mutation audit logs, strict origin handling, and production
security headers including CSP, HSTS, frame restrictions, referrer policy, and
permissions policy.

### [ ] PL-7 — Make production database deployment reproducible

Create a complete baseline migration and journal, stop swallowing arbitrary DDL
errors, validate required production environment variables at startup, and
document/test backup, restore, rollback, and migration procedures.

## P1 — required before open beta

### [ ] PL-8 — Version and fingerprint every published valuation

Return and persist model version, data snapshot time, source coverage, cap
ceiling, calculation time, and a stable input fingerprint with each X-NAV result
and frozen Docket record.

### [ ] PL-9 — Publish an X-NAV model card and independent validation

Document coefficients, curated floors, training/validation windows, benchmark
comparisons, uncertainty, failure modes, and cross-position limitations. Validate
full X-NAV against held-out trades/outcomes rather than famous-player ordering.

### [ ] PL-10 — Add browser, accessibility, and performance release gates

Add Playwright coverage for trade evaluation, player dossiers, shared trades,
simulation, and admin authentication. Add automated accessibility checks,
keyboard/screen-reader review, Lighthouse budgets, and load tests for full-league
valuation and simulation requests.

### [ ] PL-11 — Add CI, monitoring, and kill switches

Run tests, build, lint, dependency audit, migration validation, and NAV parity on
every PR. Add structured error reporting, source-freshness and cron alerts,
latency/error SLOs, and immediate NAV/Gravity feature kill switches.

### [ ] PL-12 — Complete public release hygiene

Resolve lint warnings, remove generated/debug artifacts from source control,
audit third-party data before repository publication, and add appropriate
LICENSE, SECURITY, privacy, terms, attribution, and operator documentation.

## P2 — Gravity v4 release path

### [ ] PL-13 — Fit and validate Gravity v4 from authorized data

Complete stable-ID inputs, teammate-only OZ targets, event-valued transition,
context-adjusted defense, uncertainty intervals, decile calibration,
year-over-year stability, sensitivity tests, and reproducible fitted artifacts.

### [ ] PL-14 — Shadow-test Gravity v4 before activation

Run v4 without affecting public NAV or simulation. Activate a learned incremental
term only if it improves held-out X-NAV performance in two non-overlapping test
periods and disabling the flag exactly restores the base result.
