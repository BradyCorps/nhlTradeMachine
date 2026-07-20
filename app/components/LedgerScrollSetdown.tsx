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

  // The setdown must finish before the 90vh desk spacer runs out —
  // a fixed 900px end crops the masthead on shorter viewports.
  const [end, setEnd] = useState(900);
  useEffect(() => {
    setEnd(Math.min(900, Math.round(window.innerHeight * 0.85)));
  }, []);

  const y = useTransform(scrollY, [0, end * 0.85, end], [600, 4, 0], { clamp: true });
  const scale = useTransform(scrollY, [0, end * 0.85, end], [0.88, 0.998, 1], { clamp: true });
  const opacity = useTransform(scrollY, [0, 225], [0, 1], { clamp: true });

  useMotionValueEvent(scrollY, "change", (v) => {
    const nextSettled = v > end * 0.85;
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
