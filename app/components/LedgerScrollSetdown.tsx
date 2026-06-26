"use client";

import { motion, useScroll, useSpring, useTransform, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

// Scroll-driven "set the ledger down on the desk".
// The broadsheet reads like a heavy stack being lowered onto a table —
// scale, vertical settle, opacity, and layered shadow depth all respond
// to scroll position. Heavier spring mass keeps the paper feeling weighty.
//
// Animation window: page scroll 0 → 620px.
//   0 px     → stack is smaller/farther away, invisible
//   140 px   → stack fades in, still lifting
//   300 px   → nameplate is gone, sheet readable and settling
//   480 px   → stack has nearly reached the desk plane
//   620 px   → fully settled, dead flat, at rest

interface Props {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function LedgerScrollSetdown({ children, className, style }: Props) {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();

  const rawY = useTransform(scrollY, [0, 480, 620], [110, 6, 0], { clamp: true });
  const rawScale = useTransform(scrollY, [0, 480, 620], [0.78, 0.988, 1], { clamp: true });
  const opacity = useTransform(scrollY, [0, 160], [0, 1], { clamp: true });

  // Heavier springs — mass 1.8+ for the weighted-paper feel
  const y = useSpring(rawY, { stiffness: 90, damping: 30, mass: 1.8 });
  const scale = useSpring(rawScale, { stiffness: 85, damping: 32, mass: 1.9 });

  // Layered shadows: deep cast shadow shrinks as the stack settles onto the desk
  const boxShadow = useTransform(
    scrollY,
    [0, 480, 620],
    [
      "0 24px 24px rgba(30, 18, 6, 0.20), 0 80px 110px -38px rgba(30, 18, 6, 0.55), 0 140px 150px -66px rgba(30, 18, 6, 0.48)",
      "0 6px 10px rgba(30, 18, 6, 0.26), 0 38px 62px -26px rgba(30, 18, 6, 0.50), 0 78px 100px -50px rgba(30, 18, 6, 0.44)",
      "0 2px 3px rgba(30, 18, 6, 0.32), 0 22px 48px -14px var(--fp-ink-shadow), 0 48px 86px -32px rgba(30, 18, 6, 0.52)",
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
        willChange: "transform, opacity, box-shadow",
      }}
      initial={{ opacity: 0, y: 110, scale: 0.78 }}
    >
      {children}
    </motion.div>
  );
}
