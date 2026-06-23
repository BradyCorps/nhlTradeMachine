"use client";
// app/page.tsx — The Hockey Ledger · Tactile Broadsheet front page
import React from "react";
import Link from "next/link";
import Footer from "./components/Footer";

type Skew = "a" | "b" | "c" | "d";

function ClipCard({
  href, kicker, kickerColor, edition, title, body, lines, cta, ctaColor, skew,
}: {
  href: string;
  kicker: string;
  kickerColor: string;
  edition: string;
  title: string;
  body: string;
  lines: [string, string][];
  cta: string;
  ctaColor: string;
  skew: Skew;
}) {
  return (
    <Link href={href} className="no-underline block h-full">
      <article className="fp-clip h-full flex flex-col gap-4 p-6" data-skew={skew}>
        <div>
          <div className="flex items-baseline justify-between mb-3 gap-3">
            <span className="newspaper-kicker font-black text-2xs uppercase font-mono"
              style={{ color: kickerColor }}>
              {kicker}
            </span>
            <span className="text-2xs uppercase tracking-[0.2em] font-mono shrink-0"
              style={{ color: "var(--ledger-ink-faint)" }}>
              {edition}
            </span>
          </div>
          <h2 className="font-black text-2xl leading-[1.05] mb-3"
            style={{ color: "var(--ink)", letterSpacing: "-0.012em" }}>
            {title}
          </h2>
          <div className="h-px w-full mb-3" style={{ background: "var(--rule)" }} />
          <p className="text-[12.5px] leading-relaxed" style={{ color: "var(--ledger-ink-light)" }}>
            {body}
          </p>
        </div>
        <div className="space-y-1.5 mt-auto">
          {lines.map(([label, desc]) => (
            <div key={label} className="feature-line text-2xs font-mono"
              style={{ color: "var(--ledger-ink-body)" }}>
              <span className="font-black shrink-0">{label}</span>
              <span>— {desc}</span>
            </div>
          ))}
        </div>
        <div className="fp-stamp mt-2 py-3 px-2 text-2xs" style={{ background: ctaColor }}>
          {cta}
        </div>
      </article>
    </Link>
  );
}

const BRIEFS = [
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
];

const ENGINE = [
  {
    label: "What is NAV?",
    body: "Net Asset Value: a trade-value estimate that combines on-ice impact, role, age, cap hit, term, control, and market context. Prospects use draft pedigree and stored NHLe production, not automatic ELC surplus.",
  },
  {
    label: "What is STRAND™?",
    body: "A roster DNA view showing how a player changes team identity: scoring pressure, defensive strain, usage, timeline fit, and role balance.",
  },
  {
    label: "What is the GM Audit?",
    body: "The rule layer that checks what a front office would care about: clauses, cap legality, retention, roster slots, surplus gaps, and contention-window alignment.",
  },
];

