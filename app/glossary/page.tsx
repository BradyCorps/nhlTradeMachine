// app/glossary/page.tsx — The Hockey Ledger: Glossary & Icon Key
// The "what" reference: every definition, key, and system explanation.
// The "why/how" narrative lives at /methodology.
import React from "react";
import type { Metadata } from "next";
import Header from "../components/Header";
import Footer, { iconKey, gravityTierEntries, roleIconEntries, methodologySections } from "../components/Footer";
import { TierIcon } from "../components/GravityField";

export const metadata: Metadata = {
  title: "Glossary — The Hockey Ledger",
  description: "Every definition in the Ledger: X-NAV components, STRAND traits, gravity tiers, trade logic, icon key, and data sources.",
};

function slugify(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function GlossaryPage() {
  return (
    <main
      className="min-h-screen px-4 py-4 font-mono"
      style={{ background: "var(--paper-bg)", color: "var(--ledger-ink)" }}
    >
      <div className="mx-auto max-w-5xl">
        <Header />

        <header className="pt-6 pb-5 text-center border-b-2" style={{ borderColor: "var(--ledger-rule)" }}>
          <h1 className="font-mono text-[11px] sm:text-xs font-black uppercase tracking-[0.28em] sm:tracking-[0.44em] leading-relaxed text-ledger-ink">
            Glossary &amp; Icon Key
          </h1>
          <p className="mt-2 text-[10px] uppercase tracking-[0.18em] text-ledger-ink-body leading-relaxed">
            What every number, badge, and term means. For the how and why, read the{" "}
            <a href="/methodology" className="underline hover:text-ledger-red transition-colors">Methodology</a>.
          </p>
        </header>

        <div className="py-6">
          {/* ── Table of Contents ── */}
          <nav
            className="mb-8 border border-ledger-rule p-4"
            style={{ background: "var(--paper-card)" }}
            aria-label="Table of contents"
          >
            <div className="font-mono text-[10px] font-black uppercase tracking-[0.22em] text-ledger-ink mb-3">
              Contents
            </div>
            <ol className="list-decimal list-inside space-y-1">
              <li>
                <a href="#icon-key" className="text-[11px] text-ledger-ink-body hover:text-ledger-ink no-underline hover:underline">
                  Icon Key — Asset Flags &amp; Gravity Tiers
                </a>
              </li>
              {methodologySections.map((section) => (
                <li key={section.title}>
                  <a
                    href={`#${slugify(section.title)}`}
                    className="text-[11px] text-ledger-ink-body hover:text-ledger-ink no-underline hover:underline"
                  >
                    {section.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          {/* ── Icon Key — grouped by system ── */}
          <section
            id="icon-key"
            className="mb-6 border border-ledger-rule"
            style={{ background: "var(--paper-card)" }}
            aria-label="Icon key"
          >
            <div
              className="border-b px-4 py-3 font-mono text-[10px] font-black uppercase tracking-[0.22em] text-ledger-ink"
              style={{ borderColor: "var(--ledger-rule)" }}
            >
              Icon Key
            </div>

            <h2 className="px-4 pt-4 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-ledger-ink-body">
              Asset Flags
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3 p-4">
              {iconKey.map(([icon, label, definition]) => (
                <div key={`${icon}-${label}`} className="grid grid-cols-[28px_110px_1fr] items-start gap-3">
                  <span
                    className="inline-flex h-6 w-6 items-center justify-center border font-mono text-[12px] font-black"
                    style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-ink)" }}
                  >
                    {icon}
                  </span>
                  <span className="font-mono text-[10px] font-black uppercase leading-snug text-ledger-ink">
                    {label}
                  </span>
                  <span className="text-[11px] leading-relaxed text-ledger-ink-body">
                    {definition}
                  </span>
                </div>
              ))}
            </div>

            <h2 className="px-4 pt-2 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-ledger-ink-body border-t"
              style={{ borderColor: "var(--ledger-rule)" }}
            >
              <span className="inline-block pt-3">Modern Role Icons</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3 p-4">
              {roleIconEntries.map(([icon, label, definition]) => (
                <div key={`role-${label}`} className="grid grid-cols-[28px_110px_1fr] items-start gap-3">
                  <span
                    className="inline-flex h-6 w-6 items-center justify-center border font-mono text-[12px] font-black"
                    style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-ink)" }}
                  >
                    {icon}
                  </span>
                  <span className="font-mono text-[10px] font-black uppercase leading-snug text-ledger-ink">
                    {label}
                  </span>
                  <span className="text-[11px] leading-relaxed text-ledger-ink-body">
                    {definition}
                  </span>
                </div>
              ))}
            </div>

            <h2 className="px-4 pt-2 font-mono text-[10px] font-black uppercase tracking-[0.2em] text-ledger-ink-body border-t"
              style={{ borderColor: "var(--ledger-rule)" }}
            >
              <span className="inline-block pt-3">Gravity Tiers</span>
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-5 gap-y-3 p-4">
              {gravityTierEntries.map(([tier, label, definition]) => (
                <div key={`grav-${tier}`} className="grid grid-cols-[28px_110px_1fr] items-start gap-3">
                  <span
                    className="inline-flex h-6 w-6 items-center justify-center border"
                    style={{ borderColor: "var(--ledger-rule)" }}
                  >
                    <TierIcon tier={tier} size={14} />
                  </span>
                  <span className="font-mono text-[10px] font-black uppercase leading-snug text-ledger-ink">
                    {label}
                  </span>
                  <span className="text-[11px] leading-relaxed text-ledger-ink-body">
                    {definition}
                  </span>
                </div>
              ))}
            </div>
            <p className="px-4 pb-4 text-[11px] leading-relaxed text-ledger-ink-body">
              Gravity v3 reports three bounded, position-relative zone masses — an offensive-zone
              well, a neutral-zone transition-proxy well, and a defensive-zone dome. The field is
              a model visualization of those components, not an observed player-tracking heatmap.
              Reliability is a coverage/stability index rather than a probability, and missing
              evidence shrinks the estimate toward neutral. Signal Stability is based mainly on
              current-versus-baseline on-off agreement, with a legacy defenseman pair-driver
              adjustment; it is not a fitted portability model. The public situation label is
              MIXED SITUATIONS because v3 combines all-situations, 5v5, 5-on-4, 4-on-5, and
              regular-season EDGE aggregate inputs.
            </p>
          </section>

          {/* ── Definition sections ── */}
          {methodologySections.map((section) => (
            <section
              key={section.title}
              id={slugify(section.title)}
              className="mb-6 border border-ledger-rule"
              style={{ background: "var(--paper-card)" }}
            >
              <div
                className="border-b px-4 py-3"
                style={{ borderColor: "var(--ledger-rule)" }}
              >
                <h2 className="font-mono text-[10px] font-black uppercase tracking-[0.22em] text-ledger-ink">
                  {section.title}
                </h2>
                <p className="mt-1 text-[11px] leading-relaxed text-ledger-ink-body">
                  {section.intro}
                </p>
              </div>
              <dl className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 px-4 py-4">
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
            </section>
          ))}

          <p className="mt-4 text-center text-[10px] leading-relaxed font-mono text-ledger-ink-faint">
            Analytical estimates only. Player values move with injury, role, performance, contract status, source coverage, and team context.
          </p>
        </div>

        <Footer />
      </div>
    </main>
  );
}
