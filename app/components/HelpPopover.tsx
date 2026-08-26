"use client";

import React, { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDialog } from "@/app/lib/use-dialog";

type Position = { mobile: boolean; top?: number; left?: number };

export function HelpPopover({
  label,
  definition,
  children,
  className = "",
}: {
  label: string;
  definition: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<Position>({ mobile: true });
  const triggerRef = useRef<HTMLButtonElement>(null);
  const rawId = useId();
  const panelId = `help-${rawId.replace(/:/g, "")}`;
  const headingId = `${panelId}-heading`;
  const close = useCallback(() => setOpen(false), []);
  const dialog = useDialog({ open, onClose: close, labelledBy: headingId });

  const openPanel = useCallback(() => {
    const rect = triggerRef.current?.getBoundingClientRect();
    const mobile = window.matchMedia("(max-width: 767px)").matches;
    if (!mobile && rect) {
      const width = Math.min(320, window.innerWidth - 24);
      const left = Math.min(
        window.innerWidth - width - 12,
        Math.max(12, rect.left + rect.width / 2 - width / 2),
      );
      const below = rect.bottom + 8;
      const top = below + 220 <= window.innerHeight
        ? below
        : Math.max(12, rect.top - 228);
      setPosition({ mobile: false, top, left });
    } else {
      setPosition({ mobile: true });
    }
    setOpen(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnViewportChange = () => close();
    window.addEventListener("resize", closeOnViewportChange);
    window.addEventListener("scroll", closeOnViewportChange, true);
    return () => {
      window.removeEventListener("resize", closeOnViewportChange);
      window.removeEventListener("scroll", closeOnViewportChange, true);
    };
  }, [open, close]);

  const panel = open && typeof document !== "undefined" ? createPortal(
    <div
      className={`fixed inset-0 z-[180] ${position.mobile ? "bg-black/35" : "bg-transparent"}`}
      onPointerDown={event => {
        if (event.target === event.currentTarget) close();
      }}
    >
      <div
        {...dialog}
        id={panelId}
        className="fixed border p-4 font-mono shadow-xl"
        style={position.mobile ? {
          left: 0,
          right: 0,
          bottom: 0,
          maxHeight: "min(70vh, 420px)",
          overflowY: "auto",
          paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
          borderColor: "var(--ledger-rule)",
          background: "var(--paper-card)",
          color: "var(--ledger-ink)",
        } : {
          top: position.top,
          left: position.left,
          width: 320,
          maxHeight: "min(360px, calc(100vh - 24px))",
          overflowY: "auto",
          borderColor: "var(--ledger-rule)",
          background: "var(--paper-card)",
          color: "var(--ledger-ink)",
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 id={headingId} className="text-[11px] font-black uppercase tracking-[0.16em]">
              {label}
            </h2>
            <div className="mt-2 text-[12px] leading-relaxed" style={{ color: "var(--ledger-ink-body, var(--ledger-ink))" }}>
              {definition}
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label={`Close ${label} definition`}
            className="min-h-11 min-w-11 shrink-0 border text-[18px] font-black"
            style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-ink)", background: "transparent" }}
          >
            ×
          </button>
        </div>
      </div>
    </div>,
    document.body,
  ) : null;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-haspopup="dialog"
        aria-label={`Explain ${label}`}
        onClick={() => open ? close() : openPanel()}
        className={`inline-flex min-h-11 min-w-11 items-center justify-center border-b border-dotted px-1 text-inherit md:min-h-0 md:min-w-0 ${className}`}
        style={{ borderColor: "var(--ledger-rule)", background: "transparent", cursor: "help", font: "inherit" }}
      >
        {children ?? label}
      </button>
      {panel}
    </>
  );
}
