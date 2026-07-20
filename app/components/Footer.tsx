// ── Footer — methodology, glossary, icon key, data credits ───
// Shared across Armchair GM, Trade Machine, and Player Analytics pages.
import Link from "next/link";
import { TierIcon } from "./GravityField";
import type { GravityTier } from "@/app/lib/gravity";

export const iconKey = [
  ["♛", "Megalodon", "Extreme franchise-value tier above the top NAV threshold."],
  ["◆", "Franchise / Core", "Franchise marker on asset cards; core-player section marker in selectors."],
  ["★", "Surplus / Pedigree", "Surplus contract, award signal, prospect marker, or elite shutdown pedigree when paired with text."],
  ["◇", "Prospect / Depth", "Prospect marker or depth-player section marker."],
  ["↑", "Prospects & ELC", "Prospects and entry-level contract grouping in asset selectors."],
  ["⬡", "Draft Picks", "Draft-pick grouping in asset selectors."],
  ["⚕", "Injury Risk", "Ledger note for elevated injury risk."],
  ["⟳", "Change of Scenery", "Negative but recoverable NAV profile that may fit another roster better."],
  ["⚠", "Salary Dump", "Deeply negative or high-risk contract warning."],
  ["◈", "Untouchable", "Availability gate — player is marked untouchable and will not appear in trade proposals."],
  ["◉", "Trade Block", "Player has been placed on the trade block by their team."],
  ["⚡", "Find Partners", "Triggers a league-wide search for the best trade partners for this player."],
];

export const gravityTierEntries: [GravityTier, string, string][] = [
  ["SUPERMASSIVE", "Supermassive", "Gravity tier: elite on-ice dominance — linemates improve dramatically, play bends toward the offensive zone."],
  ["STAR", "Star", "Gravity tier: strong gravitational pull — clear positive impact on linemates and territorial play."],
  ["MAIN_SEQUENCE", "Main Sequence", "Gravity tier: steady, reliable on-ice presence — consistent positive influence at even strength."],
  ["SATELLITE", "Satellite", "Gravity tier: mild positive pull — contributes but does not drive on-ice results."],
  ["ASTEROID", "Asteroid", "Gravity tier: near-neutral presence — minimal measurable effect on linemate production or territory."],
  ["BLACK_HOLE", "Black Hole", "Gravity tier: negative on-ice gravity — play quality deteriorates when this player is deployed."],
];

export const methodologySections = [
  {
    title: "Player Valuation",
    intro: "How the app turns a player, contract, and role into tradeable asset value.",
    items: [
      ["X-NAV", "Extended Net Asset Value: the Ledger's trade-value model — on-ice impact, gravity, age, role, cap hit, term, and team control priced together."],
      ["X-NAV", "Skater model. Offense, defense, age curve, contract surplus, deployment, Point Shares, and role context feed the total."],
      ["G-NAV", "Goalie model. Built around GSAx, workload, save profile, team defensive context, age, and contract surplus."],
      ["Prospect NAV", "Pre-NHL value comes from draft pedigree and stored NHLe production. No-signal ELC players do not receive automatic cap or age value."],
      ["CAP", "Contract component. Positive means the player is under market value; negative means the cap hit or term drags value."],
      ["YNG", "Youth/upside component for young NHL players who have enough real signal. It is not a blanket ELC bonus."],
      ["Negative NAV", "Negative value does not mean a bad player. It means the contract is a trade liability relative to expected production, term, and market fit."],
    ],
  },
  {
    title: "STRAND Glossary",
    intro: "The roster-DNA layer that describes style, usage, and development fit.",
    items: [
      ["STRAND", "Stylistic Trait & Rating Analysis for NHL Development: a team/player identity view for role fit, timeline, and roster balance."],
      ["SCR", "Scoring pace. Points per 82 games, normalized by position so defencemen and forwards are not judged on the same raw scale."],
      ["xG", "Expected-goals creation from shot quality and volume, not just shot count."],
      ["TOI+", "Ice-time trust and role load. Heavy minutes imply broader usage and higher coaching trust."],
      ["SUPP", "Expected-goals-against suppression relative to teammates. Positive means the team leaks fewer chances with that player on ice."],
      ["QoC Index", "0-100 even-strength deployment difficulty based on matchup and usage context."],
      ["DZ%", "Defensive-zone start share. High usage here can indicate trusted defensive deployment."],
      ["AGE", "Development and decline curve over the life of the contract."],
    ],
  },
  {
    title: "Trade Logic",
    intro: "The audit layer that decides whether a deal is plausible, not just mathematically balanced.",
    items: [
      ["GM Audit", "Checks clauses, cap legality, retention, roster slots, surplus gaps, timeline alignment, and contention-window fit."],
      ["EWA", "Estimated Wins Added: translates asset value into standings impact, adjusted by team context."],
      ["CWI", "Contention Window Index: estimates whether a trade extends, compresses, or harms a team's competitive window."],
      ["REQUESTED", "Formal trade request. Positive NAV receives a small leverage haircut."],
      ["SHOPPED", "Available or being explored by the team. No automatic NAV penalty."],
      ["UNTCH", "Untouchable availability gate. Value remains visible, but proposal logic treats the player as unavailable."],
      ["Role Tags", "First-line, middle-six, top-pair, shutdown, starter, tandem, backup, and specialist tags summarize usage/value tier."],
    ],
  },
  {
    title: "Data & Sources",
    intro: "Where the app gets its inputs and which parts remain deterministic.",
    items: [
      ["NHL API", "Rosters, positions, ages, game logs, and current-season summary data."],
      ["MoneyPuck", "Skater and goalie analytics including xG, deployment, on/off impact, and GSAx inputs."],
      ["CapWages", "Contract, cap hit, term, clause, extension, and roster metadata source."],
      ["Draft History", "Recent public draft tables enrich synced prospects with draft year and overall pick."],
      ["NHLe", "Non-NHL production translated to NHL point pace for prospects. It must come from stored or imported production data."],
      ["AI Notes", "Claude Sonnet is used for narrative explanation only; X-NAV calculations stay in deterministic app code."],
    ],
  },
];

