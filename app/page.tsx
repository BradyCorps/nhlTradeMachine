// app/page.tsx — The Hockey Ledger · broadsheet on a desk
import React from "react";
import Link from "next/link";
import Footer from "./components/Footer";
import ScrollReveal from "./components/ScrollReveal";

function Cell({
  href, lead = false, kicker, kickerColor, edition, title, body, lines, cta, ctaColor,
}: {
  href: string;
  lead?: boolean;
  kicker: string;
  kickerColor: string;
  edition: string;
  title: string;
  body: string;
  lines: [string, string][];
  cta: string;
  ctaColor: string;
}) {
  return (
    <Link href={href} className={`fp-cell no-underline ${lead ? "fp-lead" : ""}`}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="newspaper-kicker font-black text-2xs uppercase font-mono"
          style={{ color: kickerColor }}>
          {kicker}
        </span>
        <span className="text-2xs uppercase tracking-[0.2em] font-mono shrink-0"
          style={{ color: "var(--ledger-ink-faint)" }}>
          {edition}
        </span>
      </div>

      <h2 className={`fp-head font-black ${lead ? "text-3xl sm:text-4xl" : "text-2xl"} leading-[1.02]`}
        style={{ color: "var(--ink)" }}>
        {title}
      </h2>

      <div className="h-px w-full" style={{ background: "var(--ink)", opacity: 0.5 }} />

      <p className={`${lead ? "text-[14px] sm:columns-2 sm:gap-8" : "text-[12.5px]"} leading-relaxed`}
        style={{ color: "var(--ledger-ink-body)" }}>
        {body}
      </p>

      <div className={`mt-auto ${lead ? "grid grid-cols-1 sm:grid-cols-3 gap-x-6 gap-y-1.5" : "space-y-1.5"}`}>
        {lines.map(([label, desc]) => (
          <div key={label} className="feature-line text-2xs font-mono"
            style={{ color: "var(--ledger-ink-body)" }}>
            <span className="font-black shrink-0">{label}</span>
            <span>— {desc}</span>
          </div>
        ))}
      </div>

      <div className="fp-stamp py-3 px-2 text-2xs" style={{ background: ctaColor }}>
        {cta}
      </div>
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
    <main className="fp-desk min-h-screen font-serif antialiased" style={{ color: "var(--ink)" }}>
      <ScrollReveal />
      <div className="fp-sheet">

        {/* ── Dateline ───────────────────────────────────────── */}
        <div className="border-b" style={{ borderColor: "var(--rule)" }}>
          <div className="px-5 py-2 flex items-center justify-between text-2xs uppercase tracking-[0.25em] font-mono"
            style={{ color: "var(--ledger-ink-faint)" }}>
            <span>Est. 2026</span>
            <span className="hidden sm:inline">The Front Page</span>
            <span>Price: Free</span>
          </div>
        </div>

        {/* ── Masthead with ears ─────────────────────────────── */}
        <header className="masthead-rule fp-reveal">
          <div className="px-5 py-7 grid grid-cols-1 md:grid-cols-[1fr_auto_1fr] items-center gap-4">
            <div className="fp-ear hidden md:block">
              Final Edition<br />Vol. I — No. 1
            </div>
            <div className="text-center">
              <h1 className="fp-nameplate" style={{ fontSize: "clamp(2.4rem, 8vw, 4.6rem)" }}>
                The Hockey Ledger
              </h1>
              <p className="fp-slogan mt-3 text-[12px]">
                “All the Trades That Are Fit to Print”
              </p>
              <p className="mt-2 text-[10px] uppercase tracking-[0.28em] font-mono"
                style={{ color: "var(--ledger-ink-faint)" }}>
                X-NAV Analytics · STRAND™ DNA · GM Logic Engine · Live Data
              </p>
            </div>
            <div className="flex justify-center md:justify-end">
              {/* TODO: point href at your Buy Me a Coffee handle, e.g. https://buymeacoffee.com/yourname */}
              <a
                href="https://www.buymeacoffee.com/"
                target="_blank"
                rel="noopener noreferrer"
                className="fp-stamp-small no-underline"
              >
                Buy Me a Coffee
              </a>
            </div>
          </div>
        </header>

        {/* ── Lead editorial ─────────────────────────────────── */}
        <section className="fp-reveal px-5 sm:px-8 pt-8 pb-7 border-b" style={{ borderColor: "var(--ink)", transitionDelay: "0.08s" }}>
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
          <div className="fp-lede text-[14px] leading-[1.9] max-w-3xl mx-auto"
            style={{ color: "var(--ledger-ink-body)" }}>
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
          <p className="mt-5 text-2xs uppercase tracking-[0.28em] font-mono text-right max-w-3xl mx-auto"
            style={{ color: "var(--ledger-ink-faint)" }}>
            — The Front Office
          </p>
        </section>

        {/* ── The desks (dense ruled broadsheet) ─────────────── */}
        <section className="fp-reveal px-5 sm:px-8 pt-8">
          <div className="fp-section-label mb-5">Inside This Edition</div>

          <div className="fp-desks">
            <Cell
              href="/trade-machine"
              lead
              kicker="Feature One — The Lead"
              kickerColor="var(--ledger-red)"
              edition="The Desk"
              title="Trade Machine"
              ctaColor="var(--ledger-red)"
              cta="Open Trade Machine"
              body="Build a single trade, add retention, and test the package against X-NAV and the GM Audit. This is the quick social trade surface that owns share codes and replay links — the fastest way to put a deal on the record and argue it with numbers instead of noise."
              lines={[
                ["One Trade", "Fast package construction"],
                ["GM Audit", "Cap, clause, value, and fit checks"],
                ["Share Code", "Locked verdict replay link"],
              ]}
            />

            <Cell
              href="/armchair-gm"
              kicker="Feature Two"
              kickerColor="var(--ledger-green)"
              edition="The Chair"
              title="Armchair GM"
              ctaColor="var(--ledger-green)"
              cta="Enter Armchair GM"
              body="Take over a franchise, make multiple moves, inspect roster DNA, manage cap consequences, and see whether you can run the room better than the actual front office."
              lines={[
                ["Roster Control", "Multi-move session"],
                ["Who Wants This?", "Ranks all 32 teams"],
                ["Sim Engine", "Projects the season"],
              ]}
            />

            <Cell
              href="/players"
              kicker="Feature Three"
              kickerColor="var(--ledger-navy)"
              edition="The Ledger"
              title="Player Analytics"
              ctaColor="var(--ledger-navy)"
              cta="Open Player Analytics"
              body="Search the full NHL roster. Scoring pace, xGoals, ice time, point shares, and NAV components in one sortable, filterable view."
              lines={[
                ["Live Roster", "NHL API — every game"],
                ["MiniHelix", "Compact STRAND™"],
                ["OPS / DPS", "Point Shares"],
              ]}
            />

            <Cell
              href="/docket"
              kicker="Feature Four"
              kickerColor="var(--ledger-brown)"
              edition="The Record"
              title="The Docket"
              ctaColor="var(--ledger-brown)"
              cta="Open The Docket"
              body="Read the public record of graded trades. Filter published rulings and compare frozen at-trade verdicts against today's live re-grade."
              lines={[
                ["Published Rulings", "After admin review"],
                ["Dual Grade", "At-trade plus live"],
                ["Full Detail", "Verdict and STRAND"],
              ]}
            />
          </div>
        </section>

        {/* ── In development ─────────────────────────────────── */}
        <section className="fp-reveal px-5 sm:px-8 pt-11">
          <div className="fp-section-label mb-5">In Development</div>
          <div className="fp-briefs">
            {BRIEFS.map(({ feature, title, body }) => (
              <div key={feature} className="fp-brief">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="newspaper-kicker font-black text-2xs uppercase font-mono"
                    style={{ color: "var(--fig)" }}>{feature}</span>
                  <span className="text-2xs uppercase tracking-[0.2em] font-mono"
                    style={{ color: "var(--fig)", opacity: 0.75 }}>Coming Soon</span>
                </div>
                <h2 className="fp-head font-black text-lg leading-tight" style={{ color: "var(--ink)" }}>
                  {title}
                </h2>
                <p className="text-[12px] leading-relaxed" style={{ color: "var(--ledger-ink-light)" }}>
                  {body}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* ── How the engine works ───────────────────────────── */}
        <section className="fp-reveal mt-11 border-y py-9"
          style={{ borderColor: "var(--ink)", background: "var(--paper-inset)" }}>
          <div className="px-5 sm:px-8">
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
      </div>
    </main>
  );
}
