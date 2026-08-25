// ── Footer — methodology, glossary, icon key, data credits ───
// Shared across Armchair GM, Trade Machine, and Player Analytics pages.
import Link from "next/link";
import { BRAND } from "@/app/lib/brand";
import { BrandMark } from "@/app/components/BrandMark";
import { TierIcon } from "./GravityField";
import type { GravityTier } from "@/app/lib/gravity";
import { ROLE_DEFS } from "@/app/lib/player-roles";

// G3: one flag system — explicit role chips come straight from ROLE_DEFS so
// the key cannot drift from what the badges actually render.
export const roleIconEntries = Object.values(ROLE_DEFS).map(def =>
  [`ROLE: ${def.label}`, def.label, def.blurb] as [string, string, string]);

export const iconKey = [
  ["NAV: MEGALODON", "Megalodon", "Extreme franchise-value tier above the top NAV threshold."],
  ["NAV: FRANCHISE", "Franchise", "Franchise-value player."],
  ["SURPLUS", "Surplus", "On-ice value significantly exceeds contract cost."],
  ["PROSPECT: TOP", "Prospect", "Tracked top-prospect pedigree."],
  ["RFA / UFA", "Rights", "Contract rights expire this offseason."],
  ["⚕", "Injury Risk", "Ledger note for elevated injury risk."],
  ["⟳", "Change of Scenery", "Negative but recoverable NAV profile that may fit another roster better."],
  ["⚠", "Salary Dump", "Deeply negative or high-risk contract warning."],
  ["◈", "Untouchable", "Availability gate — player is marked untouchable and will not appear in trade proposals."],
  ["◉", "Trade Block", "Player has been placed on the trade block by their team."],
  ["⚡", "Find Partners", "Triggers a league-wide search for the best trade partners for this player."],
];

export const gravityTierEntries: [GravityTier, string, string][] = [
  ["SUPERMASSIVE", "Supermassive", "Gravity v3 tier: the largest positive bounded modelled fields in the current position-relative calibration."],
  ["STAR", "Star", "Gravity v3 tier: an elite positive bounded field across one or more modelled zones."],
  ["MAIN_SEQUENCE", "Main Sequence", "Gravity v3 tier: a strong positive position-relative territorial influence index."],
  ["SATELLITE", "Satellite", "Gravity v3 tier: a modest positive position-relative territorial influence index."],
  ["ASTEROID", "Asteroid", "Gravity v3 tier: a bounded field near the current position-relative reference."],
  ["BLACK_HOLE", "Black Hole", "Gravity v3 tier: a strongly negative position-relative modelled field."],
];

export interface MethodologyItem {
  term: string;
  definition: string;
  href?: string;
}

export interface MethodologySection {
  title: string;
  intro: string;
  items: MethodologyItem[];
}

