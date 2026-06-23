"use client";

import { useEffect } from "react";

// Progressive-enhancement scroll reveal. Renders nothing. On mount it arms
// only the blocks currently below the fold (so above-the-fold content never
// flashes), then animates each one in as it scrolls into view. If this island
// never loads/runs, every .fp-reveal block simply stays visible.
export default function ScrollReveal() {
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const els = Array.from(document.querySelectorAll<HTMLElement>(".fp-reveal"));
    if (els.length === 0) return;

    const io = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            entry.target.classList.add("fp-in");
            io.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.1, rootMargin: "0px 0px -10% 0px" },
    );

    const foldLine = window.innerHeight * 0.85;
    for (const el of els) {
      if (el.getBoundingClientRect().top > foldLine) {
        el.classList.add("fp-armed");
        io.observe(el);
      }
    }

    return () => io.disconnect();
  }, []);

  return null;
}
