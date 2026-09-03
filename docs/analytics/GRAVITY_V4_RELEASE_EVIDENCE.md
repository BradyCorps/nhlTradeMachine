# Gravity v4 — Release Evidence (OZ + DZ, untiered)

Reviewed 2026-09-03. Scope: the committed artifact and its runtime path only.
Evidence is either (a) verified in this environment, (b) recorded in the dated
dev-log from the codespace run that produced the artifact, or (c) marked
**not available**. Nothing below is inferred from leaderboards.

## Artifact identity (verified here)

| Field | Value |
|---|---|
| File | `app/lib/gravity-v4/fitted-artifact.json` |
| SHA-256 | `6de0271ef80f0969185e4217604efa332f1a94e7a1144d586a18ede05e74e29f` |
| Schema | `gravity-v4-profile-set/1` · kind `fitted` |
| Generated / trained | 2026-08-22T16:39:29.669Z / 2026-08-22T16:39:29.616Z |
| Source version | `capandcrease/oz-dz@20252026` |
| Profiles | 560 (181 C · 181 W · 198 D), unique ids, all season 2025-26, 5v5 |
| Sample | OZ = DZ minutes; min 300.3 · median 600.2 · max 1014.9 |
| Tier / net interval / net percentile / portability | null on all 560 |
| Reliability · data quality | LOW 535, MEDIUM 25 · `partial` on all 560 |
| NZ | `missing` / `insufficient` / 0 minutes / no interval on all 560 |
| Visual scales | zone 0.8181 · net 1.1879 (identical on all profiles) |

The manifest (`app/lib/gravity-v4/artifact-manifest.ts`) pins the checksum and
count. All 560 profiles pass `validateGravityProfileV4` with exact id/season.

## Offline validation (dev-log, codespace run; not reproducible here)

| Well | Split-half r (all / F / D) | Shuffle null | Identity | Bootstrap (95% CI excludes 0) |
|---|---|---|---|---|
| OZ (λ=100k, predeclared) | 0.409 | collapses (\|r\|<0.10) | gravity→teammate xG > finish→teammate, both positions | 118/594 (20%) |
| DZ | 0.328 / 0.299 / 0.379 | −0.036 | defense→opponent xG 0.372 vs offense −0.032 | 126/594 (21%) |
| NZ (rush proxy v2) | 0.099 / 0.052 / 0.154 | 0.035 | passes technically (0.120 vs −0.003) | — |

Verdict on NZ: noise; excluded. Rush-share 14.2% (target 20–30%) also short.

## Runtime gates (tests in `__tests__/gravity-v4-release-evidence.test.ts`, all passing)

- Bad schema version → `artifact_invalid`; diagnostic kind on the public path
  → `artifact_invalid`; profile/envelope kind mismatch, forged tier, weighted
  net, NZ relabelled as a value → `profile_invalid`; wrong season →
  `profile_invalid`; unknown id → `profile_missing`; G/Pick → `ineligible`.
- Flag unset / "" / "false" / "1" / "yes" / "TRUE " → `disabled`; nothing renders.
- NZ null end-to-end: artifact placeholder → `gravityZoneXg82OrNull` → card
  `zoneXg82.nz: null`, `netScopeLabel "OZ + DZ"` → panel "Not available" →
  share card "N/A · NOT AVAILABLE".
- Changed artifact: one renamed profile or one dropped profile → checksum
  mismatch → `artifact_invalid` (paths `sha256`, `profiles`). The dossier
  passes the manifest (asserted by test).
- Isolation: no import of `gravity-v4` in `xnav-engine`, `asset-nav`,
  `league-nav`, `team-nav-split`, `nav-breakdown`, `valuation-snapshot`,
  `team-contention-snapshot`, `season-snapshot`, `roster-assembly`, or under
  `app/api/{simulate,evaluate,league,match}`, `app/armchair-gm`, `app/fantasy`,
  `app/teams`. The only importers are the dossier panel, the admin diagnostic,
  the card-payload adapter and the dossier page. `calcNAV` output is
  byte-identical with the flag on and off.

## Regeneration

Not reproduced. `scripts/gravity-v4/export-profiles.ts` reads
`data/gravity-v4/{oz-model,oz-bootstrap,dz-bootstrap}-20252026.json`, which are
gitignored and absent; the stint/possession builders need `.gravity-v4-cache/`
or `api-web.nhle.com`, which is blocked on this host. The committed artifact
was therefore verified by checksum and full-schema validation, not by refit.
A refit that changes any byte will fail the manifest and this document must
be re-issued with it.

## Evidence gaps (stated, not papered over)

- No year-over-year / out-of-time reliability or portability.
- No calibration by decile; no external isolated-impact benchmark.
- 80% of individual players have intervals that include zero: the value is a
  point in a cloud, which is why the display is untiered and shows intervals.
- No incremental X-NAV evidence — and none is needed, because v4 does not
  enter X-NAV.

## Conditions of launch

Dossier only; "Diagnostic" label and disclaimer retained; NZ shown as not
available; no tier, no percentile of net, no leaderboard, no card sharing
beyond the existing server-resolved share card; no entry into any valuation,
ranking, trade, GM, fantasy or simulation path. `GRAVITY_V4_ENABLED` is a
human decision made in Vercel, not by this branch.

## Conclusion

APPROVED FOR LIMITED DOSSIER-ONLY DIAGNOSTIC LAUNCH
