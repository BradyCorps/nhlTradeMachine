# Next.js implementation

Copy the contents of `assets/` into `public/brand/`.

## Header

- Use `svg/cap-and-crease-lockup-horizontal.svg` for the desktop masthead.
- Use `svg/cap-and-crease-wordmark.svg` when the symbol already appears elsewhere in the header.
- Use `svg/cap-and-crease-lockup-stacked.svg` only where vertical space is available.
- The wordmark is outlined and does not depend on a browser font.
- The red ampersand is custom vector artwork. Do not replace it with typed text or tighten its supplied spacing.

## Mark selection

| Context | Asset |
| --- | --- |
| 40px+ standard use | `cap-and-crease-mark-primary.svg` |
| Performance-sensitive/CSS animation | `cap-and-crease-mark-primary-clean.svg` |
| 16–32px | `cap-and-crease-mark-small.svg` |
| Compact horizontal container | `cap-and-crease-mark-tight-horizontal.svg` |
| Dark surface | `cap-and-crease-mark-reversed.svg` |
| Single-colour production | matching one-colour SVG |

The small optical mark retains the goal, puck, and crease but intentionally omits the outer brackets and texture. The favicon uses the same simplified artwork on the paper colour.

## Geometry protections

- Do not adjust the 405.39-square master viewBox.
- Do not move either bracket.
- Do not close the gap between the red goal and vertical red line.
- Do not alter the relative positions of the goal, crease, or puck.
- Do not run the SVG through an optimizer that rounds path coordinates aggressively.
- Use the supplied tight-horizontal asset instead of manually cropping the primary file.

The exact values are also recorded in `assets/brand-geometry.json`.

## Metadata

Merge `metadata-snippet.ts` into the root `app/layout.tsx` metadata. Copy `site.webmanifest` and the complete `favicon/` directory without renaming internal files unless their paths are updated too.

## Colour

Import `brand-tokens.css`, or merge its variables into the existing token file. `#79afc1` is the canonical ice blue. Reserve it for the crease and selective analytics accents rather than large page backgrounds.

## Accessibility

When the adjacent wordmark names the site, treat the separate mark as decorative with `alt=""`. When the mark appears alone, use `alt="Cap & Crease"`.

## Source and regeneration

- Production assets: `assets/svg/`
- Exact original V3: `source/master/cap-and-crease-brady-createdV3-original.svg`
- Optimized texture: `source/texture/paper-texture-1024.jpg`
- Rebuild SVGs: `node source/build-source-assets.mjs`
- Rebuild raster assets: `source/export-assets.sh`

The archived original is intentionally large. Do not ship it to the website; ship the optimized SVG in `assets/svg/`.
