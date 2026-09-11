# NAV-01 calibration targets and evidence feasibility

Decision recorded September 8, 2026. This specifies the next research
experiment; it does not introduce a production formula or claim validation.

**Phase 5 update, September 9:** the resolved-contract protocol freezes annual
cap share at signing as the common **shadow** calibration target for F/D/G.
Historical transactions remain a validation enhancement, not an automatic
prerequisite for the Phase 5 fit or shadow output. The market-only reference
population passes representation/sample gates; ELCs are policy-constrained
fallback coverage rather than open-market training labels. See
`NAV01_CONTRACT_CALIBRATION_PROTOCOL.md`.

## Preserve the product's meaning

X-NAV remains a signed composite asset index combining on-ice contribution,
contract advantage and explicitly disclosed adjustments. It is not a salary
quote, pure contract surplus, or a goals-above-replacement statistic. Replacing
it with any of those would change the product objective, not merely calibrate
the existing model.

The inspected `xnav-engine.ts` uses 12 NAV per $1M inside BOTH contract loops,
then applies contract-year averaging, discounting and other adjustments.
Skater and goalie paths also use different concentration and retention terms.
That shared intermediate multiplier does not establish an exchange rate for
the final headline. It must not be used to claim that a 120-NAV goalie and
120-NAV forward each have $10M of asset value.

**Shared-unit decision:** retain the dimensionless NAV point for the eventual
headline, but establish comparability through separately measured common
on-ice and economic units first. A final mapping from those measurements to
NAV remains unfitted. No population mean/spread matching, percentile mapping,
or hardcoded dollar conversion can close that gap.

## Targets selected for the calibration experiment

| Layer | Common measurement unit and horizon | Validation target | Limits |
| --- | --- | --- | --- |
| On-ice contribution | Net goals added/prevented above a position-appropriate replacement player over one NHL regular season, at the player's workload | An independently specified estimate of individual goal contribution, evaluated out of time; separately check team outcome consistency | Individual contribution is estimated, not directly observed. Goalies' GSAx alone uses an expected-shot baseline, not a replacement-player baseline. Raw skater points and on-ice xGA cannot be equated to individual net goals. |
| Market price | Annual cap share (`AAV / signing-season cap ceiling`), with contract term and signing status recorded | Actual signed contract AAV/cap share predicted using only information available before signing | Price tests economic calibration, not hockey impact or trade value. Separate UFA, RFA and extension populations; price differences cannot be interpreted solely as ability. |
| Contract advantage | Signed annual cap-share difference between estimated market price and the club's actual obligation; preserve the yearly vector across the controlled term | Validate the market-price model first; reconcile each year's obligation and surplus mechanically | Surplus itself has no independently observed counterfactual label. Missing contract facts remain missing; no fictitious $0 contracts. Multi-year discount/control rules need separate evidence. |
| Composite X-NAV | Shadow bridge of deal-excluded positional signals into expected annual cap-share percentage points at signing | Frozen contract-cohort validation/holdout comparison; transaction evidence is a later enhancement | A price is not pure hockey impact or trade fairness. The shadow bridge does not replace the public dimensionless NAV headline without its own release evidence. |

The on-ice target is a methodological choice for this experiment, not a claim
that an independent GAR provider supplies ground truth. Evolving-Hockey's
[GAR glossary](https://evolving-hockey.com/glossary/goals-above-replacement/)
provides a concrete precedent for a common goal unit with separate skater
and goalie components. Its [replacement-level discussion](https://evolving-hockey.com/blog/wins-above-replacement-replacement-level-decisions-results-and-final-remarks-part-3/)
explains why average and replacement are different baselines. We are not
adopting its coefficients, thresholds, data or results as our own validation.

**Reference population remains to be estimated.** Use a reproducibly defined,
position-appropriate readily available replacement population, determined
from development data only. Do not define replacement as zero NAV, the mean
player, or a handpicked set of names. Publish the cohort, workload rules and
sensitivity before fitting the shared scale. The season-total horizon must
retain actual workload; per-60 rates are diagnostics, not interchangeable
with a season's total contribution.

## Metrics chosen; numerical tolerances still require the target dataset

- On-ice: absolute error in season-total goal units against the frozen
  independent reference, signed bias by F/D/G and workload group, and
  calibration slope/intercept. Include rate error as a workload diagnostic.
- Market price: MAE and signed bias in annual cap-share percentage points,
  by F/D/G and contract-market status, with interval coverage reported.
- Both: paired candidate-minus-current-engine errors on identical eligible
  cases. Fit any engine-score-to-target conversion on development data only;
  do not compare raw NAV points directly to goals or cap shares. Correlation
  is secondary and cannot establish equal scale or zero bias.
- Composite: no primary error metric is declared until the non-circular
  transaction target exists. No invented transaction labels or candidate-
  priced draft picks may stand in for observed evidence.

Sample floors, acceptable error/non-regression margins and interval methods
must be frozen after development-only feasibility work and before any new
holdout outcomes are inspected. The manifest's numerical-threshold field
therefore remains null. These are unresolved statistical requirements, not
permission to tune thresholds until an evaluation passes.

## Independent evidence: verified availability versus eligibility

The public [MoneyPuck data catalogue](https://www.moneypuck.com/data.htm),
checked September 8, lists season summaries back to 2008–09, game-level
skater/goalie/line data, and historical shot downloads. This establishes that
additional historical inputs are available; it does not establish the
independence of a particular holdout or completeness of historical contract
and shift joins. No additional raw dataset was downloaded in this step.

| Candidate | Feasible role | What it cannot establish by itself |
| --- | --- | --- |
| Older MoneyPuck seasons not in the eight-file freeze | Expand development samples; reconstruct historical experiments after exposure and input-version audits | A new forward-in-time holdout for the current engine, whose development used later seasons |
| Game/shot data from the already inspected 2022–26 seasons | Improve attribution diagnostics and historical joins | Independence merely because the file granularity is new; aggregate outcomes already informed selection |
| A separate provider's individual contribution estimates | External construct comparison, subject to provenance/access and shared-input checks | Ground truth or temporal independence merely because the provider differs |
| New outcomes collected after the final model/protocol freeze | Prospective out-of-time evaluation once adequate samples and all targets exist | Immediate release, or a retrospective forecast made with information learned after the cutoff |
| Historical signed contracts and asset exchanges | Economic and composite target feasibility after joining as-of inputs and market context | An untouched holdout until prior exposure, timestamp leakage and circular labels are excluded |

**Recommendation:** proceed next with a development-only target-construction
pilot: determine whether individual contribution and as-of contract/transaction
targets can actually be assembled, including player IDs, workload, replacement
cohort, market status, historical obligations and input timestamps. Produce a
coverage/leakage report before fitting any conversion. If transaction evidence
cannot support the composite target, report that limitation and request an
explicit acceptance-scope decision rather than silently redefining NAV as
GAR or salary surplus. A prospective holdout starts only after the complete
candidate and evaluation protocol are frozen, not at this memo's date.

## Gate status

The target-design decision is complete. Calibration, full statistical protocol,
independent evaluation and release remain blocked. The source manifest keeps
unresolved evaluation fields null; `targetDesign` records these choices without
promoting them to validated evidence. NAV-01 remains open.
