"use client";

import { motion, useScroll, useSpring, useTransform, useReducedMotion, useMotionValueEvent } from "framer-motion";
import { useState, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function LedgerScrollSetdown({ children, className, style }: Props) {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  const [settled, setSettled] = useState(false);

  const rawY = useTransform(scrollY, [0, 480, 620], [110, 6, 0], { clamp: true });
  const rawScale = useTransform(scrollY, [0, 480, 620], [0.78, 0.988, 1], { clamp: true });
  const opacity = useTransform(scrollY, [0, 160], [0, 1], { clamp: true });

  const y = useSpring(rawY, { stiffness: 110, damping: 38, mass: 1.4 });
  const scale = useSpring(rawScale, { stiffness: 105, damping: 40, mass: 1.4 });

  useMotionValueEvent(scrollY, "change", (v) => {
    setSettled(v > 480);
  });

  if (reduced) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  return (
    <motion.div
      className={`${className ?? ""} ${settled ? "fp-stack-settled" : "fp-stack-lifted"}`}
      style={{
        ...style,
        transformOrigin: "50% 50%",
        y,
        scale,
        opacity,
        willChange: "transform, opacity",
      }}
      initial={{ opacity: 0, y: 110, scale: 0.78 }}
    >
      {children}
    </motion.div>
  );
}
