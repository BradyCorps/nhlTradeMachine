# Welcome/home and Season Review split — 2026-10-05

This branch starts at current `origin/main`, `8e4696800b18bba946bde44105f36c48e0e4b6d9`, and separates the independent UI fixes from held PR #39 (`84e57fb23d0f08f15bd43e7ae7d7a6b589506c1d`). **No pick ownership, eligibility, inventory, conditional handling, selector or trade-bench change is included.** PR #39 remains draft, its existing pick branch/head and completed evidence intact. No merge/deployment or Production write is authorized here. The issue-reporting form is separate and untouched.

- [x] Remove the global Welcome modal/acknowledgement gate and its focus trap.
- [x] Install the supplied six-paragraph editorial and Brady byline; update both support links and accessible names.
- [x] Preserve native Season Review disclosure identity during player expansion.
- [x] Preserve completed reproduction evidence and verify the resulting independent diff.

## Changes and causes

The root layout no longer mounts `WelcomeModal`; its unused component and obsolete legal storage statement are removed. Existing visible Header/home navigation is preserved. Existing mobile/hydration/public-UI harnesses no longer pre-populate the welcome localStorage key. The fresh-browser regression asserts the acknowledgement key remains absent and Home, Players, Trade Machine and Armchair are directly accessible.

Both visible support links (Home and Methodology) now point to `https://buymeacoffee.com/capandcrease`, display **Buy me a stick tap**, and have accessible name **Buy me a stick tap — support Cap & Crease**. The homepage contains the exact supplied editorial in six readable paragraphs and the creator byline in the existing newspaper treatment.

The actual simulation/review journey reproduced the nested expansion closing Season Review: `details.open` became false. `TeamNumbers` was defined inside `SeasonResultsPager`, so updating `openPlayer` recreated the component type and remounted its uncontrolled native disclosure. Rendering the same subtree directly with a stable team key preserves the DOM element; no event suppression, controlled-panel rewrite, simulation calculation or outcome change is needed. Native summary close and mobile sheet Escape/explicit close remain intact; no outside-click behavior was introduced.

## Reused and new verification

The production UI files are byte-for-byte identical to the reviewed/tested PR #39 versions. Before screenshots and [reproduction.json](reproduction.json) are preserved from that pass. Its 2,699/2,699 CI test evidence, Phase 0 10/10, accessibility/device matrix and keyboard workflow results remain available at [run 37339448544](https://github.com/BradyCorps/nhlTradeMachine/actions/runs/37339448544). Those results were for the combined head and are explicitly distinguished from this split.

Checks for the resulting diff:

- **440/440** focused tests across the homepage and existing feature canaries. Only the obsolete canary forbidding the creator's typed name on the entire homepage is removed; draft-pick canaries are unchanged from main.
- TypeScript passed; changed-file lint passed with zero errors/warnings; production build passed.
- New UI-only `scripts/verify-welcome-season-review.mjs` is adapted from the completed isolated regression, with all ownership imports/assertions removed. Its synthetic simulation pick fixture follows unchanged main behavior, not PR #39 eligibility. At **320/412/1024/1440 px**, fresh direct first visits, editorial/support/keyboard focus, real local simulation, mouse/touch/Enter expansion and Space collapse, same disclosure DOM, unchanged results/scroll, exactly one simulation request, normal close/Escape, no page errors or horizontal overflow all passed. [report.json](report.json).
- No local full-suite rerun. The existing PR workflow supplies its normal broader gates and the UI-only regression; hosted results are recorded on the PR. Local fixture results do not imply authenticated Preview or Production browser verification.

| Before (preserved PR #39 evidence) | After (fresh split check at 412 px) |
| --- | --- |
| [Welcome gate](before-welcome.png) / [Old editorial](before-home.png) | [Direct homepage/editorial/support](after-home-412.png) |
| [Review open](before-review-open.png) → [Closed after expansion](before-review-collapse.png) | [Player expanded, review retained](after-review-expanded-412.png) |

The source-feasibility proposal for pick reconciliation is reported separately. This PR is independently reviewable and does not deploy PR #39's restrictive pick availability policy.
