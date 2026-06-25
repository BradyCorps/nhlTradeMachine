"use client";

import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

// ── Scroll-driven "lay the ledger down on the desk" ─────────────────────────
// The broadsheet is set down FLAT onto the desk, the way you'd lay a newspaper
// on a table in front of you — the far edge meets the surface first, then the
// near edge settles down flat. As the user scrolls, the sheet drops in from
// above and lays down onto the desk plane.
//
// Animation window: page scroll 0 → 560px.
//   0 px     → sheet is lifted off the desk (near edge raised toward viewer),
//              just above and invisible (nameplate is still showing)
//   40 px    → sheet starts dropping in / becoming visible
//   260 px   → nameplate is gone, sheet is well into laying down
//   420 px   → near edge has made contact — sheet is essentially flat
//   560 px   → fully settled, dead flat, at rest on the desk
//
// transformOrigin: "50% 0%" — the TOP (far) edge is the hinge / contact point.
// With a TOP hinge, a positive rotateX lifts the BOTTOM (near) edge UP toward
// the viewer; rotating back to 0 lays that near edge down onto the surface.
// That is the physical motion of setting a page down flat — NOT a bottom-hinged
// flap waving upward (which read as lifting a menu / laptop lid before).
//
// rotateX reaches flat (0) by ~420px, a touch before the descent finishes, so
// the last stretch of scroll reads as the sheet quietly settling rather than
// still tipping. transformPerspective lives on the element (not a wrapping
// `perspective()`) so it does not create a containing block that would trap the
// position:fixed nameplate / portals.

interface Props {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function LedgerScrollSetdown({ children, className, style }: Props) {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();

  const y       = useTransform(scrollY, [0, 560], [-180, 0],  { clamp: true });
  const rotateX = useTransform(scrollY, [0, 420], [16,   0],  { clamp: true });
  const scale   = useTransform(scrollY, [0, 560], [0.95, 1],  { clamp: true });
  // Opacity comes in just after the drop begins so the sheet is seen descending
  // and laying down, not fading in already-placed.
  const opacity = useTransform(scrollY, [40, 340], [0, 1],    { clamp: true });

  if (reduced) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={className}
      style={{
        ...style,
        transformPerspective: 1400,
        transformOrigin: "50% 0%",
        y,
        rotateX,
        scale,
        opacity,
      }}
      // SSR / first-frame initial state matches scrollY=0 values so there is
      // no layout shift on hydration.
      initial={{ opacity: 0, y: -180, rotateX: 16, scale: 0.95 }}
    >
      {children}
    </motion.div>
  );
}
