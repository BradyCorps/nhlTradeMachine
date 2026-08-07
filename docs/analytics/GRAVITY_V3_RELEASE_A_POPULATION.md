# Gravity v3 Release A frozen population

Generated from the frozen raw cache at `2026-07-24T21:45:10.482Z`. This report
documents aggregate inputs only. It does not calculate tier cutoffs or activate
Gravity v4. The later aggregate cutoff calculation is documented in
`docs/analytics/GRAVITY_V3_TIER_CALIBRATION.md`.

## Population

- Season: `2025-26`
- Official NHL skater universe: **940**
- Gravity calculation eligible (10+ GP): **778**
- Provisional, no public tier (10–19 GP): **63**
- Public-tier calibration population (20+ GP): **715**
- Qualified forwards: **476**
- Qualified defensemen: **239**
- Duplicate NHL IDs: **0**

Eligibility is deliberately split: fewer than 10 GP is Gravity-ineligible,
10–19 GP permits a provisional calculation but no position percentile/public
tier, and 20+ GP enters the calibration population.

## Source coverage

| Source join | Present | Legitimately unavailable | Unresolved |
| --- | --- | --- | --- |
| nhlOfficialUniverse | 940 | 0 | 0 |
| moneyPuckCurrent | 940 | 0 | 0 |
| moneyPuckBaseline | 844 | 96 | 0 |
| nstBaseline | 840 | 100 | 0 |
| nhlEdge | 939 | 1 | 0 |
| nhlDerivedDps | 940 | 0 | 0 |

| Input | Present | Missing | Zero-valued | Coverage (20+ GP) |
| --- | --- | --- | --- | --- |
| games | 715 | 0 | 0 | 100% |
| avgTOI | 715 | 0 | 0 | 100% |
| qocIndex | 715 | 0 | 0 | 100% |
| xgRelTM | 715 | 0 | 0 | 100% |
| baselineXgRel | 715 | 0 | 16 | 100% |
| pairDriverScore | 232 | 483 | 1 | 32.45% |
| assistsPace | 715 | 0 | 6 | 100% |
| baselineIxg82 | 699 | 16 | 0 | 97.76% |
| goalsPace | 715 | 0 | 31 | 100% |
| ppPtsPace82 | 715 | 0 | 170 | 100% |
| edgeOzPct | 714 | 1 | 0 | 99.86% |
| dzPct | 715 | 0 | 0 | 100% |
| edgeSpeedMaxMph | 714 | 1 | 0 | 99.86% |
| edgeBurstsOver20 | 714 | 1 | 0 | 99.86% |
| xgaRelTM | 715 | 0 | 0 | 100% |
| dps | 715 | 0 | 10 | 100% |
| pkTimeShare | 715 | 0 | 55 | 100% |

Missing values are serialized as `null`. A numeric zero is retained as
observed zero-valued evidence and is counted separately above. Optional-source
absence never removes a player from the official universe.

## Input source matrix

