import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CardStrandCompare from "@/app/components/CardStrandCompare";

const read = (path: string) => readFileSync(path, "utf8");
const players = [
  { id: "8478402", name: "Connor McDavid", teamId: "EDM", position: "C" },
  { id: "8477934", name: "Leon Draisaitl", teamId: "EDM", position: "C" },
  { id: "8480069", name: "Cale Makar", teamId: "COL", position: "D" },
];

describe("STRAND DNA on the shareable player card", () => {
  it("renders a labelled search, not a league-sized select, and the STRAND view", () => {
    const html = renderToStaticMarkup(React.createElement(CardStrandCompare, { player: players[0], allPlayers: players }));

    expect(html).toContain(">STRAND DNA</h3>");
    expect(html).toContain("Compare with another forward");
    expect(html).toContain('type="search"');
    expect(html).not.toContain("<select");
    // Nothing is offered until two letters are typed.
    expect(html).toContain("Type at least 2 letters.");
    expect(html).not.toContain("card-strand-matches");
    // StrandView's own loading state until the league cohort arrives.
    expect(html).toContain("Loading league percentiles");
  });

  it("offers at most six same-position matches through the shared search helper", () => {
    const source = read("app/components/CardStrandCompare.tsx");

    expect(source).toContain("const MAX_MATCHES = 6;");
    expect(source).toContain("filterPlayersBySearch(pool, query, p => p.teamId).slice(0, MAX_MATCHES)");
    expect(source).toContain("posGroupOf(p.position) === group");
    expect(source).toContain("p.id !== player.id");
    // Reuses the shared STRAND derivation rather than a second one.
    expect(source).toContain('import StrandView from "@/app/components/StrandView";');
    expect(source).toContain("compareAsset={compare as unknown as Asset | null}");
  });

  it("sits outside the exported plate so the PNG export is unchanged", () => {
    const card = read("app/components/PercentileCard.tsx");
    const plateEnd = card.indexOf("{/* STRAND DNA with a searchable comparison");
    const exportButton = card.indexOf("onClick={exportPng}");

    expect(plateEnd).toBeGreaterThan(card.indexOf('<div className="pcard-foot">'));
    expect(card.indexOf("<CardStrandCompare player={player} allPlayers={allPlayers} />")).toBeGreaterThan(plateEnd);
    expect(exportButton).toBeGreaterThan(plateEnd);
  });

  it("keeps controls touch-sized and the search input zoom-safe on phones", () => {
    const css = read("app/globals.css");

    expect(css).toMatch(/\.card-strand-search input \{[^}]*min-height: 44px;[^}]*font-size: 16px;/);
    expect(css).toMatch(/\.card-strand-matches \{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(150px, 1fr\)\);/);
  });
});
