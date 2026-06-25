"use client";

import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

// Scroll-driven "set the ledger down on the desk".
// The broadsheet should read like it is zooming down into place on the table,
// not hinging or flipping in 3D. Keep the page flat and readable throughout:
// scroll controls scale, a small vertical settle, opacity, and shadow depth.
//
// Animation window: page scroll 0 → 560px.
//   0 px     → sheet is slightly enlarged/near the camera and invisible
//   120 px   → sheet is visible and zooming toward its final desk position
//   260 px   → nameplate is gone, sheet is readable and nearly settled
//   420 px   → sheet has reached the desk plane
//   560 px   → fully settled, dead flat, at rest on the desk

interface Props {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function LedgerScrollSetdown({ children, className, style }: Props) {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();

  const y = useTransform(scrollY, [0, 420, 560], [-64, -6, 0], { clamp: true });
  const scale = useTransform(scrollY, [0, 560], [1.18, 1.015, 1], { clamp: true });
  const opacity = useTransform(scrollY, [0, 160], [0, 1], { clamp: true });
  const boxShadow = useTransform(
    scrollY,
    [0, 420, 560],
    [
      "0 18px 18px rgba(30, 18, 6, 0.18), 0 70px 100px -36px rgba(30, 18, 6, 0.52), 0 120px 130px -62px rgba(30, 18, 6, 0.46)",
      "0 5px 8px rgba(30, 18, 6, 0.24), 0 34px 58px -24px rgba(30, 18, 6, 0.48), 0 70px 96px -48px rgba(30, 18, 6, 0.42)",
      "0 2px 3px rgba(30, 18, 6, 0.3), 0 20px 44px -14px var(--fp-ink-shadow), 0 44px 80px -30px rgba(30, 18, 6, 0.5)",
    ],
    { clamp: true },
  );

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
        transformOrigin: "50% 50%",
        y,
        scale,
        opacity,
        boxShadow,
      }}
      // SSR / first-frame initial state matches scrollY=0 values so there is
      // no layout shift on hydration.
      initial={{ opacity: 0, y: -64, scale: 1.18 }}
    >
      {children}
    </motion.div>
  );
}
