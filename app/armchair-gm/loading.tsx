// app/armchair-gm/loading.tsx
// Mirrors the in-page startup gate so users do not see two different preloaders.

export default function ArmchairGmLoading() {
  const Row = ({ label }: { label: string }) => (
    <div className="flex items-center justify-between gap-6 text-[10px] font-black uppercase tracking-widest">
      <span className="text-zinc-600">Loading</span>
      <span className="text-zinc-800">{label}</span>
    </div>
  );

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center gap-4 px-6"
      style={{ background: 'var(--paper)' }}
    >
      <div className="relative w-12 h-12">
        <div className="absolute inset-0 rounded-full border-2 border-ledger-rule" />
        <div className="absolute inset-0 rounded-full border-2 border-t-ledger-red animate-spin" />
      </div>

      <div className="text-2xs font-black uppercase tracking-[0.5em] text-zinc-600 animate-pulse">
        Confirming Full Player Load
      </div>
      <div className="text-2xs text-zinc-800 font-black uppercase tracking-widest">
        MoneyPuck · NHL API · X-NAV 2.0
      </div>

      <div className="mt-2 w-full max-w-md space-y-2 border border-zinc-300 bg-white/35 p-4">
        <Row label="Teams" />
        <Row label="Player Assets" />
        <Row label="Player Values" />
      </div>
      <div className="text-[10px] text-zinc-600 font-black uppercase tracking-widest text-center">
        Armchair GM unlocks after every roster value is ready.
      </div>
    </div>
  );
}
