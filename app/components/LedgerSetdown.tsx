"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode } from "react";

// ── "Set the ledger down on the desk" page entrance ────────────────
//
// The reading surface arrives like a newspaper being laid flat:
//   - Comes from above with a slight forward tip (rotateX)
//   - Spring physics pull it to rest — stiff enough to feel weighted,
//     damp enough to settle in ~600ms with a single small overshoot
//   - Two springs run in parallel (y + rotateX) with slightly different
//     damping so the angle resolves a touch after the translation,
//     mimicking how a real sheet tips flat last
//   - Uses framer-motion's "transformPerspective" so perspective is
//     embedded in the element transform rather than a CSS wrapper,
//     which prevents it from becoming a containing block (sticky
//     headers, fixed portals, etc. all still work normally)

interface Props {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

const SPRING_Y       = { type: "spring", stiffness: 240, damping: 26, mass: 1.1 } as const;
const SPRING_ROTATE  = { type: "spring", stiffness: 180, damping: 24, mass: 1.0 } as const;

export default function LedgerSetdown({ children, className, style }: Props) {
  const reduced = useReducedMotion();

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
      style={{ ...style, transformPerspective: 1400, transformOrigin: "50% 100%" }}
      initial={{ opacity: 0, y: -52, rotateX: 9, scale: 1.025 }}
      animate={{ opacity: 1, y: 0,   rotateX: 0, scale: 1 }}
      transition={{
        opacity: { duration: 0.22, ease: "easeOut" },
        y:       SPRING_Y,
        rotateX: SPRING_ROTATE,
        scale:   { ...SPRING_Y, stiffness: 280, damping: 30 },
      }}
    >
      {children}
    </motion.div>
  );
}
