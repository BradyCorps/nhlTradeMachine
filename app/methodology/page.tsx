// app/methodology/page.tsx — The Hockey Ledger: Methodology
// The "why/how" narrative: why each system exists and how it thinks.
// Definitions, keys, and the icon key live at /glossary.
import React from "react";
import type { Metadata } from "next";
import Header from "../components/Header";
import Footer from "../components/Footer";

export const metadata: Metadata = {
  title: "Methodology — The Hockey Ledger",
  description: "Why the Ledger's systems exist and how they think: X-NAV, Player Gravity, STRAND DNA, the GM Audit, and the simulation engine.",
};

const SECTIONS: { id: string; title: string; paras: string[] }[] = [
  {
    id: "x-nav",
    title: "X-NAV — one number for trade value",
    paras: [
      "Front offices do not trade goals or Corsi — they trade assets. X-NAV (Extended Net Asset Value) exists because comparing a 24-year-old RFA winger against a 31-year-old defenseman with two years of term requires everything to be priced in the same currency: production, defense, gravity, age curve, contract surplus against a projected market, deployment difficulty, and team control.",
      "The model is deterministic application code, not a language model. Every component is visible on a player's Value Breakdown, so a number can always be interrogated: how much is on-ice value, how much is the contract, how much is upside. Unsigned players are projected onto their fair-market AAV rather than valued against a zero cap hit — a pending RFA is not an infinite bargain.",
    ],
  },
  {
    id: "gravity",
    title: "Player Gravity — the rink as spacetime",
    paras: [
      "Great players warp the game the way mass warps spacetime: linemates orbit them, play bends toward the opponent's net, defenders overcommit. Gravity measures that warping from observable signals — how much better the team's chances are with a player on the ice, how far play travels from where a coach deploys him, how the defensive zone holds when he patrols it.",
      "The system models each skater as three zone masses: an offensive-zone well, a neutral-zone (transition) well, and a defensive-zone dome. Every input is judged against the player's own position before the masses combine, so an offense-driving defenseman is recognized as the rarity he is, and a forward and a defenseman can still be compared on one force scale. The exact formula and calibration are proprietary to the Ledger; the shape of the field — where a player warps the rink — is published on every Gravity tab.",
      "Gravity feeds X-NAV only through its residual: the portion of the field the offensive and defensive components have not already priced. Nothing is counted twice.",
    ],
  },
  {
    id: "strand",
    title: "STRAND DNA — identity, not grades",
    paras: [
      "Two 70-point wingers can be entirely different players. STRAND (Stylistic Trait & Rating Analysis for NHL Development) profiles how a player creates value — scoring pace, chance creation, suppression, usage trust, deployment difficulty — as an identity strand rather than a single grade, so roster fit and role redundancy become visible at a glance.",
      "STRAND traits are normalized by position and rendered with league context. It answers the question a grade cannot: what does this player actually do?",
    ],
  },
  {
    id: "gm-audit",
    title: "The GM Audit — plausibility, not just math",
    paras: [
      "A trade can be mathematically balanced and still be one no general manager would make. The GM Audit is the rule layer that thinks like a front office: clause and cap legality, retention mechanics, roster slots, timeline alignment, surplus gaps, and whether the deal fits each team's contention window.",
      "The audit publishes its objections as named flags rather than a silent score, so a rejected deal always says why — and a verdict can be argued against on the record.",
    ],
  },
  {
    id: "simulation",
    title: "The Simulation Engine — consequences on the record",
    paras: [
      "Armchair GM's three-year Cup Run exists because trades are hypotheses and seasons are experiments. The engine rolls the whole league forward — aging, retirements, breakouts, drafts, cap growth, AI cap compliance — so a deadline rental or a rebuild pivot is tested against consequences, not vibes.",
      "Seeded randomness keeps runs replayable: the same decisions in the same season produce the same league, so outcomes are attributable to choices.",
    ],
  },
  {
    id: "data",
    title: "Data pipeline & acknowledgements",
    paras: [
      "Nightly snapshots combine NHL API rosters and NHL EDGE tracking with MoneyPuck's public analytics and CapWages contract data, layered over multi-season baselines so single-season noise never masquerades as signal. Missing data is skipped, never scored — a gap in coverage is not evidence of bad play.",
      "The Ledger stands on the shoulders of the public hockey-data community. Sincere thanks to the NHL, MoneyPuck, CapWages, and Hockey-Reference — their work makes independent analysis like this possible. Full source credits with links are in the Glossary's Data & Sources section.",
    ],
  },
];

export default function MethodologyPage() {
  return (
    <main
      className="min-h-screen px-4 py-4 font-mono"
      style={{ background: "var(--paper-bg)", color: "var(--ledger-ink)" }}
    >
      <div className="mx-auto max-w-4xl">
        <Header />

        <header className="pt-6 pb-5 text-center border-b-2" style={{ borderColor: "var(--ledger-rule)" }}>
          <h1 className="font-mono text-[11px] sm:text-xs font-black uppercase tracking-[0.28em] sm:tracking-[0.44em] leading-relaxed text-ledger-ink">
            Methodology
          </h1>
          <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-ledger-ink-body leading-relaxed">
            Why these systems exist and how they think. For definitions and keys, read the{" "}
            <a href="/glossary" className="underline hover:text-ledger-red transition-colors">Glossary</a>.
          </p>
        </header>

        <div className="py-6">
          {SECTIONS.map((s) => (
            <section key={s.id} id={s.id} className="mb-7">
              <h2 className="font-mono text-[11px] font-black uppercase tracking-[0.22em] text-ledger-ink border-b pb-2 mb-3"
                style={{ borderColor: "var(--ledger-rule)" }}>
                {s.title}
              </h2>
              {s.paras.map((p, i) => (
                <p key={i} className="text-[12.5px] font-serif leading-[1.85] mb-3 text-ledger-ink-body">
                  {p}
                </p>
              ))}
            </section>
          ))}

          {/* ── Support CTA ── */}
          <section className="border p-5 text-center" style={{ borderColor: "var(--ledger-ink)", background: "var(--paper-card)" }}>
            <div className="font-mono text-[10px] font-black uppercase tracking-[0.25em] text-ledger-ink mb-2">
              Keep the Presses Running
            </div>
            <p className="text-[12px] font-serif leading-relaxed text-ledger-ink-body max-w-xl mx-auto mb-4">
              The Hockey Ledger is free, independent, and built nights-and-weekends. If the
              analysis has earned a spot in your bookmarks, a coffee keeps the data flowing.
            </p>
            <a
              href="https://buymeacoffee.com/hockeyledger"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-5 py-2.5 font-mono text-[11px] font-black uppercase tracking-[0.15em] border-2 no-underline transition-colors hover:opacity-80"
              style={{ borderColor: "var(--ledger-ink)", background: "var(--ledger-amber, #d4a017)", color: "var(--ledger-ink)" }}
            >
              ☕ Buy Me a Coffee
            </a>
          </section>
        </div>

        <Footer />
      </div>
    </main>
  );
}
