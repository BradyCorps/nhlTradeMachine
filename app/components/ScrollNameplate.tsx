"use client";

import { motion, useScroll, useTransform, useReducedMotion, useMotionValueEvent } from "framer-motion";
import { useRef, useState, useEffect } from "react";

export default function ScrollNameplate() {
  const reduced = useReducedMotion();
  const [useCSSTimeline, setUseCSSTimeline] = useState(false);

  useEffect(() => {
    if (CSS.supports("animation-timeline", "scroll()")) {
      setUseCSSTimeline(true);
    }
  }, []);

  if (reduced) return null;

  if (useCSSTimeline) return <CSSTimelineNameplate />;

  return <MotionNameplate />;
}

function CSSTimelineNameplate() {
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    const onScroll = () => {
      const shouldHide = window.scrollY > 300;
      setHidden((prev) => (prev === shouldHide ? prev : shouldHide));
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  if (hidden) return null;

  return (
    <div
      aria-hidden="true"
      className="nameplate-css-scroll"
      style={{
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      <NameplateContent />
    </div>
  );
}

function MotionNameplate() {
  const { scrollY } = useScroll();
  const [hidden, setHidden] = useState(false);
  const hiddenRef = useRef(false);

  const opacity = useTransform(scrollY, [0, 260], [1, 0], { clamp: true });
  const y       = useTransform(scrollY, [0, 260], [0, -28], { clamp: true });

  useMotionValueEvent(scrollY, "change", (v) => {
    const nextHidden = v > 300;
    if (hiddenRef.current === nextHidden) return;
    hiddenRef.current = nextHidden;
    setHidden(nextHidden);
  });

  if (hidden) return null;

  return (
    <motion.div
      aria-hidden="true"
      style={{
        opacity,
        y,
        position: "fixed",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        pointerEvents: "none",
        zIndex: 5,
      }}
    >
      <NameplateContent />
    </motion.div>
  );
}

function NameplateContent() {
  return (
    <>
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

      <div
        className="nameplate-bounce-arrow"
        style={{
          marginTop: 18,
          fontSize: 15,
          color: "rgba(255,245,225,0.26)",
        }}
      >
        ↓
      </div>
    </>
  );
}
