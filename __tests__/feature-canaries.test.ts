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
import { calcDevelopmentProfile } from "../app/lib/development-profile";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

const LEAGUE_ROUTES = [
  "app/api/league/players/route.ts",
  "app/api/league/route.ts",
];

const ROSTER_ASSEMBLY_SOURCES = [
  "app/lib/roster-assembly.ts",
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
  for (const source of ROSTER_ASSEMBLY_SOURCES) {
    describe(source, () => {
      const src = read(source);

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

      it("skips fuzzy stats fallbacks only for unproven draftees", () => {
        expect(src).toContain("const isUnprovenDraftee = isDraftee && p.age <= 22");
        expect(src).toContain("!isUnprovenDraftee");
      });

      it("does not use surname-only skater stats fallbacks", () => {
        expect(src).not.toContain("buildFallbackMap");
        expect(src).not.toContain("fbMap.get(last)");
        expect(src).toContain("hasDiacritics(p.name)");
      });

      it("maps Utah Mammoth for point-share team lookups", () => {
        expect(src).toContain('const POINT_SHARES_CACHE_KEY = "cache:pointshares:v2"');
        expect(src).toContain('"ARI":"Utah Mammoth","UTA":"Utah Mammoth"');
        expect(src).not.toContain('"UTA":"Utah Hockey Club"');
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

      it("dedupes live roster rows against DB authority before returning players", () => {
        expect(src).toContain("safeNhlRosterPlayer");
        expect(src).toContain("removePlayerFromOtherRosters");
        expect(src).toContain("dedupePlayersByAuthority");
        expect(src).toContain("players = dedupePlayersByAuthority(players, dbTeamBySlug)");
      });

      it("applies published trade overlays after canonical roster assembly", () => {
        expect(src).toContain("listPublishedTrades");
        expect(src).toContain("applyPublishedTradeOverlay");
        expect(src).toContain("!trade.rosterMutating");
        expect(src).toContain("players = applyPublishedTradeOverlay(players, publishedTrades)");
      });

      it("recomputes involved team cap space from published trade overlays", () => {
        expect(src).toContain("buildPublishedTradeCapMoves");
        expect(src).toContain("const finalTeams = applyTeamCapDeltas");
        expect(src).toContain("buildPublishedTradeCapMoves(publishedTrades, players)");
        expect(src).toContain("teams: finalTeams");
      });

      it("skips overlay cap moves when the scrape already reconciled the player", () => {
        expect(src).toContain("isAlreadyReconciled");
        expect(src).toContain("player.teamId === destinationTeamId");
        expect(src).toContain("if (isAlreadyReconciled(basePlayers, asset, pair.to.teamId)) continue");
      });

      it("skips roster and cap overlays for UI-only published trades", () => {
        expect(src).toContain("!trade.rosterMutating");
        expect(src).toContain("if (!trade.published || !trade.rosterMutating || trade.sides.length !== 2) continue");
      });

      it("does not use surname-only goalie stat fallbacks", () => {
        expect(src).not.toContain("goalieSlugLast");
        expect(src).not.toContain("parts[parts.length - 1]");
        expect(src).toContain("NHL_GOALIE_STATS.get(`id:${p.id}`)");
        expect(src).toContain("goalieMap.get(");
      });

      it("keeps MoneyPuck goalie GSAX ahead of NHL fallback stats", () => {
        expect(src).toContain("const nhlG = NHL_GOALIE_STATS.get(`id:${p.id}`) ?? NHL_GOALIE_STATS.get");
        expect(src).toContain("const mpG  = goalieMap.get");
        expect(src).toContain("...(nhlG ?? {}), ...(mpG ?? {}), gsax: mpG?.gsax ?? nhlG?.gsax ?? 0");
      });

      it("does not present expired UFA/RFA contracts as fake one-year ELC deals", () => {
        expect(src).toContain("const expiresThisOffseason =");
        expect(src).toContain("const rawCapHit     = expiresThisOffseason ? 0");
        expect(src).toContain("expiresThisOffseason ? 0 : (nameCollision ? 1 : preliminaryYears)");
        expect(src).toContain("capHit:              expiring ? 0 : p.capHit");
        expect(src).toContain("yearsRemaining:      expiring ? 0 : p.yearsRemaining");
      });
    });
  }
});

describe("Canary — league cache keys", () => {
  it("keeps league and trade team cache payloads isolated", () => {
    const league = read("app/api/league/route.ts");
    const teams = read("app/api/league/teams/route.ts");
    expect(league).toContain('"cache:league:teams:v1"');
    expect(teams).toContain('"cache:trade:teams:v1"');
    expect(league).not.toContain('"cache:teams"');
    expect(teams).not.toContain('"cache:teams"');
  });
});

describe("Canary — playoff simulation bracket", () => {
  const src = read("app/api/simulate/route.ts");

  it("does not pad playoff seeds by duplicating the last team", () => {
    expect(src).not.toContain("while (seeds.length < 8)");
    expect(src).toContain("uniqueSeeds");
    expect(src).toContain("fewer than two unique teams");
  });

  it("simulates later rounds by team strength, not bracket argument order", () => {
    expect(src).toContain("function simulateSeriesByStrength");
    expect(src).toContain("simulateSeriesByStrength(getW(r1[0]), getW(r1[2]), rand)");
    expect(src).toContain("simulateSeriesByStrength(getW(r2[0]), getW(r2[1]), rand)");
  });
});

describe("Canary — simulation engine numeric guards", () => {
  it("stablePts sanitizes missing current and baseline scoring paces", () => {
    const src = read("app/lib/sim-engine.ts");
    expect(src).toContain("Number.isFinite(p.ptsPace)");
    expect(src).toContain("Number.isFinite(p.baselinePtsPace)");
  });
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
    const src = read("app/armchair-gm/page.tsx");
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

  it("executed trades clear moved players from the session trade block", () => {
    const tradePage = read("app/armchair-gm/page.tsx");
    expect(tradePage).toContain("clearSessionTradeBlock");
    expect(tradePage).toContain("tradeBlockStatus: null");
    expect(tradePage).toContain("tradeBlockNote: null");
    expect(tradePage).toContain("teamId: partnerTeam.id");
    expect(tradePage).toContain("teamId: homeTeam.id");
  });
});

describe("Canary — admin trade ingestion", () => {
  const page = read("app/admin/trades/page.tsx");
  const route = read("app/api/admin/trades/route.ts");
  const dashboard = read("app/admin/page.tsx");

  it("surfaces the ingestion panel from the admin dashboard", () => {
    expect(dashboard).toContain('/admin/trades');
    expect(dashboard).toContain('TRADE INGESTION');
  });

  it("reuses the trade machine asset panels and preview evaluator", () => {
    expect(page).toContain('TradePanel');
    expect(page).toContain('fetchTradeVerdict');
    expect(page).toContain('PREVIEW GRADE');
  });

  it("saves admin-only unpublished frozen drafts", () => {
    expect(route).toContain('requireAdmin(req)');
    expect(route).toContain('createFrozenTrade');
    expect(route).toContain('published: body.published ?? false');
    expect(route).toContain('rosterMutating: body.rosterMutating ?? true');
    expect(route).toContain('evaluatePost');
    expect(route).toContain('runTrade: true');
  });

  it("supports publish, unpublish, edit, and delete operations", () => {
    expect(route).toContain("export async function GET");
    expect(route).toContain("export async function PUT");
    expect(route).toContain("export async function PATCH");
    expect(route).toContain("export async function DELETE");
    expect(route).toContain("updateFrozenTrade");
    expect(route).toContain("deleteTrade(parsed.data.id)");
    expect(route).toContain("published: parsed.data.published");
    expect(route).toContain("rosterMutating: parsed.data.rosterMutating");
    expect(route).toContain("clearTradeOverlayCaches");
    const page = read("app/admin/trades/page.tsx");
    expect(page).toContain("SAVED TRADES");
    expect(page).toContain("ROSTER OVERLAY");
    expect(page).toContain("UI ONLY - NO ROSTER OR CAP CHANGE");
    expect(page).toContain("CONFIRM ROSTER OVERLAY");
    expect(page).toContain("pendingRosterAction");
    expect(page).toContain("togglePublished");
    expect(page).toContain("deleteSavedTrade");
    expect(page).toContain("editTrade");
  });

  it("separates current asset source teams from historical traded-from teams", () => {
    const tradePanel = read("app/components/TradePanel.tsx");
    expect(page).toContain("historicalTeams");
    expect(page).toContain("SIDE A TRADED FROM");
    expect(page).toContain("SIDE B TRADED FROM");
    expect(page).toContain('label="Side A current asset source"');
    expect(page).toContain("allowDuplicateTeams");
    expect(page).toContain("{ team: historicalHomeTeam, assetsGiven: blocks[0], fullRoster: homeRoster }");
    expect(tradePanel).toContain("allowDuplicateTeams");
    expect(tradePanel).toContain("allowDuplicateTeams ? db.teams");
  });
});

describe("Canary — public Docket page", () => {
  const page = read("app/docket/page.tsx");
  const client = read("app/docket/DocketClient.tsx");
  const today = read("app/lib/docket-today.ts");
  const view = read("app/lib/docket-view.ts");
  const header = read("app/components/Header.tsx");
  const home = read("app/page.tsx");

  it("loads published trades through the Docket view model", () => {
    expect(page).toContain("listPublishedTrades");
    expect(page).toContain("buildDocketEntries");
    expect(page).toContain("attachTodayDocketGrades");
    expect(page).toContain("<DocketClient entries={entries} />");
    expect(view).toContain("if (!trade.published || !trade.gradeAtTrade) return null");
  });

  it("exposes team, winner, search, and sort controls", () => {
    expect(client).toContain("filterAndSortDocketEntries");
    expect(client).toContain("TEAM");
    expect(client).toContain("WINNER");
    expect(client).toContain("SEARCH");
    expect(client).toContain("NAV margin high");
    expect(client).toContain("TODAY:");
  });

  it("surfaces The Docket from the home page route cards", () => {
    expect(home).toContain('href="/docket"');
    expect(home).toContain("Open The Docket");
    expect(home).toContain("Published Rulings");
    expect(home).toContain("Dual Grade");
  });

  it("expands entries with verdict, per-asset detail, STRAND, development outlook, picks, and conditions", () => {
    expect(client).toContain("FULL RULING + PLAYER DETAIL");
    expect(client).toContain("<VerdictPanel");
    expect(client).toContain("<StrandDisplay");
    expect(client).toContain("<DevelopmentProfilePanel asset={detailAsset} />");
    expect(client).toContain("PICK CURVE NAV");
    expect(client).toContain("CONDITIONS");
    expect(view).toContain("assetSnapshotToDocketAsset");
    expect(view).toContain("lockedVerdict: trade.lockedVerdict ? trade.lockedVerdict as TradeVerdict : null");
    expect(view).toContain("conditions: trade.conditions");
  });

  it("computes today's Docket grade from current canonical data without mutating at-trade snapshots", () => {
    expect(today).toContain("assembleCanonicalRoster");
    expect(today).toContain("evaluatePost");
    expect(today).toContain("runTrade: true");
    expect(today).toContain("todayLockedVerdict: evaluation.verdict ?? null");
    expect(today).toContain("navToday");
    expect(client).toContain("entry.todayWinner");
    expect(client).toContain("asset.navToday");
    expect(view).toContain('todayVerdict: "Pending live re-grade"');
  });

  it("links The Docket from the shared public masthead", () => {
    expect(header).toContain('href="/docket"');
    expect(header).toContain("The Docket");
    expect(header).toContain('pathname?.startsWith("/docket")');
  });
});

describe("Canary — trade proposal audit verification", () => {
  it("generated proposals run the full evaluate verdict before being shown", () => {
    const src = read("app/components/TradeProposal.tsx");
    expect(src).toContain("fetchTradeVerdict");
    expect(src).toContain("tradePassesFullAudit");
    expect(src).toContain("AUDIT_CONCURRENCY");
    expect(src).toContain("MAX_AUDIT_CANDIDATES");
    expect(src).toContain("generateRunRef");
    expect(src).toContain("generateAbortRef");
    expect(src).toContain("auditProgress");
    expect(src).toContain('status !== "BLOCKED" && status !== "DECLINED"');
    expect(src).toContain("const partnerRoster = allPlayers.filter(p => p.teamId === candidate.team.id)");
    expect(src).toContain("candidate.homeSends");
    expect(src).toContain("candidate.partnerSends");
  });

  it("verdict requests do not rebuild returned NAV for full rosters", () => {
    const src = read("app/lib/evaluate-client.ts");
    expect(src).toContain("const allAssets = [...outgoing, ...incoming]");
    expect(src).not.toContain("const allAssets = [...outgoing, ...incoming, ...allHomeRoster, ...allPartnerRoster]");
  });

  it("focused trade machine ignores stale async NAV and verdict responses", () => {
    const src = read("app/components/QuickTradeMachine.tsx");
    expect(src).toContain("navRunRef");
    expect(src).toContain("verdictRunRef");
    expect(src).toContain("verdictAbortRef");
    expect(src).toContain("ctrl.signal.aborted || runId !== verdictRunRef.current");
    expect(src).toContain("ctrl.signal.aborted || runId !== navRunRef.current");
  });

  it("salary dump proposals only ship negative contracts plus sweeteners", () => {
    const src = read("app/components/TradeProposal.tsx");
    expect(src).toContain("const dumpNav = negPlayers.reduce");
    expect(src).toContain("const homeSends = [...negPlayers, ...sweetener]");
    expect(src).not.toContain("const homeSends = [...outgoingBlock, ...sweetener]");
  });

  it("verdict flag expansion uses stable global indices instead of indexOf keys", () => {
    const src = read("app/components/VerdictPanel.tsx");
    expect(src).toContain("flagEntries");
    expect(src).toContain("key: `${flag.perspective");
    expect(src).not.toContain("flags.indexOf(flag)");
  });

  it("direct GM audit declines extreme NAV surplus instead of calling it a win", () => {
    const src = read("app/api/evaluate/route.ts");
    expect(src).toContain("partnerConcessionLimit");
    expect(src).toContain("rejects lopsided surplus");
    expect(src).toContain("homeNetGain > partnerConcessionLimit && imbalancePct > 22");
    expect(src).toContain('category: "VALUE_VETO"');
  });

  it("does not keep retired Arizona division data in the direct audit engine", () => {
    const src = read("app/lib/trade-classification.ts");
    expect(src).not.toContain('ARI: "Central"');
    expect(src).toContain('UTA: "Central"');
  });
});

describe("Canary — trade UI negative NAV", () => {
  it("TugBar and trade page preserve all-negative package values instead of displaying compressed zero", () => {
    const tradePage = read("app/armchair-gm/page.tsx");
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

  it("uses shared pick-round formatting for 4th and later round picks", () => {
    const assetCard = read("app/components/AssetCard.tsx");
    const quickTrade = read("app/components/QuickTradeMachine.tsx");
    const proposal = read("app/components/TradeProposal.tsx");
    const comparison = read("app/components/PlayerComparison.tsx");
    const shared = read("app/lib/trade-format.ts");
    expect(shared).toContain("formatPickRound");
    expect(shared).toContain("return `${round}th`");
    expect(assetCard).toContain("formatPickRound(asset.round)");
    expect(quickTrade).toContain("formatPickRound(asset.round)");
    expect(proposal).toContain("const rdLabel   = formatPickRound");
    expect(comparison).toContain("formatPickRound(asset.round)");
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

  it("uses tap-based salary retention controls instead of a drag slider", () => {
    const card = read("app/components/AssetCard.tsx");
    expect(card).toContain("setRetentionPct");
    expect(card).toContain("Decrease salary retention by 5 percent");
    expect(card).toContain("Increase salary retention by 5 percent");
    expect(card).toContain("[0, 25, 50].map");
    expect(card).not.toContain('type="range"');
  });
});

describe("Canary — draft pick inventory", () => {
  it("league routes create rounds 1-5 for three draft years", () => {
    const league = read("app/api/league/route.ts");
    const teams = read("app/api/league/teams/route.ts");
    expect(league).toContain("[currentDraftYear, currentDraftYear + 1, currentDraftYear + 2]");
    expect(teams).toContain("[Y, Y + 1, Y + 2]");
    expect(league).toContain("[1, 2, 3, 4, 5].map(round => ({ round, year }))");
    expect(teams).toContain("[1, 2, 3, 4, 5].map(round => ({ round, year }))");
  });
});

describe("Canary — admin cache flush", () => {
  it("clear-cache flushes BOTH the teams and contracts caches", () => {
    const src = read("app/api/admin/clear-cache/route.ts");
    expect(src).toContain("cache:league:teams:v1");
    expect(src).toContain("cache:trade:teams:v1");
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

describe("Canary — development profile rationale copy", () => {
  const src = read("app/lib/development-profile.ts");
  const panelSrc = read("app/components/DevelopmentProfilePanel.tsx");

  it("uses scouting notes instead of raw score arithmetic for no-NHL-sample players", () => {
    const profile = calcDevelopmentProfile({
      id: "no-nhl-sample",
      name: "No NHL Sample",
      position: "W",
      age: 19,
      nhlGames: 0,
      ptsPace: 0,
    });

    expect(profile.rationale[0]).toContain("No NHL sample yet");
    expect(profile.rationale[1]).toContain("No NHL or imported production sample");
    expect(profile.rationale[2]).toContain("Limited timeline history");
    expect(profile.rationale.join(" ")).not.toContain("experience score");
    expect(profile.rationale.join(" ")).not.toContain("production score");
    expect(profile.rationale.join(" ")).not.toContain("timeline trend");
    expect(src).not.toContain("NHL games drives experience score");
  });

  it("decays pedigree with NHL sample and surfaces the panel inputs", () => {
    expect(src).toContain("pedigreeSampleWeight");
    expect(src).toContain("effectivePedigreeScore");
    expect(src).toContain("scoringTrajectoryLabels");
    expect(panelSrc).toContain("pedigreeWeight");
    expect(panelSrc).toContain("3-Year Scoring");
    expect(panelSrc).toContain("SAMPLE CONF");
    expect(panelSrc).toContain("MiniScore");
    expect(panelSrc).toContain('label="Durability"');
    expect(panelSrc).toContain("avg games played per season vs 82");
    expect(src).toContain("estimatePeakYearsLeft");
    expect(src).toContain("peakYearsLeft");
    expect(panelSrc).toContain('label="Peak Left"');
    expect(panelSrc).toContain("VETERAN PEAK");
    expect(panelSrc).toContain("function OutlookKey");
    expect(panelSrc).toContain("? Outlook key");
    expect(panelSrc).toContain("<details");
    expect(panelSrc).toContain("OUTLOOK_KEY");
    expect(panelSrc).toContain("Score scale");
    expect(panelSrc).toContain("90+ elite");
    expect(panelSrc).toContain("Draft Sig");
    expect(panelSrc).toContain("Draft weight");
    expect(panelSrc).toContain("not career reputation");
    expect(panelSrc).toContain("Sample Conf");
    expect(panelSrc).toContain("Projection");
    expect(panelSrc).toContain("Peak Left");
    expect(panelSrc).toContain("Durability");
  });
});

describe("Canary — development profile route exposure", () => {
  for (const source of ROSTER_ASSEMBLY_SOURCES) {
    it(`${source} exposes developmentProfile without feeding it into NAV`, () => {
      const src = read(source);
      expect(src).toContain("fetchCachedNhlSkaterTimelineRowsForPlayers");
      expect(src).toContain("buildDevelopmentInputFromNhlTimeline");
      expect(src).toContain("developmentTimelineMap.get(String(p.id))");
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

  it("keys NAV cache entries from full valuation inputs and cap ceiling", () => {
    expect(client).toContain("xnav-2.2-full-input-key");
    expect(client).toContain("stableStringify");
    expect(client).toContain("capCeiling: capCeiling ?? a.capCeiling ?? null");
    expect(client).toContain("asset: a");
    expect(client).toContain("evaluate API omitted NAV");
    expect(client).not.toContain("total: 0, off: 0, def: 0, age: 0, cap: 0, upside: 0");
  });
});

describe("Canary — Batch 5 UI state robustness", () => {
  it("trade store mutations disambiguate duplicate player ids by team", () => {
    const store = read("app/store/tradeStore.ts");
    const card = read("app/components/AssetCard.tsx");
    const armchair = read("app/armchair-gm/page.tsx");
    expect(store).toContain("tradeAssetKey");
    expect(store).toContain("teamId ? tradeAssetKey(a) === targetKey : a.id === assetId");
    expect(store).toContain("tradeAssetKey(a) === tradeAssetKey(asset)");
    expect(card).toContain("removeAssetFromStore(asset.id, idx, asset.teamId)");
    expect(armchair).toContain("outgoingByKey");
    expect(armchair).toContain("incomingByKey");
  });

  it("armchair async requests abort stale retention and match fetches", () => {
    const src = read("app/armchair-gm/page.tsx");
    expect(src).toContain("const ctrl = new AbortController();");
    expect(src).toContain("ctrl.abort();");
    expect(src).toContain("matchAbortRef.current?.abort()");
    expect(src).toContain("matchAbortRef.current !== ctrl");
    expect(src).toContain("Promise.allSettled");
    expect(src).toContain("if (!res.ok) throw new Error");
  });

  it("armchair breakdown table guards optional skater metrics", () => {
    const src = read("app/armchair-gm/page.tsx");
    expect(src).toContain("const ptsPace = a.ptsPace ?? 0");
    expect(src).toContain("const avgTOI = a.avgTOI ?? 0");
    expect(src).toContain("const capHit = a.capHit ?? 0");
    expect(src).not.toContain("a.ptsPace.toFixed");
    expect(src).not.toContain("a.avgTOI.toFixed");
    expect(src).not.toContain("a.capHit.toFixed");
  });

  it("executed trades do not re-rank the league or remap team phases client-side", () => {
    const src = read("app/armchair-gm/page.tsx");
    expect(src).not.toContain("strengthByTeam");
    expect(src).not.toContain("projectedStandingByTeam");
    expect(src).not.toContain("phaseFromStanding");
    expect(src).toContain("applyCapDelta");
    expect(src).toContain("buildTradeCapMoves");
    expect(src).toContain("return team;");
  });

  it("players page handles failed league loads and deterministic sorting", () => {
    const src = read("app/players/page.tsx");
    expect(src).toContain("useDeferredValue");
    expect(src).toContain("if (!r.ok) throw new Error");
    expect(src).toContain("PLAYER LEDGER LOAD FAILED");
    expect(src).toContain("const compare = (av: number | null | undefined, bv: number | null | undefined)");
    expect(src).toContain("type PlayerSortKey =");
    expect(src).toContain('| "supp" | "gsax" | "svPct" | "gaa" | "gp";');
    expect(src).toContain('{ key: "seasonPts", label: "PTS" }');
    expect(src).toContain('{ key: "term",      label: "Term" }');
    expect(src).toContain('case "seasonPts": return compare(seasonPointsOf(a), seasonPointsOf(b));');
    expect(src).toContain('case "term": return compare(a.yearsRemaining, b.yearsRemaining);');
    expect(src).toContain("const visibleGoalies");
    expect(src).toContain('SectionColumnHeader section="D"');
    expect(src).toContain('SectionColumnHeader section="G"');
    expect(src).toContain('{ key: "supp",      label: "Supp" }');
    expect(src).toContain('{ key: "gaa",   label: "GAA" }');
    expect(src).toContain("function PlayerIconBadges");
    expect(src).toContain("FRANCHISE.megalodon");
    expect(src).toContain("getProspectTier(player.name)");
    expect(src).toContain("getPlayerPedigree(player.name)");
    expect(src).toContain("function PlayersIconKey");
    expect(src).toContain("PLAYER_ICON_KEY");
    expect(src).toContain('<PlayersIconKey />');
    expect(src).not.toContain("?? -99");
  });

  it("saved scenarios persist real asset identity and guarded storage", () => {
    const store = read("app/store/scenarioStore.ts");
    const history = read("app/components/TradeHistoryBar.tsx");
    expect(store).toContain("id?:");
    expect(store).toContain("teamId?:");
    expect(store).toContain("retainedPct?:");
    expect(store).toContain("safeScenarioStorage");
    expect(store).toContain("crypto.randomUUID");
    expect(history).toContain("retainedPct: a.retainedPct ?? 0");
    expect(history).toContain("teamId:   a.teamId");
  });

  it("focused trade machine uses package NAV, not linear NAV", () => {
    const src = read("app/components/QuickTradeMachine.tsx");
    expect(src).toContain("ageDecayRate");
    expect(src).toContain("ageSlotPenalty");
    expect(src).toContain("Package NAV");
    expect(src).not.toContain("Linear NAV");
  });
});

describe("Canary — evaluate route historical NAV floors", () => {
  const evaluateRoute = read("app/api/evaluate/route.ts");

  it("applies player pedigree floors on the server NAV path", () => {
    expect(evaluateRoute).toContain("getHistoricalFloor");
    expect(evaluateRoute).toContain("const historicalFloor = getHistoricalFloor(asset.name, result.total, asset)");
    expect(evaluateRoute).toContain("total: liftedTotal");
  });
});

describe("Canary — footer glossary", () => {
  const footer = read("app/components/Footer.tsx");
  const tradePage = read("app/armchair-gm/page.tsx");

  it("combines methodology and glossary into wide footer disclosure sections", () => {
    expect(footer).toContain("methodologySections");
    expect(footer).toContain("<details");
    expect(footer).toContain("Player Valuation");
    expect(footer).toContain("STRAND Glossary");
    expect(footer).toContain("grid grid-cols-1 md:grid-cols-2");
    expect(footer).toContain("Prospect NAV");
    expect(footer).toContain("NHLe");
  });

  it("keeps the icon key visible instead of hiding it in a dropdown", () => {
    expect(footer).toContain("const iconKey");
    expect(footer).toContain('aria-label="Icon key"');
    expect(footer).toContain("Megalodon");
    expect(footer).toContain("Salary Dump");
    expect(footer).not.toMatch(/title:\s*"Icon Key"/);
  });

  it("does not keep a second trade-page methodology block", () => {
    expect(tradePage).not.toContain("Methodology & Glossary");
    expect(tradePage).not.toContain("How The Hockey Ledger Works");
    expect(tradePage).toContain("<Footer />");
  });
});

describe("Canary — trade UX loading and mobile focus", () => {
  const tradePage = read("app/armchair-gm/page.tsx");
  const tradeLoading = read("app/armchair-gm/loading.tsx");
  const assetDropdown = read("app/components/AssetDropdown.tsx");
  const lineupEditor = read("app/components/LineupEditor.tsx");
  const header = read("app/components/Header.tsx");
  const quickTradeMachine = read("app/components/QuickTradeMachine.tsx");
  const tradeMachineRoute = read("app/trade-machine/page.tsx");
  const sharedTradeRoute = read("app/t/[code]/page.tsx");
  const sharedTradeImageRoute = read("app/t/[code]/opengraph-image.tsx");

  it("selects the franchise from one team-grid click instead of requiring a second confirm click", () => {
    expect(tradePage).toContain("selectingTeamId");
    expect(tradePage).toContain("setHomeTeamLocked(true)");
    expect(tradePage).toContain("setShowTeamSelect(false)");
    expect(tradePage).not.toContain("Take Control of the");
    expect(tradePage).toContain("Calculating player values before roster selection finishes");
  });

  it("does not autofocus asset search when the add-asset modal opens", () => {
    expect(assetDropdown).not.toContain("setTimeout(() => searchRef.current?.focus()");
    expect(assetDropdown).not.toContain("if (open) setTimeout");
    expect(assetDropdown).toContain("onFocus={() => searchRef.current?.scrollIntoView");
  });

  it("keeps the trade UI gated until initial player values are loaded", () => {
    expect(tradePage).toContain("initialNavReady");
    expect(tradePage).toContain("initialNavReadyRef");
    expect(tradePage).toContain("Player valuation load incomplete");
    expect(tradePage).toContain("const expectedIds = new Set(db.players.map(asset => asset.id))");
    expect(tradePage).toContain("unique values ready");
    expect(tradePage).toContain("if (booting || !dataReady || !initialNavReady)");
    expect(tradePage).toContain("Confirming Full Player Load");
    expect(tradePage).toContain("Armchair GM unlocks after every roster value is ready.");
  });

  it("uses one consistent trade preloader without skeleton bars", () => {
    expect(tradeLoading).toContain("Confirming Full Player Load");
    expect(tradeLoading).toContain("Player Values");
    expect(tradeLoading).toContain("Armchair GM unlocks after every roster value is ready.");
    expect(tradeLoading).not.toContain("Content skeleton bars");
    expect(tradeLoading).not.toContain("bg-ledger-card");
  });

  it("shows contract years remaining before adding an asset", () => {
    expect(assetDropdown).toContain("termLabel");
    expect(assetDropdown).toContain("p.yearsRemaining");
    expect(assetDropdown).toContain("{termLabel}");
  });

  it("lineup editor shows position and NAV on larger mobile-friendly player tiles", () => {
    expect(tradePage).toContain("navMap={navMap}");
    expect(lineupEditor).toContain("navMap?: Record<string, NavLike>");
    expect(lineupEditor).toContain("NAV {nav}");
    expect(lineupEditor).toContain("p?.position ?? \"--\"");
    expect(lineupEditor).toContain("minHeight: 50");
    expect(lineupEditor).not.toContain("Click a player, then click another slot");
  });

  it("lineup editor keeps extra goalies on the swappable bench", () => {
    expect(lineupEditor).toContain("const gBench = orders.G.slice(2)");
    expect(lineupEditor).toContain('group: "G" as Group, idx: 2 + i');
    expect(lineupEditor).toContain('if (prev.group !== group) return { group, idx };');
    expect(lineupEditor).toContain('<Cell group="G" idx={0} pos="G " />');
    expect(lineupEditor).toContain('<Cell group="G" idx={1} pos="G " />');
  });

  it("exposes the focused Trade Machine and shared trade routes", () => {
    const tradeRedirectRoute = read("app/trade/page.tsx");
    expect(header).toContain('href="/trade-machine"');
    expect(tradeRedirectRoute).toContain('redirect("/trade-machine")');
    expect(tradeMachineRoute).toContain("QuickTradeMachine");
    expect(sharedTradeRoute).toContain("SharedTradeView");
    expect(sharedTradeRoute).toContain("generateMetadata");
    expect(sharedTradeRoute).toContain("summarizeTradeSharePayload");
    expect(sharedTradeImageRoute).toContain("ImageResponse");
    expect(sharedTradeImageRoute).toContain("Verdict Locked At Creation");
    expect(quickTradeMachine).toContain("Run a single trade without the full Armchair GM workspace");
    expect(quickTradeMachine).toContain("Generate Share Link");
    expect(quickTradeMachine).toContain("/t/");
  });

  it("shows industry-style cap, production, NOIV, NAV, and GM audit context in the focused Trade Machine", () => {
    expect(quickTradeMachine).toContain("fetchNavMap");
    expect(quickTradeMachine).toContain("TeamTradeSummary");
    expect(quickTradeMachine).toContain("Projected Cap");
    expect(quickTradeMachine).toContain("Production");
    expect(quickTradeMachine).toContain("NOIV");
    expect(quickTradeMachine).toContain("Package NAV");
    expect(quickTradeMachine).toContain("Package NAV Balance");
    expect(quickTradeMachine).toContain("setShareUrl(\"\")");
    expect(quickTradeMachine).toContain("GM Logic Signal");
    expect(quickTradeMachine).toContain("TradeBalanceStrip");
  });
});

describe("Canary — development profile trade audit", () => {
  const src = read("app/api/evaluate/route.ts");
  const tradeLogic = read("app/lib/trade-logic.ts");
  const sharedTradeClassification = read("app/lib/trade-classification.ts");

  it("uses development profile in GM timeline reasoning without feeding X-NAV", () => {
    expect(src).toContain("isFutureCoreAsset");
    expect(src).toContain("isDevelopmentRiskAsset");
    expect(src).toContain("isPeakWindowAsset");
    expect(sharedTradeClassification).toContain("const isFutureCoreAsset");
    expect(sharedTradeClassification).toContain("const isDevelopmentRiskAsset");
    expect(sharedTradeClassification).toContain("const isPeakWindowAsset");
    expect(sharedTradeClassification).toContain("developmentProfile");
    expect(src).toContain("is selling a future-core profile");
    expect(src).toContain("development variance");
    expect(src).toContain("fits a win-now window");
    expect(src).not.toMatch(/calcNAV\([^)]*developmentProfile[\s\S]*/);
  });

  it("uses development profile in proposal fit/copy/risk without feeding X-NAV", () => {
    expect(tradeLogic).toContain("isFutureCoreAsset");
    expect(tradeLogic).toContain("isDevelopmentRiskAsset");
    expect(tradeLogic).toContain("isPeakWindowAsset");
    expect(sharedTradeClassification).toContain("developmentProfile");
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

  it("manual contract inserts require and send an explicit position", () => {
    expect(route).toContain("position is required when adding a new DB player");
    expect(route).toContain("position,");
    expect(page).toContain("const POSITION_OPTIONS = [\"C\", \"W\", \"D\", \"G\"]");
    expect(page).toContain("body: JSON.stringify({ name: name.trim(), yearsRemaining: y, capHit: c, position, hasNMC })");
    expect(page).toContain("body: JSON.stringify({ name, yearsRemaining, capHit, position })");
  });

  it("contract admin can recover from an empty reset DB by creating the players table", () => {
    const ensureSchema = read("app/db/ensure-schema.ts");
    expect(ensureSchema).toContain("CREATE TABLE IF NOT EXISTS players");
    expect(ensureSchema).toContain("CREATE TABLE IF NOT EXISTS teams");
    expect(ensureSchema).toContain("export function ensurePlayerTable");
    expect(ensureSchema).toContain("export function ensureTeamTable");
    expect(route).toContain("ensurePlayerTable");
    expect(route).toContain("await ensurePlayerTable()");
    expect(route).toContain("ensureCanonicalTeamRows");
    expect(route).toContain("await ensureCanonicalTeamRows()");
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
    const rosterAssembly = read("app/lib/roster-assembly.ts");
    expect(rosterAssembly).toContain("const isValidTeamId");
    expect(rosterAssembly).toContain("if (!isValidTeamId(d.teamId)) continue;");
  });

  it("league routes fall back to NHL summary stats when MoneyPuck misses a real skater", () => {
    const rosterAssembly = read("app/lib/roster-assembly.ts");
    expect(rosterAssembly).toContain("fetchNhlSkaterStatsFallback");
    expect(rosterAssembly).toContain("statsMap.set(`id:${s.playerId}`, entry)");
    expect(rosterAssembly).toContain("NHL_SKATER_STATS.get(`id:${p.id}`) ?? NHL_SKATER_STATS.get(posSlug) ?? NHL_SKATER_STATS.get(slug)");
  });

  it("league routes fall back to NHL goalie summary stats when MoneyPuck misses a goalie", () => {
    const rosterAssembly = read("app/lib/roster-assembly.ts");
    expect(rosterAssembly).toContain("fetchNhlGoalieStatsFallback");
    expect(rosterAssembly).toContain("cache:nhl_goalie_summary_stats");
    expect(rosterAssembly).toContain("NHL_GOALIE_STATS.get(`id:${p.id}`)");
    expect(rosterAssembly).toContain("hasLiveStats: true");
  });

  it("league roster routes do not apply retired contract extension overlays", () => {
    for (const source of ROSTER_ASSEMBLY_SOURCES) {
      const src = read(source);
      expect(src).not.toContain("contracts.extensions.json");
      expect(src).not.toContain("loadExtensions");
      expect(src).not.toContain("EXTENSIONS");
      expect(src).toContain("hasExtension");
      expect(src).toContain("extensionCapHit: undefined");
      expect(src).toContain("extensionYears");
    }
  });
});

describe("Canary — Batch 6 audit fixes", () => {
  it("draft-class import will not overwrite existing veteran contract rows with ELC defaults", () => {
    const src = read("app/api/admin/import-draft-class/route.ts");
    expect(src).toContain("skipped existing NHL contract row");
    expect(src).toContain("current.draftYear != null");
    expect(src).toContain("current.draftOverall != null");
    expect(src).toContain("current.prospectPtsPace != null");
    expect(src).toContain("const hasRealContract = current.capHit > 1.15");
    expect(src).toContain("Boolean(current.hasNmc)");
    expect(src).toContain("Boolean(current.hasNtc)");
    expect(src).toContain("if (!isProspectRow || hasRealContract)");
    expect(src).not.toContain("(current.age ?? 99) <= 22");
  });

  it("admin and evaluate cap settings reject zero, negative, absurd, and inverted cap values", () => {
    const src = read("app/api/admin/settings/route.ts");
    const evaluate = read("app/api/evaluate/route.ts");
    const teams = read("app/api/league/teams/route.ts");
    const page = read("app/admin/settings/page.tsx");
    const capSettings = read("app/lib/cap-settings.ts");
    expect(src).toContain("validateCapValue");
    expect(src).toContain("isValidCapFloor(value)");
    expect(src).toContain("value > MAX_CAP_CEILING");
    expect(src).toContain("capFloor cannot exceed capCeiling");
    expect(src).toContain("{ status: 400 }");
    expect(capSettings).toContain("const MAX_CAP_CEILING = 120");
    expect(capSettings).toContain("LEGACY_DEFAULT_CAP_CEILING = 95.5");
    expect(capSettings).toContain("parseStoredCapCeiling");
    expect(capSettings).toContain("cap > 0 && cap <= MAX_CAP_CEILING");
    expect(src).toContain("teamCacheKey(SEASON.capCeiling)");
    expect(src).toContain("teamCacheKey(95.5)");
    expect(evaluate).toContain("const MAX_CAP_CEILING = maxCapCeiling()");
    expect(evaluate).toContain("isValidCapCeiling(requestCapCeiling)");
    expect(evaluate).toContain("parseStoredCapCeiling(row?.value, SEASON.capCeiling) ?? SEASON.capCeiling");
    expect(teams).toContain("siteSettings");
    expect(teams).toContain("const getLiveCapCeiling = async ()");
    expect(teams).toContain('r.key === "cap_ceiling"');
    expect(teams).toContain("parseStoredCapCeiling(row?.value, SEASON.capCeiling) ?? SEASON.capCeiling");
    // Cap space = curated static room shifted by the ceiling delta (Decision A),
    // NOT a naive sum of all contract rows (which overstated used cap → false negatives).
    expect(teams).toContain("const CURATED_CAPSPACE_CEILING = 95.5");
    expect(teams).toContain("const ceilingDelta = capCeiling - CURATED_CAPSPACE_CEILING");
    expect(teams).toContain("Math.round((t.capSpace + ceilingDelta) * 10) / 10");
    expect(teams).not.toContain("buildTeamCapSpaceMap(dbContracts");
    expect(teams).not.toContain("TEAM_CAP_BASELINE");
    expect(teams).toContain("const cacheKey = teamCacheKey(capCeiling)");
    expect(teams).toContain("loadTeams(liveCapCeiling)");
    expect(teams).toContain("capCeiling:  liveCapCeiling");
    expect(page).toContain('placeholder={def ? String(def.capCeiling) : "104"}');
    expect(page).not.toContain('placeholder={def ? String(def.capCeiling) : "95.5"}');
  });

  it("Strand rendering guards empty trait arrays before indexing or dividing", () => {
    const display = read("app/components/StrandDisplay.tsx");
    const view = read("app/components/StrandView.tsx");
    expect(display).toContain("if (n === 0) return");
    expect(display).toContain("offTraits.length > 0 && defTraits.length > 0");
    expect(display).toContain("compareOff.length > 0 && compareDef.length > 0");
    expect(view).toContain('return "UNAVAILABLE"');
  });

  it("admin cache flush includes all live roster/stat/enrichment cache keys", () => {
    const src = read("app/api/admin/clear-cache/route.ts");
    expect(src).toContain("cache:pointshares");
    expect(src).toContain("cache:pointshares:v2");
    expect(src).toContain("cache:mp_skaters");
    expect(src).toContain("cache:mp_goalies");
    expect(src).toContain("cache:nhl_goalie_summary_stats");
    expect(src).toContain("cache:prospect_enrichment:v1");
    expect(src).toContain("PROSPECT_ENRICHMENT_CACHE_KEY");
    expect(read("app/lib/prospect-enrichment.ts")).toContain("export const PROSPECT_ENRICHMENT_CACHE_KEY");
  });

  it("admin hard reset clears mutable admin data back to scrape defaults", () => {
    const src = read("app/api/admin/reset/route.ts");
    const settings = read("app/admin/settings/page.tsx");
    const dashboard = read("app/admin/page.tsx");
    expect(src).toContain('const CONFIRMATION = "RESET ADMIN DATA"');
    expect(src).toContain("players:");
    expect(src).toContain("teamOverrides:");
    expect(src).toContain("resetTeamOverrides");
    expect(src).toContain("phaseOverride: null");
    expect(src).toContain("standingOverride: null");
    expect(src).toContain("TEAMS_DB");
    expect(src).toContain("tradeBlock:");
    expect(src).toContain("draftPickOverrides:");
    expect(src).toContain("faOverrides:");
    expect(src).toContain("siteSettings:");
    expect(src).toContain("if (body.includeTrades)");
    expect(src).toContain("clearedCacheKeys");
    expect(settings).toContain("ADMIN DATA RESET");
    expect(settings).toContain("/api/admin/reset");
    expect(settings).toContain("includeTrades");
    expect(dashboard).toContain("/admin/draft-picks");
    expect(dashboard).toContain("/admin/fa-overrides");
  });

  it("patch-team-ids reports failed roster fetches instead of zero-match success", () => {
    const src = read("app/api/admin/patch-team-ids/route.ts");
    expect(src).toContain("| null");
    expect(src).toContain("teamResults[team.id] = -1");
    expect(src).toContain(".filter(([, v]) => v < 0)");
  });

  it("trade-block admin writes canonical name-derived ids and validates status enum", () => {
    const src = read("app/api/admin/trade-block/route.ts");
    expect(src).toContain("TRADE_BLOCK_STATUSES");
    expect(src).toContain('["requested", "available", "untouchable"]');
    expect(src).not.toContain('"blocked"');
    expect(src).toContain("const entryId = makeId(body.name || body.id)");
    expect(src).toContain("Invalid trade-block status");
    expect(src).toContain("id: entryId");
  });

  it("admin contract POST validates direct cap and term ranges", () => {
    const src = read("app/api/admin/contracts/route.ts");
    expect(src).toContain("MIN_CONTRACT_CAP_HIT = 0.5");
    expect(src).toContain("MAX_CONTRACT_CAP_HIT = 20.8");
    expect(src).toContain("MAX_CONTRACT_YEARS = 12");
    expect(src).toContain("capHit must be between");
    expect(src).toContain("yearsRemaining must be an integer");
  });

  it("admin can retire players without deleting rows and roster routes filter them", () => {
    const schema = read("app/db/schema.ts");
    const contracts = read("app/api/admin/contracts/route.ts");
    const adminPage = read("app/admin/contracts/page.tsx");
    const rosterAssembly = read("app/lib/roster-assembly.ts");
    const migration = read("drizzle/0001_add_player_retirement.sql");

    expect(schema).toContain('retired:         integer("retired"');
    expect(schema).toContain('retiredDate:     text("retired_date")');
    expect(migration).toContain("ADD COLUMN retired INTEGER DEFAULT 0");
    expect(migration).toContain("ADD COLUMN retired_date TEXT");
    expect(contracts).toContain("ensureRetirementColumns");
    expect(contracts).toContain("updates.retired = retired");
    expect(contracts).toContain("updates.retiredDate = retired ? new Date().toISOString().slice(0, 10) : null");
    expect(contracts).toContain("clearRosterCaches");
    expect(adminPage).toContain("handleRetire");
    expect(adminPage).toContain("RESTORE");
    expect(rosterAssembly).toContain("removeRetiredPlayersFromRosters");
    expect(rosterAssembly).toContain("if (row.retired) continue");
    expect(rosterAssembly).toContain("if (d.retired) continue");
    expect(rosterAssembly).toContain("retired:         playersTable.retired");
  });

  it("documents intentional curl-only admin endpoints", () => {
    const src = read("docs/admin-endpoints.md");
    expect(src).toContain("GET /api/admin/clear-cache");
    expect(src).toContain("POST /api/admin/import-draft-class");
    expect(src).toContain("DELETE /api/admin/import-draft-class");
    expect(src).toContain("DELETE /api/admin/prune-stale");
    expect(src).toContain("GET /api/admin/db-info");
    expect(src).toContain("POST /api/admin/development-profile");
    expect(src).toContain("unauthenticated calls return `401`");
  });

  it("cap projection uses retained effective cap and only strikes through players from the current roster", () => {
    const src = read("app/components/CapProjection.tsx");
    expect(src).toContain("const effectiveCapHit =");
    expect(src).toContain("currentRoster.reduce((s, a) => s + effectiveCapHit(a), 0)");
    expect(src).toContain("currentKeys.has(assetKey(a))");
    expect(src).toContain("players.length + departing.length");
    expect(src).toContain("outKeys.has(assetKey(a))");
  });

  it("league routes preserve young-player contracts when only position metadata disagrees", () => {
    for (const source of ROSTER_ASSEMBLY_SOURCES) {
      const src = read(source);
      expect(src).toContain("const contractMatch =");
      expect(src).toContain('source: "position"');
      expect(src).toContain('source: "team"');
      expect(src).toContain('source: "name"');
      expect(src).toContain('contractMatch?.source === "name"');
      expect(src).toContain("nameCollision ? elcCapHit : rawCapHit");
    }
  });

  it("lower-is-better comparison bars give the cheaper/younger side the longer bar", () => {
    const src = read("app/components/PlayerComparison.tsx");
    expect(src).toContain("lowerIsBetterPct");
    expect(src).toContain("((worst - value) / (worst - best)) * 100");
    expect(src).toContain('higherIsBetter={false}');
  });

  it("players page renders development profiles and paged position sections", () => {
    const src = read("app/players/page.tsx");
    expect(src).toContain("DevelopmentProfilePanel");
    expect(src).toContain("developmentProfile?: DevelopmentProfile | null");
    expect(src).toContain("Development Outlook");
    expect(src).toContain('fetch("/api/league/teams")');
    expect(src).toContain('fetch("/api/league/players")');
    expect(src).toContain("const [forwardPage");
    expect(src).toContain("function SectionPager");
    expect(src).toContain("const FORWARD_CAP = 25");
    expect(src).toContain("const DEFENCE_CAP = 10");
    expect(src).toContain("const GOALIE_CAP = 5");
    expect(src).toContain("pageSlice(forwards, forwardPage, FORWARD_CAP)");
    expect(src).toContain("forwards: sortedSkaters.filter");
    expect(src).toContain('SectionHeader label="Goalies"');
    expect(src).toContain('SectionColumnHeader section="G"');
    expect(src).toContain("Rank</div>");
    expect(src).toContain("SortHeader");
    expect(src).toContain("players-column-header");
    expect(src).not.toContain("players-mobile-sort-strip");
    expect(src).toContain("const seasonPoints = Math.round");
    expect(src).toContain('{ label: "PTS",    val: seasonPoints.toString() }');
    expect(src).not.toContain(">Season Points<");
  });
});

describe("Canary — R0/R1/R2 audit refinements", () => {
  it("dampens low-sample positive cap surplus without the old hard replacement clamp", () => {
    const src = read("app/lib/xnav-engine.ts");
    expect(src).toContain("const capEstablishment = clamp");
    expect(src).toContain("games / 40");
    expect(src).toContain("safe(asset.baselinePtsPace ?? 0) / (isD ? 30 : 45)");
    expect(src).toContain("const positiveCapComponent = Math.max(0, baselineCapComponent) * capEstablishment");
    expect(src).toContain("const negativeCapComponent = Math.min(0, baselineCapComponent)");
    expect(src).not.toContain("isReplacementCallup");
  });

  it("returns fair-market AAV and surfaces projected next contract estimates", () => {
    const engine = read("app/lib/xnav-engine.ts");
    const types = read("app/lib/trade-types.ts");
    const timeline = read("app/components/PlayerTimeline.tsx");
    expect(engine).toContain("fmvAav?:");
    expect(engine).toContain("const currentFmvAav = BASE_CAP_CEILING * fmvCapPct");
    expect(engine).toContain("const currentFmvAavG = BASE_CAP_CEILING * fmvCapPctG");
    expect(types).toContain("fmvAav?: number");
    expect(timeline).toContain("estimateNextContractTerm");
    expect(timeline).toContain("Projected next");
    expect(timeline).toContain("fair-market midpoint AAV");
    expect(timeline).toContain("const compactProjection = years.length <= 3");
    expect(timeline).toContain("Compact contract projection for short remaining terms.");
  });

  it("keeps expanded player cards and STRAND displays de-duplicated", () => {
    const players = read("app/players/page.tsx");
    const strand = read("app/components/StrandDisplay.tsx");
    expect(players).toContain('{ label: "PTS",    val: seasonPoints.toString() }');
    expect(players).not.toContain("Season Points");
    expect(players).not.toContain(">OPS</span>");
    expect(players).not.toContain(">DPS</span>");
    expect(players).toContain(">PS</span>");
    expect(strand).not.toContain("Trait bars with league average baseline");
    expect(strand).toContain("? STRAND trait guide");
    expect(strand).toContain("<details");
  });
});

describe("Canary — UX and UI polish", () => {
  it("uses a shared body scroll lock hook for modal overlays", () => {
    const hook = read("app/lib/use-body-scroll-lock.ts");
    const armchair = read("app/armchair-gm/page.tsx");
    expect(hook).toContain("export function useBodyScrollLock");
    expect(hook).toContain("let lockCount = 0");
    expect(hook).toContain("lockCount += 1");
    expect(hook).toContain("lockCount -= 1");
    expect(hook).toContain("if (lockCount !== 1) return");
    expect(hook).toContain("if (lockCount !== 0) return");
    expect(hook).toContain('document.body.style.overflow = "hidden"');
    expect(armchair).toContain("useBodyScrollLock(showTeamSelect || tradeBlockOpen || Boolean(tradeRequest?.length) || resignOpen)");
    expect(armchair).not.toContain("useBodyScrollLock(verdictOpen");
    expect(armchair).not.toContain("useBodyScrollLock(verdictOpen ||");
    for (const path of [
      "app/components/TradeProposal.tsx",
      "app/components/LedgerDropdown.tsx",
      "app/components/TradeBlockPanel.tsx",
      "app/components/AssetDropdown.tsx",
      "app/components/TradeHistoryBar.tsx",
      "app/armchair-gm/page.tsx",
    ]) {
      expect(read(path)).toContain("useBodyScrollLock");
    }
  });

  it("surfaces NAV residual floors and NAV tooltips at point of use", () => {
    const card = read("app/components/AssetCard.tsx");
    const panel = read("app/components/TradePanel.tsx");
    const armchair = read("app/armchair-gm/page.tsx");
    expect(card).toContain("const floorAdj =");
    expect(card).toContain('label="FLOOR"');
    expect(card).toContain("Franchise/career floor applied");
    expect(card).toContain("Net Asset Value");
    expect(panel).toContain("Net Asset Value");
    expect(armchair).toContain("Franchise/career floor applied");
  });

  it("makes active header navigation visually distinct", () => {
    const src = read("app/components/Header.tsx");
    expect(src).toContain("border-b-2");
    expect(src).toContain("text-ledger-red");
    expect(src).toContain("border-ledger-red");
    expect(src).toContain("◆");
  });

  it("keeps lineups below the trade grid and removes the old roster projection panel", () => {
    const armchair = read("app/armchair-gm/page.tsx");
    const styles = read("app/globals.css");
    expect(armchair).not.toContain("lazy(() => import(\"@/app/components/CapProjection\"))");
    expect(armchair).not.toContain("<CapProjection");
    expect(read("app/components/CapProjection.tsx")).not.toContain("Post-Trade Roster Projection");
    expect(armchair.indexOf("Main Trade Grid")).toBeLessThan(armchair.indexOf("Lineups — editable depth charts below the trade"));
    expect(styles).toContain("font-size: 13px");
    expect(styles).not.toContain("players-mobile-sort-strip");
  });
});
