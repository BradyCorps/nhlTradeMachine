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
import { parseWikipediaDraftProspects } from "../app/lib/prospect-enrichment";

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

  it("calcNAV routes NHLe-only prospects through modest prospect value, not ELC surplus", () => {
    const kevinHeStyle = calcNAV({
      id: "kevin-he", name: "Kevin He", position: "W", age: 19,
      capHit: 0.925, yearsRemaining: 3,
      prospectPtsPace: 32, games: 0, hasLiveStats: false,
    });

    expect(kevinHeStyle.total).toBeGreaterThan(5);
    expect(kevinHeStyle.total).toBeLessThan(25);
    expect(kevinHeStyle.cap).toBe(0);
    expect(kevinHeStyle.age).toBe(0);
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

      it("does not use surname-only skater stats fallbacks", () => {
        expect(src).not.toContain("buildFallbackMap");
        expect(src).not.toContain("fbMap.get(last)");
        expect(src).toContain("hasDiacritics(p.name)");
      });

      it("backfills DB contracts when the scraper drops a player", () => {
        // The loop that rescues admin-edited contracts for players CapWages
        // no longer lists (expired deals at rollover, parse rejects)
        expect(src).toMatch(/Backfill: DB players the scraper/);
      });

      it("defaults draftees to 0 games so the pedigree NAV path triggers", () => {
        expect(src).toContain("const games = draftOverall != null");
        expect(src).toContain("? (stats?.games ?? 0)");
      });

      it("merges DB pedigree fields onto matching live roster rows", () => {
        expect(src).toContain("draftYear:       playersTable.draftYear");
        expect(src).toContain("const existing = list.find");
        expect(src).toContain("existing.draftYear = existing.draftYear ?? d.draftYear");
        expect(src).toContain("existing.draftOverall = existing.draftOverall ?? d.draftOverall");
        expect(src).toContain("existing.prospectPtsPace = existing.prospectPtsPace ?? d.prospectPtsPace");
        expect(src).toContain("draftYear: draftYear ?? null");
      });

      it("filters DB-only older no-signal minor-league players out of trade assets", () => {
        expect(src).toContain("injectedFromDb:   true");
        expect(src).toContain("const hasProspectSignal");
        expect(src).toContain("p.injectedFromDb && !stats && !goalieStats && !hasProspectSignal && p.age >= 24");
        expect(src).toContain("stats?.games ?? goalieStats?.gamesStarted ?? 0");
      });

      it("enriches known synced prospects before NAV evaluation", () => {
        expect(src).toContain("fetchProspectEnrichmentMap");
        expect(src).toContain("PROSPECT_ENRICHMENT[slug]");
        expect(src).toContain("const draftOverall = p.draftOverall ?? prospectOverride?.draftOverall");
        expect(src).toContain("prospectPtsPace:  prospectPtsPace ?? null");
      });
    });
  }
});

describe("Canary — draft prospect enrichment", () => {
  const src = read("app/lib/prospect-enrichment.ts");

  it("parses public draft tables into normalized prospect pedigree", () => {
    const parsed = parseWikipediaDraftProspects(`
      <table><tbody>
        <tr><th>23</th><td><a href="/wiki/Stian_Solberg">Stian Solberg</a> (D)</td><td>Anaheim Ducks</td></tr>
        <tr><th>109</th><td><a href="/wiki/Kevin_He">Kevin He</a> (LW)</td><td>Winnipeg Jets</td></tr>
      </tbody></table>
    `, 2024);

    expect(parsed["stian-solberg"]).toEqual({ draftYear: 2024, draftOverall: 23 });
    expect(parsed["kevin-he"]).toEqual({ draftYear: 2024, draftOverall: 109 });
  });

  it("does not contain name-specific prospect production overrides", () => {
    expect(src).not.toContain("MANUAL_NHLE");
    expect(src).not.toContain("kevin-he");
    expect(src).not.toContain("stian-solberg");
  });
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

  it("AssetCard exposes development profile as its own tab without affecting NAV controls", () => {
    const card = read("app/components/AssetCard.tsx");
    const src = read("app/components/DevelopmentProfilePanel.tsx");
    expect(card).toContain('type AssetCardView = "STATS" | "STRAND" | "TIMELINE" | "DEV"');
    expect(card).toContain('...(hasDevelopmentProfile ? ["DEV"] : [])');
    expect(card).toContain('view === "DEV" && hasDevelopmentProfile');
    expect(card).toContain("<DevelopmentProfilePanel asset={asset} />");
    expect(src).toContain("export function DevelopmentProfilePanel");
    expect(src).toContain("asset.developmentProfile");
    expect(src).toContain("profile.developmentPhase");
    expect(src).toContain("profile.dynastyScore");
    expect(src).toContain("profile.boomBustSignal");
    expect(src).toContain("boomBustLabel");
    expect(src).toContain("Boom ${boomScore}/100");
    expect(src).toContain("{boomScore}</span>");
    expect(src).toContain("{bustScore}</span>");
    expect(src).toContain("band.floorPts82");
  });
});

