"use client";
// ── useDialog (CXH8) ─────────────────────────────────────────────
//
// One hook for every overlay in the app, so the six of them cannot each be
// half-accessible in a different way. It supplies:
//
//   • dialog semantics (role, aria-modal, a label)
//   • focus moved into the dialog on open
//   • a focus trap, so Tab cannot reach the page behind
//   • Escape to close
//   • focus restored to whatever opened it
//   • the body scroll lock
//
// The scroll lock was previously listed by hand at the page level, which is
// why the memo modal and the Cup resume prompt were left out of it — a list
// that has to be edited every time a modal is added will eventually be wrong.
// Binding it to the dialog itself removes the list.

import { useCallback, useEffect, useRef } from "react";
import { FOCUSABLE_SELECTOR, initialFocusIndex, nextFocusIndex } from "@/app/lib/focus-trap";
import { useBodyScrollLock } from "@/app/lib/use-body-scroll-lock";

export interface DialogOptions {
  open: boolean;
  /** Escape and the backdrop call this. Omit for a dialog that cannot be dismissed. */
  onClose?: () => void;
  /** Accessible name. Use `labelledBy` instead when a visible heading exists. */
  label?: string;
  labelledBy?: string;
}

export interface DialogProps {
  ref: React.RefObject<HTMLDivElement>;
  role: "dialog";
  "aria-modal": true;
  "aria-label"?: string;
  "aria-labelledby"?: string;
  onKeyDown: (event: React.KeyboardEvent) => void;
  tabIndex: -1;
}

export function useDialog({ open, onClose, label, labelledBy }: DialogOptions): DialogProps {
  const ref = useRef<HTMLDivElement>(null);
  const restoreRef = useRef<Element | null>(null);

  useBodyScrollLock(open);

  const focusable = useCallback((): HTMLElement[] => {
    const root = ref.current;
    if (!root) return [];
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR))
      .filter(el => el.offsetParent !== null || el === document.activeElement);
  }, []);

  // Remember who opened us, move focus in, and put it back on close. Restoring
  // matters as much as trapping: without it a keyboard user is returned to the
  // top of the document and has to find their place again.
  useEffect(() => {
    if (!open) return;
    restoreRef.current = document.activeElement;

    // A frame late, so content rendered on open is present to receive focus.
    const id = window.requestAnimationFrame(() => {
      const els = focusable();
      const idx = initialFocusIndex(els.length, null);
      (idx >= 0 ? els[idx] : ref.current)?.focus();
    });

    return () => {
      window.cancelAnimationFrame(id);
      const previous = restoreRef.current;
      if (previous instanceof HTMLElement && document.contains(previous)) previous.focus();
    };
  }, [open, focusable]);

  const onKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === "Escape" && onClose) {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== "Tab") return;

    const els = focusable();
    if (els.length === 0) return;

    const current = els.indexOf(document.activeElement as HTMLElement);
    const next = nextFocusIndex(els.length, current, event.shiftKey);
    if (next < 0) return;

    // Always handled here rather than deferring to the browser — letting the
    // native order run at the edges is exactly how focus escapes.
    event.preventDefault();
    els[next]?.focus();
  }, [focusable, onClose]);

  return {
    ref,
    role: "dialog",
    "aria-modal": true,
    ...(labelledBy ? { "aria-labelledby": labelledBy } : {}),
    ...(!labelledBy && label ? { "aria-label": label } : {}),
    onKeyDown,
    tabIndex: -1,
  };
}
