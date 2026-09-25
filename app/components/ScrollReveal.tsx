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
            // Already on screen when detected (a fast fling or a jump): show it
            // at once rather than fading in over content the reader is on.
            if (entry.boundingClientRect.top < window.innerHeight * 0.9) entry.target.classList.add("fp-instant");
            entry.target.classList.add("fp-in");
            io.unobserve(entry.target);
          }
        }
      },
      // Fire while the block is still up to 40% of a viewport below the
      // screen, on its first pixel. The old 10%-of-the-block threshold scaled
      // with block height: a 2,500px section on a phone stayed invisible for
      // a full screen of scrolling (and one over ~5,000px could never fire).
      { threshold: 0, rootMargin: "0px 0px 40% 0px" },
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
