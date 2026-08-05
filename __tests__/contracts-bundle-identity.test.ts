import { describe, it, expect } from "vitest";
import bundle from "@/app/data/contracts.bundled.json";
import seed from "@/app/data/league-seed.json";
import { makePlayerId, nicknameMergeKey } from "@/app/lib/player-identity";

// ── One player, one row ──────────────────────────────────────────
//
// The bundle is a name-keyed object, and everything downstream keys on the
// player id — which strips accents, dots and case. So two keys can be one
// player, and the file cannot tell you: whichever the seed writes last wins,
// silently, and the other contract disappears without a word.
//
// It had three such pairs, each holding DIFFERENT money:
//
//   Alexis Lafreniere $6.5M × 6   vs  Alexis Lafrenière $7.45M × 7
//   JT Miller         $8M × 3 NTC vs  J.T. Miller       $8M × 4
//   Matt Savoie       $1.1M × 2   vs  Matthew Savoie    $0.887M × 3
//
// Nobody found them by reading the file. They surfaced because the name
// matcher refused to guess between two spellings and reported the conflict.
// This is the check that means the next one is caught by a test run instead.

const entries = Object.keys(bundle as Record<string, unknown>);

/** Group the keys by whatever collapses them, and keep only the collisions. */
const collisions = (key: (name: string) => string): [string, string[]][] => {
  const by = new Map<string, string[]>();
  for (const name of entries) {
    const k = key(name);
    const bucket = by.get(k);
    if (bucket) bucket.push(name);
    else by.set(k, [name]);
  }
  return [...by.entries()].filter(([, names]) => names.length > 1);
};

describe("contracts.bundled.json — one player, one row", () => {
  it("has no two keys that resolve to the same player id", () => {
    // A hard failure, not a warning: two rows for one id means one of the two
    // contracts in the file is already unreachable.
    expect(collisions(makePlayerId)).toEqual([]);
  });

  it("has no two keys that are spelling variants of each other", () => {
    // Looser than the id check — this is what catches Matt/Matthew, where the
    // ids genuinely differ and the seed writes two separate players.
    //
    // If two real, distinct players ever collide here (a Nicholas and a Nick
    // who are not the same person), this assertion is the place to allow the
    // pair explicitly rather than to relax the rule.
    expect(collisions(nicknameMergeKey)).toEqual([]);
  });

  it("still holds the whole league", () => {
    // A dedupe that quietly emptied the file would pass both checks above.
    expect(entries.length).toBeGreaterThan(1400);
  });
});

// ── The seed built from it ───────────────────────────────────────
//
// league-seed.json is what "Load baseline" writes into the players table, and
// it is generated from the bundle by de-duplicating on the derived id — first
// key wins. That is exactly how the wrong Lafrenière shipped: the stale
// "Alexis Lafreniere" ($6.5M × 6) sorted ahead of the real "Alexis Lafrenière"
// ($7.45M × 7), so the generator kept the stale one and dropped the other
// without a word. Fixing the bundle fixed the seed; these keep it fixed.

const seedRows = (seed as { players: { id: string; name: string; position: string }[] }).players;

describe("league-seed.json — the baseline the DB is loaded from", () => {
  it("has no repeated row id", () => {
    const ids = seedRows.map(r => r.id);
    expect(ids.length).toBe(new Set(ids).size);
  });

  it("gives same-named players distinct ids rather than losing one", () => {
    // Two people can share a name — Vancouver's two Elias Petterssons. The
    // generator salts the second id with a position so both survive. What must
    // never happen is two rows sharing a name AND an id, which is one player's
    // contract silently overwriting another's.
    const byName = new Map<string, { id: string; position: string }[]>();
    for (const r of seedRows) {
      const bucket = byName.get(r.name);
      if (bucket) bucket.push(r); else byName.set(r.name, [r]);
    }
    for (const [name, rows] of byName) {
      if (rows.length === 1) continue;
      expect(new Set(rows.map(r => r.id)).size, `${name} shares an id`).toBe(rows.length);
      // And they must be tellable apart downstream, which is what the salt is.
      expect(new Set(rows.map(r => r.position)).size, `${name} shares a position`).toBe(rows.length);
    }
  });

  it("carries the corrected contracts the duplicates were hiding", () => {
    const row = (name: string) => seedRows.find(r => r.name === name) as unknown as
      { capHit: number; yearsRemaining: number } | undefined;
    expect(row("Alexis Lafrenière")).toMatchObject({ capHit: 7.45, yearsRemaining: 7 });
    // PuckPedia: $886,666, year 3 of 3 — and `yearsRemaining` counts the
    // current season, so the final year of a deal is 1, not 3.
    expect(row("Matthew Savoie")).toMatchObject({ capHit: 0.887, yearsRemaining: 1 });
    expect(seedRows.some(r => r.name === "Matt Savoie")).toBe(false);
  });
});
