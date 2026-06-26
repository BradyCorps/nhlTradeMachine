"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import type { ToastEvent, ToastKind } from "@/app/lib/ledger-toast";

const DURATION_MS = 3500;

const BG: Record<ToastKind, string> = {
  success: "var(--ledger-green)",
  error:   "var(--ledger-red)",
  info:    "var(--ledger-ink)",
};

export default function LedgerToaster() {
  const [toasts, setToasts] = useState<ToastEvent[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    function handler(e: Event) {
      const t = (e as CustomEvent<ToastEvent>).detail;
      setToasts((prev) => [...prev, t]);
      setTimeout(() => {
        setToasts((prev) => prev.filter((x) => x.id !== t.id));
      }, DURATION_MS);
    }
    window.addEventListener("ledger-toast", handler);
    return () => window.removeEventListener("ledger-toast", handler);
  }, []);

  if (!mounted) return null;

  return createPortal(
    <div style={{
      position: "fixed",
      bottom: 24,
      right: 24,
      zIndex: 9999,
      display: "flex",
      flexDirection: "column",
      gap: 8,
      pointerEvents: "none",
    }}>
      <AnimatePresence initial={false}>
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 32, y: 4 }}
            animate={{ opacity: 1, x: 0, y: 0 }}
            exit={{ opacity: 0, x: 32 }}
            transition={{ type: "spring", stiffness: 320, damping: 26 }}
            style={{
              background: BG[t.kind],
              color: "var(--paper)",
              padding: "10px 16px",
              fontSize: 11,
              fontWeight: 900,
              letterSpacing: "0.1em",
              fontFamily: "'Courier Prime', 'Courier New', monospace",
              boxShadow: "0 4px 18px rgba(0,0,0,0.35)",
              maxWidth: 340,
              lineHeight: 1.45,
              pointerEvents: "auto",
            }}
          >
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}
