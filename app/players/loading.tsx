// app/players/loading.tsx
// Shown by Next.js App Router during initial route navigation to /players.

export default function PlayersLoading() {
  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4"
      style={{ background: 'var(--paper)' }}
    >
      {/* Spinner */}
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-ledger-rule" />
        <div className="absolute inset-0 rounded-full border-2 border-t-ledger-ice animate-spin" />
      </div>

      {/* Label */}
      <div className="text-center mt-2">
        <div className="text-2xs font-black uppercase tracking-[0.5em] text-ledger-ink-faint font-mono animate-pulse">
          Cap & Crease
        </div>
        <div className="text-2xs text-ledger-rule font-mono mt-1 uppercase tracking-widest animate-pulse">
          Loading Player Analytics · Live Data
        </div>
      </div>

      {/* Player row skeletons */}
      <div className="w-full max-w-3xl px-6 mt-4 space-y-2">
        {[100, 100, 100, 100, 100].map((_, i) => (
          <div
            key={i}
            className="h-10 rounded animate-pulse bg-ledger-card"
            style={{ animationDelay: `${i * 80}ms` }}
          />
        ))}
      </div>
    </div>
  );
}