export default function Footer() {
  return (
    <footer className="mt-8 border-t border-ledger-rule px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 text-center">
          <p className="text-2xs uppercase tracking-[0.16em] sm:tracking-[0.36em] leading-relaxed font-mono text-ledger-ink-faint">
            <Link href="/methodology" className="underline hover:text-ledger-ink transition-colors">Methodology</Link> · <Link href="/methodology#strand-glossary" className="underline hover:text-ledger-ink transition-colors">Glossary</Link> · Icon Key
          </p>
          <p className="mt-1 text-[9px] uppercase tracking-[0.14em] sm:tracking-[0.24em] font-mono text-ledger-rule">
            X-NAV · G-NAV · NOIV · STRAND · GM Audit
          </p>
        </div>

        <section className="mb-4 border border-ledger-rule"
          style={{ background: "var(--paper-card)" }}
          aria-label="Icon key">
          <div className="border-b px-4 py-2 font-mono text-[10px] font-black uppercase tracking-[0.22em] text-ledger-ink"
            style={{ borderColor: "var(--ledger-rule)" }}>
            Icon Key
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 p-4">
            {iconKey.map(([icon, label, definition]) => (
              <div key={`${icon}-${label}`} className="flex items-start gap-2.5">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center border font-mono text-[12px] font-black"
                  style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-ink)" }}>
                  {icon}
                </span>
                <div className="min-w-0">
                  <span className="font-mono text-[9px] font-black uppercase leading-snug text-ledger-ink">
                    {label}
                  </span>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ledger-ink-light">
                    {definition}
                  </p>
                </div>
              </div>
            ))}
            {gravityTierEntries.map(([tier, label, definition]) => (
              <div key={`grav-${tier}`} className="flex items-start gap-2.5">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center border"
                  style={{ borderColor: "var(--ledger-rule)" }}>
                  <TierIcon tier={tier} size={14} />
                </span>
                <div className="min-w-0">
                  <span className="font-mono text-[9px] font-black uppercase leading-snug text-ledger-ink">
                    {label}
                  </span>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ledger-ink-light">
                    {definition}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <div className="space-y-2">
          {methodologySections.map(section => (
            <details
              key={section.title}
              className="group border border-ledger-rule"
              style={{ background: "var(--paper-card)" }}
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3">
                <div>
                  <div className="font-mono text-[10px] font-black uppercase tracking-[0.22em] text-ledger-ink">
                    {section.title}
                  </div>
                  <div className="mt-1 text-[11px] leading-relaxed text-ledger-ink-faint">
                    {section.intro}
                  </div>
                </div>
                <span className="font-mono text-[13px] text-ledger-ink-faint group-open:rotate-180"
                  aria-hidden="true">⌄</span>
              </summary>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 border-t px-4 py-4"
                style={{ borderColor: "var(--ledger-rule)" }}>
                {section.items.map(([term, definition]) => (
                  <div key={`${section.title}-${term}`} className="grid grid-cols-[96px_1fr] gap-4">
                    <dt className="font-mono text-[9px] font-black uppercase leading-snug text-ledger-ink">
                      {term}
                    </dt>
                    <dd className="text-[11px] leading-relaxed text-ledger-ink-light">
                      {definition}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          ))}
        </div>

        <p className="mt-4 text-center text-[9px] leading-relaxed font-mono text-ledger-rule">
          Analytical estimates only. Player values move with injury, role, performance, contract status, source coverage, and team context.
        </p>
      </div>
    </footer>
  );
}
