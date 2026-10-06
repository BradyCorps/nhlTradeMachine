# NAV surface trace — 536 vs 538, market AAV, outlook certainty, NAV history

Date: 2026-10-06. Copy changes only; no valuation formula, input or price changed.

## 1. Where the two numbers come from

"First-year panel" is not a code name. The panel is headed **Contract Projection** with the row
**Trade value (NAV) by contract year** (`app/components/PlayerTimeline.tsx`).

| Surface | Entry point | Cap ceiling | Notes |
|---|---|---|---|
| Dossier, server navMap | `calculateAssetNAV(player, liveCap)` | live (`getLiveCapCeiling`) | full asset |
| Player card / `/players` row | `calculateAssetNAV(player)` | static default (104.0) | full asset |
| Card Contract Projection | `calcNAV(asset)` + `calcPlayerTimeline` | `asset.capCeiling ?? default` | full asset |
| `/players` Contract tab | hand-built subset passed to `PlayerTimeline` | `player.capCeiling` | omits `baselineToiPerGame`, `baselineSeasonsWeighted` and others |

Every surface uses one engine (`calcNAV`). Identical inputs give identical results
(`__tests__/nav-surface-trace.test.ts`). A gap in production therefore comes from different inputs.

Mechanisms demonstrated on a fixture (not live McDavid data):
- Omitted baseline context on the Contract tab: roughly ±$0.25–0.31M market AAV and −7/+9 NAV, depending on
  whether current ice time is below or above baseline.
- Timeline clamps to six contract years: affects only deals longer than six years (McDavid's bundled deal is three).
- Cap ceiling: 108.5 instead of 104.0 added about 18 NAV in the fixture.

**Not proven:** which of these produced 536 vs 538 for McDavid. The live inputs (cap ceiling, retention, extension,
games, baselines) could not be read here (the sandbox cannot reach the live site). The static/live cap difference
stays a lead. To settle it, log `capCeiling, capHit, yearsRemaining, retainedPct, asOf date, forecast season,
model version` from each surface for McDavid in Production.

Valuation date and forecast year: `asOfDate` only feeds `buildValuationSnapshot`; it does not change `calcNAV`.
Year 1 of the timeline has decay 1.0 (no forecast aging).

## 2. Market AAV

Meaning: a fit to 1,996 one-way standard contracts (2017–2026) on scoring per 60, ice time, age, UFA status and
unit. It estimates a **typical signing value**, not what a player's output is worth, and not a price for an
exceptional player. Floor is league minimum; ceiling is the CBA 20%.

Validation (walk-forward, forwards): trained on contracts signed before 2024-07-01, tested on the 395 later
contracts. Metric: mean **absolute** error in share-of-cap points, converted to dollars at the ceiling shown
(1.169 pts ≈ $1.2M at $104M; R² 0.7026). "Richest" is the 20 largest *actual* held-out contracts; their mean
absolute miss is 2.25 pts ≈ $2.3M (defence 2.26 pts, 20 deals). These are averages across contracts, not an
interval for any player, and the model applies no adjustment for them. An earlier draft of the copy said "no
consistent bias reported"; that was not supported (the build notes cite a signed +0.51-pt mean on the five
richest forwards, and warn signed means cancel), so it was removed. **McDavid's estimate was not changed.**
The dossier label's explanation (`marketAavDefinition`) now says exactly this.

## 3. Outlook certainty

- "Confidence" (0–100) is a hand-weighted score of experience, seasons on record, volatility and durability.
  Never calibrated against outcomes. Now labelled **Evidence score**, shown `/100`, never `%`.
- "Floor / median / ceiling" is a hand-built band that widens with less history and more volatility. Not a
  prediction interval; never tested for coverage. Now **Low / Median / High case**, "scenario range".
- "Peak years left" is age arithmetic from assumed peak ends (F 30, D 31, G 33) plus two years for a top
  production score. Now **Assumed peak years left**.
- Making these calibrated would need a backtest (coverage of the band, reliability of the score) first.

## 4. NAV history inventory (documented state, not re-verified today)

- One verified COMPLETE batch: as of 2026-09-13, 1,417 players / 32 teams.
- 1,428 players / 33 teams of legacy rows, unverified (per the 2026-10-02 read-only authenticated check).
- That is a single as-of date, not a time series. Snapshot IDs are content hashes and do not prove a stored
  historical valuation. No history line should be drawn, and none was built from forecasts or invented checkpoints.

## 5. Contract tab input correction (follow-up commit)

The tab's inline literal is replaced by `contractTabAsset(player)` (`app/lib/contract-tab-asset.ts`, a thin call to
`toAssetInput`). It restores baseline ice time, seasons weighted, retention, extension terms, contract status and
every other engine input; it also drops the hard-coded `retainedPct: 0`, `multiplier: 1`, `defRate ?? 0.08`.
Forecast logic in `calcPlayerTimeline` is untouched. Year 1 equals the card value when there is no extension;
with an extension the timeline deliberately excludes it from per-year NAV (it clears extension fields in its
loop and prices extension years from `extensionCapHit`), so Year 1 can differ from the headline. Unchanged.

### Cap ceiling by surface
| Surface | Ceiling | Why |
|---|---|---|
| `/players` row, card, Contract tab | `player.capCeiling`, stamped from `/api/league/teams` (live) on load; static `SEASON.capCeiling` only if absent | one value per payload, same for all three |
| Dossier | `getLiveCapCeiling()` | server reads the same live setting |
| `/api/league` navMap | live ceiling | same |
Within `/players` the three surfaces therefore share one ceiling; a static/live gap there is not the cause.
The panel's *next-contract* estimate still divides by static `SEASON.capCeiling` (`PlayerTimeline.tsx`); left as is
and flagged, not changed here. A static fallback occurs only when the teams payload lacks a ceiling.

### Before / after (fixtures, `npx tsx scripts/trace-nav-surfaces.ts`)
| Fixture | Card NAV / AAV | Tab before | Tab after |
|---|---|---|---|
| Star C, current TOI below baseline | 446 / $15.27M | 430 / $14.65M | 446 / $15.27M |
| Star C, current TOI above baseline | 467 / $15.63M | 478 / $16.06M | 467 / $15.63M |
| Winger, 50% salary retained | 280 / $7.92M | 179 / $7.80M | 280 / $7.92M |
| D, expiring | 94 / $6.57M | 88 / $6.05M | 94 / $6.57M |
| Complete input, no baseline extras | 147 / $5.86M | 147 / $5.86M | 147 / $5.86M |

Why: without baseline ice time and seasons weighted the tab pooled a different prior (lower when current TOI is
below baseline, higher when above); ignoring retention charged the full cap hit (−101 NAV on the 50% case); the
no-baseline fixture is unchanged, as expected. Existing engine/baseline tests are unchanged and pass.

## 6. Live comparison
Not possible: the sandbox cannot reach capandcrease.com or api-web.nhle.com. The historical McDavid 536 vs 538
discrepancy remains **unresolved**; the fixture mechanisms are candidates, not findings.

## 7. Proposed, not implemented

Use the live cap ceiling for the panel's next-contract estimate (currently static). Would change displayed numbers.
