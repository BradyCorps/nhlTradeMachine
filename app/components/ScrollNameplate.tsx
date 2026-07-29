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

  const opacity = useTransform(scrollY, [0, 320], [1, 0], { clamp: true });
  const y       = useTransform(scrollY, [0, 320], [0, -36], { clamp: true });

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
      {/* The kit wordmark, cream cut, rather than Libre Baskerville with a
          typed ampersand. The red ampersand is a custom vector and the kit
          forbids recreating it as text. Decorative: the sheet below carries
          the real <h1>, so announcing the name here would repeat it. */}
      <img
        src="/brand/svg/cap-and-crease-wordmark-cream.svg"
        alt=""
        aria-hidden="true"
        width={1280}
        height={240}
        style={{
          width: "min(88vw, 720px)",
          height: "auto",
          userSelect: "none",
          filter: "drop-shadow(0 2px 36px rgba(0,0,0,0.5))",
        }}
      />

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
