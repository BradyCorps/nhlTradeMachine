// app/methodology/page.tsx — The Hockey Ledger: Methodology & Glossary
import React from "react";
import Link from "next/link";
import { iconKey, gravityTierEntries, methodologySections } from "../components/Footer";
import { TierIcon } from "../components/GravityField";

function slugify(title: string) {
  return title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

export default function MethodologyPage() {
  return (
    <main
      className="min-h-screen font-mono"
      style={{ background: "var(--paper-bg)", color: "var(--ledger-ink)" }}
    >
      {/* ── Back link ── */}
      <div className="mx-auto max-w-5xl px-4 pt-6">
        <Link
          href="/players"
          className="inline-block text-[10px] font-black uppercase tracking-[0.2em] no-underline text-ledger-ink-faint hover:text-ledger-ink transition-colors"
        >
          &larr; Back to Player Analytics
        </Link>
      </div>

      {/* ── Nameplate / Header ── */}
      <header className="mx-auto max-w-5xl px-4 pt-6 pb-5 text-center border-b-2" style={{ borderColor: "var(--ledger-rule)" }}>
        <h1 className="font-mono text-[11px] sm:text-xs font-black uppercase tracking-[0.28em] sm:tracking-[0.44em] leading-relaxed text-ledger-ink">
          The Hockey Ledger &mdash; Methodology &amp; Glossary
        </h1>
        <p className="mt-2 text-[9px] uppercase tracking-[0.18em] text-ledger-ink-faint leading-relaxed">
          Reference &middot; Valuation Framework &middot; Icon Key &middot; Data Sources
        </p>
      </header>

      <div className="mx-auto max-w-5xl px-4 py-6">
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
              <a href="#icon-key" className="text-[11px] text-ledger-ink-light hover:text-ledger-ink no-underline hover:underline">
                Icon Key
              </a>
            </li>
            {methodologySections.map((section) => (
              <li key={section.title}>
                <a
                  href={`#${slugify(section.title)}`}
                  className="text-[11px] text-ledger-ink-light hover:text-ledger-ink no-underline hover:underline"
                >
                  {section.title}
                </a>
              </li>
            ))}
          </ol>
        </nav>

        {/* ── Icon Key ── */}
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
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-5 gap-y-3 p-4">
            {iconKey.map(([icon, label, definition]) => (
              <div key={`${icon}-${label}`} className="grid grid-cols-[28px_110px_1fr] items-start gap-3">
                <span
                  className="inline-flex h-6 w-6 items-center justify-center border font-mono text-[12px] font-black"
                  style={{ borderColor: "var(--ledger-rule)", color: "var(--ledger-ink)" }}
                >
                  {icon}
                </span>
                <span className="font-mono text-[9px] font-black uppercase leading-snug text-ledger-ink">
                  {label}
                </span>
                <span className="text-[11px] leading-relaxed text-ledger-ink-light">
                  {definition}
                </span>
              </div>
            ))}
            {gravityTierEntries.map(([tier, label, definition]) => (
              <div key={`grav-${tier}`} className="grid grid-cols-[28px_110px_1fr] items-start gap-3">
                <span
                  className="inline-flex h-6 w-6 items-center justify-center border"
                  style={{ borderColor: "var(--ledger-rule)" }}
                >
                  <TierIcon tier={tier} size={14} />
                </span>
                <span className="font-mono text-[9px] font-black uppercase leading-snug text-ledger-ink">
                  {label}
                </span>
                <span className="text-[11px] leading-relaxed text-ledger-ink-light">
                  {definition}
                </span>
              </div>
            ))}
          </div>
        </section>

        {/* ── Methodology Sections ── */}
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
              <p className="mt-1 text-[11px] leading-relaxed text-ledger-ink-faint">
                {section.intro}
              </p>
            </div>
            <dl
              className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 px-4 py-4"
            >
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
          </section>
        ))}

        {/* ── Closing disclaimer ── */}
        <p className="mt-4 text-center text-[9px] leading-relaxed font-mono text-ledger-rule">
          Analytical estimates only. Player values move with injury, role, performance, contract status, source coverage, and team context.
        </p>
      </div>
    </main>
  );
}
