# Next.js handoff

Copy the contents of `assets/` into `public/brand/`.

## Header

- Use `svg/cap-and-crease-lockup-horizontal.svg` for the normal desktop masthead.
- Use `svg/cap-and-crease-wordmark.svg` when the symbol is already displayed elsewhere.
- Use `svg/cap-and-crease-lockup-stacked.svg` only where vertical space is available.
- The wordmark SVG has outlined lettering, so it does not depend on a browser font.
- The red ampersand is a custom vector. Do not recreate it with a typed `&`, and do not tighten the supplied spacing around it.

## Mark sizing

- At **40px and larger**, use `cap-and-crease-mark-primary.svg`.
- At **32px and smaller**, use `cap-and-crease-mark-small.svg`.
- The small optical version intentionally omits the puck.
- The standard mark places the puck inside the red net; preserve that placement.
- Use the reversed mark only on dark surfaces.
- Do not rotate the mark; the red goal is left of the vertical line and the blue crease always projects right.

## Metadata

Merge `metadata-snippet.ts` into the root `app/layout.tsx` metadata.
Copy `site.webmanifest` and the complete `favicon/` directory without renaming internal files unless their paths are also updated.

## Colour

Import `brand-tokens.css`, or merge its five variables into the existing token file. The ice blue is reserved for the crease and related data accents; it should not become a general page background.

## Accessibility

When the adjacent wordmark already names the site, treat the separate mark as decorative with `alt=""`.
When the mark appears alone, use `alt="Cap & Crease"`.

## Clear space

Keep empty space around the mark equal to at least one quarter of its width. Do not place the mark directly against rules, text or viewport edges.

## Source of truth

Production assets are in `assets/svg/`. Files in `source/` retain editable live text and require Bodoni Moda. Run `node source/build-source-assets.mjs` before outlining editable source, then run `source/export-assets.sh` to refresh PNGs and favicons. The original generated identity board is visual reference only and should not be shipped to the website.
