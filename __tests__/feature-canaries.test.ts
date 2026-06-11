// ── Feature Canaries ─────────────────────────────────────────────────────────
// These tests exist because three working features were silently lost during
// refactors: the contracts DB backfill, the draftee injection, and the trade
// block stamping. Each canary fails loudly if a load-bearing code path is
// deleted again. If one of these fails, the feature it guards was REMOVED —
// do not "fix" the test; restore the feature.

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import { calcNAV, calcProspectNAV } from "../app/lib/xnav-engine";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const LEAGUE_ROUTES = [
  "app/api/league/players/route.ts",
  "app/api/league/route.ts",
];

describe("Canary — engine prospect path", () => {
  it("calcProspectNAV exists and values a #1 overall around first-overall pick value", () => {
    const nav = calcProspectNAV({
      id: "p", name: "Top Pick", position: "C", age: 18,
      capHit: 0.95, yearsRemaining: 3, draftOverall: 1,
    });
    // #1 overall ≈ 400-pick value × 1.10 certainty
    expect(nav.total).toBeGreaterThan(300);
  });

  it("calcNAV routes draftees (games < 14, no live stats) through the pedigree path", () => {
    const draftee = calcNAV({
      id: "d", name: "Draftee", position: "C", age: 18,
      capHit: 0.95, yearsRemaining: 3,
      draftOverall: 2, games: 0, hasLiveStats: false,
    });
    const sameButUndrafted = calcNAV({
      id: "u", name: "Undrafted", position: "C", age: 18,
      capHit: 0.95, yearsRemaining: 3, games: 0, hasLiveStats: false,
    });
    // The pedigree path must produce a dramatically different (higher) value
    // than the stats path would for a player with zero production.
    expect(draftee.total).toBeGreaterThan(200);
    expect(draftee.total).toBeGreaterThan(sameButUndrafted.total + 100);
  });
});

describe("Canary — league route features (source-level)", () => {
  for (const route of LEAGUE_ROUTES) {
    describe(route, () => {
      const src = read(route);

      it("injects drafted prospects from the DB", () => {
        expect(src).toContain("isNotNull(playersTable.draftOverall)");
      });

      it("stamps trade block status onto players", () => {
        expect(src).toContain("tradeBlockTable");
        expect(src).toContain("tradeBlockStatus");
      });

      it("skips fuzzy stats fallbacks for draftees (false-positive guard)", () => {
        expect(src).toContain("!isDraftee");
      });

      it("backfills DB contracts when the scraper drops a player", () => {
        // The loop that rescues admin-edited contracts for players CapWages
        // no longer lists (expired deals at rollover, parse rejects)
        expect(src).toMatch(/Backfill: DB players the scraper/);
      });

      it("defaults draftees to 0 games so the pedigree NAV path triggers", () => {
        expect(src).toMatch(/draftOverall != null \? \(stats\?\.games \?\? 0\)/);
      });
    });
  }
});

describe("Canary — engine inputs", () => {
  const engine = read("app/lib/xnav-engine.ts");

  it("AssetInput carries prospect pedigree fields", () => {
    expect(engine).toContain("draftOverall?:");
    expect(engine).toContain("prospectPtsPace?:");
  });

  it("AssetInput carries multi-season baseline fields", () => {
    for (const f of ["baselineXgRel", "pairDriverScore", "baselineHdsvPct", "pkTimeShare"]) {
      expect(engine).toContain(f);
    }
  });

  it("QoC Index (0-100) is consumed, not the legacy rank sum", () => {
    expect(engine).toContain("qocIndex");
  });
});

describe("Canary — admin cache flush", () => {
  it("clear-cache flushes BOTH the teams and contracts caches", () => {
    const src = read("app/api/admin/clear-cache/route.ts");
    expect(src).toContain("cache:teams");
    expect(src).toContain("cache:contracts");
  });
});
