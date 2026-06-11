// ── Footer — data credits and disclaimer ────────────────────
// Shared across Trade Machine and Player Analytics pages.

export default function Footer() {
  return (
    <div className="text-center pt-4 px-4 border-t border-ledger-rule">
      <p className="text-2xs uppercase tracking-[0.16em] sm:tracking-[0.4em] leading-relaxed font-mono text-ledger-ink-faint">
        Data: NHL API · MoneyPuck · CapWages &nbsp;·&nbsp; Models: X-NAV 1.1 · G-NAV · NOIV · STRAND™ &nbsp;·&nbsp; AI: Claude Sonnet
      </p>
      <p className="text-[9px] mt-1 leading-relaxed font-mono text-ledger-rule">
        All valuations are analytical estimates, not financial advice. Player values fluctuate with injury, performance, and market conditions.
      </p>
    </div>
  );
}