export const methodologySections: MethodologySection[] = [
  {
    title: "Player Valuation",
    intro: "How the app turns a player, contract, and role into tradeable asset value.",
    items: [
      { term: "X-NAV", definition: "Extended Net Asset Value: the Ledger's skater trade-value model. Offense, defense, age curve, contract surplus, deployment, Point Shares, and role context priced into one number; Gravity is a separately gated experimental term." },
      { term: "G-NAV", definition: "Goalie Net Asset Value. Built around goals saved above expected, workload, save profile, team defensive context, age, and contract surplus." },
      { term: "Prospect NAV", definition: "Pre-NHL value comes from draft pedigree and stored NHLe production. No-signal ELC players do not receive automatic cap or age value." },
      { term: "OFF / DEF", definition: "On-ice components: offensive production and creation on one side, suppression and defensive value on the other, each judged against position." },
      { term: "GRAV", definition: "The separately gated X-NAV handoff from Gravity v3. When enabled, it contains only the bounded neutral-zone transition proxy; it is off in the public-launch baseline." },
      { term: "Modelled Field", definition: "The warped rink is a visualization generated from three model components. It is not an observed tracking heatmap or a map of puck trajectories." },
      { term: "Signal Stability", definition: "A v3 heuristic based mainly on current-versus-baseline on-off agreement, with a legacy defenseman pair-driver adjustment. It does not estimate portability." },
      { term: "Reliability", definition: "A 0–100 v3 sample, stability, and data-coverage index, with coverage as a hard ceiling. It is not a calibrated probability." },
      { term: "Data Coverage", definition: "The share of fixed v3 zone weight backed by present inputs. Below two-thirds coverage, a profile is INSUFFICIENT and receives no tier or percentile." },
      { term: "Mixed Situations", definition: "Gravity v3 combines all-situations, 5v5, 5-on-4, 4-on-5, and regular-season EDGE aggregate inputs. It is not a single-strength model." },
      { term: "CAP", definition: "Contract component. Positive means the player is under market value; negative means the cap hit or term drags value." },
      { term: "AGE / YNG", definition: "Age-curve component: decline drag for veterans, youth projection for young NHL players with enough real signal. Not a blanket ELC bonus." },
      { term: "UPS", definition: "Upside component — development ceiling for players whose trajectory has not fully priced into production yet." },
      { term: "Negative NAV", definition: "Negative value does not mean a bad player. It means the contract is a trade liability relative to expected production, term, and market fit." },
    ],
  },
  {
    title: "STRAND Glossary",
    intro: "The roster-DNA layer that describes style, usage, and development fit.",
    items: [
      { term: "STRAND", definition: "Stylistic Trait & Rating Analysis for NHL Development: a team/player identity view for role fit, timeline, and roster balance." },
      { term: "SCR", definition: "Scoring pace. Points per 82 games, normalized by position so defencemen and forwards are not judged on the same raw scale." },
      { term: "xG", definition: "Expected-goals creation from shot quality and volume, not just shot count." },
      { term: "TOI+", definition: "Ice-time trust and role load. Heavy minutes imply broader usage and higher coaching trust." },
      { term: "SUPP", definition: "Expected-goals-against suppression relative to teammates. Positive means the team leaks fewer chances with that player on ice." },
      { term: "QoC Index", definition: "0-100 even-strength deployment difficulty based on matchup and usage context." },
      { term: "DZ%", definition: "Defensive-zone start share. High usage here can indicate trusted defensive deployment." },
      { term: "HD Finish", definition: "High-danger finishing vs league expectation, from NHL EDGE shot-location data. Positive = converts quality chances above league rate." },
      { term: "20+ Bursts", definition: "Count of 20+ mph skating bursts from NHL EDGE tracking — a direct speed-in-game signal, not a one-off top speed." },
      { term: "AGE", definition: "Development and decline curve over the life of the contract." },
    ],
  },
  {
    title: "Modern Roles",
    intro: "Derived identity labels — what a player actually does, computed from tracking, deployment, and creation-mix data.",
    items: [
      { term: "Puck-Moving Anchor", definition: "D — clean exits and controlled entries; play travels north on his stick, not off the glass." },
      { term: "Neutral Zone Engine", definition: "F — carries through center ice for controlled entries; the transition game runs through him." },
      { term: "High-Danger Distributor", definition: "Seeks cross-seam and low-to-high passes that create high-probability chances." },
      { term: "Rush Weapon", definition: "Counterattack specialist — top-end speed and finishing on odd-man rushes." },
      { term: "Slot Hunter", definition: "Off-puck movement into soft high-danger slot ice for quick shots and deflections." },
      { term: "Net-Front Disruptor", definition: "Screens, tips, and low-slot rebounds — goalie sightlines are never clean." },
      { term: "Volume Shooter", definition: "Drives offense by directing pucks at net relentlessly." },
      { term: "Forecheck Monster", definition: "Offensive-zone recoveries and forced turnovers sustain possession." },
      { term: "Perimeter Lockdown", definition: "D — forces rushes outside and denies clean blue-line entries." },
      { term: "Complete Shutdown", definition: "C — suppresses opponent expected goals while on the ice; the trusted matchup assignment." },
      { term: "Floor Raiser", definition: "High usage — carries a lineup through transition, minutes, and self-created offense." },
      { term: "Ceiling Raiser", definition: "Adaptable elite complement — suppression, forechecking, or off-puck play that elevates a top line." },
      { term: "Workhorse Wall", definition: "G — starter workload with saves above expected; the net is his every night." },
      { term: "High-Danger Eraser", definition: "G — elite on grade-A chances; the slot shot that beats most goalies gets erased." },
      { term: "Storm Cellar", definition: "G — positive GSAx behind a leaky defense; keeps the scoreboard respectable." },
      { term: "Tandem Weapon", definition: "G — split workload with elite efficiency per start; wins his half of the calendar." },
    ],
  },
  {
    title: "Trade Logic",
    intro: "The audit layer that decides whether a deal is plausible, not just mathematically balanced.",
    items: [
      { term: "GM Audit", definition: "Checks clauses, cap legality, retention, roster slots, surplus gaps, timeline alignment, and contention-window fit." },
      { term: "EWA", definition: "Estimated Wins Added: translates asset value into standings impact, adjusted by team context." },
      { term: "CWI", definition: "Contention Window Index: estimates whether a trade extends, compresses, or harms a team's competitive window." },
      { term: "REQUESTED", definition: "Formal trade request. Positive X-NAV receives a small leverage haircut." },
      { term: "SHOPPED", definition: "Available or being explored by the team. No automatic X-NAV penalty." },
      { term: "UNTCH", definition: "Untouchable availability gate. Value remains visible, but proposal logic treats the player as unavailable." },
      { term: "Role Tags", definition: "First-line, middle-six, top-pair, shutdown, starter, tandem, backup, and specialist tags summarize usage/value tier." },
    ],
  },
  {
    title: "Data & Sources",
    intro: "Cap & Crease is only possible because these sources publish world-class hockey data. Sincere thanks to each of them.",
    items: [
      { term: "NHL API", definition: "Rosters, positions, ages, game logs, current-season summary data, and NHL EDGE tracking (zone time, speed, shot location).", href: "https://www.nhl.com" },
      { term: "MoneyPuck", definition: "Skater and goalie analytics including xG, deployment, on/off impact, and GSAx inputs. An indispensable public resource.", href: "https://moneypuck.com" },
      { term: "CapWages", definition: "Contract data this project was originally built on. No longer queried — contracts are maintained by hand here — but the historical baseline came from their work and the credit stands.", href: "https://capwages.com" },
      { term: "Hockey-Reference", definition: "Point Shares and historical context for career baselines.", href: "https://www.hockey-reference.com" },
      { term: "NHLe", definition: "Non-NHL production translated to NHL point pace for prospects. It must come from stored or imported production data." },
      { term: "AI Notes", definition: "AI is used for narrative explanation only; X-NAV and Gravity calculations stay in deterministic app code." },
    ],
  },
];

