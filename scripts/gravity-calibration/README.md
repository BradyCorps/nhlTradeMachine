# Gravity v3 Release A population builder

This tool freezes the aggregate-input population used to recalibrate Gravity v3
after the Release A QoC/TOI correction. It does not calculate tier cutoffs and
does not change runtime behavior.

## Eligibility

- Fewer than 10 regular-season games: Gravity-ineligible.
- 10–19 games: provisional Gravity input profile, no percentile or public tier.
- 20 or more games: included in the public-tier calibration population.

The universe is the paginated NHL Stats skater summary for season `20252026`,
game type `2`. It is never inferred from a successful optional-source join.

## Sources

- NHL Stats skater summary: official universe, stable NHL IDs, positions, games,
  team history, scoring, usage, and plus/minus.
- NHL Stats team summary: inputs for the existing DPS derivation.
- MoneyPuck season-summary skater downloads for 2022-23 through 2025-26:
  current scoring/on-off/zone starts and the production multi-season
  MoneyPuck baseline.
- NHL EDGE skater-detail regular-season aggregates: zone time, top speed, and
  20+ mph bursts. No game events or shift charts are requested.
- Tracked `OtherData/` Natural Stat Trick exports: current/prior individual-xG
  and defense-pair baseline evidence.

MoneyPuck rows already carry NHL player IDs. `OtherData/` does not, so the
builder emits `source-crosswalk.json`. It permits only Unicode-NFC
case/whitespace exact names plus explicit position and team-abbreviation
disambiguation. There is no fuzzy, nickname, surname, accent-removal, or
player-name fallback join.

## Commands

Acquire missing aggregate responses and build:

```bash
npx tsx scripts/gravity-calibration/build-population.ts
```

Rebuild without network access from the same raw cache:

```bash
npx tsx scripts/gravity-calibration/build-population.ts --offline
```

Optional bounded concurrency for NHL EDGE requests:

```bash
npx tsx scripts/gravity-calibration/build-population.ts --concurrency=6
```

Raw HTTP responses and metadata are cached under
`.gravity-calibration-cache/2025-26/`. The cache is gitignored. Responses are
retried with bounded exponential backoff and are never downloaded again while a
matching, checksum-valid cache entry exists.

## Outputs

- `data/gravity-calibration/2025-26/population.json` — normalized player-level
  inputs, gitignored.
- `data/gravity-calibration/2025-26/source-crosswalk.json` — explicit identity
  crosswalk, gitignored.
- `data/gravity-calibration/2025-26/manifest.json` — aggregate provenance,
  fingerprints, field-to-source matrix, coverage, exclusions, unresolved
  crosswalk evidence, and completeness gates.
- `docs/analytics/GRAVITY_V3_RELEASE_A_POPULATION.md` — concise audit report.

The normalized snapshot distinguishes missing evidence (`null`) from observed
zero evidence (`0`) and is sorted by numeric NHL player ID.

## Storage

The player-level NHL-derived snapshot is not committed because NHL.com terms do
not clearly permit republishing a derived player database. Store the normalized
population, crosswalk, and raw cache in private versioned object storage keyed
by the SHA-256 values in the committed manifest. A calibration job must verify
those hashes before use.
