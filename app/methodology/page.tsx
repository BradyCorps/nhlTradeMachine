// app/methodology/page.tsx — Cap & Crease: Methodology
// The "why/how" narrative: why each system exists and how it thinks.
// Definitions, keys, and the icon key live at /glossary.
import React from "react";
import type { Metadata } from "next";
import Header from "../components/Header";
import Footer from "../components/Footer";

export const metadata: Metadata = {
  title: "Methodology — Cap & Crease",
  description: "Why the Ledger's systems exist and how they think: X-NAV, Fair Market Value, Player Gravity, STRAND DNA, the GM Audit, and the simulation engine.",
};

const SECTIONS: { id: string; title: string; paras: string[] }[] = [
  {
    id: "x-nav",
    title: "X-NAV — one number for trade value",
    paras: [
      "Front offices do not trade goals or Corsi — they trade assets. X-NAV (Extended Net Asset Value) exists because comparing a 24-year-old RFA winger against a 31-year-old defenseman with two years of term requires production, defense, age curve, contract surplus against a projected market, deployment difficulty, and team control to be priced in the same currency. Gravity is a separately gated experimental term, not part of the public-launch baseline.",
      "The model is deterministic application code, not a language model. Every component is visible on a player's Value Breakdown, so a number can always be interrogated: how much is on-ice value, how much is the contract, how much is upside. Unsigned players are projected onto their fair-market AAV rather than valued against a zero cap hit — a pending RFA is not an infinite bargain.",
      "When a player spikes above their multi-season baseline, the engine does not blindly believe or ignore the spike — it computes a credibility score from finishing luck, age, draft pedigree, and sample size, then blends the spike against the baseline at a rate proportional to that credibility. Backtested against 3,371 scoring spike seasons (2008–2024), the credibility blend (R² = 0.72) beats both naive spike belief (R² = 0.68) and fixed anchoring (R² = 0.60). Young spikes (≤23) persist 106% on average — they are real development, not noise. Late-career spikes (≥29) persist only 20%.",
    ],
  },
  {
    id: "fmv",
    title: "Fair Market Value — what the market actually pays",
    paras: [
      "A player's trade value depends on the gap between their on-ice production and what it costs to replace them on the open market. Fair Market Value is what the market actually pays a skater or goalie with a given profile — not what we think they deserve, but what GMs have historically signed for.",
      "The skater FMV model is trained on 1,996 one-way standard contracts signed between 2017 and 2026, fitted separately for forwards and defensemen. Production and deployment enter as monotone piecewise-linear splines with knots at the median and 85th percentile — a straight line was badly misspecified, under-predicting both the cheapest and the most expensive contracts while over-predicting the middle. The spline slopes are constrained non-negative so the price curve can only rise with production: an elite scorer is never penalized for scoring more.",
      "Walk-forward validation (trained on pre-July 2024, scored on post): forwards R² = 0.70 with a mean error of $1.21M at a $104M cap ceiling; defensemen R² = 0.60 and $1.33M. Roughly two-thirds of what a skater signs for sits in these features; the rest is leverage, cap room, and how many clubs were bidding. The published range reflects that uncertainty rather than hiding it behind a single figure.",
      "A separate backtest of the offensive power curve — the convex mapping from points pace to offensive value — tested the model's 1.6 exponent against 1,439 contracts matched to prior-season production. The optimal exponent across all skaters is 1.5 (R² = 0.5558) versus the model's 1.6 (R² = 0.5548), a gap of one-tenth of a percent. The market prices forward production slightly less convexly (optimal 1.4) and defenseman production nearly linearly (optimal 1.0–1.1), consistent with defensemen being valued more for deployment than scoring.",
    ],
  },
  {
    id: "gravity",
    title: "Player Gravity — a modelled territorial field",
    paras: [
      "Player Gravity v3 is a position-relative territorial influence index. It combines on-ice chance impact, transition proxies, and defensive suppression into an offensive-zone well, neutral-zone well, and defensive-zone dome. The rink field is a model visualization of those components, not a literal tracking map.",
      "The current field force is a bounded display composite, not expected goals and not a direct measurement of defender attention. The public scope is MIXED SITUATIONS because v3 combines all-situations, 5v5, 5-on-4, 4-on-5, and regular-season EDGE aggregate inputs. Signal Stability is based mainly on agreement between current and baseline on-off values, with a legacy defenseman pair-driver adjustment; it is not a fitted portability model. Reliability is a 0–100 coverage/stability index, not a probability, and coverage is a hard ceiling on it. Profiles below 20 games or two-thirds weighted coverage are marked INSUFFICIENT and receive no tier or percentile.",
      "V3 tiers and percentiles are calibrated separately within forwards and defensemen from the verified 2025-26 qualified population. They describe rarity within position, not equivalent impact across positions; the model does not publish a combined v3 league percentile.",
      "Gravity v3 has three independent release channels: public display, an X-NAV transition contribution, and a simulation contribution. All three fail closed and are off in the public-launch baseline. Enabling display cannot change a valuation or simulated season; either value channel requires its own held-out validation and release decision.",
      "When the X-NAV channel is enabled, it receives only the transition portion of v3. Direct offensive production and defensive suppression are valued elsewhere. When the simulation channel is enabled, its separately bounded term can affect team strength. Neither channel is active merely because a field is displayed.",
      "Territorial Gravity v4 is a separate 5v5 expected-goal contract and diagnostic path. In v4 output, positive wells and domes represent estimated expected-goal impact in each phase of play. It is hard-locked off until an authorized event/shift dataset supports fitting, uncertainty intervals, held-out validation, season-specific calibration, and shadow testing. It does not currently affect X-NAV or simulation.",
    ],
  },
  {
    id: "strand",
    title: "STRAND DNA — identity, not grades",
    paras: [
      "Two 70-point wingers can be entirely different players. STRAND (Stylistic Trait & Rating Analysis for NHL Development) profiles how a player creates value — scoring pace, chance creation, suppression, usage trust, deployment difficulty — as an identity strand rather than a single grade, so roster fit and role redundancy become visible at a glance.",
      "The double helix encodes eight skater dimensions: four offensive (scoring pace, expected goals, net on-ice value, ice time) and four defensive (defensive point shares, chance suppression, quality of competition, zone deployment). When a dimension has no data, it is honestly greyed out rather than silently filled with a neutral value — the helix shape only shows what is actually measured.",
      "A stability backtest across 9,506 consecutive-season pairs (2008–2025, minimum 20 GP) measured which identity traits persist year to year. Every STRAND dimension is a solid or strong signal — none are noise. Expected goal pace (r = 0.89) and ice time (r = 0.88) are the most persistent skater traits, more stable than any goalie metric. Scoring pace (r = 0.83) and net on-ice value (r = 0.77) are strong skills. Usage difficulty (r = 0.70), zone deployment (r = 0.59), and chance suppression (r = 0.55) are solid signals. For comparison, the best goalie metric (freeze rate) persists at r = 0.72 — most skater identity traits are stickier than any goalie stat.",
      "The identity profile is real: forwards are slightly more stable than defensemen across most traits, and star players are more predictable than depth players. Some trait pairs share signal — ice time and quality of competition correlate at r = 0.77, scoring pace and expected goals at r = 0.79 — but they measure different facets of the same underlying skill rather than being redundant. STRAND traits are normalized by position and rendered with league context. It answers the question a grade cannot: what does this player actually do?",
    ],
  },
  {
    id: "goalie-evaluation",
    title: "Goalie Evaluation — a separate model, not a forced fit",
    paras: [
      "Goalies are not scored on points, so they cannot share a skater's valuation pipeline. X-NAV prices goalies through GSAx (goals saved above expected), save percentage, workload, and a fitted fair-market-value model trained on 260 goalie contracts. The result feeds the same trade-value currency as skaters, but the inputs and the aging assumptions are entirely different.",
      "Not all goalie stats are equal. A stability backtest across 769 consecutive-season pairs (2008–2025, minimum 1,000 minutes) measured which metrics actually persist year to year: freeze rate (r = 0.72) and rebound control (r = 0.69) are genuine repeatable skills. High-danger save percentage (r = 0.40), overall save percentage (r = 0.30), and GAA (r = 0.34) carry moderate signal. GSAx per 60 (r = 0.13) and medium-danger save percentage (r = 0.06) are nearly random from one season to the next — a single year tells you almost nothing about the next. The app weights accordingly: the percentile profile emphasizes the stable metrics, and all eight are regressed toward population means using their measured stability coefficients before any evaluation.",
      "Goalies peak later than skaters. The backtest aging curve (131 goalies, signings-derived birth years) shows near-plateau through age 30, a 3% annual decline at 31–33, 4.5% at 34–36, and steeper decline after 37 — with survivorship bias flattening the oldest group, since only elite goalies still play at that age. The valuation engine uses a goalie peak age of 30 (versus 27–28 for forwards), so a 29-year-old goalie in his prime is not penalized the way a 29-year-old skater past his peak would be.",
      "Hot goalie regression is real and strong: 78% of goalies with a save percentage at or above .915 declined the next season, with an average drop of 0.93 percentage points. The model captures this — a .925 season regresses toward .913 in the next projection, not .925.",
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
      "Goalies evolve across offseasons rather than carrying a frozen stat line. Each rollover regresses GSAx and save percentage toward population means using the backtest stability coefficients, applies the goalie age curve, and adds stochastic noise — so a team riding a hot backup into Year 2 will honestly face the regression that history says is coming.",
      "Seeded randomness keeps runs replayable: the same decisions in the same season produce the same league, so outcomes are attributable to choices.",
    ],
  },
  {
    id: "data",
    title: "Data pipeline & acknowledgements",
    paras: [
      "Nightly snapshots combine NHL API rosters and NHL EDGE tracking with MoneyPuck's public analytics, layered over multi-season baselines so single-season noise never masquerades as signal. In fixed-weight composites such as Gravity v3, missing evidence contributes no term, which shrinks the estimate toward neutral and lowers the reported reliability.",
      "The Ledger stands on the shoulders of the public hockey-data community. Sincere thanks to the NHL, MoneyPuck, CapWages, and Hockey-Reference — their work makes independent analysis like this possible. Contract data is now entered by hand here rather than queried from CapWages, but the baseline this was built on came from them and the debt is worth naming. Full source credits with links are in the Glossary's Data & Sources section.",
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
              Cap & Crease is free, independent, and built nights-and-weekends. If the
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
