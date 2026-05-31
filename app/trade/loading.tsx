// app/trade/loading.tsx
// Shown by Next.js App Router during initial route navigation to /trade.
// Matches the brand aesthetic so the transition feels seamless.

export default function TradeLoading() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ background: 'var(--paper)' }}
    >
      {/* Spinner */}
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-ledger-rule" />
        <div className="absolute inset-0 rounded-full border-2 border-t-ledger-red animate-spin" />
      </div>

      {/* Masthead skeleton */}
      <div className="text-center mt-2">
        <div className="text-2xs font-black uppercase tracking-[0.5em] text-ledger-ink-faint font-mono animate-pulse">
          The Hockey Ledger
        </div>
        <div className="text-2xs text-ledger-rule font-mono mt-1 uppercase tracking-widest animate-pulse">
          Loading Trade Machine · X-NAV 1.1
        </div>
      </div>

      {/* Content skeleton bars */}
      <div className="w-full max-w-2xl px-6 mt-4 space-y-3">
        {[80, 60, 90, 50].map((w, i) => (
          <div
            key={i}
            className="h-2 rounded-full animate-pulse bg-ledger-card"
            style={{ width: `${w}%`, animationDelay: `${i * 100}ms` }}
          />
        ))}
      </div>
    </div>
  );
}