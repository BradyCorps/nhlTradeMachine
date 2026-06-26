"use client";

import { useState, useEffect } from "react";
import { motion, useScroll, useTransform, useReducedMotion } from "framer-motion";

export default function FloatingAccents() {
  const reduced = useReducedMotion();
  const [mounted, setMounted] = useState(false);
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, 400], [1, 0], { clamp: true });

  useEffect(() => setMounted(true), []);

  if (reduced || !mounted) return null;

  return (
    <motion.div
      aria-hidden="true"
      className="hidden lg:block"
      style={{
        opacity,
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 4,
      }}
    >
      {/* Trade Alert */}
      <motion.div
        className="hero-float-card"
        style={{ position: "absolute", top: "16%", left: "3.5%" }}
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: [0, -8, 0] }}
        transition={{
          opacity: { duration: 0.7, delay: 1.0 },
          scale: { duration: 0.7, delay: 1.0 },
          y: { repeat: Infinity, duration: 5, ease: "easeInOut", delay: 1.3 },
        }}
      >
        <div className="text-[7px] font-mono font-black uppercase tracking-[0.25em] opacity-60">
          Trade Alert
        </div>
        <div className="text-[11px] font-black mt-1">{`McDavid → TOR`}</div>
        <div className="text-[8px] font-mono opacity-50 mt-0.5">{`NAV Δ +2.4`}</div>
      </motion.div>

      {/* STRAND DNA */}
      <motion.div
        className="hero-float-card"
        style={{ position: "absolute", top: "34%", right: "3.5%" }}
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: [0, -11, 0] }}
        transition={{
          opacity: { duration: 0.7, delay: 1.6 },
          scale: { duration: 0.7, delay: 1.6 },
          y: { repeat: Infinity, duration: 4.5, ease: "easeInOut", delay: 1.9 },
        }}
      >
        <div className="text-[7px] font-mono font-black uppercase tracking-[0.25em] opacity-60">
          {`STRAND™ DNA`}
        </div>
        <div className="text-[10px] font-mono mt-1 opacity-80">Fit: 94%</div>
        <div className="text-[8px] font-mono opacity-50 mt-0.5">
          {"●●●●○"}
        </div>
      </motion.div>

      {/* GM Audit */}
      <motion.div
        className="hero-float-card"
        style={{ position: "absolute", bottom: "32%", left: "5%" }}
        initial={{ opacity: 0, scale: 0.9, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: [0, -7, 0] }}
        transition={{
          opacity: { duration: 0.7, delay: 2.2 },
          scale: { duration: 0.7, delay: 2.2 },
          y: { repeat: Infinity, duration: 5.5, ease: "easeInOut", delay: 2.5 },
        }}
      >
        <div className="text-[7px] font-mono font-black uppercase tracking-[0.25em] opacity-60">
          GM Audit
        </div>
        <div className="text-[10px] font-mono mt-1 opacity-80">{`Cap Legal ✓`}</div>
        <div className="text-[8px] font-mono opacity-50 mt-0.5">Window: Open</div>
      </motion.div>
    </motion.div>
  );
}