describe("Canary — admin cache flush", () => {
  it("clear-cache flushes BOTH the teams and contracts caches", () => {
    const src = read("app/api/admin/clear-cache/route.ts");
    expect(src).toContain("cache:teams");
    expect(src).toContain("cache:contracts");
    expect(src).toContain("cache:contracts:v2");
    expect(src).toContain("cache:nhl_skater_summary_stats");
    expect(src).toContain("DEVELOPMENT_NHL_SUMMARY_CACHE_KEY");
    expect(src).toContain("DEVELOPMENT_TIMELINE_CACHE_KEY");
  });
});

describe("Canary — development profile diagnostics", () => {
  const src = read("app/api/admin/development-profile/route.ts");

  it("accepts external timeline rows diagnostically without changing trade value", () => {
    expect(src).toContain("export async function POST");
    expect(src).toContain("externalTimelineRows");
    expect(src).toContain("parseExternalTimelineRows");
    expect(src).toContain("externalRejectedRows");
    expect(src).toContain("fetchCachedNhlSkaterTimelineRowsForPlayer");
    expect(src).toContain("cache: timelineResult.cache");
    expect(src).toContain("tradeValueChanged: false");
  });
});

describe("Canary — development profile route exposure", () => {
  for (const route of LEAGUE_ROUTES) {
    it(`${route} exposes developmentProfile without feeding it into NAV`, () => {
      const src = read(route);
      expect(src).toContain("buildDevelopmentInputFromPlayerPayload");
      expect(src).toContain("calcDevelopmentProfile(developmentInput)");
      expect(src).toContain("developmentProfile,");
      expect(src).not.toMatch(/calcNAV\([^)]*developmentProfile[\s\S]*/);
    });
  }

  it("Asset type carries the diagnostic development profile field", () => {
    const src = read("app/lib/trade-types.ts");
    expect(src).toContain("import type { DevelopmentProfile }");
    expect(src).toContain("draftYear?: number | null");
    expect(src).toContain("developmentProfile?: DevelopmentProfile | null");
  });
});

describe("Canary — NAV client cache keys", () => {
  const client = read("app/lib/evaluate-client.ts");

  it("includes prospect valuation inputs so NHLe updates do not reuse stale NAV", () => {
    expect(client).toContain("xnav-2.1-prospect-nhle");
    expect(client).toContain("a.draftOverall ??");
    expect(client).toContain("a.prospectPtsPace ??");
  });
});

describe("Canary — development profile trade audit", () => {
  const src = read("app/api/evaluate/route.ts");
  const tradeLogic = read("app/lib/trade-logic.ts");

  it("uses development profile in GM timeline reasoning without feeding X-NAV", () => {
    expect(src).toContain("const isFutureCoreAsset");
    expect(src).toContain("const isDevelopmentRiskAsset");
    expect(src).toContain("const isPeakWindowAsset");
    expect(src).toContain("developmentProfile");
    expect(src).toContain("is selling a future-core profile");
    expect(src).toContain("development variance");
    expect(src).toContain("fits a win-now window");
    expect(src).not.toMatch(/calcNAV\([^)]*developmentProfile[\s\S]*/);
  });

  it("uses development profile in proposal fit/copy/risk without feeding X-NAV", () => {
    expect(tradeLogic).toContain("const isFutureCoreAsset");
    expect(tradeLogic).toContain("const isDevelopmentRiskAsset");
    expect(tradeLogic).toContain("const isPeakWindowAsset");
    expect(tradeLogic).toContain("developmentProfile");
    expect(tradeLogic).toContain("future-core profile");
    expect(tradeLogic).toContain("DEV VARIANCE");
    expect(tradeLogic).toContain("peak-window player");
    expect(tradeLogic).not.toMatch(/calcNAV\([^)]*developmentProfile[\s\S]*/);
  });
});

