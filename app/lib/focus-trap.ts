// ── Focus trap (CXH8) ────────────────────────────────────────────
//
// Six overlays — team select, mode select, trade proposals, the Claude memo,
// the Cup resume prompt and draft night — each opened over the page with no
// dialog semantics, no focus trap, no Escape and no focus restore. A keyboard
// user could tab straight out of an open modal into the page behind it and
// operate controls they cannot see, and a screen reader was never told a
// dialog had opened at all.
//
// The cycling rule is pulled out here so it can be tested without a DOM. The
// hook in use-dialog.ts supplies the elements.

/**
 * Everything focusable by default, minus anything explicitly removed from the
 * tab order. `details summary` and `[contenteditable]` are included because
 * both take focus and both appear in these overlays.
 */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "details > summary",
  "[contenteditable]",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * The index to focus next when Tab is pressed inside a trap.
 *
 * Wraps in both directions: Tab past the last element returns to the first,
 * Shift+Tab before the first goes to the last. That wrapping IS the trap —
 * without it focus escapes to the browser chrome and then to the page behind.
 *
 * `current` of -1 means focus is somewhere the trap does not own (the dialog
 * container itself, or nothing), in which case Tab enters at the first element
 * and Shift+Tab at the last.
 */
export function nextFocusIndex(count: number, current: number, shiftKey: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return shiftKey ? count - 1 : 0;
  const step = shiftKey ? -1 : 1;
  return (current + step + count) % count;
}

/**
 * Which element should take focus when a dialog opens.
 *
 * An explicitly requested element wins. Otherwise the first focusable one —
 * never the container, because a focused container reads as an empty dialog to
 * a screen reader and leaves the first Tab press going nowhere useful.
 */
export function initialFocusIndex(count: number, requested: number | null): number {
  if (requested != null && requested >= 0 && requested < count) return requested;
  return count > 0 ? 0 : -1;
}
