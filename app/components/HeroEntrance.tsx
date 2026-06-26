"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { ReactNode, CSSProperties } from "react";

interface AnimProps {
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
}

export function SheetEntrance({ children, className, style }: AnimProps) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className} style={style}>{children}</div>;

  return (
    <motion.div
      className={className}
      style={{ ...style, transformOrigin: "50% 0%" }}
      initial={{ opacity: 0, y: 70, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{
        opacity: { duration: 0.45, ease: "easeOut" },
        y: { duration: 1.2, type: "spring", stiffness: 100, damping: 22, mass: 1.2 },
        scale: { duration: 1.2, type: "spring", stiffness: 100, damping: 22, mass: 1.2 },
      }}
    >
      {children}
    </motion.div>
  );
}

export function FadeUp({ children, className, style, delay = 0 }: AnimProps & { delay?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className} style={style}>{children}</div>;

  return (
    <motion.div
      className={className}
      style={style}
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.8, delay, ease: [0.16, 1, 0.3, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function ScrollCard({ children, className, index = 0 }: AnimProps & { index?: number }) {
  const reduced = useReducedMotion();
  if (reduced) return <div className={className}>{children}</div>;

  return (
    <motion.div
      className={className}
      initial={{ y: 80, opacity: 0, scale: 0.97 }}
      whileInView={{ y: 0, opacity: 1, scale: 1 }}
      viewport={{ once: true, amount: 0.15 }}
      transition={{
        type: "spring",
        bounce: 0.32,
        duration: 0.85,
        delay: index * 0.08,
      }}
    >
      {children}
    </motion.div>
  );
}
