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
          The Hockey Ledger separates fast trade debate from full front-office
          control. Build one transaction in Trade Machine, or take the chair in
          Armchair GM and manage the roster consequences that follow.
        </p>
      </div>

      {/* ── Route cards ──────────────────────────────────────── */}
      <div className="max-w-5xl mx-auto px-4 sm:px-5 pb-10 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">

        <Link href="/trade-machine" className="no-underline group">
          <div className="rounded-sm p-6 h-full flex flex-col gap-4 transition-all duration-200 group-hover:opacity-80"
            style={{ background: "var(--ledger-card)", border: "2px solid var(--ledger-rule)" }}>
            <div>
              <div className="newspaper-kicker font-black text-2xs uppercase mb-3 font-mono"
                style={{ color: "var(--ledger-red)" }}>Feature One</div>
              <h2 className="font-black text-xl leading-tight mb-2" style={{ color: "var(--ink)" }}>
                Trade Machine
              </h2>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--ledger-ink-light)" }}>
                Build a single trade, add retention, and test the package
                against X-NAV and the GM Audit. This is the quick social trade
                surface that will own share codes and replay links.
              </p>
            </div>
            <div className="space-y-2 mt-auto">
              {[
                ["One Trade",       "Fast package construction"],
                ["GM Audit",        "Cap, clause, value, and fit checks"],
                ["Share Code",      "Locked verdict replay in the next phase"],
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

        <Link href="/armchair-gm" className="no-underline group">
          <div className="rounded-sm p-6 h-full flex flex-col gap-4 transition-all duration-200 group-hover:opacity-80"
            style={{ background: "var(--ledger-card)", border: "2px solid var(--ledger-rule)" }}>
            <div>
              <div className="newspaper-kicker font-black text-2xs uppercase mb-3 font-mono"
                style={{ color: "var(--ledger-green)" }}>Feature Two</div>
              <h2 className="font-black text-xl leading-tight mb-2" style={{ color: "var(--ink)" }}>
                Armchair GM
              </h2>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--ledger-ink-light)" }}>
                Take over a franchise, make multiple moves, inspect roster DNA,
                manage cap consequences, and see whether you can run the room
                better than the actual front office.
              </p>
            </div>
            <div className="space-y-2 mt-auto">
              {[
                ["Roster Control",  "Multi-move franchise session"],
                ["Who Wants This?", "Ranks all 32 teams as partners"],
                ["Sim Engine",      "Projects the season after your moves"],
              ].map(([label, desc]) => (
                <div key={label} className="feature-line text-2xs font-mono"
                  style={{ color: "var(--ledger-ink-body)" }}>
                  <span className="font-black shrink-0" style={{ color: "var(--ledger-ink-body)" }}>{label}</span>
                  <span>— {desc}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 py-3 px-2 text-center font-black text-2xs uppercase tracking-[0.18em] sm:tracking-[0.3em] font-mono"
              style={{ background: "var(--ledger-green)", color: "white" }}>
              Enter Armchair GM
            </div>
          </div>
        </Link>

        <Link href="/players" className="no-underline group">
          <div className="rounded-sm p-6 h-full flex flex-col gap-4 transition-all duration-200 group-hover:opacity-80"
            style={{ background: "var(--ledger-card)", border: "2px solid var(--ledger-rule)" }}>
            <div>
              <div className="newspaper-kicker font-black text-2xs uppercase mb-3 font-mono"
                style={{ color: "var(--ledger-navy)" }}>Feature Three</div>
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

        <Link href="/docket" className="no-underline group">
          <div className="rounded-sm p-6 h-full flex flex-col gap-4 transition-all duration-200 group-hover:opacity-80"
            style={{ background: "var(--ledger-card)", border: "2px solid var(--ledger-rule)" }}>
            <div>
              <div className="newspaper-kicker font-black text-2xs uppercase mb-3 font-mono"
                style={{ color: "var(--ledger-brown)" }}>Feature Four</div>
              <h2 className="font-black text-xl leading-tight mb-2" style={{ color: "var(--ink)" }}>
                The Docket
              </h2>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--ledger-ink-light)" }}>
                Read the public record of graded trades. Filter published rulings,
                compare frozen at-trade verdicts against today's live re-grade, and
                inspect the player detail behind each decision.
              </p>
            </div>
            <div className="space-y-2 mt-auto">
              {[
                ["Published Rulings", "Saved Docket trades after admin review"],
                ["Dual Grade",        "At-trade snapshot plus live today read"],
                ["Full Detail",       "Verdict, packages, STRAND, and outlook"],
              ].map(([label, desc]) => (
                <div key={label} className="feature-line text-2xs font-mono"
                  style={{ color: "var(--ledger-ink-body)" }}>
                  <span className="font-black shrink-0" style={{ color: "var(--ledger-ink-body)" }}>{label}</span>
                  <span>— {desc}</span>
                </div>
              ))}
            </div>
            <div className="mt-2 py-3 px-2 text-center font-black text-2xs uppercase tracking-[0.18em] sm:tracking-[0.3em] font-mono"
              style={{ background: "var(--ledger-brown)", color: "white" }}>
              Open The Docket
            </div>
          </div>
        </Link>

        {[
          {
            feature: "Feature Five",
            title: "Fantasy Hockey Expansion",
            body: "Built for fantasy managers who want to draft smarter, execute cleaner trades, and work the waiver wire with front-office data.",
          },
          {
            feature: "Feature Six",
            title: "Micro-Context Prop Engine",
            body: "Built for sharper daily reads on player-prop markets through matchup, role, pace, and usage context.",
          },
          {
            feature: "Feature Seven",
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
