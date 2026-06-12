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

      it("injects team-assigned DB players missing from the live roster feed", () => {
        expect(src).toContain("Inject DB roster rows");
        expect(src).toContain("}).from(playersTable);");
        expect(src).toContain("slugify(x.name) === dbSlug");
      });

      it("uses DB contract fields ahead of scraper values for matching players", () => {
        expect(src).toContain("capHit:         b?.capHit ?? cw.capHit");
        expect(src).toContain("yearsRemaining: b?.yearsRemaining ??");
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

describe("Canary — Team DNA Usage trait", () => {
  it("computeRosterStrand uses qocIndex, not the dead legacy qocRank", () => {
    const src = read("app/trade/page.tsx");
    // qocRank is null on every player now — norm(400 - 400) pinned every
    // team's Usage at 0, producing a constant -62 gap vs the champ template.
    expect(src).not.toContain("qocRank ?? 400");
    expect(src).toContain("def.Usage+= norm(p.qocIndex ?? 35, 0, 100)");
  });
});

describe("Canary — trade block mechanics", () => {
  it("evaluate route hard-declines untouchables from the partner side", () => {
    const src = read("app/api/evaluate/route.ts");
    expect(src).toContain('"UNTOUCHABLE"');
    expect(src).toMatch(/tradeBlockStatus === "untouchable"/);
    expect(src).toContain("will not trade him");
  });

  it("evaluate route passes tradeBlockStatus through to the engine", () => {
    const src = read("app/api/evaluate/route.ts");
    expect(src).toContain("tradeBlockStatus: asset.tradeBlockStatus");
  });

  it("evaluate route does not protect elite assets that are being shopped", () => {
    const src = read("app/api/evaluate/route.ts");
    expect(src).toContain('a.tradeBlockStatus === "available" || a.tradeBlockStatus === "requested"');
    expect(src).toMatch(/navOf\(a\) > 260 && !isShoppedAsset\(a\)/);
  });

  it("engine applies the trade-request leverage discount", () => {
    const engine = read("app/lib/xnav-engine.ts");
    expect(engine).toContain("applyTradeRequestDiscount");
    expect(engine).toMatch(/tradeBlockStatus !== "requested"/);
  });

  it("proposal generator excludes untouchables from return packages", () => {
    const src = read("app/lib/trade-logic.ts");
    expect(src).toMatch(/tradeBlockStatus !== "untouchable"/);
    // preScreen veto
    expect(src).toMatch(/partnerSends\.some\(a => a\.tradeBlockStatus === "untouchable"\)/);
  });

  it("WhatWeNeed surfaces block players and hides untouchables", () => {
    const src = read("app/lib/need-targets.ts");
    expect(src).toContain("tradeBlockStatus");
    expect(src).toContain("flagged untouchable");
    expect(src).toContain("On the trade block");
  });

  it("match route names the best-fitting shopped player as the return", () => {
    const src = read("app/api/match/route.ts");
    expect(src).toContain("fits as the return");
  });
});

describe("Canary — trade UI negative NAV", () => {
  it("TugBar and trade page preserve all-negative package values instead of displaying compressed zero", () => {
    const tradePage = read("app/trade/page.tsx");
    const tugBar = read("app/components/TugBar.tsx");
    expect(tradePage).toContain("const displayNavA = cNavA > 0 ? cNavA : navA");
    expect(tradePage).toContain("const displayNavB = cNavB > 0 ? cNavB : navB");
    expect(tradePage).toContain("const homeNetGain = displayNavB - displayNavA");
    expect(tugBar).toContain("{dispA.toFixed(0)} ←→ {dispB.toFixed(0)} NAV");
  });

  it("AssetCard only shows the proposal lightning action on the home side", () => {
    const src = read("app/components/AssetCard.tsx");
    expect(src).toContain("!isPick && idx === 0");
    expect(src).toContain("onRequestTrade?.(asset)");
  });
});

describe("Canary — admin cache flush", () => {
  it("clear-cache flushes BOTH the teams and contracts caches", () => {
    const src = read("app/api/admin/clear-cache/route.ts");
    expect(src).toContain("cache:teams");
    expect(src).toContain("cache:contracts");
    expect(src).toContain("cache:contracts:v2");
  });
});

describe("Canary — admin contract sync", () => {
  const route = read("app/api/admin/contracts/route.ts");
  const page = read("app/admin/contracts/page.tsx");

  it("live delta keeps scraper team and position metadata for sync", () => {
    expect(route).toContain("position: cw.position");
    expect(route).toContain("teamSlug: cw.teamSlug");
  });

  it("sync updates existing rows instead of only inserting missing players", () => {
    expect(route).toContain("existingById");
    expect(route).toContain("existingByName");
    expect(route).toContain("existingById.get(id) ?? existingByName.get(id)");
    expect(route).toContain(".normalize(\"NFD\")");
    expect(route).toContain("await db.update(playersTable).set(updates)");
    expect(route).toContain("updatedEntries");
  });

  it("sync backfills scraper metadata when the client payload is stale", () => {
    expect(route).toContain("needsMetadata");
    expect(route).toContain("teamSlug: cw.teamSlug ?? live.teamSlug");
  });

  it("sync falls back to NHL rosters when CapWages has no team", () => {
    expect(route).toContain("fetchNhlRosterTeamMap");
    expect(route).toContain("teamIdFromSlug(cw.teamSlug) ?? rosterFallback?.teamId");
  });

  it("sync reports updated counts in the admin toast", () => {
    expect(page).toContain("${data.added} added, ${data.updated ?? 0} updated");
    expect(page).toContain("resolvedTeamId");
  });
});
