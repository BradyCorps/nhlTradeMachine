// app/page.tsx — Cap & Crease · broadsheet on a desk
import React from "react";
import Link from "next/link";
import Footer from "./components/Footer";
import ScrollReveal from "./components/ScrollReveal";
import ScrollNameplate from "./components/ScrollNameplate";
import ScrollSnap from "./components/ScrollSnap";
import LedgerScrollSetdown from "./components/LedgerScrollSetdown";
import { BRAND } from "@/app/lib/brand";
import { BrandMark } from "@/app/components/BrandMark";
import TrendingPlayers from "./components/TrendingPlayers";

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
    feature: "Feature Eight",
    title: "Micro-Context Prop Engine",
    body: "Built for sharper daily reads on player-prop markets through matchup, role, pace, and usage context.",
  },
];

const ENGINE = [
  {
    label: "What is X-NAV?",
    body: "Extended Net Asset Value: the Ledger's trade-value model. It combines on-ice impact, role, age, cap hit, term, control, gravity, and market context into one number. Prospects use draft pedigree and stored NHLe production, not automatic ELC surplus.",
  },
  {
    label: "What is STRAND?",
    body: "A roster DNA view showing how a player changes team identity: scoring pressure, defensive strain, usage, timeline fit, and role balance.",
  },
  {
    label: "What is the GM Audit?",
    body: "The rule layer that checks what a front office would care about: clauses, cap legality, retention, roster slots, surplus gaps, and contention-window alignment.",
  },
];

