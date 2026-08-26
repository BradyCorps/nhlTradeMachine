"use client";
// Boot / error full-page states for the Armchair GM.
import React from "react";
import Header from "@/app/components/Header";

export function LoadingScreen({
  teamsReady = false,
  playersReady = false,
  navReady = false,
  playerCount = 0,
  navCount = 0,
}: {
  teamsReady?: boolean;
  playersReady?: boolean;
  navReady?: boolean;
  playerCount?: number;
  navCount?: number;
}) {
  const Check = ({ ready, label, detail }: { ready: boolean; label: string; detail?: string }) => (
    <div className="flex items-center justify-between gap-6 text-[10px] font-black uppercase tracking-widest">
      <span className={ready ? "text-emerald-700" : "text-zinc-600"}>{ready ? "Loaded" : "Loading"}</span>
      <span className="text-zinc-800">{label}</span>
      {detail && <span className="text-zinc-500 font-mono">{detail}</span>}
    </div>
  );

  return (
    <main
      className="min-h-screen bg-paper px-4 pt-5 pb-8 font-serif text-ink"
      aria-busy="true"
      aria-label="Loading Armchair GM"
    >
      <div className="mx-auto max-w-7xl">
        <Header activeTab="armchair-gm" />

        <div className="mt-6 border-b border-ledger-rule pb-4">
          <h1 className="text-[18px] font-black uppercase tracking-[0.12em] font-mono text-ledger-ink">
            Armchair GM
          </h1>
          <p className="mt-2 max-w-3xl text-[11px] font-mono leading-relaxed text-ledger-ink-body">
            Run an NHL front office through roster moves, free agency, the draft, season simulation, and a three-year Cup Run.
          </p>
        </div>

        <div className="mt-5 grid gap-4 lg:grid-cols-2" aria-hidden="true">
          {[0, 1].map((side) => (
            <section key={side} className="border border-ledger-rule bg-ledger-card-light p-4">
              <div className="h-11 animate-pulse bg-paper-inset" />
              <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
                {Array.from({ length: 6 }, (_, index) => (
                  <div key={index} className="h-16 animate-pulse bg-paper-inset" />
                ))}
              </div>
              <div className="mt-4 h-24 animate-pulse bg-paper-inset" />
            </section>
          ))}
        </div>

        <div className="mt-4 border border-zinc-300 bg-white/35 p-4 font-mono" role="status" aria-live="polite">
          <div className="mb-3 text-[10px] font-black uppercase tracking-[0.3em] text-zinc-700 animate-pulse">
            Confirming Full Player Load
          </div>
          <div className="space-y-2">
            <Check ready={teamsReady} label="Teams" />
            <Check ready={playersReady} label="Player Assets" detail={playerCount ? `${playerCount}` : undefined} />
            <Check ready={navReady} label="Player Values" detail={playerCount ? `${Math.min(navCount, playerCount)}/${playerCount}` : undefined} />
          </div>
          <div className="mt-3 text-[10px] text-zinc-600 font-black uppercase tracking-widest">
            Cached league values unlock the desk as soon as the roster arrives.
          </div>
        </div>
      </div>
    </main>
  );
}

export function ErrorScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
      <div className="text-rose-500 font-black text-lg">Couldn't load league data</div>
      <div className="text-zinc-600 text-sm font-mono">Something went wrong while loading teams and players.</div>
      <button
        onClick={onRetry}
        className="px-5 py-2.5 font-black uppercase tracking-widest text-[11px] transition-all active:scale-[0.98]"
        style={{ background: "var(--ledger-ink)", color: "var(--ledger-card-light)", borderRadius: "2px" }}
      >
        Retry
      </button>
    </div>
  );
}
