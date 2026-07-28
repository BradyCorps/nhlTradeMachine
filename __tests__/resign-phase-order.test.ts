// ── OFF2: RFA business before UFA business ───────────────────────
// A club qualifies and re-signs its restricted free agents before the UFA
// market opens, and an RFA walked is team control surrendered — where a UFA was
// leaving regardless. Presenting them mixed makes the user re-derive that
// priority from a chip on every row.
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { sortPendingByRights, type OffseasonPending } from "@/app/lib/free-agency";
import type { Asset } from "@/app/lib/trade-types";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const fa = (name: string, status: "RFA" | "UFA", aav: number): OffseasonPending => ({
  player: { id: name, name, teamId: "WPG", position: "C", age: 26 } as Asset,
  contract: { aav, term: 4, status, resignProbability: 0.8, tier: "TOP" },
});

describe("sortPendingByRights", () => {
  it("puts every restricted free agent ahead of every unrestricted one", () => {
    const sorted = sortPendingByRights([
      fa("ufa-big", "UFA", 9),
      fa("rfa-small", "RFA", 1.2),
      fa("ufa-small", "UFA", 1),
      fa("rfa-big", "RFA", 8),
    ]);
    expect(sorted.map(p => p.contract.status)).toEqual(["RFA", "RFA", "UFA", "UFA"]);
  });

  it("orders by cap commitment within each group — the decisions that set the budget", () => {
    const sorted = sortPendingByRights([
      fa("rfa-small", "RFA", 1.2),
      fa("rfa-big", "RFA", 8),
      fa("ufa-small", "UFA", 1),
      fa("ufa-big", "UFA", 9),
    ]);
    expect(sorted.map(p => p.player.name)).toEqual(["rfa-big", "rfa-small", "ufa-big", "ufa-small"]);
  });

  it("breaks ties by name so the order never jitters between renders", () => {
    const a = sortPendingByRights([fa("Zeta", "RFA", 5), fa("Alpha", "RFA", 5)]);
    const b = sortPendingByRights([fa("Alpha", "RFA", 5), fa("Zeta", "RFA", 5)]);
    expect(a.map(p => p.player.name)).toEqual(["Alpha", "Zeta"]);
    expect(a.map(p => p.player.name)).toEqual(b.map(p => p.player.name));
  });

  it("does not mutate the input", () => {
    const input = [fa("ufa", "UFA", 9), fa("rfa", "RFA", 1)];
    const before = input.map(p => p.player.name);
    sortPendingByRights(input);
    expect(input.map(p => p.player.name)).toEqual(before);
  });

  it("handles an empty list and an all-one-status list", () => {
    expect(sortPendingByRights([])).toEqual([]);
    expect(sortPendingByRights([fa("a", "UFA", 3)]).map(p => p.player.name)).toEqual(["a"]);
  });
});

describe("OFF2 — Re-Sign screen accessibility", () => {
  const src = () => read("app/components/ResignPhase.tsx");

  it("has no text below the 10px AA floor", () => {
    const sizes = [...src().matchAll(/text-\[(\d+)px\]/g)].map(m => Number(m[1]));
    expect(sizes.length).toBeGreaterThan(0);
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(10);
  });

  it("never suppresses the global focus ring", () => {
    // outline-none on a search input leaves keyboard users with no indicator.
    expect(src()).not.toContain("outline-none");
  });

  it("labels both search inputs — a placeholder is not a label", () => {
    const s = src();
    expect(s).toContain('aria-label="Search your roster to release a player"');
    expect(s).toContain('aria-label="Search the free-agent market"');
  });

  it("announces cap space, the number every decision is judged against", () => {
    expect(src()).toContain('aria-live="polite"');
  });

  it("marks the rights status in words, not colour alone", () => {
    expect(src()).toContain("{fa.contract.status}");
  });

  it("uses real headings and list semantics", () => {
    const s = src();
    expect(s).toMatch(/<h3[^>]*>\s*\n\s*Your Pending Free Agents/);
    expect(s).toMatch(/<h3[^>]*>\s*\n\s*Free-Agent Market/);
    expect(s).toContain('<ul role="list"');
  });

  it("orders the pending list through the shared rule", () => {
    expect(src()).toContain("sortPendingByRights(pending)");
  });
});
