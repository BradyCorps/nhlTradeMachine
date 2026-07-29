# Cap & Crease brand kit

Production-ready assets for the approved **Blue Paint** identity: a top-down hockey goal with the puck in the net, a vertical goal line, and the blue crease projecting right. The masthead uses the original oversized signature ampersand as a custom vector—not a substitute font glyph.

## Start here

Give this complete folder or the ZIP to Claude. The implementation notes are in `implementation/IMPLEMENTATION.md`.

## Asset map

| Need | File |
| --- | --- |
| Standard mark | `assets/svg/cap-and-crease-mark-primary.svg` |
| Compact mark without puck | `assets/svg/cap-and-crease-mark-primary-no-puck.svg` |
| 16–32px optical mark | `assets/svg/cap-and-crease-mark-small.svg` |
| Dark-background mark | `assets/svg/cap-and-crease-mark-reversed.svg` |
| One-colour dark ink | `assets/svg/cap-and-crease-mark-one-color-ink.svg` |
| One-colour cream | `assets/svg/cap-and-crease-mark-one-color-cream.svg` |
| Desktop/header lockup | `assets/svg/cap-and-crease-lockup-horizontal.svg` |
| Stacked lockup | `assets/svg/cap-and-crease-lockup-stacked.svg` |
| Wordmark only | `assets/svg/cap-and-crease-wordmark.svg` |
| Signature red ampersand | `assets/svg/cap-and-crease-ampersand.svg` |
| One-colour ampersands | `assets/svg/cap-and-crease-ampersand-one-color-ink.svg` and `-cream.svg` |
| Publisher seal | `assets/svg/cap-and-crease-seal.svg` |
| Favicons and PWA | `assets/favicon/` |
| Open Graph card | `assets/png/cap-and-crease-og-1200x630.png` |
| Social avatar | `assets/png/cap-and-crease-social-avatar-1024.png` |
| Brand colours | `assets/brand-tokens.css` and `.json` |

## Version 1.1 changes

- Restores the original flourished ampersand from the approved masthead reference.
- Rebuilds the wordmark and lockups with deliberate spacing around that custom mark.
- Moves the puck inside the red goal on all standard-size marks.
- Keeps the puck omitted from the 16–32px optical icon.
- Regenerates all SVG, PNG, social, favicon and implementation assets from those decisions.

## Production rules

- The blue crease always points right.
- The net remains to the left of the vertical red goal line.
- In the standard mark, the puck stays inside the red net.
- Preserve the deliberate clear space on both sides of the signature ampersand.
- Do not replace the signature ampersand with a typed font character.
- Use the primary mark at 40px or larger.
- Use the small optical mark at 32px or smaller.
- Do not recolour the crease with team colours.
- Do not use the generated reference board as a website asset.

## Typeface

The exported wordmark and lockups contain outlined lettering and require no font. Bodoni Moda is included only for editable source work under its bundled Open Font License.

The concept board in `reference/` retains the earlier detached-puck exploration and must not be treated as production geometry. The SVG files in `assets/svg/` are authoritative.
