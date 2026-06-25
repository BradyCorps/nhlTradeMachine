"use client";

import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

// Scroll-driven "set the ledger down on the desk".
// The broadsheet should read as a sheet being lowered onto a table, not as a
// hinged panel flipping open. Keep the tilt shallow and pivot around the sheet's
// center so scroll mostly controls height, with the shadow tightening as the
// paper reaches the desk.
//
// Animation window: page scroll 0 → 560px.
//   0 px     → sheet is just above the desk, lightly tipped away, invisible
//   120 px   → sheet is visible and clearly descending
//   260 px   → nameplate is gone, sheet is nearly flat
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

  const y = useTransform(scrollY, [0, 420, 560], [-112, -10, 0], { clamp: true });
  const rotateX = useTransform(scrollY, [0, 320, 560], [-5, -1, 0], { clamp: true });
  const scale = useTransform(scrollY, [0, 560], [1.018, 1], { clamp: true });
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
        transformPerspective: 1400,
        transformOrigin: "50% 50%",
        y,
        rotateX,
        scale,
        opacity,
        boxShadow,
      }}
      // SSR / first-frame initial state matches scrollY=0 values so there is
      // no layout shift on hydration.
      initial={{ opacity: 0, y: -112, rotateX: -5, scale: 1.018 }}
    >
      {children}
    </motion.div>
  );
}
