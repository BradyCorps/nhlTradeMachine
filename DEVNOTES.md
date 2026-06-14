# Development Notes

## 2026-06-14 Wrap-Up

### Completed Tonight

- Fixed the Patrick Thomas false-positive stats issue by removing surname-only skater stats fallbacks.
- Kept safer name matching for legitimate diacritic normalization cases.
- Prevented no-signal ELC/minor-league players from receiving artificial positive NAV from age/cap alone.
- Added a prospect NAV path:
  - Draft pedigree gives modest value before an NHL sample exists.
  - Stored/imported `prospectPtsPace` can raise that value.
  - No player-specific Kevin He or Stian Solberg overrides.
- Added draft-history enrichment so synced prospects can pick up `draftYear` and `draftOverall` from recent draft tables.
- Updated NAV client cache keys so prospect input changes do not reuse stale values.
- Kept the development profile layer diagnostic-only and separate from X-NAV.
- Reworded DEV rationale copy so 0-game prospects read like scouting/data notes instead of raw model arithmetic.
- Rebuilt the footer into one combined methodology/glossary surface.
- Removed the duplicate trade-page methodology block.
- Made the icon key always visible.
- Changed methodology/glossary content into wide footer dropdowns:
  - Player Valuation
  - STRAND Glossary
  - Trade Logic
  - Data & Sources
- Fixed franchise selection so the initial team picker works in one click.
- Added a stronger NAV loading status while player values are calculating.
- Stopped mobile keyboards from opening automatically when tapping add-asset buttons.

### Verification

- `npm run test`
- Result: `173` tests passing.
- Dev server was not started in Codespace, per project instructions.

## Next Project

### Prospect Production Import

Build a proper prospect production import flow instead of hardcoding or guessing junior/college/European production.

Recommended first version:

- Bulk CSV or pasted table import.
- Preview changes before saving.
- Inputs:
  - `name`
  - `team`
  - `league`
  - `games`
  - `goals`
  - `assists`
  - `points`
- Convert production to `prospectPtsPace` using NHLe factors.
- Match cautiously by normalized name and team.
- Save only confident matches.
- Flag ambiguous matches for manual review.

Reasoning:

- Draft slot can be enriched automatically.
- Production value should come from real imported/stored stats.
- This lets players like Kevin He earn extra NAV from OHL production while random later-round prospects stay modest unless they also have production.

## Manual QA For Tomorrow

- Check footer layout on desktop and mobile.
- Confirm the icon key is always visible and not hidden behind a dropdown.
- Confirm methodology dropdowns are full-width and not skinny columns.
- Test first-load franchise selection in the browser.
- Test mobile add-asset drawer and confirm the keyboard opens only when tapping search.
- Review example NAVs:
  - Kevin He
  - Stian Solberg
  - a random no-signal ELC player
  - an older AHL-only player
- Revisit later-round prospect draft-pedigree curve after real production data is imported.