export default function Footer() {
  return (
    <footer className="mt-8 border-t border-ledger-rule px-4 py-6">
      <div className="mx-auto max-w-6xl">
        <div className="mb-5 text-center">
          <p className="text-2xs uppercase tracking-[0.16em] sm:tracking-[0.36em] leading-relaxed font-mono text-ledger-ink-faint">
            <Link href="/methodology" className="underline hover:text-ledger-ink transition-colors">Methodology</Link> · <Link href="/glossary" className="underline hover:text-ledger-ink transition-colors">Glossary</Link> · <Link href="/glossary#icon-key" className="underline hover:text-ledger-ink transition-colors">Icon Key</Link> · <Link href="/legal" className="underline hover:text-ledger-ink transition-colors">Terms &amp; Privacy</Link>
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.14em] sm:tracking-[0.24em] font-mono text-ledger-rule">
            X-NAV · G-NAV · NOIV · STRAND · GM Audit
          </p>
        </div>

        {/* Collapsed by default (mobile audit X2): the full icon key added
            ~1,000px of always-on grids to every page that renders the footer.
            It opens on demand here and still lives in full at
            /glossary#icon-key. Kept as a native <details> so it works without JS. */}
        <details className="group mb-4 border border-ledger-rule"
          style={{ background: "var(--paper-card)" }}>
          <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-4 py-3"
            aria-label="Icon key">
            <div className="font-mono text-[10px] font-black uppercase tracking-[0.22em] text-ledger-ink">
              Icon Key
            </div>
            <span className="font-mono text-[13px] text-ledger-ink-faint group-open:rotate-180" aria-hidden="true">⌄</span>
          </summary>
          <div className="border-t px-4 pt-3 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-ledger-ink-faint"
            style={{ borderColor: "var(--ledger-rule)" }}>
            Asset Flags
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 p-4">
            {iconKey.map(([icon, label, definition]) => (
              <div key={`${icon}-${label}`} className="flex items-start gap-2.5">
                <span className="inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center border px-1 font-mono text-[10px] font-black"
                  style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-ink)" }}>
                  {icon}
                </span>
                <div className="min-w-0">
                  <span className="font-mono text-[10px] font-black uppercase leading-snug text-ledger-ink">
                    {label}
                  </span>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ledger-ink-body">
                    {definition}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 pt-1 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-ledger-ink-faint border-t"
            style={{ borderColor: "var(--ledger-rule-light, var(--ledger-rule))" }}>
            <span className="inline-block pt-2">Modern Role Chips</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 p-4">
            {roleIconEntries.map(([icon, label, definition]) => (
              <div key={`role-${label}`} className="flex items-start gap-2.5">
                <span className="inline-flex min-h-6 min-w-6 shrink-0 items-center justify-center border px-1 font-mono text-[9px] font-black"
                  style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-ink)" }}>
                  {icon}
                </span>
                <div className="min-w-0">
                  <span className="font-mono text-[10px] font-black uppercase leading-snug text-ledger-ink">
                    {label}
                  </span>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ledger-ink-body">
                    {definition}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="px-4 pt-1 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-ledger-ink-faint border-t"
            style={{ borderColor: "var(--ledger-rule-light, var(--ledger-rule))" }}>
            <span className="inline-block pt-2">Gravity Tiers</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-4 p-4">
            {gravityTierEntries.map(([tier, label, definition]) => (
              <div key={`grav-${tier}`} className="flex items-start gap-2.5">
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center border"
                  style={{ borderColor: "var(--ledger-rule)" }}>
                  <TierIcon tier={tier} size={14} />
                </span>
                <div className="min-w-0">
                  <span className="font-mono text-[10px] font-black uppercase leading-snug text-ledger-ink">
                    {label}
                  </span>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-ledger-ink-body">
                    {definition}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </details>

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
                  <div className="mt-1 text-[11px] leading-relaxed text-ledger-ink-body">
                    {section.intro}
                  </div>
                </div>
                <span className="font-mono text-[13px] text-ledger-ink-faint group-open:rotate-180"
                  aria-hidden="true">⌄</span>
              </summary>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 border-t px-4 py-4"
                style={{ borderColor: "var(--ledger-rule)" }}>
                {section.items.map(({ term, definition, href }) => (
                  <div key={`${section.title}-${term}`} className="grid grid-cols-[96px_1fr] gap-4">
                    <dt className="font-mono text-[10px] font-black uppercase leading-snug text-ledger-ink">
                      {href ? (
                        <a href={href} target="_blank" rel="noopener noreferrer"
                          className="underline hover:text-ledger-red transition-colors text-ledger-ink">
                          {term}
                        </a>
                      ) : term}
                    </dt>
                    <dd className="text-[11px] leading-relaxed text-ledger-ink-body">
                      {definition}
                    </dd>
                  </div>
                ))}
              </dl>
            </details>
          ))}
        </div>

        {/* The mark signs off the page. The wordmark is already in the
            masthead, so this instance is decorative — no `title`, and it is
            hidden from screen readers rather than announcing the site twice. */}
        <div className="mt-5 flex justify-center">
          <BrandMark size={44} />
        </div>

        <p className="mt-4 text-center text-[10px] leading-relaxed font-mono text-ledger-rule">
          Analytical estimates only. Player values move with injury, role, performance, contract status, source coverage, and team context.
        </p>
        {/* Nominative use, stated plainly: the league's marks are named to say
            what the data is about, never to imply endorsement. */}
        <p className="mt-2 text-center text-[10px] leading-relaxed font-mono text-ledger-rule">
          {BRAND.disclaimer}
        </p>
      </div>
    </footer>
  );
}
