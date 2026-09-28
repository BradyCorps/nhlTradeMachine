import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import CardStrandCompare from "@/app/components/CardStrandCompare";
import { cardStrandProfile, validatePublicCardImagePayload } from "@/app/lib/card-payload";
import { buildStrandPercentiles } from "@/app/lib/strand-metrics";

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

  it("includes the selected STRAND comparison in the PNG payload and renderer", () => {
    const card = read("app/components/PercentileCard.tsx");
    const renderer = read("app/api/card-image/route.tsx");
    expect(card).toContain("onCompareChange={selected => setCompareSelection");
    expect(card).toContain("primary: cardStrandProfile(player, cohort)");
    expect(card).toContain("compare: compare ? cardStrandProfile(compare, cohort) : null");
    expect(renderer).toContain("STRAND DNA · POSITION PERCENTILES");
    expect(renderer).toContain("data.strand.compare?.off");
    expect(renderer).toContain("data.strand.compare?.def");
  });

  it("exports the canonical percentile rails and rejects malformed STRAND values", () => {
    const cohort = Array.from({ length: 20 }, (_, i) => ({ ops: i, xGPace: i, xgRelTM: i, avgTOI: i, dps: i, xgaRelTM: -i, qocIndex: i, dzPct: i }));
    const player = { name: "Primary", position: "C", ...cohort[10] };
    const profile = cardStrandProfile(player, cohort);
    const canonical = buildStrandPercentiles(player, cohort, false);
    expect(profile.off).toEqual(canonical.off.map(({ label, percentile }) => ({ label, percentile })));
    expect(profile.def).toEqual(canonical.def.map(({ label, percentile }) => ({ label, percentile })));

    const payload = {
      name: "Primary", sub: "EDM · C", xnavTotal: 10,
      capHitLabel: "$1M", yearsLabel: "1 yr", fmvLabel: "$2M",
      surplusLabel: "+$1M", surplusColor: "#146a24", gravity: null,
      edgeCells: [], stats: [], navCells: [], peerLabel: "all forwards", avgPercentile: 50,
      strand: { cohortLabel: "all forwards · ≥20 GP", primary: profile, compare: profile },
    };
    expect(validatePublicCardImagePayload(payload).success).toBe(true);
    expect(validatePublicCardImagePayload({ ...payload, strand: {
      ...payload.strand, primary: { ...profile, off: [{ label: "OPS", percentile: Infinity }, ...profile.off.slice(1)] },
    } }).success).toBe(false);
  });

  it("keeps controls touch-sized and the search input zoom-safe on phones", () => {
    const css = read("app/globals.css");

    expect(css).toMatch(/\.card-strand-search input \{[^}]*min-height: 44px;[^}]*font-size: 16px;/);
    expect(css).toMatch(/\.card-strand-matches \{[^}]*grid-template-columns: repeat\(auto-fill, minmax\(150px, 1fr\)\);/);
  });

  it("keeps the dossier link outside the tablist and median text legible on inset paper", () => {
    const playersPage = read("app/players/page.tsx");
    const card = read("app/components/PercentileCard.tsx");
    expect(playersPage).toMatch(/<div role="tablist"[^>]*>[\s\S]*?<\/div>\s*\{hasDossier && \(/);
    expect(card).toMatch(/\.pcard-med \{[^}]*color: #4a3820;/);
    expect(card).toMatch(/\.pcard-nodata \{[^}]*color: #4a3820;/);
  });
});
