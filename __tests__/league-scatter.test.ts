import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  MAX_COMPARISONS, QUADRANT_LABEL, axisDomain, comparisonRows, leagueMedians, matchingIds, quadrantOf,
  signedDelta, toggleComparison, upperMedian, type ScatterPeer,
} from "../app/lib/league-scatter";
import NavLeagueScatter from "../app/components/NavLeagueScatter";

const peer = (i: number, over: Partial<ScatterPeer> = {}): ScatterPeer => ({
  id: String(1000 + i), name: `Player ${i} Skater`, teamId: ["WPG", "FLA", "EDM", "COL"][i % 4],
  off: 10 + i * 3, def: 40 - i, nav: 20 + i * 2, age: 24 + (i % 10), ...over,
});
const current = peer(0, { id: "8482149", name: "Cole Perfetti", teamId: "WPG", off: 55, def: 18, nav: 71 });
const peers = Array.from({ length: 30 }, (_, i) => peer(i + 1));
const all = [current, ...peers];
const ids = new Set(all.map(p => p.id));

describe("scatter cohort and reference lines", () => {
  it("uses the same upper median of the whole cohort as the previous chart", () => {
    // The previous implementation, verbatim.
    const legacy = (vals: number[]) => { const s = [...vals].sort((a, b) => a - b); return s[Math.floor(s.length / 2)]; };
    expect(leagueMedians(all)).toEqual({ off: legacy(all.map(p => p.off)), def: legacy(all.map(p => p.def)) });
    expect(upperMedian([1, 2, 3, 4])).toBe(3);
    expect(upperMedian([5])).toBe(5);
  });
  it("keeps the previous axis padding rule", () => {
    const [lo, hi] = axisDomain([10, 110], 20);
    expect(lo).toBeCloseTo(10 - 8) ; expect(hi).toBeCloseTo(110 + 8);
    expect(axisDomain([50, 50], 20)).toEqual([30, 70]); // zero span falls back
  });
  it("search highlights members without changing the cohort, the medians or the ranking", () => {
    const before = JSON.stringify(all), medBefore = leagueMedians(all);
    const hit = matchingIds(peers, "player 7");
    expect(hit.size).toBeGreaterThan(0);
    expect([...hit].every(id => ids.has(id))).toBe(true);
    expect(JSON.stringify(all)).toBe(before);
    expect(leagueMedians(all)).toEqual(medBefore);
    expect(matchingIds(peers, "   ").size).toBe(0);
    expect(matchingIds(peers, "fla").size).toBeGreaterThan(0);         // club names match too
    expect(matchingIds(peers, "no such skater").size).toBe(0);
  });
});

describe("comparison selection", () => {
  it("adds up to three, removes on repeat, and refuses a fourth", () => {
    let sel: string[] = [];
    for (const id of ["1001", "1002", "1003"]) {
      const r = toggleComparison(sel, id, current.id, ids);
      expect(r.change).toBe("added"); sel = r.next;
    }
    expect(sel).toEqual(["1001", "1002", "1003"]);
    const fourth = toggleComparison(sel, "1004", current.id, ids);
    expect(fourth).toMatchObject({ change: "rejected", reason: "full" });
    expect(fourth.next).toEqual(sel);
    expect(toggleComparison(sel, "1002", current.id, ids)).toEqual({ next: ["1001", "1003"], change: "removed" });
    expect(MAX_COMPARISONS).toBe(3);
  });
  it("never selects the dossier player or someone outside the cohort", () => {
    expect(toggleComparison([], current.id, current.id, ids)).toMatchObject({ change: "rejected", reason: "current" });
    expect(toggleComparison([], "999999", current.id, ids)).toMatchObject({ change: "rejected", reason: "unknown" });
  });
  it("table rows put the dossier player first and keep exact values and differences", () => {
    const rows = comparisonRows(current, [peers[4], peers[1]]);
    expect(rows.map(r => r.name)).toEqual(["Cole Perfetti", peers[4].name, peers[1].name]);
    expect(rows[0]).toMatchObject({ isCurrent: true, vs: null, off: 55, def: 18, nav: 71 });
    expect(rows[1].vs).toEqual({ off: peers[4].off - 55, def: peers[4].def - 18, nav: peers[4].nav - 71 });
    expect(signedDelta(-3.4)).toBe("-3"); expect(signedDelta(0)).toBe("0"); expect(signedDelta(2)).toBe("+2");
  });
});

describe("neutral quadrant wording", () => {
  it("describes position against the medians and nothing about ability", () => {
    const med = { off: 40, def: 30 };
    expect(quadrantOf({ off: 41, def: 31 }, med)).toBe("both-above");
    expect(quadrantOf({ off: 41, def: 10 }, med)).toBe("off-only");
    expect(quadrantOf({ off: 10, def: 31 }, med)).toBe("def-only");
    expect(quadrantOf({ off: 10, def: 10 }, med)).toBe("both-below");
    expect(quadrantOf({ off: 40, def: 30 }, med)).toBe("both-above"); // on the line counts as at-or-above, as before
    for (const label of Object.values(QUADRANT_LABEL)) expect(label).toMatch(/median/i);
    for (const label of Object.values(QUADRANT_LABEL)) expect(label).not.toMatch(/elite|star|best|worst|depth|two-way/i);
  });
});

describe("rendered controls and tables (server markup; the SVG itself needs a browser)", () => {
  const html = renderToStaticMarkup(React.createElement(NavLeagueScatter, {
    peers, currentPlayer: current, playerName: current.name, cohortLabel: "forwards · ≥20 GP · 2025-26",
  }));
  it("says the axes are NAV contributions, not percentiles or ratings", () => {
    expect(html).toMatch(/contributions to X-NAV, in NAV points/);
    expect(html).toMatch(/not percentiles and not overall player ratings/);
    expect(html).toMatch(/Offensive contribution to NAV/);
    expect(html).toMatch(/Ranked among forwards · ≥20 GP · 2025-26/);
  });
  it("has the search, a reset action, and exact values for the dossier player", () => {
    expect(html).toMatch(/role="combobox"/);
    expect(html).toMatch(/Add up to 3 comparison players/);
    expect(html).toMatch(/Reset comparisons/);
    expect(html).toMatch(/Cole Perfetti · this player/);
    expect(html).toMatch(/Exact contributions, NAV points/);
  });
  it("does not create a tab stop per point", () => {
    const stops = (html.match(/tabindex="0"/gi) ?? []).length;
    const buttons = (html.match(/<button/gi) ?? []).length;
    expect(stops).toBeLessThanOrEqual(3);      // the two scroll regions at most
    expect(buttons).toBeLessThanOrEqual(2);    // reset (and an empty selection has no chips)
    expect(html).not.toMatch(/<circle[^>]*role="button"/);
  });
  it("lists every plotted player once in the read-only table", () => {
    const rows = (html.match(/<tr[^>]*style="border-bottom/g) ?? []).length;
    expect(rows).toBeGreaterThanOrEqual(all.length);
  });
  it("renders nothing when fewer than five players are plotted", () => {
    const tiny = renderToStaticMarkup(React.createElement(NavLeagueScatter, { peers: peers.slice(0, 2), currentPlayer: current, playerName: current.name }));
    expect(tiny).toBe("");
  });
});
