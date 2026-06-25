"use client";

import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

// ── Scroll-driven "set the ledger down on the desk" ─────────────────────────
// The newspaper sheet starts hidden above the viewport and slides down onto
// the desk as the user scrolls, with a perspective tilt that makes it read as
// a physical object being lowered onto a surface.
//
// Animation window: page scroll 0 → 520px.
//   0 px     → sheet is above and invisible (nameplate is still fading)
//   80 px    → sheet starts becoming visible
//   260 px   → nameplate is gone, sheet is at ~50% opacity and well into descent
//   520 px   → sheet is fully placed, flat, at rest on the desk
//
// transformOrigin: "50% 100%" — the bottom edge of the sheet is the hinge.
// rotateX(positive) makes the top go INTO the screen. Combined with the bottom
// edge as the hinge, this reads as the top of the newspaper tipping away from
// the viewer as it lowers — the natural motion of setting a page face-down.

interface Props {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function LedgerScrollSetdown({ children, className, style }: Props) {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();

  const y       = useTransform(scrollY, [0, 520], [-240, 0],  { clamp: true });
  const rotateX = useTransform(scrollY, [0, 520], [22,    0], { clamp: true });
  const scale   = useTransform(scrollY, [0, 520], [0.88,  1], { clamp: true });
  // Opacity lags slightly behind position so the sheet "materialises" as it descends
  const opacity = useTransform(scrollY, [80, 480], [0, 1],    { clamp: true });

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
        transformOrigin: "50% 100%",
        y,
        rotateX,
        scale,
        opacity,
      }}
      // SSR / first-frame initial state matches scrollY=0 values so there is
      // no layout shift on hydration.
      initial={{ opacity: 0, y: -240, rotateX: 22, scale: 0.88 }}
    >
      {children}
    </motion.div>
  );
}
