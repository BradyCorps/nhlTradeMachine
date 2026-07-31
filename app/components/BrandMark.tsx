// ── Cap & Crease mark (V3) ───────────────────────────────────────
//
// The authored V3 symbol: editorial brackets, a red goal separated from its
// goal line, an ice-blue crease projecting right, and the puck inside the net.
// Geometry is taken verbatim from the kit's `mark-primary-clean.svg` and must
// not be re-centred, re-spaced or redrawn — the composition is deliberate and
// the gap between the goal and the goal line is not a mistake.
//
// WHY THE CLEAN VARIANT AND NOT THE TEXTURED PRIMARY
//
// The kit's textured `mark-primary.svg` is 221 KB, of which 218 KB is a
// base64-embedded 1024×1024 JPEG of paper grain, carrying four vector paths.
// The app renders its marks at 44px, which downsamples that texture 23:1 — the
// grain is not perceptible at the size it would be paid for. For scale, the
// whole shared JS bundle is 87 KB, so the textured header lockup alone would be
// nearly three times the app's critical-path JavaScript.
//
// So the UI uses the clean vector — identical geometry, ~1.3 KB — and the
// textured files stay in `public/brand/` for the places grain actually reads:
// large display, the Open Graph card, downloadable art. Nothing about the
// drawing changes; only whether a grain overlay nobody can see at this size
// rides on the critical path.
//
// The kit's own `implementation/BrandMark.tsx` renders through `next/image`,
// which cannot work here: `next/image` refuses SVG unless `dangerouslyAllowSVG`
// is set, and enabling that for a logo enables it for every image the optimiser
// touches. Inlining also lets the one-colour variants sit on any surface.
//
// Inlining copies the kit's path data, so `__tests__/brand-kit.test.ts` reads
// the real SVGs out of `public/brand/svg/` and asserts these paths still match.
// Regenerating the kit fails loudly rather than leaving the app on a superseded
// mark.

import React from "react";

const INK = "#1c140a";
const CREAM = "#f2ecd7";
const RED = "#b83020";
const ICE = "#79afc1";

export type BrandMarkVariant = "primary" | "reversed" | "ink" | "cream";

/**
 * Below this the kit's optically-corrected small cut is used.
 *
 * V3 reversed what the small cut drops. It keeps the goal, goal line, crease
 * AND puck, and omits the outer BRACKETS — at 32px the brackets thicken into
 * the ink and the mark reads as a solid block. (V2's small cut dropped the puck
 * and kept the brackets; that is no longer the rule.)
 */
export const SMALL_CUT_BELOW = 40;

// ── V3 geometry, verbatim from cap-and-crease-mark-primary-clean.svg ─────────
const FULL_VIEWBOX = "0 0 405.39 405.39";
/** The goal/crease unit alone — the frame the kit's small mark ships with. */
const SMALL_VIEWBOX = "126 126 166 166";

const BRACKET_LEFT =
  "107.71 139.52 107.71 116.78 54.66 116.78 34.45 136.99 34.45 273.41 54.66 293.62 112.77 293.62 112.77 270.88 76.14 270.88 67.29 262.04 67.29 148.36 76.14 139.52 107.71 139.52";
const BRACKET_RIGHT =
  "308.67 139.52 308.67 116.78 361.72 116.78 381.93 136.99 381.93 273.41 361.72 293.62 303.62 293.62 303.62 270.88 340.25 270.88 349.09 262.04 349.09 148.36 340.25 139.52 308.67 139.52";
const GOAL =
  "M196.38,149.6v10.22h-43.84c-1.1,0-2.2.19-3.2.64-1.5.68-3.19,2.06-3.26,4.84-.11,4.51-.02,75.27,0,90.73,0,3.93,3.07,7.22,6.99,7.37.06,0,.11,0,.17,0,5.78.13,43.12,0,43.12,0v10.13h-43.61s-17.01-.74-16.93-15.81c.09-15.07,0-92.18,0-92.18,0,0-.33-15.95,14.83-15.94,15.16,0,45.72,0,45.72,0Z";
const CREASE =
  "M215.7,280.99c35.82,0,64.86-31.95,64.86-71.36s-29.04-71.36-64.86-71.36v142.73Z";
/** Separated from the goal on purpose. Do not close the gap. */
const GOAL_LINE = { x: 202.7, y: 134.47, width: 8.84, height: 150.31 } as const;
const PUCK = { cx: 187.73, cy: 245.61, r: 9.06 } as const;

interface Palette { bracket: string; goal: string; crease: string; puck: string }

function paletteFor(variant: BrandMarkVariant): Palette {
  switch (variant) {
    // Dark surfaces: the ink parts go cream, the red and the ice hold — this
    // is what the kit's reversed SVG does, not a full recolour.
    case "reversed": return { bracket: CREAM, goal: RED, crease: ICE, puck: CREAM };
    case "ink":      return { bracket: INK, goal: INK, crease: INK, puck: INK };
    case "cream":    return { bracket: CREAM, goal: CREAM, crease: CREAM, puck: CREAM };
    default:         return { bracket: INK, goal: RED, crease: ICE, puck: INK };
  }
}

export function BrandMark({
  size = 48,
  variant = "primary",
  title,
  className,
}: {
  size?: number;
  variant?: BrandMarkVariant;
  /**
   * Accessible name. Omit when a wordmark beside the mark already names the
   * site — the kit calls for the mark to be decorative in that case, and a
   * second announcement of "Cap & Crease" is noise to a screen reader.
   */
  title?: string;
  className?: string;
}) {
  const small = size < SMALL_CUT_BELOW;
  const c = paletteFor(variant);

  return (
    <svg
      width={size}
      height={size}
      viewBox={small ? SMALL_VIEWBOX : FULL_VIEWBOX}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {/* Brackets drop out below SMALL_CUT_BELOW — see the note above. */}
      {!small && (
        <>
          <polygon fill={c.bracket} points={BRACKET_LEFT} />
          <polygon fill={c.bracket} points={BRACKET_RIGHT} />
        </>
      )}
      <path fill={c.goal} d={GOAL} />
      <rect fill={c.goal} {...GOAL_LINE} />
      <path fill={c.crease} d={CREASE} />
      <circle fill={c.puck} {...PUCK} />
    </svg>
  );
}
