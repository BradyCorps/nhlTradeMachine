interface HorizontalScrollCueProps {
  label?: string;
  className?: string;
}

/** Visible on compact layouts so an intentional local scroller is discoverable
 * even when the browser uses an overlay scrollbar. */
export function HorizontalScrollCue({
  label = "Swipe or scroll for more",
  className = "",
}: HorizontalScrollCueProps) {
  return (
    <p
      className={`md:hidden mt-1 flex items-center gap-1.5 font-mono text-[9px] font-bold uppercase tracking-[0.12em] ${className}`}
      style={{ color: "var(--ledger-ink-faint)" }}
    >
      <span aria-hidden="true">↔</span>
      <span>{label}</span>
    </p>
  );
}
