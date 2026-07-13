export default function Loading() {
  return (
    <main
      className="min-h-screen font-mono"
      style={{ background: "var(--paper-bg)", color: "var(--ledger-ink)" }}
    >
      <div className="mx-auto max-w-6xl px-4 py-12 text-center">
        <div className="text-[11px] font-black uppercase tracking-[0.3em] animate-pulse">
          Loading Team Analytics&hellip;
        </div>
      </div>
    </main>
  );
}
