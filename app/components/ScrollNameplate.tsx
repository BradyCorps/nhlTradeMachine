"use client";

import { motion, useScroll, useTransform, useReducedMotion, useMotionValueEvent } from "framer-motion";
import { useRef, useState } from "react";

// ── Desk nameplate overlay ──────────────────────────────────────────────────
// Fixed overlay that sits ON the desk before the newspaper arrives.
// Fades and drifts upward as the user scrolls, making room for the sheet.
// aria-hidden: pure decoration — the masthead inside the sheet is the real h1.

export default function ScrollNameplate() {
  const reduced = useReducedMotion();
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);

  // Fade and drift up as user scrolls 0 → 260px
  const opacity = useTransform(scrollY, [0, 260], [1, 0], { clamp: true });
  const y       = useTransform(scrollY, [0, 260], [0, -28], { clamp: true });

  useMotionValueEvent(scrollY, "change", (v) => {
    const nextHidden = v > 300;
    if (hiddenRef.current === nextHidden) return;
    hiddenRef.current = nextHidden;
    setHidden(nextHidden);
  });

  if (reduced) return null;

  return (
    <motion.div
      aria-hidden="true"
      style={{
        opacity,
        y,
        position: "fixed",
        inset: 0,
        display: hidden ? "none" : "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      {/* Nameplate — same font as fp-nameplate, sized to read clearly on the desk */}
      <div style={{
        fontFamily: "'Libre Baskerville', Georgia, 'Times New Roman', serif",
        fontWeight: 700,
        fontSize: "clamp(2.2rem, 7.5vw, 4.8rem)",
        color: "var(--paper)",
        letterSpacing: "-0.02em",
        lineHeight: 0.92,
        textAlign: "center",
        textShadow: "0 2px 36px rgba(0,0,0,0.5), 0 1px 0 rgba(0,0,0,0.15)",
        userSelect: "none",
      }}>
        The Hockey Ledger
      </div>

      <div style={{
        marginTop: 26,
        fontFamily: "'Courier Prime', 'Courier New', monospace",
        fontSize: 9,
        fontWeight: 900,
        letterSpacing: "0.4em",
        textTransform: "uppercase",
        color: "rgba(255,245,225,0.38)",
        userSelect: "none",
      }}>
        Scroll to read
      </div>

      {/* Gently bouncing arrow */}
      {!hidden && (
        <motion.div
          animate={{ y: [0, 10, 0] }}
          transition={{ duration: 2.0, repeat: Infinity, ease: "easeInOut" }}
          style={{
            marginTop: 18,
            fontSize: 15,
            color: "rgba(255,245,225,0.26)",
          }}
        >
          ↓
        </motion.div>
      )}
    </motion.div>
  );
}
