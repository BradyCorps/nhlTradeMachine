"use client";

import Header from "@/app/components/Header";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { TEAMS_DB } from "@/app/lib/db";

export default function TeamsLoading() {
  const pathname = usePathname();
  const detailId = pathname.startsWith("/teams/")
    ? decodeURIComponent(pathname.slice("/teams/".length).split("/")[0]).toUpperCase()
    : null;
  const detailTeam = detailId ? TEAMS_DB.find((team) => team.id === detailId) ?? null : null;

  return (
    <main
      className="min-h-screen font-mono"
      aria-busy="true"
      aria-label="Loading Team Analytics"
      style={{ background: "var(--paper-bg)", color: "var(--ledger-ink)" }}
    >
      <div className="mx-auto max-w-6xl px-4 pt-5 pb-8">
        <Header activeTab="teams" />

        <header className="mt-6 mb-5 border-b pb-4" style={{ borderColor: "var(--ledger-rule)" }}>
          <h1 className="text-[18px] font-black uppercase tracking-[0.08em]" style={{ color: "var(--ledger-ink)" }}>
            {detailTeam ? `${detailTeam.name} Team Analytics` : "NHL Team Analytics"}
          </h1>
          <p className="mt-2 max-w-3xl text-[11px] leading-relaxed" style={{ color: "var(--ledger-ink-faint)" }}>
            {detailTeam
              ? `${detailTeam.name} contention window, roster X-NAV, cap situation, Team DNA, EDGE profile, and projected lines.`
              : "Compare all 32 franchises by contention window, roster X-NAV, cap space, Team DNA, EDGE profile, and projected lines."}
          </p>
        </header>

        {!detailTeam && (
          <nav aria-label="NHL team dossiers" className="mb-5 grid grid-cols-2 gap-x-4 gap-y-1 border p-3 sm:grid-cols-4"
            style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}>
            {TEAMS_DB.map((team) => (
              <Link
                key={team.id}
                href={`/teams/${team.id.toLowerCase()}`}
                className="inline-flex min-h-11 items-center text-[9px] font-black uppercase tracking-[0.08em] underline-offset-2 hover:underline focus-visible:underline sm:min-h-0"
                style={{ color: "var(--ledger-ink-body)" }}
              >
                {team.name}
              </Link>
            ))}
          </nav>
        )}

        <div className="mb-5 grid grid-cols-5 gap-2 border p-3" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}>
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-10 animate-pulse" style={{ background: "var(--ledger-rule-light)" }} />
          ))}
        </div>

        <div className="mb-5 h-44 border p-4" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-card)" }}>
          <div className="h-full animate-pulse" style={{ background: "var(--paper-inset)" }} />
        </div>

        <div className="space-y-2" role="status">
          <span className="sr-only">Loading team records and league values</span>
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="h-16 border p-3" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-card)" }}>
              <div className="h-full animate-pulse" style={{ background: "var(--paper-inset)" }} />
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
