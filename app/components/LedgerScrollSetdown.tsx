"use client";

import { motion, useScroll, useTransform, useReducedMotion, useMotionValueEvent } from "framer-motion";
import { useRef, useState, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function LedgerScrollSetdown({ children, className, style }: Props) {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  const [settled, setSettled] = useState(false);
  const settledRef = useRef(false);

  const y = useTransform(scrollY, [0, 480, 620], [110, 6, 0], { clamp: true });
  const scale = useTransform(scrollY, [0, 480, 620], [0.9, 0.995, 1], { clamp: true });
  const opacity = useTransform(scrollY, [0, 160], [0, 1], { clamp: true });

  useMotionValueEvent(scrollY, "change", (v) => {
    const nextSettled = v > 480;
    if (settledRef.current === nextSettled) return;
    settledRef.current = nextSettled;
    setSettled(nextSettled);
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
        y: settled ? 0 : y,
        scale: settled ? 1 : scale,
        opacity: settled ? 1 : opacity,
        willChange: settled ? "auto" : "transform, opacity",
      }}
      initial={{ opacity: 0, y: 110, scale: 0.9 }}
    >
      {children}
    </motion.div>
  );
}