describe("Canary — admin contract sync", () => {
  const route = read("app/api/admin/contracts/route.ts");
  const page = read("app/admin/contracts/page.tsx");
  const scraper = read("app/services/scraper.ts");

  it("live delta keeps scraper team and position metadata for sync", () => {
    expect(route).toContain("position: cw.position");
    expect(route).toContain("teamSlug: cw.teamSlug");
  });

  it("sync treats dash position placeholders as missing metadata", () => {
    expect(route).toContain("pos === \"-\"");
    expect(route).toContain("first === \"-\"");
  });

  it("scraper carries age and uses contract expiry year for remaining years", () => {
    expect(scraper).toContain("yearsRemainingFromExpiry");
    expect(scraper).toContain("SEASON.label.slice(0, 4)");
    expect(scraper).toContain("age: ageNow");
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

  it("sync resolves AHL affiliate slugs to NHL parent teams", () => {
    expect(route).toContain("manitoba_moose: \"WPG\"");
    expect(route).toContain("abbotsford_canucks: \"VAN\"");
  });

  it("sync resolves lowercase NHL team abbreviations from CapWages", () => {
    expect(route).toContain("const direct = slug.trim().toUpperCase()");
    expect(route).toContain("if (isValidTeamId(direct)) return direct");
  });

  it("sync preserves an existing valid DB team when live sources do not resolve", () => {
    expect(route).toContain("const currentTeamId = isValidTeamId(current?.teamId) ? current.teamId : null");
    expect(route).toContain("?? currentTeamId ?? null");
  });

  it("sync writes scraped age into DB rows", () => {
    expect(route).toContain("age:            playersTable.age");
    expect(route).toContain("if (values.age && current.age !== values.age) updates.age = values.age");
    expect(route).toContain("age:            values.age");
  });

  it("sync reports updated counts in the admin toast", () => {
    expect(page).toContain("${data.added} added, ${data.updated ?? 0} updated");
    expect(page).toContain("resolvedTeamId");
    expect(page).toContain("info.resolvedTeamId ?? info.currentTeamId ?? \"no-team\"");
  });

  it("sync invalidates league caches after DB metadata updates", () => {
    expect(route).toContain("SYNC_CACHE_KEYS");
    expect(route).toContain("await redis.del(key)");
    expect(route).toContain("clearedCacheKeys");
    expect(route).toContain("cache:nhl_skater_summary_stats");
  });

  it("contract admin can persist prospect NHLe signal for synced prospects", () => {
    expect(route).toContain("NHLE_FACTORS");
    expect(route).toContain("prospectPtsPace");
    expect(route).toContain("calculatedProspectPtsPace");
    expect(route).toContain("updates.draftOverall");
    expect(route).toContain("updates.prospectPtsPace");
  });

  it("league roster injection ignores placeholder team ids", () => {
    const leaguePlayers = read("app/api/league/players/route.ts");
    const league = read("app/api/league/route.ts");
    expect(leaguePlayers).toContain("const isValidTeamId");
    expect(leaguePlayers).toContain("if (!isValidTeamId(d.teamId)) continue;");
    expect(league).toContain("const isValidTeamId");
    expect(league).toContain("if (!isValidTeamId(d.teamId)) continue;");
  });

  it("league routes fall back to NHL summary stats when MoneyPuck misses a real skater", () => {
    const leaguePlayers = read("app/api/league/players/route.ts");
    const league = read("app/api/league/route.ts");
    expect(leaguePlayers).toContain("fetchNhlSkaterStatsFallback");
    expect(leaguePlayers).toContain("NHL_SKATER_STATS.get(posSlug) ?? NHL_SKATER_STATS.get(slug)");
    expect(league).toContain("fetchNhlSkaterStatsFallback");
    expect(league).toContain("NHL_SKATER_STATS.get(posSlug) ?? NHL_SKATER_STATS.get(slug)");
  });
});
