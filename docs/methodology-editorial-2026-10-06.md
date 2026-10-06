# Methodology editorial review, 2026-10-06

Copy-only rewrite based on `origin/main` at `42ad63fd769e640a6b41c5db6307b95145228f76`. The homepage Staff Editorial is the voice reference. Each model starts with a hockey question, explains inputs and testing, and closes with limits. No calculator, fitted artifact, release flag, source record, component styling, navigation, or section anchor changes.

## Representative passages

| Before | After |
| --- | --- |
| “Front offices do not trade goals or Corsi” | “Would you trade a 24-year-old RFA winger for a 31-year-old defenseman with two years left on his deal?” |
| “The composite was validated end-to-end” | “Those figures describe the earlier analysis, not a new end-to-end forecast test of the current X-NAV 4.2 engine.” |
| “The identity profile is real” | “STRAND is an identity profile, not a ranking of who is better or a guarantee of future fit.” |
| “the same decisions in the same season produce the same league, so outcomes are attributable to choices” | “Keeping a seed fixed helps compare modelled changes; it does not prove a roster decision caused that outcome in the real NHL.” |

AI-assisted development is acknowledged explicitly. The deployed calculators use deterministic application code; automated simulation decisions are not language-model decisions. The disabled automatic AI recap is identified separately from usable simulation results.

## Factual conflicts found during the copy review

The following changes narrow or correct descriptions to match existing evidence. They do not change mathematics or release behavior.

| Existing claim | Evidence and disposition |
| --- | --- |
| Historical 252-team-season and 4,453-pair summaries validate the current whole NAV calculator | Preserve every reported metric, population and period as historical results. The [current NAV model card](analytics/MODEL_CARD_NAV.md) distinguishes D-NAV component holdout evidence from full F/G totals. [Team backtest](../scripts/backtest/team-nav-backtest.ts) now uses the actual engine with a different period; [individual stability script](../scripts/backtest/nav-stability-backtest.ts) reconstructs an earlier model. Neither justifies presenting old results as a fresh X-NAV 4.2 forecast test. |
| Young scoring spikes prove development rather than noise | Preserve 106%/20% as average persistence of the increase above baseline. Association does not establish a causal explanation or individual certainty. See [credibility script](../scripts/backtest/credibility-blend-backtest.ts) and dated [development notes](DEVNOTES.md). |
| Forward exponent 1.6 is “within 0.01% of optimal” | Preserve the reported 1,439-contract comparison, exponents and R² values. The displayed .5558/.5548 difference is .001 R²; it does not establish that percentage claim or proximity to the forward-only optimum of 1.4. See [power-curve script](../scripts/backtest/power-curve-backtest.ts) and development notes. |
| V3 backtest period is 2015–2026, and teammate association proves player-caused uplift | [Gravity model card](GRAVITY_MODEL_CARD.md) records 2015–2025 and 5,722 pairs. Remove causal interpretation; focal exclusion and removal of a shared term do not remove linemate/continuity confounding. |
| All Gravity channels are off; v4 is hard-locked pending a fitted artifact | Defaults remain fail-closed, but [release gates](GRAVITY_RELEASE_GATES.md) document a v3 display beta. Newer [v4 release evidence](analytics/GRAVITY_V4_RELEASE_EVIDENCE.md) and [flag](../app/lib/gravity-v4/feature-flag.ts) permit only an explicitly enabled, artifact-checked dossier diagnostic. OZ/DZ fitted; NZ excluded. NAV/rankings/trades/simulation unchanged. Older hard-lock wording in the release-gates document is stale and needs a separate documentation reconciliation. The rewrite describes release permission, not a newly verified live environment setting. |
| All eight STRAND dimensions passed the stability test | Preserve all numerical results. [Stability script](../scripts/backtest/strand-stability-backtest.ts) tests seven computable traits; eight are displayed. Stability is not accuracy or independent skill. |
| Every goalie profile metric is regressed before valuation; forward peak is 27–28 | [Goalie profile](../app/lib/goalie-percentiles.ts) and [NAV engine](../app/lib/xnav-engine.ts) distinguish displayed metrics from valuation inputs. Code peak assumptions are G30/F26/D27. Preserve goalie sample sizes, coefficients, aging results and percentage-point units. |
| D-NAV fitted path activates for any defender with 20 selected-season games | [NAV engine](../app/lib/xnav-engine.ts) uses available teammate-relative inputs, nonzero games and shrinkage. Missing inputs take the fallback path; selecting current statistics does not alter frozen model inputs. |
| Shared cap calculation establishes correct cap space; 12F/6D/2G is a universal NHL legal minimum | [Cap-space helper](../app/lib/team-cap-space.ts) separates curated $95.5M fallback rebasing from supplied live values. Consistency is not fresh ledger verification. Lineup counts are application gates, not comprehensive CBA judgments. |

## Questions retained for separate resolution

- The page's .60 credibility comparator is baseline-only anchoring. The script also has a distinct fixed 40/60 blend, recorded at .715 in development notes. Preserve the original .60 summary with its narrower comparator; retrieving archived outputs would be needed to independently reproduce that precise historical result. No historical fit was rerun.
- Exact legacy team/individual summary numbers remain attributed to earlier recorded analyses. A versioned reproduction against today's engine would be new analytical work, outside this editorial pass.
- Reconcile older Gravity hard-lock documentation with the newer limited diagnostic release record separately. This PR does not enable a channel, inspect Production flags, or grant broader validation status.
- Current cap figures still require their own ledger reconciliation before anyone calls them verified correct.

## Preservation and verification

All nine section IDs, existing links, JSX classes/styles and navigation are preserved. Numerical results are retained except unsupported assertions explicitly identified above; corrected period/peak values follow their cited evidence. Public observed statistics, frozen 2025–26 inputs and current 2026–27 contracts are labelled separately. Detailed definitions and source links remain available through the existing Glossary navigation. Support remains **Buy me a stick tap** at https://buymeacoffee.com/capandcrease.

Local checks and hosted checks are recorded in the PR. Normal CI supplies broader tests and the production build; no Production changes or deployment are part of this work.
