# Planned Product Split

## 2026-06-17 Trade Machine / Armchair GM Direction

### Decision

Split the product into two clear modes:

- **Trade Machine**: a fast, focused one-off trade builder with shareable results.
- **Armchair GM**: the deeper roster-control experience currently represented by the broader trade machine flow.

This keeps the viral, low-friction trade use case separate from the larger front-office sandbox. A user who only wants to build and share one trade should not have to understand the full GM simulation surface. A user who wants to run a team should get a mode that feels bigger than a single transaction.

### Naming

Primary names:

- **Trade Machine**
  - One-off trades.
  - Public, lightweight, share-first.
  - Built for Reddit, Discord, group chats, and quick debate.

- **Armchair GM**
  - Full roster sandbox.
  - Current deeper experience should migrate toward this name.
  - Tagline direction: "Think you're better than your GM?"

Working copy:

- Trade Machine: "Build a trade. Test the logic. Share the receipt."
- Armchair GM: "Take the chair and prove you can run the room."

Avoid making "Trade Machine" carry both meanings. It should mean a single transaction tool.

### Route Direction

Recommended public routes:

- `/trade-machine`
  - Main one-off trade builder.
  - New primary destination for quick trades.

- `/trade/:shareCode` or `/t/:shareCode`
  - Share/replay route that reconstructs a saved trade.
  - Short route is better for social sharing if technically clean.

- `/armchair-gm`
  - Renamed home for the current deeper roster-management experience.
  - Can keep compatibility redirects from existing routes during migration.

Migration note:

- Preserve old route behavior with redirects or aliases until public links and internal navigation are updated.
- Do not break existing `/trade` users abruptly. Prefer redirecting `/trade` to the best matching new destination once the split is implemented.

### Trade Machine Scope

The one-off Trade Machine should support:

- Select two or more NHL teams.
- Add players, draft picks, and retained salary.
- Run the current trade verdict / GM logic audit.
- Show cap impact and key roster consequences.
- Generate a share code or share URL.
- Rehydrate the exact trade from that share code.
- Present the reconstructed trade in a clean read-only view for social traffic.

Share payload should reconstruct:

- Teams involved.
- Player assets.
- Draft picks.
- Retained salary selections.
- Conditional pick notes if supported.
- Cap result.
- GM logic verdict.
- Season or data snapshot context.
- Created timestamp.

The share view should be understandable without requiring the user to enter the full app workflow first.

### Armchair GM Scope

Armchair GM should own the deeper experience:

- Pick a franchise.
- Manage roster construction over a longer session.
- Make multiple moves.
- Track cap space, contracts, picks, retained salary, and team phase.
- Use trade proposals and GM audit logic as part of a broader front-office loop.
- Support season simulation, future timeline, and multi-move consequences.

This mode should feel like taking over a front office, not just submitting one transaction.

### UX Positioning

Navigation should communicate two different jobs:

- **Trade Machine**: quick, shareable, debate-friendly.
- **Armchair GM**: deeper, session-based, prove-you-can-do-better mode.

The homepage and README should eventually stop using "NHL Trade Machine" as the umbrella product name if that creates confusion. "The Hockey Ledger" can remain the broader product brand, with Trade Machine and Armchair GM as distinct modes.

### Implementation Phases

#### Phase 1: Product Shell

- Add/rename navigation entries for Trade Machine and Armchair GM.
- Decide whether `/trade` temporarily points to the existing experience or redirects to `/armchair-gm`.
- Add copy that clearly separates one-off trades from franchise sandbox mode.

#### Phase 2: Shareable Trade State

- Define a stable trade payload schema.
- Add encode/decode support for share codes or persisted share records.
- Ensure player, pick, and retained salary selections can be reconstructed.
- Add tests for payload validation and backward compatibility.

#### Phase 3: One-Off Trade Machine

- Build the focused `/trade-machine` flow.
- Keep it lean: team select, asset select, verdict, share.
- Add a read-only reconstructed trade view.
- Make social previews useful when a shared link is posted.

Status: Done for the first usable version. `/trade-machine` now owns the focused one-off builder, and `/t/:shareCode` reconstructs a locked shared trade from the Phase 2 payload.

#### Phase 4: Armchair GM Rename

- Move the current broader experience under `/armchair-gm`.
- Update in-app copy from generic "trade machine" language to Armchair GM language where appropriate.
- Keep trade-specific controls named plainly inside the mode.
- Preserve old links through redirects.

#### Phase 5: Polish And Growth

- Add share cards or image previews if social embedding needs stronger presentation.
- Consider lightweight public reactions or "who won?" voting later, but do not block the core share flow on it.
- Keep Armchair GM focused on deeper roster consequences and multi-step management.

### Open Questions

- Should share codes be fully client-decodable, server-persisted, or a hybrid?
    * we should decide this base on industry standard
- How much historical data should a shared trade preserve if live player values change later?
    * we could have a state and graph that shows value over time for up to 3 years
- Should shared trades lock the verdict from creation time or recompute with current data?
    * this should be locked in a the time of the trade, that will allow me to refine based on user conclusions.
- Should `/trade` become the quick Trade Machine route long-term, or remain a compatibility alias?
    * /trade should become the quick Trade Machine route
- Does "Armchair GM" need a stronger branded variant, or is the phrase clear enough for hockey users?
    * Armchair GM is a good branded variant as it is clear for all sports users. The core logic can eventually expand into other sports.

### Answered Direction

- Use an industry-standard share-code approach after Phase 1 research. Default assumption is a persisted canonical record with a compact public code, plus schema validation for replay.
- Preserve enough state to show how value changes over time for up to three years.
- Lock the original verdict at trade creation time so later user conclusions can be compared against the model that existed when the trade was made.
- Make `/trade` the quick Trade Machine route long-term.
- Keep **Armchair GM** as the deeper mode name because it is clear across sports and leaves room for future expansion.

### Current Recommendation

Use **Trade Machine** for the quick public tool and **Armchair GM** for the deeper mode.

Keep "Think you're better than your GM?" as the hook, not necessarily the mode name. It is strong CTA copy, but Armchair GM is cleaner for navigation, URLs, and repeated product references.
