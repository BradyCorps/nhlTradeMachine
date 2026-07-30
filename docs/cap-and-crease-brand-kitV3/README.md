# Cap & Crease brand kit

Production assets for the user-authored **Blue Paint V3** identity. V3 is the source of truth for the symbol: the exact centred composition, wide editorial-bracket spacing, separated red goal/goal line, right-facing ice-blue crease, puck position, and paper grain are preserved.

The masthead remains the approved classical-serif `CAP & CREASE` wordmark with its custom oversized ampersand. The ampersand is vector artwork, not a typed character.

## Start here

Give this complete folder or ZIP to Claude, then begin with:

- `implementation/CLAUDE-HANDOFF.md`
- `implementation/IMPLEMENTATION.md`
- `preview.html`

## Asset map

| Need | File |
| --- | --- |
| Authoritative textured mark | `assets/svg/cap-and-crease-mark-primary.svg` |
| Lightweight mark without grain | `assets/svg/cap-and-crease-mark-primary-clean.svg` |
| Textured mark without puck | `assets/svg/cap-and-crease-mark-primary-no-puck.svg` |
| 16–32px optical mark | `assets/svg/cap-and-crease-mark-small.svg` |
| Tight horizontal canvas | `assets/svg/cap-and-crease-mark-tight-horizontal.svg` |
| Dark-background mark | `assets/svg/cap-and-crease-mark-reversed.svg` |
| One-colour versions | `assets/svg/cap-and-crease-mark-one-color-ink.svg` and `-cream.svg` |
| Desktop/header lockup | `assets/svg/cap-and-crease-lockup-horizontal.svg` |
| Stacked lockup | `assets/svg/cap-and-crease-lockup-stacked.svg` |
| Wordmark only | `assets/svg/cap-and-crease-wordmark.svg` |
| Signature ampersand | `assets/svg/cap-and-crease-ampersand.svg` |
| Publisher seal | `assets/svg/cap-and-crease-seal.svg` |
| Social avatar SVG | `assets/svg/cap-and-crease-social-avatar.svg` |
| Favicons and PWA icons | `assets/favicon/` |
| Open Graph card | `assets/png/cap-and-crease-og-1200x630.png` |
| Brand tokens | `assets/brand-tokens.css` and `.json` |
| Exact V3 geometry | `assets/brand-geometry.json` |
| Original Illustrator export | `source/master/cap-and-crease-brady-createdV3-original.svg` |

## V2.0 decisions

- Replaces the earlier generated mark with Brady's centred V3 SVG.
- Preserves V3 geometry without redrawing, re-spacing, re-centring, or changing proportions.
- Preserves the authored paper grain while reducing the production SVG from roughly 7.3 MB to about 216 KB.
- Keeps the original 7.3 MB SVG in `source/master/` for archival and editing.
- Keeps the approved outlined serif wordmark and flourished ampersand unchanged.
- Rebuilds all lockups, seal, social, favicon, PWA, PNG, and implementation assets around V3.
- Uses `#79afc1` as the canonical ice blue.

## Production rules

- Do not move the brackets inward or alter the gap between the red goal and goal line.
- Do not re-centre or redraw the V3 master.
- The blue crease always points right.
- The puck remains inside the red goal in standard-size artwork.
- Use the textured primary at 40px and larger when the grain is visible.
- Use the supplied optical mark at 32px and smaller; it retains the goal, puck, and crease while intentionally omitting the outer brackets and grain.
- Use the tight-horizontal file only when a compact intrinsic canvas is required. Its artwork geometry is unchanged.
- Do not replace the custom ampersand with a font glyph.
- Do not recolour the blue crease with team colours.

## Typeface

The exported wordmark and lockups contain outlined lettering and require no runtime font. Bodoni Moda is included only for editable source work under its bundled Open Font License.

Run `node source/build-source-assets.mjs` to rebuild SVG assets from the archived V3 master, then run `source/export-assets.sh` to refresh PNGs and icons.