export default function WelcomePage() {
  return (
    <main className="fp-page min-h-screen font-serif antialiased" style={{ color: "var(--ink)" }}>

      {/* ── Dateline ─────────────────────────────────────────── */}
      <div className="border-b" style={{ borderColor: "var(--rule)" }}>
        <div className="max-w-5xl mx-auto px-5 py-2 flex items-center justify-between text-2xs uppercase tracking-[0.25em] font-mono"
          style={{ color: "var(--ledger-ink-faint)" }}>
          <span>Est. 2026</span>
          <span className="hidden sm:inline">Vol. I &nbsp;·&nbsp; No. 1</span>
          <span>The Front Page</span>
          <span className="hidden sm:inline">Price: Free</span>
        </div>
      </div>

      {/* ── Masthead ─────────────────────────────────────────── */}
      <header className="masthead-rule">
        <div className="max-w-4xl mx-auto px-5 py-7 text-center">
          <h1 className="fp-nameplate font-black"
            style={{ fontSize: "clamp(2.8rem, 9vw, 5.5rem)" }}>
            The Hockey Ledger
          </h1>
          <p className="mt-4 text-[11px] uppercase tracking-[0.3em] font-mono"
            style={{ color: "var(--ledger-ink-faint)" }}>
            X-NAV Analytics &nbsp;·&nbsp; STRAND™ DNA &nbsp;·&nbsp; GM Logic Engine &nbsp;·&nbsp; Live Data
          </p>
        </div>
      </header>
      <div className="fp-halftone" style={{ height: 9 }} />

      {/* ── Lead editorial ───────────────────────────────────── */}
      <section className="max-w-4xl mx-auto px-5 pt-9 pb-7">
        <div className="text-center mb-5">
          <div className="newspaper-kicker font-black text-2xs uppercase font-mono mb-1"
            style={{ color: "var(--ledger-red)" }}>
            Staff Editorial
          </div>
          <p className="text-2xs uppercase tracking-[0.3em] font-mono"
            style={{ color: "var(--ledger-ink-faint)" }}>
            On the Business of Building a Hockey Team
          </p>
        </div>
        <div className="fp-lede text-[14px] leading-[1.9]" style={{ color: "var(--ledger-ink-body)" }}>
          <p className="mb-4">
            Every trade is an argument, and every argument deserves a hearing on
            the record. The Hockey Ledger exists to put the case in ink: to weigh
            a deal the way a front office actually weighs it — cap and clause,
            age and term, the slot a player fills and the window a team is trying
            to keep open. No hot takes set in disappearing pixels. A ruling you
            can hold up to the light.
          </p>
          <p>
            Build a single transaction in the Trade Machine and test it against
            X-NAV and the GM Audit, or take the chair in Armchair GM and live with
            every consequence that follows. Read the published Docket to see how
            the calls have aged. The press is open. Turn the page and start
            running the room.
          </p>
        </div>
        <p className="mt-5 text-2xs uppercase tracking-[0.28em] font-mono text-right"
          style={{ color: "var(--ledger-ink-faint)" }}>
          — The Front Office
        </p>
      </section>

      <div className="fp-fold" />

      {/* ── The desks ────────────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-5 pt-7">
        <div className="fp-section-label mb-6">Inside This Edition</div>

        <div className="fp-grid grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-2 gap-6">
          <ClipCard
            href="/trade-machine"
            skew="a"
            kicker="Feature One"
            kickerColor="var(--ledger-red)"
            edition="The Desk"
            title="Trade Machine"
            ctaColor="var(--ledger-red)"
            cta="Open Trade Machine"
            body="Build a single trade, add retention, and test the package against X-NAV and the GM Audit. This is the quick social trade surface that owns share codes and replay links."
            lines={[
              ["One Trade", "Fast package construction"],
              ["GM Audit", "Cap, clause, value, and fit checks"],
              ["Share Code", "Locked verdict replay link"],
            ]}
          />

          <ClipCard
            href="/armchair-gm"
            skew="b"
            kicker="Feature Two"
            kickerColor="var(--ledger-green)"
            edition="The Chair"
            title="Armchair GM"
            ctaColor="var(--ledger-green)"
            cta="Enter Armchair GM"
            body="Take over a franchise, make multiple moves, inspect roster DNA, manage cap consequences, and see whether you can run the room better than the actual front office."
            lines={[
              ["Roster Control", "Multi-move franchise session"],
              ["Who Wants This?", "Ranks all 32 teams as partners"],
              ["Sim Engine", "Projects the season after your moves"],
            ]}
          />

          <ClipCard
            href="/players"
            skew="c"
            kicker="Feature Three"
            kickerColor="var(--ledger-navy)"
            edition="The Ledger"
            title="Player Analytics"
            ctaColor="var(--ledger-navy)"
            cta="Open Player Analytics"
            body="Search the full NHL roster. Every player's scoring pace, xGoals, ice time, point shares, and NAV components in one view — sortable, filterable by team and position."
            lines={[
              ["Live Roster", "NHL API data — updates every game"],
              ["MiniHelix", "Compact STRAND™ for every player"],
              ["OPS / DPS", "Offensive and Defensive Point Shares"],
              ["Cap & Contract", "Term, NMC/NTC flags, cap hit"],
            ]}
          />

          <ClipCard
            href="/docket"
            skew="d"
            kicker="Feature Four"
            kickerColor="var(--ledger-brown)"
            edition="The Record"
            title="The Docket"
            ctaColor="var(--ledger-brown)"
            cta="Open The Docket"
            body="Read the public record of graded trades. Filter published rulings, compare frozen at-trade verdicts against today's live re-grade, and inspect the player detail behind each decision."
            lines={[
              ["Published Rulings", "Saved Docket trades after admin review"],
              ["Dual Grade", "At-trade snapshot plus live today read"],
              ["Full Detail", "Verdict, packages, STRAND, and outlook"],
            ]}
          />
        </div>
      </section>

      {/* ── In development ───────────────────────────────────── */}
      <section className="max-w-5xl mx-auto px-4 sm:px-5 pt-12">
        <div className="fp-section-label mb-6">In Development</div>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
          {BRIEFS.map(({ feature, title, body }) => (
            <div key={feature} className="fp-brief p-6 h-full flex flex-col gap-3">
              <div className="flex items-baseline justify-between">
                <span className="newspaper-kicker font-black text-2xs uppercase font-mono"
                  style={{ color: "var(--ledger-violet)" }}>{feature}</span>
                <span className="text-2xs uppercase tracking-[0.2em] font-mono"
                  style={{ color: "var(--ledger-ink-faint)" }}>Coming Soon</span>
              </div>
              <h2 className="font-black text-lg leading-tight" style={{ color: "var(--ink)" }}>
                {title}
              </h2>
              <p className="text-[12px] leading-relaxed" style={{ color: "var(--ledger-ink-light)" }}>
                {body}
              </p>
            </div>
          ))}
        </div>
      </section>

      <div className="fp-fold mt-12" />

      {/* ── How the engine works ─────────────────────────────── */}
      <section className="border-y py-9" style={{ borderColor: "var(--ledger-rule)", background: "var(--paper-inset)" }}>
        <div className="max-w-3xl mx-auto px-5">
          <div className="fp-section-label mb-7">How the Engine Works</div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-7 text-center">
            {ENGINE.map(({ label, body }) => (
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
      </section>

      <Footer />
    </main>
  );
}
