"use client";

import { motion, useScroll, useTransform, useReducedMotion, useMotionValueEvent } from "framer-motion";
import { useRef, useState, useEffect, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}

export default function LedgerScrollSetdown({ children, className, style }: Props) {
  const reduced = useReducedMotion();
  const [useCSSTimeline, setUseCSSTimeline] = useState(false);

  useEffect(() => {
    if (CSS.supports("animation-timeline", "scroll()")) {
      setUseCSSTimeline(true);
    }
  }, []);

  if (reduced) {
    return (
      <div className={className} style={style}>
        {children}
      </div>
    );
  }

  if (useCSSTimeline) {
    return (
      <div
        className={`${className ?? ""} css-scroll-anim`}
        style={style}
      >
        {children}
      </div>
    );
  }

  return <MotionFallback className={className} style={style}>{children}</MotionFallback>;
}

function MotionFallback({ children, className, style }: Props) {
  const { scrollY } = useScroll();
  const [settled, setSettled] = useState(false);
  const settledRef = useRef(false);

  const y = useTransform(scrollY, [0, 760, 900], [600, 4, 0], { clamp: true });
  const scale = useTransform(scrollY, [0, 760, 900], [0.88, 0.998, 1], { clamp: true });
  const opacity = useTransform(scrollY, [0, 225], [0, 1], { clamp: true });

  useMotionValueEvent(scrollY, "change", (v) => {
    const nextSettled = v > 760;
    if (settledRef.current === nextSettled) return;
    settledRef.current = nextSettled;
    setSettled(nextSettled);
  });

  return (
    <motion.div
      className={className ?? ""}
      style={{
        ...style,
        transformOrigin: "50% 50%",
        y: settled ? 0 : y,
        scale: settled ? 1 : scale,
        opacity: settled ? 1 : opacity,
        willChange: settled ? "auto" : "transform, opacity",
      }}
      initial={{ opacity: 0, y: 600, scale: 0.88 }}
    >
      {children}
    </motion.div>
  );
}
