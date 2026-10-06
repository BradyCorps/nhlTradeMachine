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

Upper-end validation (walk-forward, held-out): forwards R² 0.7026, mean miss 1.169% of cap (~$1.2M at $104M).
For the 20 richest held-out forwards the mean absolute miss is 2.25% of cap (~$2.3M) (defence: 2.26%, 20 deals).
No signed top-end bias is reported. Twenty deals is thin evidence for a superstar, so McDavid's figure should be
read as a range. **McDavid's estimate was not changed.** The dossier label now carries this explanation
(`marketAavDefinition`, numbers read from the artifact).

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

## 5. Proposed, not implemented

Make the `/players` Contract tab pass the full player through the `calculateAssetNAV` boundary. It changes
displayed numbers on that tab, so it needs your go-ahead.
