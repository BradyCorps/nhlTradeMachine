"use client";

import { useEffect, useRef } from "react";

export default function ScrollSnap() {
  const snappedRef = useRef(false);
  const scrollingRef = useRef(false);

  useEffect(() => {
    const stack = document.querySelector(".fp-stack") as HTMLElement | null;
    if (!stack) return;

    const onScroll = () => {
      if (snappedRef.current || scrollingRef.current) return;

      const rect = stack.getBoundingClientRect();
      const threshold = 120;

      if (rect.top > 0 && rect.top < threshold) {
        snappedRef.current = true;
        scrollingRef.current = true;

        const targetScroll = window.scrollY + rect.top;
        window.scrollTo({ top: targetScroll, behavior: "smooth" });

        const onScrollEnd = () => {
          scrollingRef.current = false;
          window.removeEventListener("scroll", onScroll);
        };
        setTimeout(onScrollEnd, 600);
      }
    };

    const onScrollUp = () => {
      if (!snappedRef.current || scrollingRef.current) return;

      const spacer = document.querySelector(".fp-desk-spacer") as HTMLElement | null;
      if (!spacer) return;

      const stackRect = stack.getBoundingClientRect();
      if (stackRect.top > 80) {
        snappedRef.current = false;
      }
    };

    const handler = () => {
      onScroll();
      onScrollUp();
    };

    window.addEventListener("scroll", handler, { passive: true });
    return () => window.removeEventListener("scroll", handler);
  }, []);

  return null;
}
