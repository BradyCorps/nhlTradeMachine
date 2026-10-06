// app/methodology/page.tsx — Cap & Crease: Methodology
// The "why/how" narrative: why each system exists and how it thinks.
// Definitions, keys, and the icon key live at /glossary.
import React from "react";
import Header from "../components/Header";
import Footer from "../components/Footer";
import { publicRouteMetadata } from "@/app/lib/public-seo";

export const metadata = publicRouteMetadata({
  path: "/methodology",
  title: "Methodology — Cap & Crease",
  description: "The questions behind Cap & Crease: model inputs, testing, uncertainty, and what X-NAV, Fair Market Value, Gravity, STRAND, and simulations can tell you.",
});

const SECTIONS: { id: string; title: string; paras: string[] }[] = [
  {
    id: "x-nav",
    title: "X-NAV — one number for trade value",
    paras: [
      "Would you trade a 24-year-old RFA winger for a 31-year-old defenseman with two years left on his deal? The points column gets you part of the way. I built X-NAV, or Extended Net Asset Value, to put production, defense, age, contract cost, and team control into the same conversation.",
      "The inputs include scoring and chance creation, defensive results, deployment difficulty, age, and the contract ledger. F-NAV, D-NAV, and G-NAV use separate paths for forwards, defensemen, and goalies. The result is in NAV points, not dollars. Getting it down to one number was the easy part to ask for, not the easy part to build. A player's Value Breakdown shows how the components add up. Unsigned players are priced against an estimated fair-market AAV, not a zero cap hit. An unsigned RFA is not an unlimited bargain.",
      "The deployed NAV calculators are deterministic application code with rules and fitted coefficients, not a language model choosing a number. AI-written commentary is a separate feature. The automatic season recap is currently paused; that does not turn off the simulation or Season Review.",
      "There is an important season distinction: the public model uses completed 2025–26 statistical inputs with the current 2026–27 contract context. Selecting 2026–27 observed statistics changes the statistics you see, not those frozen model inputs. Current NAV is not an archived historical valuation or a forecast of the selected season.",
      "One test asked what to do with a sudden scoring jump. Across 3,371 spike seasons from 2008–2024, the recorded credibility blend scored R² = 0.72, compared with 0.68 for believing the spike and 0.60 for anchoring to the baseline. The blend considers finishing luck, age, draft pedigree, and sample size. Baseline-only anchoring is different from the script's separate fixed 40/60 blend.",
      "In that sample, players aged ≤23 retained 106% of the increase above their earlier baseline on average; players aged ≥29 retained 20%. That is a group result about how much of a scoring jump lasted. It is not a 106% probability, proof that age caused the change, or a promise about the next young winger who breaks out.",
      "An earlier team-level summary covered 252 team-seasons from 2017–2024. It reported R² = 0.45 between roster NAV and goal differential per game, with seasonal results from 0.42 to 0.57. The lowest and highest fifths averaged −0.60 and +0.55 goal differential per game. Offense alone scored R² = 0.51 and the goalie evaluation scored 0.30. Age and contract surplus reduced that team-performance association. Those figures describe the earlier analysis, not a new end-to-end forecast test of the current X-NAV 4.2 engine.",
      "The earlier individual stability analysis covered 4,453 consecutive-season pairs from 2017–2024, with at least 20 GP. NAV repeated at r = 0.80, compared with an average STRAND trait correlation of 0.74. Its component correlations were 0.87 for offense, 0.82 for defense, 0.89 for age, and 0.72 for contract surplus. ",
      "On-ice True Market Value repeated at 0.86. Same-contract pairs scored 0.79 and changed-contract pairs 0.70; 69% of top-fifth players stayed there, and 90% stayed within one fifth. These are historical stability results. They do not establish that today's values are accurate.",
      "The current model card makes a narrower claim: D-NAV's fitted defensive component has an out-of-time holdout; the full F-NAV and G-NAV totals do not have that forecast evidence. FMV has its own contract-price tests. I would not turn those different checks into one blanket 'validated' stamp. A trade-value estimate can help start an argument without proving a player will win more games, command that return, or perform the same way on another team.",
    ],
  },
  {
    id: "fmv",
    title: "Fair Market Value — what similar contracts suggest",
    paras: [
      "A good player on a $3M deal and the same player on a much larger deal are different trade assets. Fair Market Value asks what a player with that profile might cost, based on contracts other players signed. I wanted a market reference for the contract comparison, not my personal list of who deserves a raise.",
      "The skater fit uses 1,996 one-way standard contracts signed between 2017 and 2026, with separate models for forwards and defensemen. Production, minutes, age, and free-agent status help estimate a share of the cap. That share is converted to dollars at the ceiling being used. Goalies have a separate fit, described below.",
      "The price curve is allowed to bend. The technical term is a monotone piecewise-linear spline, with knots at the median and 85th percentile. A straight line missed the cheaper and more expensive ends while overpricing the middle. The fitted slopes cannot be negative: within the fitted range, more production does not lower the estimate.",
      "The walk-forward test trained on contracts signed before July 2024 and evaluated later signings. Forwards scored R² = 0.70 with mean absolute error of $1.21M at a $104M cap ceiling. Defensemen scored R² = 0.60 with $1.33M error. That is evidence about contract-price estimates on that test population, not the accuracy of every player's NAV. The published skater price range makes some of the uncertainty visible; it is not a guaranteed signing range.",
      "A separate offensive power-curve test matched 1,439 contracts to prior-season production. Across all skaters, exponent 1.5 scored R² = 0.5558 and the earlier 1.6 scored 0.5548, a difference of 0.001 in R². The best forward exponent in that analysis was 1.4; the defenseman range was 1.0–1.1. The current engine uses 1.6 for forwards and 1.1 for defensemen. This checks one scoring-to-value relationship, not the entire market model.",
      "A contract is also a negotiation. Leverage, team cap room, bidders, and terms outside the model can matter. The error left over does not tell me exactly which of those caused a deal. FMV is a fitted comparison with limits, not the salary a player must receive or evidence that a GM overpaid by precisely the difference shown.",
    ],
  },
  {
    id: "gravity",
    title: "Player Gravity — a modelled territorial field",
    paras: [
      "Some players seem to make the whole line more dangerous without taking every shot. Player Gravity asks whether the available data can describe that territorial influence. The rink picture is a model visualization, not a literal tracking map of where defenders followed a player.",
      "Gravity v3 combines on-ice chance impact, transition proxies, and defensive suppression into an offensive-zone well, neutral-zone well, and defensive-zone dome. It is position-relative: forwards are compared with forwards, defensemen with defensemen. The field force is a bounded display composite, not expected goals or a direct measurement of defender attention.",
      "Its input scope is MIXED SITUATIONS. That includes all-situations, 5v5, 5-on-4, 4-on-5, and regular-season EDGE aggregates. Signal Stability mainly compares current and baseline on-off values, with a legacy defenseman pair-driver adjustment. It is not a fitted test of how a player would travel to another team. Reliability is a 0–100 coverage/stability index, not a probability, and coverage limits its ceiling. Below 20 games or two-thirds weighted coverage, a profile is INSUFFICIENT and gets no tier or percentile.",
      "The documented v3 backtest covers 5,722 consecutive-season pairs in a 2015–2025 panel. Reconstructed force repeated at r = 0.68. It predicted next-season on-ice xGF% less well than simply carrying the player's prior xGF% forward. There was no historical EDGE input for the neutral-zone well, so this was not a test of the complete field.",
      "A separate test removed the player's own shots from his teammates' 5v5 expected-goal result. The next-season association was r = 0.42 for forwards and 0.25 for defensemen, including when the shared on-off lift term was removed from force. That is useful evidence to examine. It does not isolate a causal effect: linemate quality, roster continuity, and other context can still matter. The neutral-zone transition claim remains unvalidated in v3.",
      "V3 tiers and percentiles use the verified 2025–26 qualified population, separately by position. They describe rarity within that group, not equal impact across positions. There is no combined v3 league percentile.",
      "Display, X-NAV, and simulation have independent release switches, all off by default. The release record describes v3 public display as a labelled beta. Its valuation and simulation contributions remain off in the public-launch baseline. Seeing a field does not enable either contribution. If separately authorized, the X-NAV channel receives only the transition portion, because production and suppression are already valued elsewhere; simulation has its own bounded term and evidence requirements.",
      "Territorial Gravity v4 is a separate 5v5 expected-goal diagnostic. Its committed 2025–26 artifact contains fitted offensive-zone and defensive-zone estimates and is approved only for limited, untiered dossier display behind its own flag and artifact checks. The neutral-zone estimate is excluded and shown as unavailable. It does not enter X-NAV, rankings, trades, or simulation. The release evidence does not establish year-over-year reliability, portability, or out-of-time performance. A diagnostic display is not a release of a new valuation model.",
    ],
  },
  {
    id: "strand",
    title: "STRAND DNA — identity, not grades",
    paras: [
      "Two 70-point wingers can arrive there in very different ways. One drives chances; another finishes them. I built STRAND, Stylistic Trait & Rating Analysis for NHL Development, to make those differences easier to see when comparing roles and roster fit.",
      "The skater helix has eight dimensions: scoring pace, expected goals, net on-ice value, ice time, defensive point shares, chance suppression, quality of competition, and zone deployment. Missing dimensions are greyed out rather than supplied with a neutral-looking number. The profile uses position normalization and league context; the picture can only be as useful as the inputs behind it.",
      "The stability backtest covered seven computable traits across 9,506 consecutive-season pairs from 2008–2025, with at least 20 GP. Expected-goal pace repeated at r = 0.89, ice time at 0.88, scoring pace at 0.83, net on-ice value at 0.77, usage difficulty at 0.70, zone deployment at 0.59, and chance suppression at 0.55. For comparison, the goalie freeze-rate result was 0.72. Seven measured traits should not be described as validation of every dimension in an eight-dimension display.",
      "Some traits also move together: ice time and quality of competition correlated at r = 0.77; scoring pace and expected goals at 0.79. The recorded analysis found forwards slightly more stable than defensemen across most traits, and stars more stable than depth players. Those associations tell me where the profile shares information. They do not prove each trait is an independent skill.",
      "STRAND is an identity profile, not a ranking of who is better or a guarantee of future fit. A trait repeating from year to year does not make its measurement error disappear. A similar helix does not mean two players are interchangeable, and a grey dimension means missing evidence, not an average player.",
    ],
  },
  {
    id: "goalie-evaluation",
    title: "Goalie Evaluation — a separate model, not a forced fit",
    paras: [
      "A goalie who saves a team for a month can look like the answer to everything. Pricing him as though he were a winger would not help. G-NAV asks a goalie-specific trade-value question using goals saved above expected, save percentage, workload, age, career baselines, and contract cost.",
      "The goalie fair-market fit was trained on 260 contracts. G-NAV shares the NAV-point unit with F-NAV and D-NAV, but uses its own inputs and assumptions. The percentile profile displays additional goalie metrics. Displaying a metric does not mean it is an input to the valuation, and those eight display metrics are not all regressed before every calculation.",
      "The stability test covered 769 consecutive-season pairs from 2008–2025, with at least 1,000 minutes. Freeze rate repeated at r = 0.72 and rebound control at 0.69. High-danger save percentage scored 0.40, overall save percentage 0.30, and GAA 0.34. GSAx per 60 scored 0.13 and medium-danger save percentage 0.06. Those last two results are a reason to be cautious with one season, not proof that the goalie contributed nothing that year.",
      "A separate aging analysis used 131 goalies with birth years derived from signing records. It showed a near-plateau through age 30, then annual declines of 3% at 31–33 and 4.5% at 34–36, with steeper decline after 37. The oldest group is affected by survivorship: the goalies still playing are not a random sample. The valuation code uses peak age 30 for goalies, 26 for forwards, and 27 for defensemen. Those are model assumptions informed by evidence, not an expiry date for a player's ability.",
      "In the hot-goalie sample, 78% of goalies with save percentage at or above .915 declined the next season, with an average drop of 0.93 percentage points. A regression example takes a .925 season toward .913 instead of carrying .925 unchanged. That illustrates why a projection uses a baseline; it does not promise that next season's save percentage will be .913.",
      "The current model card describes audits and baseline-regression evidence, not an out-of-time forecast test of the full G-NAV total. G-NAV also does not publish the skater FMV uncertainty band. I would not read a confident-looking number as certainty about a goalie, or treat a percentile profile as proof that the contract price is right.",
    ],
  },
  {
    id: "team-model",
    title: "The Team Model — what a club page actually means",
    paras: [
      "A team can be high in the standings and still have an aging roster, little cap room, and a thin prospect pool. I wanted the club pages to keep those questions separate. Standings position, roster value, future assets, cap space, and lineup legality should not all be squeezed into one 'contender' label.",
      "Phase is the standings tier, sourced from conference rank, division rank, and points percentage. Competitive window is a read of the CURRENT roster's valuations when Armchair GM supplies a roster window. Other consumers fall back to the standings tier when that window is absent. Changing an Armchair roster does not rewrite the standings. A Contender phase and a Rebuilding roster window can therefore describe different things without either label predicting a Cup.",
      "The curated cap-space fallback uses a $95.5M reference ceiling. The shared calculation adds the ceiling delta; a separately supplied live figure is already measured against the current ceiling and is not rebased again. Curated figures carry accounting such as LTIR relief, buried contracts, and bonus overages that a simple sum of player contracts would miss. Sharing the calculation keeps pages consistent. It does not independently establish that every underlying cap-space figure is current and correct.",
      "One earlier bug made the league and team routes differ by $8.5M for all 32 clubs: $104.0M minus $95.5M. Tests now cover the shared rebasing behavior and live-value handling. That is an arithmetic and consistency check, not a fresh reconciliation of each club's real cap ledger.",
      "The lineup counter checks the application's dressed-lineup minimum of 12 forwards, 6 defensemen, 2 goaltenders and reports the exact shortfall. Armchair GM uses the same counter at its simulation gate. This is a count of whether the model can dress its required lineup, not a complete ruling on every NHL roster or cap regulation.",
      "The Teams chart is a client-side positional SUM of player values. Roster X-NAV+ adds only positive contributions, with below-zero values clamped at zero for that chart. The signed Roster X-NAV total keeps the negative values. Each version adds forwards, defensemen, and goalies into its own matching total. The population is the signed active roster only, not draft picks or the unsigned reserve list. The per-player paths are genuinely position-specific; adding them together is a display aggregation, not another fitted model.",
      "The current D-NAV defensive fit uses available teammate-relative defensive inputs and sample-size shrinkage. Missing inputs take a fallback path; the fitted path is not simply switched on by 20 games in the selected statistics season. Its component holdout evidence should not be extended to the whole team total or to every positional model.",
      "The expiry ledger uses the calendar year a player's rights actually reach the market. A known future UFA or RFA year remains relevant to planning even when it is not the current season's expiring class. Tests check the year buckets, roster counts, and signed/positive-only sum identities. Those checks show that the stated inputs are handled consistently. They do not prove the roster is complete, every contract is freshly verified, or a competitive-window label will come true.",
    ],
  },
  {
    id: "gm-audit",
    title: "The GM Audit — plausibility, not just math",
    paras: [
      "You can balance the value in a trade and still build a deal neither team has much reason to make. Acquiring another starting goalie is the obvious example when a club already has a strong one. The GM Audit asks what the numbers alone might miss about that proposal.",
      "Its rule-based checks use clauses, cap and retention mechanics, roster slots, asset value, team context, and timelines. It publishes named objections so you can see why the deal was flagged. Where the app has a separate team-fit assessment, that describes projected on-ice impact. It is a different question from the overall trade-value audit, and missing team-fit data is not an invented win or loss.",
      "Focused regression tests cover the implemented rules and cases such as franchise-calibre returns and an overcrowded crease. These test whether the code applies the intended rules. They do not establish how often a real general manager would agree with the verdict.",
      "The audit is a model of plausibility, not knowledge of negotiations or a binding CBA opinion. It cannot know every club's private plan, every condition, or whether a player would waive a clause. A balanced package does not guarantee acceptance; a flag gives you an objection to inspect, not the final word on a trade.",
    ],
  },
  {
    id: "simulation",
    title: "The Simulation Engine — consequences on the record",
    paras: [
      "A deadline rental can look great until you try to replace him next summer. Armchair GM's three-year Cup Run lets you try a roster decision and see the modelled consequences across seasons. I wanted more than a verdict that forgot the contract as soon as the trade was finished.",
      "The engine uses roster inputs and valuations, aging, retirements, breakouts, drafts, cap growth, and simulated opposing-team decisions. It projects a league using seeded randomness. The opposing clubs' automated cap decisions are application logic; they are not a language model running NHL teams. The automatic AI-written recap is disabled, while simulated results and Season Review remain available.",
      "Goalie inputs evolve at rollover. GSAx and save percentage are regressed toward population means using the backtest stability coefficients, then the goalie age curve and stochastic noise are applied. A hot backup does not carry the same stat line forever. That is how the simulation represents uncertainty, not proof of what that goalie will do in Year 2.",
      "Regression tests check seeded replay, independent random streams, multi-season stat carryover, lineup gates, and consistency between player and team totals. The same complete inputs, decisions, season, and seed should replay the same result. Those are engineering checks. A repeatable simulation can still be wrong about hockey.",
      "This is a scenario tool, not a guarantee about standings, playoff odds, or the consequences of a real trade. Two runs are only a useful comparison when their inputs and assumptions are comparable. Keeping a seed fixed helps compare modelled changes; it does not prove a roster decision caused that outcome in the real NHL.",
    ],
  },
  {
    id: "data",
    title: "Data pipeline & acknowledgements",
    paras: [
      "A new box score should not quietly rewrite last season's model inputs. The site keeps selected-season observed statistics, historical analytical inputs, and current contract information distinct. The season and competition labels matter: a regular-season line and a playoff line are different records, and missing coverage is not confirmation of zero games.",
      "Scheduled feed snapshots use NHL roster/statistics APIs and NHL EDGE data. MoneyPuck supplies analytics alongside multi-season baselines. New observations can update the statistics being displayed while the public valuation model retains its historical input context. An archived valuation is not recomputed just because today's feed changed.",
      "Coverage and provenance checks help establish which records and sources are present. They do not establish analytical accuracy or complete coverage of every population. In fixed-weight composites such as Gravity v3, a missing input contributes no term, moves the estimate toward neutral, and reduces coverage/reliability. That is missing-data handling, not evidence of average ability.",
      "I could not have built this without the NHL, MoneyPuck, CapWages, and Hockey-Reference. Contract facts are maintained in the site's ledger rather than queried from CapWages at read time, but the original baseline came from that work and deserves credit. Detailed definitions, evidence context, and source links are in the Glossary's Data & Sources section. The models are estimates, the sources have limits, and there is still work to do.",
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
            What I built, what goes into the numbers, and where the evidence stops. For definitions and keys, read the{" "}
            <a href="/glossary" className="inline-flex items-center min-h-11 underline hover:text-ledger-red transition-colors">Glossary</a>.
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
              I built Cap &amp; Crease to give hockey arguments a better starting point.
              If you find it useful and want to support the work, a stick tap is appreciated.
            </p>
            <a
              href="https://buymeacoffee.com/capandcrease"
              aria-label="Buy me a stick tap — support Cap & Crease"
              target="_blank"
              rel="noopener noreferrer"
              className="inline-block px-5 py-2.5 font-mono text-[11px] font-black uppercase tracking-[0.15em] border-2 no-underline transition-colors hover:opacity-80"
              style={{ borderColor: "var(--ledger-ink)", background: "var(--ledger-amber, #d4a017)", color: "var(--paper)" }}
            >
              Buy me a stick tap
            </a>
          </section>
        </div>

        <Footer />
      </div>
    </main>
  );
}