| Input | Source snapshot(s) | Situation | Release A use | Missing-data rule |
| --- | --- | --- | --- | --- |
| games | moneypuck_skater_summary_2025, nhl_official_skater_universe | MoneyPuck all situations; NHL regular-season total | Calculation eligibility, sample/reliability damping, and EDGE bursts per 82. | Official GP is required; the universe build rejects a missing or invalid value. |
| avgTOI | moneypuck_skater_summary_2025, nhl_official_skater_universe | MoneyPuck all situations; NHL regular-season total | Descriptive usage only; Release A does not multiply Gravity masses by TOI. | Official TOI/GP fallback is used; otherwise the value remains null. |
| qocIndex | moneypuck_skater_summary_2025 | Mixed: all-situations ice-time rank and 5-on-5 zone starts | Descriptive context only; Release A does not multiply Gravity masses by QoC. | A missing component uses the existing neutral prior; both missing yields null. |
| xgRelTM | moneypuck_skater_summary_2025 | All situations | Current on/off component of the offensive-zone lift and signal stability. | Null; computeGravity can use baselineXgRel alone or omit lift if both are absent. |
| baselineXgRel | moneypuck_skater_summary_2022, moneypuck_skater_summary_2023, moneypuck_skater_summary_2024, moneypuck_skater_summary_2025 | 5-on-5 with documented all-situations fallback | Multi-season on/off anchor for offensive lift and signal stability. | Null; current xgRelTM remains usable and stability takes the unknown prior. |
| pairDriverScore | nstCurrentPairings, nstPriorPairings | Natural Stat Trick all-situations defensive pair aggregates | Defenseman-only legacy adjustment to signal stability, not partner isolation. | Null; no legacy defense-pair adjustment is applied. |
| assistsPace | moneypuck_skater_summary_2025, nhl_official_skater_universe | All situations | Displayed offensive-zone mass only; excluded from navResidual. | Null; the fixed offensive-zone term is omitted. |
| baselineIxg82 | nstCurrentSkaters, nstPriorSkaters | Natural Stat Trick all-situations skater totals | Individual expected-goal component of displayed offensive-zone mass only. | Null; computeGravity uses goalsPace as its documented fallback. |
| goalsPace | moneypuck_skater_summary_2025, nhl_official_skater_universe | All situations | Fallback for baselineIxg82 in displayed offensive-zone mass; excluded from navResidual. | Null; the individual-xG/goals offensive-zone term is omitted. |
| ppPtsPace82 | moneypuck_skater_summary_2022, moneypuck_skater_summary_2023, moneypuck_skater_summary_2024, moneypuck_skater_summary_2025 | 5-on-4 production | Displayed offensive-zone mass only; excluded from navResidual. | Null only when no qualifying baseline season exists; an absent 5-on-4 row is zero. |
| edgeOzPct | nhl_edge_skater_detail | NHL regular-season EDGE aggregate; no strength-state tag | Transition displacement component of neutral-zone mass and navResidual. | Null; the neutral-zone displacement term is omitted. |
| dzPct | moneypuck_skater_summary_2025 | 5-on-5 zone starts | Deployment expectation for neutral-zone displacement; also descriptive QoC context. | Null; computeGravity uses a neutral 0.5 deployment prior. |
| edgeSpeedMaxMph | nhl_edge_skater_detail | NHL regular-season EDGE aggregate; no strength-state tag | Neutral-zone mass and navResidual. | Null; the fixed neutral-zone speed term is omitted. |
| edgeBurstsOver20 | nhl_edge_skater_detail | NHL regular-season EDGE aggregate; no strength-state tag | Neutral-zone mass and navResidual. | Null; the fixed neutral-zone burst term is omitted. |
| xgaRelTM | moneypuck_skater_summary_2025 | All situations | Displayed defensive-zone mass only; excluded from navResidual. | Null; the fixed defensive-zone suppression term is omitted. |
| dps | nhl_official_skater_universe, nhl_team_summary | NHL regular-season all-situations summaries | Displayed defensive-zone mass only; excluded from navResidual. | Null and an unresolved source join if the NHL team summary cannot be linked. |
| pkTimeShare | moneypuck_skater_summary_2022, moneypuck_skater_summary_2023, moneypuck_skater_summary_2024, moneypuck_skater_summary_2025 | 4-on-5 usage divided by all-situations usage | Displayed defensive-zone mass only; excluded from navResidual. | Null only when no qualifying baseline season exists; absent 4-on-5 ice is zero. |

The machine-readable manifest also records each raw field and normalization.
`avgTOI` and `qocIndex` are retained as provenance and usage context; neither
multiplies a per-rate Gravity mass after the Release A correction.

## Source snapshots

| Source | Kind | Rows | Requests | SHA-256 |
| --- | --- | --- | --- | --- |
| moneypuck_skater_summary_2022 | http | 951 | 1 | dbab6b12ce45ed3a3c6bcaa78d9c993fe7f4f1de820039a277eb0416d7901c5e |
| moneypuck_skater_summary_2023 | http | 924 | 1 | f05add93188ffb18b3aaa2d1222a0d2e4bf74e9343b44edb48bd72eca0471156 |
| moneypuck_skater_summary_2024 | http | 920 | 1 | 6639c8a638c6acc464e71f4d0a536e3f36c395a4f9d11e95fdd54a6602c05592 |
| moneypuck_skater_summary_2025 | http | 940 | 1 | f0d8959f4575b25e83a1cb791c499cc440ce45d9c69fe886ecc62d16a74db4cb |
| nhl_edge_skater_detail | http | 939 | 940 | 332be24b07d439840b407743c74997750775680a0c7947b8900ac84c8ba3d3f7 |
| nhl_official_skater_universe | http | 940 | 10 | d6d6f854662fb55c4641048dc74d75e0ceae636d8cb8dc756a2f76fe6f4e0ba4 |
| nhl_team_summary | http | 32 | 1 | 745e581e5794cf16cd222bada02e81a523c0c1e38b73cab793e148d17cb339d9 |
| nstCurrentPairings | tracked_file | 1475 | 0 | 9802693052a8c11d4462529ebdced4c8d6ae77df7793d0a142e761e019756825 |
| nstCurrentSkaters | tracked_file | 940 | 0 | ecbe0fd77dc64a9e90c4484776c85076432c230e2f58e2182d6f0769683acd1e |
| nstPriorPairings | tracked_file | 3413 | 0 | c8c75d2eba4662d2aee9610f90faf4eff47ae2b24baf000fddc0f9efbbb3f54a |
| nstPriorSkaters | tracked_file | 1210 | 0 | 1f0c653a9179cbde53ee58b0ce8cb2dc06e5485c82ee68772d72c8fd5c6db4a0 |

MoneyPuck data is credited to MoneyPuck.com. The tracked `OtherData/` files
provide the Natural Stat Trick current/prior aggregate baseline inputs. Those
files do not carry NHL IDs, so the builder emits a versioned exact-match
crosswalk. It uses Unicode NFC, case folding, whitespace normalization, explicit
position mapping, and explicit team-abbreviation mapping only. No fuzzy,
nickname, accent-removal, or player-name fallback joins are allowed.

