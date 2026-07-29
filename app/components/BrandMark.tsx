// ── Cap & Crease mark ────────────────────────────────────────────
//
// The kit ships `implementation/BrandMark.tsx`, which renders the SVGs through
// `next/image`. That would not work here: `next/image` refuses to optimise SVG
// unless `dangerouslyAllowSVG` is set in next.config, and turning that on for a
// logo means turning it on for every image the optimiser touches. The marks are
// ~700 bytes each, so they are inlined instead — no network request, no config
// flag, and the mark can inherit `currentColor` for the one-colour variants.
//
// Inlining does create a copy of the kit's path data. `__tests__/brand-kit.test.ts`
// reads the real SVGs out of `public/brand/svg/` and asserts these paths still
// match, so regenerating the kit fails loudly instead of leaving the app
// rendering a superseded mark.
//
// Geometry is fixed by the kit and must not be altered: red goal left of the
// vertical goal line, blue crease projecting right, puck inside the net. The
// mark is never rotated.

import React from "react";

const INK = "#1c140a";
const PAPER = "#f2ecd7";
const RED = "#b83020";
const ICE = "#79afc1";

export type BrandMarkVariant = "primary" | "reversed" | "ink" | "cream";

/**
 * Below this the kit's optically-corrected small cut is used instead. It
 * deliberately omits the puck — at 32px and under the puck closes up into the
 * net and reads as a blob.
 */
export const SMALL_CUT_BELOW = 40;

const BRACKETS = {
  left: "M28 20h48v26H52v164h24v26H28l-16-16V36L28 20Z",
  right: "M228 20h-48v26h24v164h-24v26h48l16-16V36l-16-16Z",
} as const;

const CREASE = "M140 70a58 58 0 0 1 0 116V70Z";
const NET = "M128 82H84v92h44";
const GOAL_LINE = "M130 62h10v134h-10z";

/** The 256-unit cut, 40px and up. */
function PrimaryCut({ variant }: { variant: BrandMarkVariant }) {
  const monochrome = variant === "ink" || variant === "cream";
  const frame = variant === "reversed" || variant === "cream" ? PAPER : INK;
  const puck = variant === "reversed" ? PAPER : monochrome ? frame : INK;

  return (
    <>
      <path fill={frame} d={BRACKETS.left} />
      <path fill={frame} d={BRACKETS.right} />
      {monochrome
        ? <path d={CREASE} fill="none" stroke={frame} strokeWidth="9" strokeLinejoin="round" />
        : <path d={CREASE} fill={ICE} />}
      <path
        d={NET}
        fill="none"
        stroke={monochrome ? frame : RED}
        strokeWidth="10"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
      <path fill={monochrome ? frame : RED} d={GOAL_LINE} />
      <circle cx="106" cy="146" r="9" fill={puck} />
    </>
  );
}

/** The 64-unit cut, under 40px. No puck — see SMALL_CUT_BELOW. */
function SmallCut({ variant }: { variant: BrandMarkVariant }) {
  const monochrome = variant === "ink" || variant === "cream";
  const frame = variant === "reversed" || variant === "cream" ? PAPER : INK;

  return (
    <>
      <path fill={frame} d="M7 4h13v7h-6v42h6v7H7l-4-4V8l4-4Z" />
      <path fill={frame} d="M57 4H44v7h6v42h-6v7h13l4-4V8l-4-4Z" />
      {monochrome
        ? <path d="M35 18a14 14 0 0 1 0 28V18Z" fill="none" stroke={frame} strokeWidth="3" strokeLinejoin="round" />
        : <path d="M35 18a14 14 0 0 1 0 28V18Z" fill={ICE} />}
      <path
        d="M32 21H22v22h10"
        fill="none"
        stroke={monochrome ? frame : RED}
        strokeWidth="3"
        strokeLinecap="square"
        strokeLinejoin="round"
      />
      <path fill={monochrome ? frame : RED} d="M32 16h3v32h-3z" />
    </>
  );
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

  return (
    <svg
      width={size}
      height={size}
      viewBox={small ? "0 0 64 64" : "0 0 256 256"}
      className={className}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      focusable="false"
    >
      {title && <title>{title}</title>}
      {small ? <SmallCut variant={variant} /> : <PrimaryCut variant={variant} />}
    </svg>
  );
}
