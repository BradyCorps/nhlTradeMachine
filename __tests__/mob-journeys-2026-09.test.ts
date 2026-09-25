import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ChartData } from "@/app/components/ChartData";

const read = (path: string) => readFileSync(path, "utf8");

describe("Home scroll reveal never blanks a screen", () => {
  it("fires on the first pixel ahead of the viewport, independent of block height", () => {
    const reveal = read("app/components/ScrollReveal.tsx");

    expect(reveal).toContain('{ threshold: 0, rootMargin: "0px 0px 40% 0px" }');
    // A fraction-of-the-block threshold scales with height: a tall section
    // stayed transparent for a full phone screen, and >~5,000px never fired.
    expect(reveal).not.toMatch(/threshold:\s*0\.\d/);
    // Reduced motion and a missing island both leave content visible.
    expect(reveal).toContain('matchMedia("(prefers-reduced-motion: reduce)").matches) return;');
  });

  it("keeps the fade short and off for reduced motion", () => {
    const css = read("app/globals.css");

    expect(css).toMatch(/\.fp-armed \{[^}]*transition: opacity 0\.4s var\(--fp-ease\), transform 0\.6s var\(--fp-ease\);/);
    expect(css).toMatch(/@media \(prefers-reduced-motion: reduce\) \{[^@]*?\.fp-armed, \.fp-armed\.fp-in \{ opacity: 1; transform: none; transition: none; \}/);
  });
});

describe("Armchair GM analysis tabs", () => {
  it("lets tabs keep their label width and wrap below lg, sharing one row from lg", () => {
    const tabs = read("app/armchair-gm/GmAnalysisTabs.tsx");
    const css = read("app/globals.css");

    expect(tabs).toContain('className="tap-target gm-tab"');
    expect(tabs).toContain('className="gm-tablist"');
    // The inline flex:1 1 0 + min-width:0 is what let labels shrink and overprint.
    expect(tabs).not.toMatch(/flex: "1 1 0"/);
    expect(tabs).not.toContain("Swipe or scroll for all analysis views");
    expect(css).toContain(".gm-tablist { display: flex; flex-wrap: wrap; gap: 0; }");
    expect(css).toContain(".gm-tab { flex: 1 0 auto; min-width: 44px; }");
    expect(css).toMatch(/@media \(min-width: 1024px\) \{\s*\.gm-tablist \{ flex-wrap: nowrap; \}\s*\.gm-tab \{ flex: 1 1 0; min-width: 0; \}/);
  });

  it("keeps arrow-key navigation on the tablist", () => {
    const tabs = read("app/armchair-gm/GmAnalysisTabs.tsx");

    expect(tabs).toContain('e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0');
    expect(tabs).toContain("tabIndex={active ? 0 : -1}");
  });
});

describe("Armchair GM captain / alternate badges", () => {
  it("uses a 24px dense-table target around a small bordered letter", () => {
    const roster = read("app/armchair-gm/RosterTab.tsx");
    const badge = roster.slice(roster.indexOf("{letter && ("), roster.indexOf("{row.breakoutTag &&"));

    expect(badge).toContain('className="shrink-0 !min-h-6 !min-w-6 !border-0 !px-0"');
    // The border belongs to the letter, not to a wrapper around the 44px trigger.
    expect(badge.indexOf("<HelpPopover")).toBeLessThan(badge.indexOf('border: "1px solid var(--ledger-ink-faint)"'));
    expect(badge).toContain("{letter}");
  });
});

describe("Chart data disclosure (franchise DNA)", () => {
  const columns = ["Rating / 100", "League reference / 100", "Championship reference / 100", "Comparison / 100"];
  const rows = [
    { id: "ops", label: "Offense: OPS", values: ["46", "33", "57", "44"] },
    { id: "xg", label: "Offense: xG", values: ["38", "40", "54", "36"] },
  ];

  it("renders numeric readings as one matrix row each, with every value and a pin", () => {
    const html = renderToStaticMarkup(React.createElement(ChartData, { title: "Winnipeg Jets franchise DNA", columns, rows }));

    expect(html).toContain('class="chart-data-matrix"');
    for (const column of columns) expect(html).toContain(`<span class="chart-data-full">${column}</span>`);
    for (const row of rows) {
      expect(html).toContain(`aria-label="Pin ${row.label}"`);
      for (const value of row.values) expect(html).toContain(`<td>${value}</td>`);
    }
    // The long per-value sentences are gone from the table.
    expect(html).not.toContain("Rating / 100: 46");
    // Narrow panels key the headers, but keep the full text for assistive tech.
    expect(html).toContain('class="chart-data-legend" aria-hidden="true"');
    expect(html).toContain('<span class="chart-data-key" aria-hidden="true">①</span>');
  });

  it("keeps prose values in the per-row layout with a label/value grid", () => {
    const html = renderToStaticMarkup(React.createElement(ChartData, {
      title: "NAV breakdown",
      columns: ["NAV", "Meaning"],
      rows: [{ id: "off", label: "OFF", values: ["+165", "On-ice offensive value"] }],
    }));

    expect(html).not.toContain("chart-data-matrix");
    expect(html).toContain('<dl class="chart-data-values"><div><dt>NAV</dt><dd>+165</dd></div><div><dt>Meaning</dt><dd>On-ice offensive value</dd></div></dl>');
  });

  it("switches to keyed headers inside narrow panels only", () => {
    const css = read("app/globals.css");

    expect(css).toContain(".chart-data { container-type: inline-size; }");
    expect(css).toMatch(/@container \(max-width: 400px\) \{[\s\S]*?\.chart-data-matrix \.chart-data-key \{ display: inline;/);
    expect(css).toContain(".chart-data-key, .chart-data-legend { display: none; }");
  });
});

describe("Trade Machine share link feedback", () => {
  const qtm = read("app/components/QuickTradeMachine.tsx");

  it("shows a busy state and blocks duplicate activation", () => {
    expect(qtm).toContain("disabled={!verdict || shareBuilding}");
    expect(qtm).toContain("aria-busy={shareBuilding}");
    expect(qtm).toContain('{shareBuilding ? "Building link…" : shareUrl ? "Show share link" : "Generate Share Link"}');
    expect(qtm).toContain("if (!homeTeam || !partnerTeam || !verdict || shareBuilding) return;");
    // A repeat tap shows the existing link instead of minting another.
    expect(qtm).toContain("if (shareUrl) { revealShareLink(); return; }");
  });

  it("announces progress and brings the finished link into view", () => {
    expect(qtm).toContain('<p role="status" aria-live="polite"');
    expect(qtm).toContain("Share link ready — the verdict is locked into it.");
    expect(qtm).toContain('shareSectionRef.current?.scrollIntoView({ block: "nearest", behavior: "auto" });');
    // The link renders directly under the controls, before the verdict, so a
    // second tap lands on the same (now idempotent) button.
    expect(qtm.indexOf('<section ref={shareSectionRef}')).toBeLessThan(qtm.indexOf("{verdict && <VerdictSummary verdict={verdict} />}"));
    expect(qtm).toContain("shareInputRef.current?.focus({ preventScroll: true });");
    // A fresh link is revealed after the commit that renders it, not on a
    // next-frame guess that can run before the section exists.
    expect(qtm).toMatch(/useEffect\(\(\) => \{\s*if \(!shareUrl \|\| !revealWhenRendered\.current\) return;/);
  });

  it("offers an accessible error with retry that keeps the trade", () => {
    const errorBlock = qtm.slice(qtm.indexOf("{shareError && ("), qtm.indexOf("{verdict && <VerdictSummary verdict={verdict} />}"));

    expect(errorBlock).toContain('<div role="alert">');
    expect(errorBlock).toContain('title="Couldn\'t build the share link"');
    expect(errorBlock).toContain("onRetry={createShare}");
    // The share failure no longer replaces the page-level error or clears the verdict.
    expect(qtm).not.toContain("Couldn't build the share link — re-run the GM Audit and try again.");
  });

  it("holds placeholders back on the shared page until league data loads, but shows the locked verdict", () => {
    const shared = qtm.slice(qtm.indexOf("export function SharedTradeView"), qtm.indexOf("export default function QuickTradeMachine"));

    expect(shared).toContain("setLeagueLoaded(true);");
    expect(shared).toContain("{(leagueLoaded || error) && <DataContextRail");
    expect(shared).toContain('<div role="status" aria-live="polite" aria-busy="true"');
    expect(shared).toContain("Loading the traded players…");
    // The verdict renders from the payload regardless of league data.
    expect(shared).toContain("{payload.lockedVerdict && <VerdictSummary verdict={payload.lockedVerdict} />}");
  });

  it("names the salary-retention control and keeps team-picker focus visible", () => {
    expect(qtm).toContain("aria-label={`Salary retained on ${asset.name}`}");
    expect(qtm).toContain('className="min-h-6 border px-2 py-1 text-[10px] font-mono bg-transparent"');
    expect(qtm).not.toContain('tracking-[0.08em] bg-transparent outline-none"');
  });
});