## Coverage distribution

```json
{
  "count": 715,
  "minimumPct": 66.67,
  "p25Pct": 100,
  "medianPct": 100,
  "p75Pct": 100,
  "maximumPct": 100,
  "meanPct": 99.95,
  "buckets": {
    "100": 714,
    "0_24": 0,
    "25_49": 0,
    "50_74": 1,
    "75_99": 0
  }
}
```

## Exclusions and identity

```json
{
  "exclusionReasons": {
    "BELOW_GRAVITY_CALCULATION_MINIMUM_GAMES": 162,
    "BELOW_PUBLIC_TIER_MINIMUM_GAMES": 63
  },
  "unresolvedCrosswalkRows": 15,
  "outOfUniverseCrosswalkRows": 547,
  "unresolvedQualifiedSourceJoins": 0
}
```

The following source rows remain intentionally unresolved and are not used in
normalized inputs. Each has an exact-name candidate in the 2025-26 universe but
fails the explicit position match; the builder does not override that conflict.

| Source row | Source name | Source position | Source team(s) | Classification |
| --- | --- | --- | --- | --- |
| nst:current:skater:637 | Seth Jarvis | C | CAR | POSITION_MISMATCH |
| nst:prior:pairing:kurtis macdermid | Kurtis MacDermid | D | COL | POSITION_MISMATCH |
| nst:prior:pairing:sebastian aho | Sebastian Aho | D | NYI | POSITION_MISMATCH |
| nst:prior:skater:1146 | Ethen Frank | C | WSH | POSITION_MISMATCH |
| nst:prior:skater:160 | Jaden Schwartz | C | SEA | POSITION_MISMATCH |
| nst:prior:skater:399 | Ivan Barbashev | C | STL, VGK | POSITION_MISMATCH |
| nst:prior:skater:643 | Zach Aston-Reese | C | CBJ, DET, TOR | POSITION_MISMATCH |
| nst:prior:skater:698 | Alexandre Texier | C | CBJ, STL | POSITION_MISMATCH |
| nst:prior:skater:717 | Sebastian Aho | D | NYI | POSITION_MISMATCH |
| nst:prior:skater:818 | Paul Cotter | C | NJD, VGK | POSITION_MISMATCH |
| nst:prior:skater:824 | Angus Crookshank | L | OTT | POSITION_MISMATCH |
| nst:prior:skater:888 | Connor McMichael | C | WSH | POSITION_MISMATCH |
| nst:prior:skater:912 | Aliaksei Protas | C | WSH | POSITION_MISMATCH |
| nst:prior:skater:951 | Justin Sourdif | R | FLA | POSITION_MISMATCH |
| nst:prior:skater:955 | Seth Jarvis | C | CAR | POSITION_MISMATCH |

## Completeness gates

- PASS — `officialUniverseRepresented100Pct`
- PASS — `qualifiedIdentityPositionGamesComplete`
- PASS — `duplicateNhlIdsZero`
- PASS — `everySourceJoinClassified`
- PASS — `noOptionalSourceDropsPlayers`
- PASS — `allExclusionsMachineReadable`
- PASS — `deterministicPlayerIdOrdering`
- PASS — `everyComputeGravityInputExplicit`
- PASS — `inputSourceMatrixCoversEveryInput`
- PASS — `inputSourceMatrixReferencesKnownSources`
- PASS — `normalizedSnapshotFingerprintMatches`
- PASS — `cachedRerunReproducible`
- PASS — `structuralValidationPassed`

## Reproduction

```bash
npx tsx scripts/gravity-calibration/build-population.ts
npx tsx scripts/gravity-calibration/build-population.ts --offline
```

The second command performs no network requests and must reproduce the same
normalized population and SHA-256 fingerprint from the frozen raw cache.

## Storage and redistribution

The player-level normalized population and identity crosswalk are intentionally
gitignored. MoneyPuck explicitly permits its listed downloads for
non-commercial use with attribution, while NHL.com terms do not clearly permit
republishing an NHL-derived player database. Commit the builder, aggregate
manifest, and this report only. Store the two restricted artifacts and the raw
cache in private, versioned object storage keyed by their SHA-256 fingerprints;
deployment or CI should verify the committed manifest before calibration.

- Population SHA-256: `6b76883a33802f1fbfc93475ca5240819ad8294bfc5aa5a8f35fd3fe895654f9`
- Crosswalk SHA-256: `846d0c108f0f846a3b33a7b44b6175a1e60817e2e09d45b8a13ab133fb4ab99c`
- Source fingerprint: `8faee7bf2cfb35bbd378200047edcbd96feee9d38148280f4dd636e5d23e82f1`
- Manifest payload SHA-256: `e59c9b8ea35d54b1d7ab8f7d9c94b9f46b8535ee6ffdd3a63d30ebba425e8a04`