export default function WelcomePage() {
  return (
    <main className="fp-desk fp-desk-deep min-h-screen font-serif antialiased" style={{ color: "var(--ink)" }}>
      <ScrollReveal />
      <ScrollNameplate />
      <ScrollSnap />
      {/* Desk spacer — gives the nameplate a full viewport of desk to sit on */}
      <div className="fp-desk-spacer" aria-hidden="true" />
      <LedgerScrollSetdown className="fp-stack">
        <div className="fp-stack-extra" aria-hidden="true" />
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
              First Edition<br />Vol. I — No. 1
            </div>
            <div className="text-center">
              {/* The mark as a crest above the nameplate — the traditional
                  broadsheet position for a device. Decorative; the wordmark
                  beneath it already names the paper. */}
              <BrandMark size={44} className="mx-auto mb-3 block" />
              {/* Kit wordmark. The <h1> stays as visually-hidden text so the
                  front page keeps a real heading for search and screen
                  readers; the image itself is decorative. */}
              <h1 className="sr-only">{BRAND.name}</h1>
              <img
                src="/brand/svg/cap-and-crease-wordmark.svg"
                alt=""
                aria-hidden="true"
                width={1280}
                height={240}
                className="mx-auto h-auto"
                style={{ width: "min(86vw, 620px)" }}
              />
              <p className="fp-slogan mt-3 text-[12px]">
                "Everything a hockey fan could ask for"
              </p>
              <p className="mt-2 text-[10px] uppercase tracking-[0.28em] font-mono flex items-center justify-center gap-2"
                style={{ color: "var(--ledger-ink-faint)" }}>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" style={{ opacity: 0.35, flexShrink: 0 }}>
                  <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="0.6" />
                  <circle cx="9" cy="9" r="4.5" stroke="currentColor" strokeWidth="0.5" />
                  <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="0.4" />
                  <circle cx="9" cy="9" r="0.8" fill="currentColor" />
                </svg>
                <span>X-NAV Analytics · STRAND DNA · GM Logic Engine · Live Data</span>
                <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" style={{ opacity: 0.35, flexShrink: 0 }}>
                  <circle cx="9" cy="9" r="7" stroke="currentColor" strokeWidth="0.6" />
                  <circle cx="9" cy="9" r="4.5" stroke="currentColor" strokeWidth="0.5" />
                  <circle cx="9" cy="9" r="2" stroke="currentColor" strokeWidth="0.4" />
                  <circle cx="9" cy="9" r="0.8" fill="currentColor" />
                </svg>
              </p>
            </div>
            <div className="flex justify-center md:justify-end">
              <a
                href="https://buymeacoffee.com/hockeyledger"
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
            <p>
              Build your trade in the Trade Machine and test it against the X-NAV
              engine and the GM Audit or take the chair in Armchair GM and live
              with every consequence that follows. Explore advanced and enhanced
              stats on the Player Analytics page, featuring {BRAND.name}
              exclusive Player Gravity system, STRAND DNA Identity profiles and a
              new all-in-one X-NAV model. Read the published Docket to see how the
              calls have aged. Visit the Press Box and play the daily hockey crib.
            </p>
          </div>
          <p className="mt-5 text-2xs uppercase tracking-[0.3em] font-mono text-center max-w-3xl mx-auto"
            style={{ color: "var(--ledger-ink-faint)" }}>
            The press is open. Turn the page and start running the room.
          </p>
          <p className="mt-3 text-2xs uppercase tracking-[0.28em] font-mono text-right max-w-3xl mx-auto"
            style={{ color: "var(--ledger-ink-faint)" }}>
            — The Front Office
          </p>
        </section>

        {/* ── The desks (dense ruled broadsheet) ─────────────── */}
        <section className="fp-reveal px-5 sm:px-8 pt-8" style={{ transitionDelay: "0.12s" }}>
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
              body="Build a single trade, add retention, and test the package against X-NAV and the GM Audit. The quick social trade surface that owns share codes and replay links — the fastest way to put a deal on the record and argue it with numbers instead of noise."
              lines={[
                ["One Trade", "Fast package construction"],
                ["GM Audit", "Cap, clause, value, and fit"],
                ["Share Code", "Locked verdict replay link"],
              ]}
            />

            <Cell
              href="/players"
              lead
              kicker="Feature Two — Player Intelligence"
              kickerColor="var(--ledger-navy)"
              edition="The Ledger"
              title="Player Analytics"
              ctaColor="var(--ledger-navy)"
              cta="Open Player Analytics"
              body="Search the full NHL roster. Season totals, advanced analytics, STRAND DNA, Gravity fields, contract valuations, and X-NAV components — the deepest single-player view in hockey."
              lines={[
                ["Gravity", "On-ice gravitational pull"],
                ["STRAND DNA", "Stylistic identity profile"],
                ["X-NAV", "Complete trade valuation"],
              ]}
            />

            <Cell
              href="/fantasy"
              lead
              kicker="Feature Three — The Fantasy Desk"
              kickerColor="var(--ledger-amber)"
              edition="The Pool"
              title="Fantasy Hockey Tools"
              ctaColor="var(--ledger-amber)"
              cta="Open Fantasy Tools"
              body="Draft research built on the Ledger's live data. A full points-league draft board with value over replacement, a regression radar that separates real breakouts from shooting luck, a keeper corner for dynasty leagues, and a goalie board ranked by goals saved above expected."
              lines={[
                ["Draft Board", "FP/82 with VBD ranks"],
                ["Regression Radar", "Buy low, sell high"],
                ["Keeper Corner", "Dynasty targets by age"],
              ]}
            />

            <Cell
              href="/teams"
              kicker="Feature Four"
              kickerColor="var(--ledger-green)"
              edition="The Room"
              title="Team Analytics"
              ctaColor="var(--ledger-green)"
              cta="Open Team Analytics"
              body="Browse all 32 franchises. Contention window, roster strength, cap situation, EDGE speed and finishing profiles, and the team's competitive stage — from tanking to Cup contender."
              lines={[
                ["Team Stage", "Live contention window"],
                ["EDGE Profile", "Speed, finishing, zone time"],
                ["Roster NAV", "Full roster valuation"],
              ]}
            />

            <Cell
              href="/armchair-gm"
              kicker="Feature Five"
              kickerColor="var(--ledger-green)"
              edition="The Chair"
              title="Armchair GM"
              ctaColor="var(--ledger-green)"
              cta="Enter Armchair GM"
              body="Take over a franchise, make multiple moves, inspect roster DNA, manage cap consequences, and see whether you can run the room better than the actual front office. A full multi-move session with the season on the line, every consequence on the record."
              lines={[
                ["Roster Control", "Multi-move session"],
                ["Who Wants This?", "Ranks all 32 teams"],
                ["Sim Engine", "Projects the season"],
              ]}
            />

            <Cell
              href="/docket"
              kicker="Feature Six"
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

            <Cell
              href="/press-box"
              kicker="Feature Seven — Daily Game"
              kickerColor="var(--ledger-amber)"
              edition="The Box"
              title="Press Box"
              ctaColor="var(--ledger-amber)"
              cta="Play Today's Hand"
              body="A daily hockey card game inspired by cribbage scoring. Pick four from six dealt players, reveal a mystery call-up, and score points for teammates, draft classes, divisions, nationalities, and more. New hand every day — chase the perfect five-star hand and build your streak."
              lines={[
                ["Daily Hand", "New cards every day"],
                ["Crib Scoring", "Seven scoring categories"],
                ["Streaks", "Track your daily streak"],
              ]}
            />
          </div>
        </section>

        {/* ── Trending players ────────────────────────────────── */}
        <section className="fp-reveal px-5 sm:px-8 pt-11" style={{ transitionDelay: "0.14s" }}>
          <div className="fp-section-label mb-5">Highest-Valued Assets</div>
          <p className="text-[12px] leading-relaxed mb-5 font-mono" style={{ color: "var(--ledger-ink-light)" }}>
            The ten most valuable trade assets in the NHL right now, ranked by X-NAV — or sorted by gravitational pull.
          </p>
          <TrendingPlayers />
        </section>

        {/* ── In development ─────────────────────────────────── */}
        <section className="fp-reveal px-5 sm:px-8 pt-11" style={{ transitionDelay: "0.16s" }}>
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
          style={{ borderColor: "var(--ink)", background: "var(--paper-inset)", transitionDelay: "0.20s" }}>
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
      </LedgerScrollSetdown>
    </main>
  );
}
