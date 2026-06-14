"use client";
// app/page.tsx — The Hockey Ledger welcome page
import React from "react";
import Link from "next/link";
import Footer from "./components/Footer";

export default function WelcomePage() {
  return (
    <main className="min-h-screen font-serif antialiased"
      style={{ background: "var(--paper)", color: "var(--ink)" }}>

      {/* ── Masthead ─────────────────────────────────────────── */}
      <div className="border-b-2 border-double" style={{ borderColor: "var(--ink)" }}>
        <div className="max-w-4xl mx-auto px-5 py-6 text-center">
          <p className="text-2xs uppercase tracking-[0.4em] mb-2 font-mono"
            style={{ color: "var(--ledger-ink-faint)" }}>
            Est. 2026 &nbsp;—&nbsp; Vol. I &nbsp;—&nbsp; The Front Page
          </p>
          <h1 className="font-black leading-none"
            style={{ fontSize: "clamp(2.4rem, 8vw, 4.5rem)", letterSpacing: "-0.02em", color: "var(--ink)" }}>
            The Hockey Ledger
          </h1>
          <p className="mt-3 text-[11px] uppercase tracking-[0.3em] font-mono"
            style={{ color: "var(--ledger-ink-faint)" }}>
            X-NAV Analytics &nbsp;·&nbsp; STRAND™ DNA &nbsp;·&nbsp; GM Logic Engine &nbsp;·&nbsp; Live Data
          </p>
        </div>
      </div>

      {/* ── Lede ─────────────────────────────────────────────── */}
      <div className="max-w-2xl mx-auto px-5 py-8 text-center">
        <p className="text-[14px] leading-[1.85]" style={{ color: "var(--ledger-ink-body)" }}>
          The Hockey Ledger evaluates NHL trades the way a front office does —
          surplus value, cap context, contention window, and player fit.
          Every number is derived from live NHL data, MoneyPuck analytics,
          and the X-NAV engine built for this.
        </p>
      </div>

      {/* ── Route cards ──────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-5 pb-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">

        <Link href="/trade" className="no-underline group">
          <div className="rounded-sm p-6 h-full flex flex-col gap-4 transition-all duration-200 group-hover:opacity-80"
            style={{ background: "var(--ledger-card)", border: "2px solid var(--ledger-rule)" }}>
            <div>
              <div className="newspaper-kicker font-black text-2xs uppercase mb-3 font-mono"
                style={{ color: "var(--ledger-red)" }}>Feature One</div>
              <h2 className="font-black text-xl leading-tight mb-2" style={{ color: "var(--ink)" }}>
                Trade Machine
              </h2>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--ledger-ink-light)" }}>
                Build any trade, add retention, evaluate it against the X-NAV engine.
                Run the GM Audit to see what a front office would flag — cap violations,
                clause issues, surplus value, and window fit.
              </p>
            </div>
            <div className="space-y-2 mt-auto">
              {[
                ["X-NAV",           "Surplus value over cap cost, per player"],
                ["STRAND™ DNA",     "10-trait helix — offensive & defensive profile"],
                ["GM Audit",        "Hard flags: NMC, cap floor, negative retention"],
                ["Who Wants This?", "Ranks all 32 teams as partners for your package"],
                ["Sim Engine",      "Project the season after any trade combination"],
              ].map(([label, desc]) => (
                <div key={label} className="feature-line text-2xs font-mono"
                  style={{ color: "var(--ledger-ink-body)" }}>
                  <span className="font-black shrink-0" style={{ color: "var(--ledger-ink-body)" }}>{label}</span>
                  <span>— {desc}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 py-3 px-2 text-center font-black text-2xs uppercase tracking-[0.18em] sm:tracking-[0.3em] font-mono"
              style={{ background: "var(--ledger-red)", color: "white" }}>
              Open Trade Machine
            </div>
          </div>
        </Link>

        <Link href="/players" className="no-underline group">
          <div className="rounded-sm p-6 h-full flex flex-col gap-4 transition-all duration-200 group-hover:opacity-80"
            style={{ background: "var(--ledger-card)", border: "2px solid var(--ledger-rule)" }}>
            <div>
              <div className="newspaper-kicker font-black text-2xs uppercase mb-3 font-mono"
                style={{ color: "var(--ledger-navy)" }}>Feature Two</div>
              <h2 className="font-black text-xl leading-tight mb-2" style={{ color: "var(--ink)" }}>
                Player Analytics
              </h2>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--ledger-ink-light)" }}>
                Search the full NHL roster. Every player's scoring pace, xGoals,
                ice time, point shares, and NAV components in one view —
                sortable, filterable by team and position.
              </p>
            </div>
            <div className="space-y-2 mt-auto">
              {[
                ["Live Roster",  "NHL API data — updates every game"],
                ["MiniHelix",    "Compact STRAND™ for every player in the list"],
                ["OPS / DPS",    "Offensive and Defensive Point Shares"],
                ["Cap & Contract","Years remaining, NMC/NTC flags, cap hit"],
                ["Goalie Tiers", "Starter / Tandem / Backup by GSAX"],
              ].map(([label, desc]) => (
                <div key={label} className="feature-line text-2xs font-mono"
                  style={{ color: "var(--ledger-ink-body)" }}>
                  <span className="font-black shrink-0" style={{ color: "var(--ledger-ink-body)" }}>{label}</span>
                  <span>— {desc}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 py-3 px-2 text-center font-black text-2xs uppercase tracking-[0.18em] sm:tracking-[0.3em] font-mono"
              style={{ background: "var(--ledger-navy)", color: "white" }}>
              Open Player Analytics
            </div>
          </div>
        </Link>

        {[
          {
            feature: "Feature Three",
            title: "Fantasy Hockey Expansion",
            body: "Built for fantasy managers who want to draft smarter, execute cleaner trades, and work the waiver wire with front-office data.",
          },
          {
            feature: "Feature Four",
            title: "Micro-Context Prop Engine",
            body: "Built for sharper daily reads on player-prop markets through matchup, role, pace, and usage context.",
          },
          {
            feature: "Feature Five",
            title: "Three-Year Simulation Model",
            body: "See how trades compound over three seasons and pressure-test long-term franchise decisions.",
          },
        ].map(({ feature, title, body }) => (
          <div key={feature} className="rounded-sm p-6 h-full flex flex-col gap-4 opacity-60"
            style={{ background: "var(--paper-card)", border: "1px dashed var(--ledger-rule)" }}>
            <div>
              <div className="newspaper-kicker font-black text-2xs uppercase mb-2 font-mono"
                style={{ color: "var(--ledger-violet)" }}>{feature}</div>
              <div className="text-2xs uppercase tracking-[0.2em] mb-3 font-mono"
                style={{ color: "var(--ledger-ink-faint)" }}>Coming Soon</div>
              <h2 className="font-black text-lg leading-tight mb-2" style={{ color: "var(--ink)" }}>
                {title}
              </h2>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--ledger-ink-light)" }}>
                {body}
              </p>
            </div>
          </div>
        ))}
      </div>
        

      {/* ── Explainer strip ──────────────────────────────────── */}
      <div className="border-y py-8" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}>
        <div className="max-w-3xl mx-auto px-5">
          <p className="text-2xs uppercase tracking-[0.4em] font-mono text-center mb-5"
            style={{ color: "var(--ledger-ink-faint)" }}>How the engine works</p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5 text-center">
            {[
              {
                label: "What is NAV?",
                body:  "Net Asset Value: a trade-value estimate that combines on-ice impact, role, age, cap hit, term, control, and market context. Prospects use draft pedigree and stored NHLe production, not automatic ELC surplus.",
              },
              {
                label: "What is STRAND™?",
                body:  "A roster DNA view showing how a player changes team identity: scoring pressure, defensive strain, usage, timeline fit, and role balance.",
              },
              {
                label: "What is the GM Audit?",
                body:  "The rule layer that checks what a front office would care about: clauses, cap legality, retention, roster slots, surplus gaps, and contention-window alignment.",
              },
            ].map(({ label, body }) => (
              <div key={label}>
                <div className="font-black text-[11px] uppercase tracking-[0.2em] mb-2 font-mono"
                  style={{ color: "var(--ledger-ink-body)" }}>{label}</div>
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--ledger-ink-light)" }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────── */}
      <Footer />
    </main>
  );
}
