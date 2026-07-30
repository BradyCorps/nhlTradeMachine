# Claude handoff: Cap & Crease V3

Implement this as an asset replacement, not a redesign.

## Repository checkpoint

The user identified Git commit `14e4b48` (`CXH1: stop the analysis deck blanking after a trade`) as the known baseline. Before changing files, verify the working branch contains that commit and preserve any later Armchair GM fixes.

## Required implementation

1. Copy this kit's `assets/` directory to the app's `public/brand/` directory.
2. Replace existing brand imports with the supplied V3 filenames; do not paste or reconstruct SVG path data in React components.
3. Use `cap-and-crease-lockup-horizontal.svg` for the main desktop header.
4. Use `cap-and-crease-mark-small.svg` at 32px and below.
5. Merge the metadata/favicon paths from `metadata-snippet.ts`.
6. Merge the CSS tokens without changing existing unrelated theme variables.
7. Check desktop and mobile headers, browser favicon, PWA icon, social metadata, and dark-surface usage.

## Non-negotiable visual details

- V3's bracket spacing is final.
- The symbol is already centred; do not apply compensating translate or negative margin.
- The gap between the red goal and red goal line is deliberate.
- The paper grain belongs to the standard mark.
- The puck stays inside the net.
- The blue is exactly `#79afc1`.
- The classical-serif wordmark and custom flourished ampersand are unchanged.

## Do not

- Do not substitute a typed ampersand.
- Do not use the archived 7.3 MB master in production.
- Do not recolour, retrace, simplify, or auto-centre the primary mark.
- Do not remove the small optical variant; it keeps the goal, puck, and crease but drops the outer brackets and grain at favicon size.
- Do not alter game, trade, Armchair GM, or analysis-deck logic as part of this asset pass.

## Verification

- Compare the implementation to `reference/v3-kit-preview.png`.
- Confirm the primary SVG stays visually centred at 64, 128, and 256px.
- Confirm no network request is made for a font or texture image.
- Confirm all `/brand/` assets return HTTP 200 in production.
- Run the repository's normal lint, typecheck, unit tests, and production build.
