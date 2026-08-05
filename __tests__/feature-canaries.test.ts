// ── Feature Canaries ─────────────────────────────────────────────────────────
// These tests exist because three working features were silently lost during
// refactors: the contracts DB backfill, the draftee injection, and the trade
// block stamping. Each canary fails loudly if a load-bearing code path is
// deleted again. If one of these fails, the feature it guards was REMOVED —
// do not "fix" the test; restore the feature.

import { describe, it, expect } from "vitest";
import fs from "fs";
import { stripComments } from "./support/source";
import path from "path";
import { calcNAV, calcProspectNAV } from "../app/lib/xnav-engine";
import { parseWikipediaDraftProspects } from "../app/lib/prospect-enrichment";
import { calcDevelopmentProfile } from "../app/lib/development-profile";
import { columnsFor, groupRosterRows, sortRosterRows } from "../app/lib/roster-table";
import type { RosterRow } from "../app/lib/roster-view";

/** A minimal roster row, for the Roster-tab canaries below. */
const rosterRowFor = (
  position: string, name = "Player", points = 0, nav: number | null = 0,
): RosterRow => ({
  asset: { id: `${name}-${position}`, name, position, teamId: "WPG" } as any,
  games: 82, goals: 0, assists: 0, points, toi: 15, nav, simulated: false,
});

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

/**
 * Read a file as the code it compiles to, with its commentary removed.
 *
 * Use this for any assertion of the form "this string must NOT appear". Use
 * plain `read` when the assertion is about a comment itself.
 */
const readSource = (p: string) => stripComments(read(p));

const readArmchairAll = () =>
  [
    "app/armchair-gm/page.tsx",
    "app/armchair-gm/SeasonResultsPager.tsx",
    "app/armchair-gm/GmAnalysisTabs.tsx",
    "app/armchair-gm/Screens.tsx",
    "app/armchair-gm/contention.ts",
    "app/armchair-gm/CupRunDraftSummaryModal.tsx",
    "app/armchair-gm/useCupRunLifecycle.ts",
    "app/armchair-gm/useOffseasonFlow.ts",
    "app/armchair-gm/useTradeBench.ts",
    "app/armchair-gm/TeamSelectModal.tsx",
    "app/armchair-gm/MemoModal.tsx",
    "app/armchair-gm/CupRunResumePrompt.tsx",
    "app/armchair-gm/VerdictSheet.tsx",
    "app/armchair-gm/MatchResultsPanel.tsx",
    "app/armchair-gm/TeamEdgeTiles.tsx",
  ].map(read).join("\n");
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
    // #1 overall is an elite prospect, but an UNPROVEN one is capped below the
    // franchise-star tier (PROSPECT_CEILING) — he shouldn't be worth more than a
    // proven cornerstone. Blue-chip, not generational-untouchable.
    expect(nav.total).toBeGreaterThan(200);
    expect(nav.total).toBeLessThanOrEqual(240);
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

describe("Canary — NHL EDGE usage and presentation", () => {
  it("threads high-danger EDGE luck from snapshots into valuation, rollover, and UI", () => {
    const capture = read("app/lib/nhl-feed-capture.ts");
    const roster = read("app/lib/roster-assembly.ts");
    const types = read("app/lib/trade-types.ts");
    const xnav = read("app/lib/xnav-engine.ts");
    const rollover = read("app/lib/season-rollover.ts");
    const breakoutModel = read("app/lib/breakout-model.ts");
    const players = read("app/players/page.tsx");
    const armchair = readArmchairAll();
    const card = read("app/components/PercentileCard.tsx");

    expect(capture).toContain("hdFinishingDelta: edge.facts.hdFinishingDelta");
    expect(capture).toContain("export async function latestEdgeSignalMap");
    expect(capture).toContain("speedMaxMph: fromPayload.speedMaxMph");
    expect(roster).toContain("const edgeSignals = await latestEdgeSignalMap");
    expect(roster).toContain("hdFinishingDelta: edgeSignal?.hdFinishingDelta ?? null");
    expect(roster).toContain("edgeOzPct: edgeSignal?.ozPct ?? null");
    expect(roster).toContain("edgeSpeedMaxMph: edgeSignal?.speedMaxMph ?? null");
    expect(types).toContain("hdFinishingDelta?: number | null");
    expect(types).toContain("edgeOzPct?: number | null");
    expect(types).toContain("edgeSpeedMaxMph?: number | null");
    expect(xnav).toContain("const edgeLuckAdj = asset.hdFinishingDelta != null");
    // The finishing-luck (and burst) signals now live in the shared breakout
    // model that both the rollover and the sim route consume.
    expect(breakoutModel).toContain("if (s.hdFinishingDelta != null)");
    expect(breakoutModel).toContain("edgeBurstsOver20");
    expect(rollover).toContain("computeBreakout");
    expect(players).toContain('{ label: "EDGE HD"');
    expect(players).toContain("NHL EDGE high-danger finishing vs league average");
    expect(players).toContain("hdFinishingDelta: player.hdFinishingDelta ?? undefined");
    // The card spreads the full player into calcNAV (EDGE fields included)
    // and renders the EDGE HD finishing read on the plate.
    expect(card).toContain("...(player as any)");
    expect(card).toContain("hdFinishingDelta");
    expect(armchair).toContain("NHL EDGE HD");
    expect(armchair).toContain("computeTeamEdgeProfile");
    expect(armchair).toContain("Team EDGE Snapshot");
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

      it("reads contracts only from the players table (no live scrape at read time)", () => {
        // Orthogonal backend: the players table is the single source of truth.
        expect(src).toContain("async function loadContractsFromDB()");
        expect(src).toContain("loadContractsFromDB(),");
        expect(src).not.toContain("scrapeCapWages");
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

      it("auto-seeds the canonical baseline when the players table is empty", () => {
        // The DB is never left empty (fresh boot / post-reset): the read path
        // loads the committed baseline before returning contracts.
        expect(src).toContain("seedPlayersTable()");
        expect(src).toContain("rows.length === 0");
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
        expect(src).toContain("p.injectedFromDb && !stats && !goalieStats && !hasProspectSignal && !hasFaStatus && p.age >= 24");
        // A goalie's game count falls back to his goalie stats when the skater
        // stats map has nothing. Pinned as intent — the expression used to read
        // `goalieStats?.gamesStarted`, which was appearances wearing the wrong
        // name; it names `gamesPlayed` now.
        expect(src).toMatch(/stats\?\.games \?\? goalieStats\?\.gamesPlayed/);
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
        // GSAX: MoneyPuck first. Pinned to that precedence rather than to the
        // spread expression, which grew per-field rules when starts stopped
        // being clobbered.
        expect(src).toContain("gsax: mpG?.gsax ?? nhlG?.gsax ?? 0");
      });

      it("lets the NHL feed's real starts survive the MoneyPuck merge", () => {
        // The sharpest form of the bug: the correct starts count was fetched
        // and then overwritten with MoneyPuck's games-played, because the
        // spread put MoneyPuck last and MoneyPuck wrote `gamesStarted`.
        expect(src).toContain("gamesStarted: nhlG?.gamesStarted ?? mpG?.gamesStarted ?? null");
        // MoneyPuck publishes appearances, and says so.
        expect(src).toMatch(/gamesPlayed:\s+g,/);
        expect(src).not.toMatch(/gamesStarted:\s+g,/);
      });

      it("does not present expired UFA/RFA contracts as fake one-year ELC deals", () => {
        // Pinned as intent: an expiring deal carries no cap hit and no years,
        // whatever else the branch has since grown. (It used to assert the two
        // ternaries verbatim, which the extension work rewrote.)
        expect(src).toContain("deriveContractStatus({");
        expect(src).toMatch(/rawCapHit\s+=[\s\S]{0,120}expiresThisOffseason \? 0/);
        expect(src).toMatch(/finalYears\s+= override\?\.yearsRemaining[\s\S]{0,200}expiresThisOffseason \? 0/);
      });

      it("derives free-agency status from stored expiry facts via a pure helper", () => {
        expect(src).toContain("export function deriveContractStatus(");
        expect(src).toContain("rawExpiryYear != null ? rawExpiryYear <= offseasonYear");
      });
    });
  }
});

describe("Canary — league cache keys", () => {
  it("keeps league and trade team cache payloads isolated", () => {
    const league = read("app/api/league/route.ts");
    const teams = read("app/api/league/teams/route.ts");
    const teamCache = read("app/lib/team-cache.ts");
    expect(league).toContain("LEAGUE_TEAMS_CACHE_KEY");
    expect(teams).toContain("teamCacheKey(capCeiling)");
    expect(teamCache).toContain('"cache:league:teams:v1"');
    expect(teamCache).toContain('"cache:trade:teams:v1"');
    expect(league).not.toContain('"cache:teams"');
    expect(teams).not.toContain('"cache:teams"');
  });
});

describe("Canary — playoff simulation bracket", () => {
  const src = read("app/lib/playoff-bracket.ts");

  it("does not pad playoff seeds by duplicating the last team", () => {
    expect(src).not.toContain("while (seeds.length < 8)");
    expect(src).toContain("uniqueSeeds");
    expect(src).toContain("fewer than two unique teams");
  });

  it("simulates later rounds by team strength, not bracket argument order", () => {
    expect(src).toContain("export function simulateSeriesByStrength");
    // Conference final still takes the two R2 winners by strength.
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

describe("Canary — Armchair rework Phase 3", () => {
  it("keeps future draft choice and signing market controls wired", () => {
    const armchair = readArmchairAll();
    const futureDraft = read("app/lib/future-draft-choice.ts");
    const resign = read("app/components/ResignPhase.tsx");

    expect(futureDraft).toContain("futureDraftPromptForUserPick");
    expect(futureDraft).toContain("applyFutureDraftChoice");
    expect(armchair).toContain("onSelectUserPick");
    expect(armchair).toContain("selectFutureDraftPick");
    expect(resign).toContain('const [marketSort, setMarketSort] = useState<"ask" | "nav" | "age">("ask")');
    expect(resign).toContain("NAV {nav > 0 ? \"+\" : \"\"}{nav.toFixed(0)}");
    expect(resign).toContain("EDGE HD");
    expect(resign).toContain("Age {ageArrow}");
    expect(resign).toContain("capPct");
  });

  it("Phase 3: re-signing your own free agents is gated by cap space", () => {
    const resign = read("app/components/ResignPhase.tsx");
    // The pending re-sign rows now compute affordability and disable the button
    // (previously you could pile salary well past the ceiling).
    expect(resign).toContain("const affordable = fa.contract.aav <= capSpace");
    expect(resign).toContain("onClick={() => affordable && onResign(fa)}");
    expect(resign).toContain('title={affordable ? "Re-sign to your roster" : "Not enough cap space');
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
    // Pinned to the field consumed, not to the expression. The old assertion
    // quoted `norm(p.qocIndex ?? 35, 0, 100)` verbatim, which locked in the
    // `?? 35` default that Tier 0 removed — a canary holding a bug in place.
    const src = readSource("app/lib/roster-strand.ts");
    expect(src).not.toContain("qocRank");
    expect(src).toContain("acc.Usage.add(p.qocIndex, 0, 100)");
  });

  it("averages each trait over the players who have it, not the whole roster", () => {
    // Thirteen players with five real readings between them used to produce a
    // mean that was mostly eight copies of "we do not know", pulled to 0.5.
    const src = readSource("app/lib/roster-strand.ts");
    expect(src).not.toMatch(/\?\?\s*35\b/);
    expect(src).not.toMatch(/xnav\?\.def/);
    expect(src).toContain("measured(value)");
    expect(src).toContain("export function rosterStrandCoverage");
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

  it("TradeBlockPanel does not expose front-facing admin links", () => {
    const src = read("app/components/TradeBlockPanel.tsx");
    expect(src).not.toContain('href="/admin/trade-block"');
    expect(src).not.toContain("ADMIN →");
  });

  it("match route names the best-fitting shopped player as the return", () => {
    const src = read("app/api/match/route.ts");
    expect(src).toContain("fits as the return");
  });

  it("executed trades clear moved players from the session trade block", () => {
    const tradePage = readArmchairAll();
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

  it("tabs the per-asset detail and surfaces NHL EDGE signals", () => {
    const edgeStrip = read("app/components/EdgeStrip.tsx");
    // Player detail is tabbed (Stats / Strand / Outlook) instead of dumping
    // every panel inline, with accessible tab semantics and touch targets.
    expect(client).toContain('role="tablist"');
    expect(client).toContain('role="tab"');
    expect(client).toContain("aria-selected={active}");
    expect(client).toContain('className="tap-target"');
    expect(client).toContain("<EdgeStrip asset={detailAsset} />");
    // EDGE strip surfaces real snapshot fields for skaters and goalies.
    expect(edgeStrip).toContain("hdFinishingDelta");
    expect(edgeStrip).toContain("edgeSpeedMaxMph");
    expect(edgeStrip).toContain("baselineHdsvPct");
    expect(edgeStrip).toContain("NHL EDGE");
  });
});

describe("Canary — trade proposal audit verification", () => {
  it("generated proposals run the full evaluate verdict before being shown", () => {
    const src = read("app/components/TradeProposal.tsx");
    expect(src).toContain("fetchTradeVerdict");
    expect(src).toContain("tradePassesFullAudit");
    // The audit stays bounded and batched. CXH4 moved the two constants into
    // app/lib/proposal-plan.ts, so this pins the bound rather than the names.
    const plan = read("app/lib/proposal-plan.ts");
    expect(plan).toMatch(/AUDIT_BUDGET = \d+/);
    expect(plan).toMatch(/AUDIT_WAVE = \d+/);
    expect(src).toContain("AUDIT_WAVE");
    expect(src).toContain("planAuditOrder(");
    expect(src).toContain("generateRunRef");
    expect(src).toContain("generateAbortRef");
    expect(src).toContain("auditProgress");
    // The gate now requires a whitelisted accepted status (no more fail-open).
    expect(src).toContain('from "@/app/lib/trade-proposal-audit"');
    expect(src).not.toContain('status !== "BLOCKED" && status !== "DECLINED"');
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

  it("AssetCard exposes a development-profile tab without affecting NAV controls", () => {
    const card = read("app/components/AssetCard.tsx");
    const src = read("app/components/DevelopmentProfilePanel.tsx");
    // RL3 replaced the DEV tab with OUTLOOK. The guarantee this canary was
    // always making is unchanged — a tab gated on the profile existing, and
    // NAV controls untouched by it — so it is pinned to that rather than to
    // the tab's former name. What changed is WHICH read the trade card shows:
    // OUTLOOK is the analytics-desk trajectory read (PA12); the dynasty and
    // boom-bust view is a fantasy question and belongs on fantasy surfaces.
    expect(card).toContain('hasOutlook = Boolean(asset.developmentProfile');
    expect(card).toContain('...(hasOutlook ? ["OUTLOOK"] : [])');
    expect(card).toContain('view === "OUTLOOK" && hasOutlook');
    expect(card).toContain("<PlayerOutlook asset={asset} />");
    // The trade card must NOT carry the fantasy panel any more.
    expect(card).not.toContain("<DevelopmentProfilePanel");
    // ...but it still has to exist, intact, where it is actually used.
    for (const surface of ["app/docket/DocketClient.tsx", "app/components/OffseasonPlayerAnalytics.tsx"]) {
      expect(read(surface), surface).toContain("DevelopmentProfilePanel");
    }
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

  it("Trade Machine asset rows expand into EDGE scouting (measured profile + strands)", () => {
    const quick = read("app/components/QuickTradeMachine.tsx");
    // Expandable per-player row with scouting detail
    expect(quick).toContain("function AssetRow");
    expect(quick).toContain("<MeasuredProfile asset={asset} />");
    expect(quick).toContain("buildAssetTraits(asset, nav)");
    expect(quick).toContain("<StrandDisplay");
    // Scannable collapsed stat chip (skater pts pace / goalie SV% + GSAx)
    expect(quick).toContain("pts/82");
    expect(quick).toContain("GSAx");
    expect(quick).toContain("tap a player for scouting");
    // navMap threaded through every AssetList call site, including the shared link view
    expect(quick).toContain("navMap?: Record<string, XNAVResult>");
    expect(quick).toContain('console.error("[quick shared NAV]"');
  });

  it("Trade Machine shows each team's live contention window + buyer/seller stance", () => {
    const quick = read("app/components/QuickTradeMachine.tsx");
    // Live phase from the whole roster, seed phase as fallback
    expect(quick).toContain("deriveTeamPhase");
    expect(quick).toContain("normalizePhase(homeTeam?.phase)");
    expect(quick).toContain('console.error("[quick trade roster NAV]"');
    // Buyer/seller stance vocabulary + the window badge
    expect(quick).toContain("function TeamWindowBadge");
    expect(quick).toContain("PHASE_META");
    expect(quick).toContain('stance: "Buyer"');
    expect(quick).toContain('stance: "Seller"');
    // Post-trade window shift feeds the badge
    expect(quick).toContain("homePostPhase");
    expect(quick).toContain("partnerPostPhase");
  });
});

describe("Canary — STRAND redesign (rails · one index · EDGE band · 3×3 goalie)", () => {
  const display = read("app/components/StrandDisplay.tsx");
  const view = read("app/components/StrandView.tsx");
  const edge = read("app/components/EdgeStrip.tsx");
  // PA1 moved the player STRAND surface off the index to the dossier panel
  const players = read("app/components/PlayerStrandPanel.tsx");
  const quick = read("app/components/QuickTradeMachine.tsx");
  const docket = read("app/docket/DocketClient.tsx");

  it("renderer puts labels on fixed rails with one 0–100 index + faint raw, and an EDGE footer slot", () => {
    // Trait carries a 0–100 index + a raw sub-line. The shape lives in
    // app/lib/strand-traits.ts now — one definition, re-exported here — so the
    // assertion follows it rather than pinning where it used to sit.
    const traitShape = read("app/lib/strand-traits.ts");
    expect(traitShape).toContain("idx?:");
    expect(traitShape).toContain("raw?:");
    expect(display).toContain("export type { StrandTrait }");
    expect(display).toContain("Math.round(t.val * 100)");
    // Rails own the top/bottom bands and clamp the wave so peaks never hit the text
    expect(display).toContain("RAIL_ZONE");
    expect(display).toContain("Math.min(amplitude, cy - RAIL_ZONE - 4)");
    expect(display).toContain("fixed TOP rail");
    expect(display).toContain("fixed BOTTOM rail");
    // EDGE band renders inside the card via the footer slot
    expect(display).toContain("footer?:");
    expect(display).toContain("{footer && <div");
    // Guide is derived from the traits on screen, not a hardcoded skater list
    expect(display).toContain("TRAIT_GUIDE");
    expect(display).toContain("guideLabels");
  });

  it("goalies use a shared 3×3 model with HDSV actually populated (no hardcoded greyed dash)", () => {
    expect(view).toContain("export function buildGoalieStrandTraits");
    // Six nodes, three per rail. The goals-against node is "GA/GM" rather than
    // "GAA": it is goals per appearance, and calling it GAA claimed a per-60
    // figure the data cannot support. The count and the rails are the
    // guarantee; the label is free to be corrected.
    for (const label of ["GSAX", "SV%", "HDSV", "WRKLD", "BUSY"]) {
      expect(view).toContain(`label: "${label}"`);
    }
    expect(view).toMatch(/label: "GAA"/);
    // HDSV comes from the real EDGE field, greying out only when truly absent
    expect(view).toContain("baselineHdsvPct");
    // The goals-against index is inverted so a stingy goalie reads high
    expect(view).toMatch(/label: "GAA"[\s\S]{0,200}invert: true/);
    // The players page no longer hardcodes HDSV to unavailable
    expect(players).toContain("buildGoalieStrandTraits(player)");
    expect(players).not.toContain('val: 0.5, unavailable: true');
  });

  it("EDGE strip takes a structural signal source so both Asset and Player can pass it", () => {
    expect(edge).toContain("export interface EdgeSignalSource");
    expect(edge).toContain("asset: EdgeSignalSource");
  });

  it("every strand surface renders the EDGE band beneath the shape", () => {
    expect(view).toContain("footer={<EdgeStrip asset={asset} heading={false} />}");
    expect(players).toContain("footer={<EdgeStrip asset={player} heading={false} />}");
    expect(quick).toContain("footer={<EdgeStrip asset={asset} heading={false} />}");
    expect(docket).toContain("footer={<EdgeStrip asset={detailAsset} heading={false} />}");
    // Goalies get the GOALTENDER badge, not a mislabelled skater archetype
    expect(quick).toContain('? "GOALTENDER"');
    expect(docket).toContain('? "GOALTENDER"');
  });

  it("strand numbers are self-explaining: persistent key, real units, clear labels", () => {
    // Always-visible key answering "what is this number?"
    expect(display).toContain("0–100 rating vs the NHL field");
    expect(display).toContain("= the actual stat");
    // A width cap so a full-bleed page doesn't blow the SVG up
    expect(display).toContain("maxWidth");
    expect(players).toContain("maxWidth={460}");
    // Ice time reads as minutes, not metres; QoC replaces the vague "Usage";
    // suppression is shown positive (higher = stingier)
    expect(view).toMatch(/label: "TOI"[\s\S]{0,300}min\/gm/);
    expect(view).toContain('label: "QoC"');
    expect(view).not.toContain('label: "Usage"');
    expect(view).not.toContain('label: "TOI+"');
    expect(view).toContain("(higher = stingier)");
  });

  it("EDGE OZ-time percentile is normalized from the feed's 0–1 fraction", () => {
    expect(edge).toContain("a.edgeOzPercentile <= 1 ? a.edgeOzPercentile * 100");
    expect(edge).toContain("%ile");
  });
});

describe("Canary — Player Card AA redesign + FMV surplus read", () => {
  const card = read("app/components/PercentileCard.tsx");
  const tip = read("app/components/MetricTip.tsx");

  it("renders percentiles as a semantic table with scoped headers and accessible bars", () => {
    expect(card).toContain("<table");
    expect(card).toContain("<caption>");
    expect(card).toContain('scope="col"');
    expect(card).toContain('scope="row"');
    // Bars are labelled for assistive tech, not color-only
    expect(card).toContain('role="img"');
    expect(card).toContain("th percentile —");
    // Value breakdown uses a description list, not a bare grid of divs
    expect(card).toContain("<dl");
    expect(card).toContain("<dt>");
    // Card is a labelled group and no longer capped at the cramped 380px
    expect(card).toContain('role="group"');
    expect(card).toContain("maxWidth: 620");
    // PA6/PA7: exportable, branded, with gravity + EDGE strips on the plate
    // PA6: image export renders server-side (Satori/next-og), not html2canvas —
    // the client rasterizer drew black backgrounds in Firefox. The button
    // POSTs a payload to the card-image route and downloads the returned PNG.
    expect(card).toContain("Export Card (PNG)");
    expect(card).toContain("/api/card-image");
    expect(card).not.toContain("html2canvas");
    // Headshot proxied same-origin and inlined as a data URL for the renderer
    // The headshot proxy is gone on purpose. The card is built to be shared,
    // so embedding league-owned photography in it was redistribution — and the
    // drawn bust removes the dependency rather than merely hiding it.
    expect(card).not.toContain("/api/headshot");
    expect(card).toContain("<PlayerAvatar");
    expect(card).toContain("CAP & CREASE");
    expect(card).toContain("MODEL_PRICE_LABEL");
    expect(card).toContain("Extended Net Asset Value");
    // Missing stats read as "No data", never a fabricated 50th percentile
    expect(card).toContain("No data");
  });

  it("reads the contract against the model price, through the shared verdict", () => {
    // The card used to decide this inline: `surplus >= 1 ? "BARGAIN" : ...`.
    // That $1M is smaller than the model's own error, so a gap it cannot
    // resolve was printed as a verdict — Eichel's $1.1M being the case that
    // exposed it. The threshold now comes from the fit's published error, and
    // it must come from ONE place so three surfaces cannot drift apart.
    expect(card).toContain("contractVerdict");
    expect(card).not.toMatch(/surplus\s*>=\s*1\s*\?/);
    expect(card).not.toContain('"BARGAIN"');
    expect(card).not.toContain('"OVERPAY"');
    // Never "Fair Market Value" — the model predicts what clubs pay, it does
    // not adjudicate what a player is worth, and the label must not claim it.
    expect(card).not.toContain("Fair Market Value");
    expect(card).not.toContain("Market AAV");
    // NAV breakdown values are rounded (goalie def path is not pre-rounded)
    expect(card).toContain("Math.round(c.val)");
  });

  it("MetricTip is keyboard + screen-reader accessible", () => {
    expect(tip).toContain("tabIndex={0}");
    expect(tip).toContain("onFocus={enter}");
    expect(tip).toContain("onBlur={leave}");
    expect(tip).toContain('aria-label={`${term}: ${tip}`}');
    expect(tip).toContain('role="tooltip"');
    expect(tip).toContain('e.key === "Escape"');
  });
});

describe("Canary — draft pick inventory", () => {
  it("league routes create rounds 1-5 for five draft years", () => {
    const league = read("app/api/league/route.ts");
    const teams = read("app/api/league/teams/route.ts");
    const helper = read("app/lib/draft-pick-inventory.ts");
    expect(league).toContain("buildDraftPickInventory(LIVE_TEAMS)");
    expect(teams).toContain("buildDraftPickInventory(LIVE_TEAMS)");
    expect(helper).toContain("[firstYear, firstYear + 1, firstYear + 2, firstYear + 3, firstYear + 4]");
    expect(helper).toContain("SEASON.firstTradablePickYear");
    expect(helper).toContain("[1, 2, 3, 4, 5].map(round => ({ round, year }))");
    expect(helper).toContain("draftPickOverrides");
    expect(helper).toContain("currentOwnerId");
    expect(helper).toContain("via ${origTeam.id}");
  });
});

describe("Canary — admin cache flush", () => {
  it("clear-cache flushes BOTH the teams and contracts caches", () => {
    const src = read("app/api/admin/clear-cache/route.ts");
    const teamCache = read("app/lib/team-cache.ts");
    expect(src).toContain("clearTeamCaches(redis)");
    expect(teamCache).toContain("cache:league:teams:v1");
    expect(teamCache).toContain("cache:trade:teams:v1");
    expect(teamCache).toContain("teamCacheKey(SEASON.capCeiling)");
    expect(teamCache).toContain("teamCacheKey(LEGACY_CURATED_CAP_CEILING)");
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
    expect(panelSrc).toContain("What does each score mean?");
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
    const armchair = readArmchairAll();
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
    const src = readArmchairAll();
    expect(src).toContain("const ptsPace = a.ptsPace ?? 0");
    expect(src).toContain("const avgTOI = a.avgTOI ?? 0");
    expect(src).toContain("const capHit = a.capHit ?? 0");
    expect(src).not.toContain("a.ptsPace.toFixed");
    expect(src).not.toContain("a.avgTOI.toFixed");
    expect(src).not.toContain("a.capHit.toFixed");
  });

  it("executed trades do not re-rank the league or remap team phases client-side", () => {
    const src = readArmchairAll();
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

  it("applies the pedigree floor to talent, preserving contract drag and booking the lift to upside", () => {
    expect(evaluateRoute).toContain("getHistoricalFloor");
    // Floor talent (total − cap), not the bottom line, so a pedigree lift can't
    // cancel a toxic contract; the cap component stays honest.
    expect(evaluateRoute).toContain("const talent = result.total - contractDrag");
    expect(evaluateRoute).toContain("getHistoricalFloor(asset.name, talent, asset)");
    expect(evaluateRoute).toContain("total: liftedTotal");
    expect(evaluateRoute).toContain("upside: (result.upside ?? 0) + (liftedTotal - result.total)");
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
  const tradePage = readArmchairAll();
  const tradeLoading = read("app/armchair-gm/loading.tsx");
  const assetDropdown = read("app/components/AssetDropdown.tsx");
  const lineupEditor = read("app/components/LineupEditor.tsx");
  const header = read("app/components/Header.tsx");
  const quickTradeMachine = read("app/components/QuickTradeMachine.tsx");
  const tradeMachineRoute = read("app/trade-machine/page.tsx");
  const sharedTradeRoute = read("app/t/[code]/page.tsx");
  const sharedTradeImageRoute = read("app/t/[code]/opengraph-image.tsx");
  const teamStrand = read("app/components/TeamStrand.tsx");
  const resignPhase = read("app/components/ResignPhase.tsx");
  const offerSheetPhase = read("app/components/OfferSheetPhase.tsx");

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

  it("threads ordered lineup slots from the editor into the sim engine", () => {
    const simulateRoute = read("app/api/simulate/route.ts");
    const simDispatch = read("app/armchair-gm/useSimDispatch.ts");
    expect(lineupEditor).toContain("onLineupChange");
    expect(lineupEditor).toContain("savedLineupOrders");
    expect(lineupEditor).toContain("hydrateLineupOrdersForRoster");
    expect(lineupEditor).toContain("forwards: orders.F.slice(0, 12)");
    expect(tradePage).toContain("lineupOrders");
    expect(tradePage).toContain("savedLineupOrders={lineupOrders}");
    expect(simDispatch).toContain("newlyAddedPlayers");
    expect(simDispatch).toContain("simPlayerPool");
    expect(simDispatch).toContain("orders: lineupOrders");
    expect(simulateRoute).toContain("lineup?.orders?.[team.id]");
    expect(simulateRoute).toContain("buildDeploymentMap(lineupOrder)");
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
    // The tile shows a position — now the alternate too, so this pins that a
    // position is rendered rather than the exact expression that renders it.
    expect(lineupEditor).toContain('displayPosition(p.position, p.secondaryPosition) : "--"');
    expect(lineupEditor).toContain("minHeight: 50");
    expect(lineupEditor).not.toContain("Click a player, then click another slot");
  });

  it("lineup editor keeps extra goalies on the swappable bench", () => {
    expect(lineupEditor).toContain("const gBench = orders.G.slice(2)");
    expect(lineupEditor).toContain('group: "G" as Group, idx: 2 + i');
    // Clicking across groups reselects rather than swapping — a goalie cannot
    // be dropped into a forward slot. (Pinned as intent: this used to assert
    // the exact `setSelected` updater line that CXH2 removed.)
    expect(lineupEditor).toMatch(/selected\.group !== group\)\s*\{?\s*setSelected\(\{ group, idx \}\)/);
    expect(lineupEditor).toContain('renderCell("G", 0, "G ")');
    expect(lineupEditor).toContain('renderCell("G", 1, "G ")');
  });

  it("Armchair GM Phase 5 keeps mobile controls touch-sized and keyboard-visible", () => {
    const globals = read("app/globals.css");
    const tabs = read("app/armchair-gm/GmAnalysisTabs.tsx");
    const verdictSheet = read("app/armchair-gm/VerdictSheet.tsx");
    expect(globals).toContain(".tap-target");
    expect(globals).toContain("min-height: 44px");
    expect(globals).toContain("[role=\"button\"]):focus-visible");
    expect(globals).toContain(".armchair-trade-flow");
    expect(tradePage).toContain("armchair-trade-flow");
    expect(tradePage).toContain("aria-label=\"Run GM audit for the current trade\"");
    // CXH8 replaced toggle semantics with real tab semantics: a pressed button
    // is a toggle, a tab selects a panel, and only the latter is announced as
    // "N of M" with arrow-key navigation between them.
    expect(tabs).toContain('role="tab"');
    expect(tabs).toContain("aria-selected={active}");
    expect(tabs).toContain('role="tablist"');
    expect(tabs).not.toContain("aria-pressed={active}");
    expect(tabs).toContain("aria-label={`Open ${label} tab`}");
    expect(tabs).toContain("aria-label=\"Simulate one season\"");
    expect(verdictSheet).toContain("aria-expanded={verdictOpen}");
    expect(verdictSheet).toContain("aria-label={verdictOpen ? \"Collapse trade verdict sheet\" : \"Expand trade verdict sheet\"}");
    expect(lineupEditor).toContain("role=\"button\"");
    expect(lineupEditor).toContain("tabIndex={0}");
    expect(lineupEditor).toContain("onKeyDown={(event) => keySlot(event, group, idx)}");
  });

  it("free-agency modals are accessible and paginate full markets", () => {
    expect(resignPhase).toContain("MARKET_PAGE_SIZE");
    expect(resignPhase).toContain("marketPageItems");
    expect(resignPhase).toContain("Previous free agent page");
    expect(resignPhase).toContain("Next free agent page");
    expect(resignPhase).not.toContain(".slice(0, 60)");
    expect(offerSheetPhase).toContain("RFA_PAGE_SIZE");
    expect(offerSheetPhase).toContain("visibleRfas");
    expect(offerSheetPhase).toContain("Previous RFA page");
    expect(offerSheetPhase).toContain("Next RFA page");
    expect(offerSheetPhase).not.toContain(".slice(0, 60)");
    expect(resignPhase).toContain('role="dialog"');
    expect(resignPhase).toContain('aria-modal="true"');
    expect(offerSheetPhase).toContain('role="dialog"');
    expect(offerSheetPhase).toContain('aria-modal="true"');
    expect(resignPhase).toContain("tap-target");
    expect(offerSheetPhase).toContain("tap-target");
  });

  it("surfaces the curated FA class and lets AI work the open pool", () => {
    const roster = read("app/lib/roster-assembly.ts");
    const freeAgency = read("app/lib/free-agency.ts");
    // The curated 2026 UFA/RFA class must actually be wired into the FA-pool
    // injection — it was dead code, so the marquee free agents never showed.
    expect(roster).toContain("seedFreeAgentStatus");
    expect(roster).toContain("d.expiryStatus ?? seedFreeAgentStatus(d.name)");
    // The pre-existing FA pool is AI-signable (addMarketCandidate) so contenders
    // work through the board — cap/need naturally leave plenty for the user.
    expect(freeAgency).toContain('!player.teamId || player.teamId === "FA_POOL"');
    expect(freeAgency).toContain("addMarketCandidate({ player, contract: marketContract });");
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
    // TM7 landing: reworked hero with the three-step strip, no Armchair CTA
    expect(quickTradeMachine).toContain("Put a deal on the record.");
    expect(quickTradeMachine).toContain("How the trade desk works");
    expect(quickTradeMachine).not.toContain("Open Armchair GM");
    expect(quickTradeMachine).toContain("Generate Share Link");
    expect(quickTradeMachine).toContain("/t/");
  });

  it("shows industry-style cap, production, NOIV, NAV, and GM audit context in the focused Trade Machine", () => {
    expect(quickTradeMachine).toContain("fetchNavMap");
    expect(quickTradeMachine).toContain("TeamTradeSummary");
    expect(quickTradeMachine).toContain("TeamStrandPreview");
    expect(quickTradeMachine).toContain("Projected Cap");
    expect(quickTradeMachine).toContain("Production");
    expect(quickTradeMachine).toContain("NOIV");
    expect(quickTradeMachine).toContain("Package NAV");
    expect(quickTradeMachine).toContain("Package NAV Balance");
    expect(quickTradeMachine).toContain("setShareUrl(\"\")");
    expect(quickTradeMachine).toContain("GM Logic Signal");
    expect(quickTradeMachine).toContain("TradeBalanceStrip");
  });

  it("shows trade deltas on Team Strands when a pre-trade compare strand is supplied", () => {
    expect(teamStrand).toContain("signedDelta");
    expect(teamStrand).toContain("traitDeltas");
    expect(teamStrand).toContain("compareOffVals");
    expect(teamStrand).toContain("trade impact");
    expect(teamStrand).toContain("fontSize: 11");
    expect(quickTradeMachine).toContain("sideOutcomes");
    expect(quickTradeMachine).toContain("Team Strands");
    expect(quickTradeMachine).toContain("Pre/Post Delta");
    expect(quickTradeMachine).toContain("computeRosterStrand");
    expect(quickTradeMachine).toContain("compare={preTradeHomeStrand ?? undefined}");
    expect(tradePage).toContain("preTradeHomeStrand");
    expect(tradePage).toContain("preTradePartnerStrand");
    expect(tradePage).toContain("compare={compare ?? undefined}");
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

describe("Canary — contracts are hand-maintained, not scraped", () => {
  const route = read("app/api/admin/contracts/route.ts");
  const prune = read("app/api/admin/prune-stale/route.ts");

  it("nothing in the contract path fetches a third party's site", () => {
    // CapWages sell an API and began 403ing the scraper, which is their right.
    // Coding around a bot check to avoid paying for the product somebody sells
    // is not a thing this project does, so the scraper was deleted rather than
    // disguised.
    expect(route).not.toContain("scrapeCapWages");
    expect(route).not.toContain("capwages");
    expect(prune).not.toContain("scrapeCapWages");
  });

  it("the ingest endpoint refuses to invent its own data", () => {
    // It used to scrape when handed an empty body, which is also how a failed
    // scrape could quietly write a half-league of nulls.
    expect(route).toMatch(/No players supplied/);
    expect(route).toMatch(/status:\s*400/);
  });

  it("pruning is gated on the committed baseline, which cannot be blocked", () => {
    // The gate exists because a source that fails flags the whole league as
    // stale. A committed file cannot 403 or rate-limit, and a bad one shows up
    // in a diff rather than at deletion time.
    expect(prune).toContain("contracts.bundled.json");
    expect(prune).toContain("sourcesHealthy");
  });

  it("sync still treats dash position placeholders as missing metadata", () => {
    expect(route).toContain("pos === \"-\"");
    expect(route).toContain("first === \"-\"");
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
    const teamCache = read("app/lib/team-cache.ts");
    expect(src).toContain("clearTeamCaches(redis, db");
    expect(teamCache).toContain("teamCacheKey(SEASON.capCeiling)");
    expect(teamCache).toContain("teamCacheKey(LEGACY_CURATED_CAP_CEILING)");
    expect(evaluate).toContain("const MAX_CAP_CEILING = maxCapCeiling()");
    expect(evaluate).toContain("isValidCapCeiling(requestCapCeiling)");
    expect(evaluate).toContain("parseStoredCapCeiling(row?.value, SEASON.capCeiling) ?? SEASON.capCeiling");
    expect(teams).toContain("siteSettings");
    expect(teams).toContain("const getLiveCapCeiling = async ()");
    expect(teams).toContain('r.key === "cap_ceiling"');
    expect(teams).toContain("parseStoredCapCeiling(row?.value, SEASON.capCeiling) ?? SEASON.capCeiling");
    // Cap space = curated static room shifted by the ceiling delta (Decision A),
    // NOT a naive sum of all contract rows (which overstated used cap → false negatives).
    // Decision A is unchanged; it moved into a shared module because the other
    // league route did NOT apply the delta and the two disagreed by $8.5M for
    // every club. Pin the rule where it lives now, and that both routes use it.
    const capSpaceLib = read("app/lib/team-cap-space.ts");
    expect(capSpaceLib).toContain("export const CURATED_CAPSPACE_CEILING = 95.5");
    expect(capSpaceLib).toContain("capCeiling - CURATED_CAPSPACE_CEILING");
    expect(teams).toContain("resolveTeamCapSpace");
    expect(read("app/api/league/route.ts")).toContain("resolveTeamCapSpace");
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
    expect(src).toContain("clearTeamCaches(redis, db)");
    expect(settings).toContain("ADMIN DATA RESET");
    expect(settings).toContain("/api/admin/reset");
    expect(settings).toContain("includeTrades");
    expect(dashboard).toContain("/admin/draft-picks");
    expect(dashboard).not.toContain("/admin/fa-overrides");
  });

  it("keeps dead ContractSyncer and obsolete contracts API retired", () => {
    expect(fs.existsSync(path.join(process.cwd(), "app/components/ContractSyncer.tsx"))).toBe(false);
    expect(fs.existsSync(path.join(process.cwd(), "app/api/contracts/route.ts"))).toBe(false);
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
    expect(rosterAssembly).toContain("if (row.retired || row.excludeFromRoster) continue");
    expect(rosterAssembly).toContain("if (d.retired || d.excludeFromRoster) continue");
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
    // The bar math now lives in the tested pure helper.
    expect(src).toContain("compareStat(homeVal, partnerVal, higherIsBetter)");
    expect(src).toContain('higherIsBetter={false}');
    const lib = read("app/lib/stat-bar-compare.ts");
    expect(lib).toContain("((worst - v) / (worst - best)) * 100");
  });

  it("players page renders development profiles and paged position sections", () => {
    const src = read("app/players/page.tsx");
    // PA12: the analytics Outlook is the redefined trajectory read now.
    expect(src).toContain("PlayerOutlook");
    expect(src).toContain("developmentProfile?: DevelopmentProfile | null");
    expect(src).toContain("Player Outlook");
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
    expect(timeline).toContain("Projected next contract");
    expect(timeline).toContain("fair-market midpoint");
    // Reworked contract tab: accessible table, labelled NAV, current-deal surplus read.
    expect(timeline).toContain("<table");
    expect(timeline).toContain('scope="row"');
    expect(timeline).toContain("Trade value (NAV) by contract year");
    expect(timeline).toContain("surplusText");
    expect(timeline).toContain("contractVerdict");
    expect(timeline).toContain("Current deal");
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
    expect(strand).toContain("What does each trait mean?");
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
    // The guarantee is that every overlay locks scroll — not that it does so
    // through one page-level argument list. CXH8 moved the lock into
    // `useDialog`, and the list was precisely why the memo modal and the Cup
    // resume prompt had been left out of it. So each overlay must satisfy one
    // of the two mechanisms, and it is a failure only if it satisfies neither.
    const lockCall = armchair.slice(armchair.indexOf("useBodyScrollLock("));
    const lockArgs = lockCall.slice(0, lockCall.indexOf(");"));
    const OVERLAYS: [string, string][] = [
      ["showTeamSelect", "app/armchair-gm/TeamSelectModal.tsx"],
      ["modeSelectOpen", "app/armchair-gm/ModeSelectModal.tsx"],
      ["draftOpen", "app/components/DraftNight.tsx"],
      ["tradeBlockOpen", ""],
      ["tradeRequest", ""],
      ["resignOpen", ""],
      ["offerSheetOpen", ""],
      ["cupDraftSummary", ""],
    ];
    for (const [flag, component] of OVERLAYS) {
      const viaList = lockArgs.includes(flag);
      const viaDialog = component !== "" && read(component).includes("useDialog");
      expect(viaList || viaDialog, `${flag} must lock body scroll`).toBe(true);
    }
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
    const armchair = readArmchairAll();
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

describe("Canary — Claude concerns", () => {
  it("keeps Armchair GM simulation dispatch extracted from the monolithic page", () => {
    const page = read("app/armchair-gm/page.tsx");
    const hook = read("app/armchair-gm/useSimDispatch.ts");
    expect(page).toContain('import { useSimDispatch } from "./useSimDispatch"');
    expect(page).toContain("} = useSimDispatch({");
    expect(page).not.toContain('fetch("/api/simulate"');
    expect(page).not.toContain("const simAbortRef");
    expect(hook).toContain("export function useSimDispatch");
    expect(hook).toContain('fetch("/api/simulate"');
    expect(hook).toContain('kind: "season_recap"');
  });
});

describe("Canary — sim without a trade + AI best lines", () => {
  it("lets a season be simulated with zero trades", () => {
    const hook = read("app/armchair-gm/useSimDispatch.ts");
    const tabs = read("app/armchair-gm/GmAnalysisTabs.tsx");
    // The dispatch no longer requires an executed trade.
    expect(hook).not.toContain("executedTrades.length === 0) return");
    expect(hook).toContain("if (!homeTeam) return;");
    // The Sim tab is always present and the button is not gated on trades.
    expect(tabs).toContain('{ key: "sim", label: "Sim"');
    expect(tabs).not.toContain('disabled={simLoading || executedTrades.length === 0}');
    expect(tabs).toContain("Baseline (No Trades)");
  });

  it("fields best lines for every team by default in the sim engine", () => {
    const route = read("app/api/simulate/route.ts");
    expect(route).toContain("function defaultLineupOrder");
    expect(route).toContain("lineup?.orders?.[team.id] ?? defaultLineupOrder(roster)");
  });

  it("shows a measured profile (percentiles vs NHL, not a rating) on the player card", () => {
    const lib = read("app/lib/measured-profile.ts");
    const comp = read("app/components/MeasuredProfile.tsx");
    const card = read("app/components/AssetCard.tsx");
    expect(lib).toContain("export function computeMeasuredProfile");
    // Sim drivers as dimensions.
    for (const key of ["production", "opportunity", "burst", "finishing", "pedigree"]) {
      expect(lib).toContain(`key: "${key}"`);
    }
    // No-sample dimensions are flagged, never invented.
    expect(lib).toContain('"no EDGE sample"');
    expect(comp).toContain("percentile vs NHL · not a rating");
    expect(card).toContain("<MeasuredProfile asset={asset} />");
  });

  it("threads the EDGE burst channel into the season projection", () => {
    const burst = read("app/lib/burst-channel.ts");
    const route = read("app/api/simulate/route.ts");
    expect(burst).toContain("export function burstProfile");
    expect(burst).toContain("rushLift");
    expect(burst).toContain("varianceKick");
    // Applied to the projection: rush lift on points, variance kick on the tail.
    expect(route).toContain("const burst = burstProfile(p);");
    expect(route).toContain("rand() * burst.varianceKick");
    expect(route).toContain("* burst.rushLift");
  });

  it("splits the season box score into Forwards and Defense sections", () => {
    const pager = read("app/armchair-gm/SeasonResultsPager.tsx");
    expect(pager).toContain("const forwards = skaters.filter");
    expect(pager).toContain("const defense = skaters.filter");
    expect(pager).toContain("Forwards ·");
    expect(pager).toContain("Defense ·");
    expect(pager).toContain("Goaltending");
  });

  it("Phase 1: valuation breakdown reconciles to X-NAV, prospects show ELC, career-year split", () => {
    const pager = read("app/armchair-gm/SeasonResultsPager.tsx");
    const engine = read("app/lib/xnav-engine.ts");
    const sim = read("app/api/simulate/route.ts");
    // The breakdown reconciles to X-NAV, and says WHAT each row is.
    //
    // This used to pin the plug implementation: `nav.total - componentSum`
    // under a row labelled "Model Adj." — which closed the arithmetic without
    // naming the difference, and pinned the very thing Tier 0 removed. The
    // guarantee was always "these rows produce the headline"; that is what is
    // asserted now, and the row-by-row identity lives in nav-identity.test.ts.
    expect(pager).toContain("navStagesForDisplay(nav.stages, nav.total)");
    expect(pager).toContain("= <strong>X-NAV {nav.total}</strong>");
    // Prospects with no market AAV read ELC, not "$—M"
    expect(pager).toContain("'ELC / n/a'");
    // Defensemen get pairing labels, not forward line labels
    expect(engine).toContain("ELITE_1ST_PAIR");
    expect(engine).toContain("isD = false");
    expect(engine).toContain("classifyRosterTier(toi, normalizedPts, evMdep, qocIdx, evToi, shToi, isD)");
    // A veteran over-pace is a career year, not a breakout
    expect(sim).toContain('breakoutTag = p.age <= 26 ? "BREAKOUT" : "CAREER_YEAR"');
    expect(pager).toContain("CAREER_YEAR");
  });

  it("renders League Numbers as real standings by conference and division", () => {
    const pager = read("app/armchair-gm/SeasonResultsPager.tsx");
    const route = read("app/api/simulate/route.ts");
    // The sim already returns full standings; the pager renders them grouped.
    expect(route).toContain("standings:   standings.slice(0, 32)");
    expect(pager).toContain("function LeagueNumbers");
    expect(pager).toContain("function DivisionStandings");
    expect(pager).toContain('conf: "Eastern"');
    expect(pager).toContain('conf: "Western"');
    expect(pager).toContain("Final Standings");
    expect(pager).toContain("function playoffMark");
  });
});

describe("Canary — live team timelines", () => {
  it("derives each team's phase from its live roster and recomputes on roster/nav change", () => {
    const contention = read("app/armchair-gm/contention.ts");
    const page = read("app/armchair-gm/page.tsx");
    expect(contention).toContain("export function deriveTeamPhase");
    expect(contention).toContain('present >= 6.5 ? "Contender"');
    expect(page).toContain("deriveTeamPhase(roster, navMap)");
    expect(page).toContain("}, [db.players, navMap]);");
  });
});

describe("Canary — ship-readiness infrastructure", () => {
  it("has error boundary, 404 page, robots.ts, and sitemap.ts", () => {
    const error = read("app/error.tsx");
    const notFound = read("app/not-found.tsx");
    const robots = read("app/robots.ts");
    const sitemap = read("app/sitemap.ts");
    expect(error).toContain("Something went wrong");
    expect(error).toContain("reset");
    expect(notFound).toContain("No ruling on file");
    expect(robots).toContain("/admin/");
    expect(sitemap).toContain("/teams");
    expect(sitemap).toContain("/trade-machine");
  });

  it("has Team Analytics page consuming league data with contention + EDGE", () => {
    const teamsPage = read("app/teams/page.tsx");
    expect(teamsPage).toContain("computeContention");
    expect(teamsPage).toContain("computeTeamEdgeProfile");
    expect(teamsPage).toContain("Team Analytics");
    expect(teamsPage).toContain("EDGE Profile");
    expect(teamsPage).toContain("Roster NAV");
  });

  it("has Teams link in the site-wide nav header", () => {
    const header = read("app/components/Header.tsx");
    expect(header).toContain('href="/teams"');
    expect(header).toContain('"teams"');
  });
});

describe("Canary — G4 model propagation", () => {
  it("evaluate route cannot silently drop the gravity NZ-well input again", () => {
    // AssetInput declares edgeOzPct, and the evaluate route's field-by-field
    // adapter maps it — the drift class behind the Fox home-vs-analytics bug.
    const engine = read("app/lib/xnav-engine.ts");
    const evaluate = read("app/api/evaluate/route.ts");
    expect(engine).toContain("edgeOzPct?: number | null;");
    expect(evaluate).toContain("edgeOzPct: asset.edgeOzPct");
  });

  it("season simulator feels gravity and speaks modern roles", () => {
    const sim = read("app/api/simulate/route.ts");
    // Team strength includes the zone-mass on-ice term…
    expect(sim).toContain("simOnIceDelta");
    expect(sim).toContain("computeGravity");
    expect(sim).toContain("gravityDelta(p)");
    // …and traded-player outcomes carry evidence-derived role labels.
    expect(sim).toContain("derivePlayerRoles");
    // The sim-side term lives in the gravity engine, one formula, one place.
    const gravity = read("app/lib/gravity.ts");
    expect(gravity).toContain("export function simOnIceDelta");
  });

  it("season recap names the traded player's modern role", () => {
    const claude = read("app/api/claude/route.ts");
    expect(claude).toContain("role: z.string().optional()");
    expect(claude).toContain("roleTag");
  });
});

describe("Canary — PA5 STRAND compare + PA8 dated feed + AG3 positions", () => {
  it("PA5: the STRAND dossier panel offers a peer-compare dropdown", () => {
    const panel = read("app/components/PlayerStrandPanel.tsx");
    expect(panel).toContain("peers");
    expect(panel).toContain("compareOff");
    expect(panel).toContain("<select");
    // The dossier page feeds same-position peers into it
    const page = read("app/players/[playerId]/page.tsx");
    expect(page).toContain("buildComparePeers");
    expect(page).toContain("peers={comparePeers}");
  });

  it("PA8: the Hot Off the Press feed orders by signing date with a dated column", () => {
    const players = read("app/players/page.tsx");
    expect(players).toContain("orderFreshInk");
    expect(players).toContain("signedRecency");
    // signing date is a real, persisted fact, stamped on set and threaded through
    const schema = read("app/db/schema.ts");
    expect(schema).toContain("extension_signed_at");
    const admin = read("app/api/admin/contracts/route.ts");
    expect(admin).toContain("extensionSignedAt");
    const assembly = read("app/lib/roster-assembly.ts");
    expect(assembly).toContain("extensionSignedAt");
  });

  it("AG3: alternate positions are honored by the shared lineup eligibility", () => {
    const order = read("app/lib/lineup-order.ts");
    // secondary position is consulted, and the helpers are exported (single source)
    expect(order).toContain("secondaryPosition");
    expect(order).toContain("export const isC");
    expect(order).toContain("export const isW");
    // the editor no longer keeps its own divergent copies
    const editor = read("app/components/LineupEditor.tsx");
    expect(editor).toContain("isC, isW, isF, isD, isG");
    expect(editor).not.toContain('const isC = (p: Player)');
  });
});

describe("Canary — TM1 visual roster grid picker", () => {
  it("replaces the outgoing-asset dropdown with a tap-to-add roster grid", () => {
    const tm = read("app/components/QuickTradeMachine.tsx");
    // The visual grid, team-first, grouped by position — not a <select> of assets
    expect(tm).toContain("RosterGridPicker");
    expect(tm).toContain("groupTeamRoster");
    expect(tm).toContain("Select a team to see its roster");
    // The old AssetPicker dropdown component is gone
    expect(tm).not.toContain("function AssetPicker");
    // Cards are real buttons (keyboard/tap), labelled for assistive tech
    expect(tm).toContain("Add ${isPick ? assetLabel(asset) : asset.name} to the package");
  });
});

describe("Canary — PA12 redefined analytics Outlook", () => {
  it("the Outlook tab reads trajectory + EDGE, not the fantasy dynasty wall", () => {
    const page = read("app/players/page.tsx");
    // The analytics tab now renders the redefined Outlook…
    expect(page).toContain("PlayerOutlook");
    expect(page).toContain("Player Outlook");
    // …and no longer the dynasty/boom-bust DevelopmentProfilePanel here
    expect(page).not.toContain("DevelopmentProfilePanel");

    const outlook = read("app/components/PlayerOutlook.tsx");
    expect(outlook).toContain("deriveOutlook");
    expect(outlook).toContain("Next-Season Projection");
    expect(outlook).toContain("Scoring Trajectory");
    expect(outlook).toContain("Leading Indicators");

    // The derivation is honest for vets (no dynasty framing) and EDGE-forward
    const lib = read("app/lib/player-outlook.ts");
    expect(lib).toContain("export function deriveOutlook");
    expect(lib).toContain("edgeReads");
    expect(lib).not.toContain("dynastyScore");
  });
});

describe("Canary — /api/league/players performance + OPS/DPS resilience", () => {
  it("caches the assembled roster payload and only when point-shares loaded", () => {
    // Pins the intent, not one implementation of it. The route moved from
    // cache-or-block (redis.get / redis.setex inline) to swrCache, which serves
    // stale instantly and refreshes behind the request — the guarantee this
    // canary exists for is stronger now, not weaker.
    const route = read("app/api/league/players/route.ts");
    expect(route).toContain("LEAGUE_PLAYERS_CACHE_KEY");
    expect(route).toContain("swrCache");
    expect(route).toContain("isHealthyRoster");        // don't cache a blank-OPS/DPS payload
    expect(route).toContain("stale-while-revalidate"); // CDN cache header
  });

  it("never makes a visitor wait for the rebuild when something is servable", () => {
    // The measured 20-25s cold load: a 15-minute TTL over a ~40s assembly meant
    // whoever arrived first after it lapsed paid the whole cost.
    const route = read("app/api/league/players/route.ts");
    expect(route).toContain("freshSeconds");
    expect(route).toContain("staleSeconds");
    const swr = read("app/lib/swr-cache.ts");
    expect(swr).toContain("export function cacheDecision");
    // Stale must return without awaiting the rebuild.
    expect(swr).toMatch(/state === "stale"[\s\S]{0,900}blocked: false/);
  });

  it("the players cache is invalidated by every roster mutation", () => {
    // It rides the shared team-cache key set that clearTeamCaches drops.
    const teamCache = read("app/lib/team-cache.ts");
    expect(teamCache).toContain("LEAGUE_PLAYERS_CACHE_KEY");
    expect(teamCache).toMatch(/teamCacheKeys[\s\S]*LEAGUE_PLAYERS_CACHE_KEY/);
  });

  it("point-shares serve a last-good copy when the NHL stats API fails", () => {
    const assembly = read("app/lib/roster-assembly.ts");
    expect(assembly).toContain("POINT_SHARES_STALE_KEY");
    expect(assembly).toContain("serving stale point-shares");
    // failure paths throw into the catch so the stale fallback runs
    expect(assembly).not.toContain("!skatersRes.value.ok) return psMap");
  });
});

describe("Canary — F0 fantasy draft tool workshop", () => {
  it("the fantasy desk is league-configurable with tiers and a draft tracker", () => {
    const page = read("app/fantasy/page.tsx");
    // League settings drive scoring + VBD, persisted per device
    expect(page).toContain("League Settings");
    expect(page).toContain("FANTASY_SETTINGS_KEY");
    expect(page).toContain("sanitizeSettings");
    // Sortable board, tier chips, draft-night tracker
    expect(page).toContain("aria-sort");
    expect(page).toContain("Tier");
    expect(page).toContain("Hide Taken");
    expect(page).toContain("Reset Draft");
    expect(page).toContain("FANTASY_TAKEN_KEY");
    // Keeper corner leads with the Ledger dynasty signal
    expect(page).toContain("keeperRank");
    // The math is the pure, tested engine — not inline page math
    const lib = read("app/lib/fantasy-board.ts");
    expect(lib).toContain("export function buildFantasyBoard");
    expect(lib).toContain("export function assignTiers");
    expect(lib).toContain("export function replacementRanks");
    // Tiers are size-capped so a dense tail can't collapse into one mega-tier.
    expect(lib).toContain("maxTierSize");
  });
});

describe("Canary — D1 CSV trade ingestion", () => {
  it("the admin can ingest a CSV of completed trades in one pass", () => {
    const route = read("app/api/admin/trades/ingest-csv/route.ts");
    // Guarded, dry-runnable, and it does BOTH halves of the manual chore:
    expect(route).toContain("requireAdmin");
    expect(route).toContain("dryRun");
    expect(route).toContain("createFrozenTrade");           // frozen trade record
    expect(route).toContain("draftPickOverrides");          // pick ownership transfer
    expect(route).toContain("onConflictDoUpdate");
    expect(route).toContain("clearTeamCaches");             // overlay caches drop after ingest

    const lib = read("app/lib/trade-csv.ts");
    expect(lib).toContain("export function parseTradeCsv");
    expect(lib).toContain("export function parsePickToken");
    expect(lib).toContain("export function resolveTrades");
    expect(lib).toContain("canonicalNameSlug");             // diacritics-safe player match

    const page = read("app/admin/trades/page.tsx");
    expect(page).toContain("CsvIngestPanel");
    expect(page).toContain("DRY RUN");
    expect(page).toContain("ingest-csv");
  });
});

describe("Canary — fantasy research layer (proprietary signals on the board)", () => {
  it("the fantasy desk surfaces the Ledger stack, not just box-score columns", () => {
    const page = read("app/fantasy/page.tsx");
    // Every row expands into the full Ledger outlook (PA12 component reused)
    expect(page).toContain("PlayerOutlook");
    expect(page).toContain("aria-expanded");
    // Modern role badge column (evidence-derived play styles)
    expect(page).toContain("derivePlayerRoles");
    // EDGE Breakout Watch — same engine the season simulator trusts
    expect(page).toContain("buildBreakoutWatch");
    expect(page).toContain("EDGE Breakout Watch");

    const lib = read("app/lib/fantasy-board.ts");
    expect(lib).toContain("export function buildBreakoutWatch");
    expect(lib).toContain("computeBreakout"); // one breakout model, propagated
  });

  it("everything is position-aware and every number carries context", () => {
    const lib = read("app/lib/fantasy-board.ts");
    // Sort is a tested pure fn — the inverted-comparator (least-FP-first) bug stays dead
    expect(lib).toContain("export function sortRows");
    // Position-specific breakout stories: a D never gets "the goals are coming"
    expect(lib).toContain('posGroup === "D"');
    expect(lib).toContain("blue-line production scales with PP time");
    // Breakout odds carry a base-rate referent
    expect(lib).toContain("BREAKOUT_BASE_RATE_PCT");
    // Goalie board reframed for fantasy: workload + win environment
    expect(lib).toContain("export function buildGoalieBoard");
    expect(lib).toContain("goalieWinEnv");

    const page = read("app/fantasy/page.tsx");
    expect(page).toContain("sortRows");            // uses the tested sorter, not inline math
    expect(page).toContain("breakout odds");       // labeled, not a naked %
    expect(page).toContain("Start");               // goalie workload context (Start Share col)
    expect(page).toContain("Win");                 // win-environment col
    expect(page).toContain("buildGoalieBoard");
  });
});

describe("Canary — same-team nickname dedup (Matt / Matthew Savoie)", () => {
  it("roster assembly collapses formal/common first-name duplicates on one team", () => {
    const identity = read("app/lib/player-identity.ts");
    expect(identity).toContain("export function dedupeSameTeamNicknames");
    expect(identity).toContain("nicknameMergeKey");
    expect(identity).toContain('matt: "matthew"');
    const assembly = read("app/lib/roster-assembly.ts");
    // Runs AFTER the id-keyed authority dedup, since these carry distinct ids
    expect(assembly).toMatch(/dedupePlayersByAuthority[\s\S]*dedupeSameTeamNicknames/);
  });
});

describe("Canary — Outlook credibility (confidence cap, trend reconciliation, D-EDGE)", () => {
  it("keeps the four real-data credibility fixes wired in player-outlook.ts", () => {
    const src = read("app/lib/player-outlook.ts");
    // 1) Confidence never reads 100 — capped at 99.
    expect(src).toMatch(/Math\.min\(\s*99/);
    // 2) Proportional trajectory threshold — a lone down year off a strong run is not "cooling".
    expect(src).toContain("trajectoryDirection");
    // 3) DECLINING age + RISING points reconciles to a high-risk read, not a flat "declining".
    expect(src).toContain("HIGH RISK");
    // 4) Defensemen get their own EDGE reads (never finishing luck).
    expect(src).toContain("defenseEdgeReads");
    expect(src).toContain("forwardEdgeReads");
  });
});

describe("Canary — fantasy page AA, pagination, and selection accent", () => {
  it("keeps keyboard-visible focus, windowed pagination, and a non-ink selection color", () => {
    const page = read("app/fantasy/page.tsx");
    // Pagination replaced the "show 50 more" accumulator.
    expect(page).toContain("pageNumbers");
    expect(page).not.toContain("Show 50 More");
    expect(page).toContain('aria-label="Draft board pagination"');
    // Selection uses a distinct accent, not the ink color.
    expect(page).toContain("accentInk");
    expect(page).toContain("var(--ledger-ice");
    // Keyboard focus is visible on the interactive controls.
    expect(page).toContain("focus-visible:outline");
  });

  it("labels the value-over-replacement column in plain language and explains it", () => {
    const page = read("app/fantasy/page.tsx");
    // The column is labeled VOR (not the opaque "VBD") and spelled out somewhere.
    expect(page).toContain('label="VOR"');
    expect(page).not.toContain('label="VBD"');
    expect(page).toContain("Value Over Replacement");
    // League settings show the live replacement line so the concept is concrete.
    expect(page).toContain("replacementRanks(settings)");
    expect(page).toContain("replacement level");
  });

  it("keeps league settings self-explanatory — grouped scoring vs roster fieldsets", () => {
    const page = read("app/fantasy/page.tsx");
    expect(page).toContain("Scoring — points per stat");
    expect(page).toMatch(/Roster &amp; league size/);
    // No sub-10px type left on the fantasy board (AA legibility floor).
    expect(page).not.toContain("text-[9px]");
    expect(page).not.toContain("text-[8px]");
  });
});

describe("Canary — Armchair state integrity (CX1–CX4)", () => {
  it("CX4: executeTrade preserves db metadata and fully invalidates the sim", () => {
    const bench = read("app/armchair-gm/useTradeBench.ts");
    expect(bench).toContain("return { ...prev, players: playersWithDynamicPickValues, teams: updatedTeams }");
    expect(bench).toContain("simControlsRef.current?.resetSimulation()");
  });
  it("CX2: shared-link asset resolution is ownership-guarded on the execute path", () => {
    const share = read("app/lib/trade-share.ts");
    expect(share).toContain("expectedTeamId");
    expect(share).toContain("asset.teamId === expectedTeamId");
    const page = read("app/armchair-gm/page.tsx");
    expect(page).toContain("resolveTradeShareAssets(parsed.outgoing, db.players, parsed.homeTeamId)");
    expect(page).toContain("resolveTradeShareAssets(parsed.incoming, db.players, parsed.partnerTeamId)");
  });
  it("CX1: a URL-hydration guard blocks the state→URL sync until the parse runs", () => {
    const page = read("app/armchair-gm/page.tsx");
    expect(page).toContain("urlHydratedRef");
    expect(page).toContain("if (!urlHydratedRef.current) return;");
  });
  it("CX3: package changes abort in-flight audit/memo/match and verdict/memo guard staleness", () => {
    const page = read("app/armchair-gm/page.tsx");
    expect(page).toMatch(/evalAbortRef\.current\?\.abort\(\);\s*\n\s*memoAbortRef\.current\?\.abort\(\);\s*\n\s*matchAbortRef\.current\?\.abort\(\);/);
    expect(page).toContain("evalAbortRef.current !== ctrl) return;");
    expect(page).toContain("memoAbortRef.current !== ctrl) return;");
  });
});

describe("Canary — Cup Run lifecycle cap + clean start (CX5)", () => {
  it("reconciles the user's cap on rollover and starts a run from a clean slate", () => {
    const cup = read("app/lib/cup-run.ts");
    // The reconcile no longer exempts the user team; it subtracts their retention.
    expect(cup).toContain("export function reconcileTeamCapSpaces");
    expect(cup).not.toContain("if (team.id === userTeamId) return team;");
    expect(cup).toContain("userRetainedAav");
    const lifecycle = read("app/armchair-gm/useCupRunLifecycle.ts");
    expect(lifecycle).toContain("reconcileTeamCapSpaces(db.teams, livePlayers, nextCap, next.teamId, userRetainedAav)");
    // Starting a Cup Run clears pre-run trades + sim first.
    const page = read("app/armchair-gm/page.tsx");
    // CX5 required a run to start from a clean slate. ST1 strengthened HOW:
    // instead of resetTrades() (which also reopened franchise selection), the
    // handler restores the immutable entry baseline and runs the shared season
    // reset. Both still clear pre-run trades and the pre-run sim.
    expect(page).toMatch(/onStart=\{\(\) => \{[\s\S]*restoreEntryBaseline\(\);[\s\S]*resetSeasonState\(\);[\s\S]*handleStartCupRun\(\);/);
    expect(page).toMatch(/const resetSeasonState = [\s\S]*setExecutedTrades\(\[\]\);/);
    expect(page).toMatch(/const resetSeasonState = [\s\S]*resetSimulation\(\);/);
  });
});

describe("Canary — RFA offer-sheet compensation (CX6)", () => {
  it("conveys own picks as compensation instead of deleting them, and frees only the current cap", () => {
    const fa = read("app/lib/free-agency.ts");
    expect(fa).toContain("export function resolveOfferSheetCompensation");
    expect(fa).toContain("pickOriginalOwner(p.id) === signingTeamId"); // own picks only
    const hook = read("app/armchair-gm/useOffseasonFlow.ts");
    expect(hook).toContain("resolveOfferSheetCompensation(homeTeamId, db.players, compensation)");
    // Picks convey to the original club, not deleted.
    expect(hook).toContain("transferSet.has(p.id) ? { ...p, teamId: originalTeamId }");
    // Original club frees only the RFA's current cap (no double-count of the old deal).
    expect(hook).not.toContain("incoming: [{ capHit: fa.player.lastCapHit ?? fa.player.capHit }]");
  });
});

describe("Canary — AI offseason RFA retention + no vanishing FAs (AI1–3/CXH3)", () => {
  it("always re-signs AI RFAs and relocates walked players to the FA pool", () => {
    const fa = read("app/lib/free-agency.ts");
    // RFAs are retained unconditionally (no wouldFit walk branch for RFAs).
    expect(fa).toContain("RFAs carry team control and are ALWAYS retained");
    // Walked players are relocated, never deleted.
    expect(fa).toContain("export function applyOffseasonToRoster");
    expect(fa).toContain('teamId: "FA_POOL"');
    // The offseason hook uses the shared helper (no delete-filter of walked ids).
    const hook = read("app/armchair-gm/useOffseasonFlow.ts");
    expect(hook).toContain("applyOffseasonToRoster(prev.players, res)");
    expect(hook).not.toContain("filter(p => !walkedIds.has(p.id))");
  });
});

describe("Canary — Duehr valuation integrity (VAL2)", () => {
  it("derives the box score as PTS = G + A (no 0-0-1 lines)", () => {
    const lib = read("app/lib/box-score.ts");
    expect(lib).toContain("pts: g + a");
    const card = read("app/components/AssetCard.tsx");
    expect(card).toContain("boxScoreFromPace(asset)");
    // The old independent per-pace rounding of PTS is gone.
    expect(card).not.toContain("asset.ptsPace ? (asset.ptsPace * asset.games / 82)");
  });

  it("does not hand a thin-sample forward a settled line role", () => {
    const badges = read("app/components/AssetBadges.tsx");
    expect(badges).toContain("MIN_ROLE_SAMPLE_GAMES");
    expect(badges).toMatch(/asset\.games \?\? 0\) < MIN_ROLE_SAMPLE_GAMES[\s\S]*?UNPROVEN/);
  });
});

describe("Canary — PlayerComparison metric fixes (audit #8)", () => {
  it("averages TOI/age, guards empty sides, and uses the fixed bar geometry", () => {
    const cmp = read("app/components/PlayerComparison.tsx");
    // TOI + age are averaged per skater (null for an empty side), not summed.
    expect(cmp).toContain('avg(outgoing, "avgTOI")');
    expect(cmp).toContain('avg(outgoing, "age")');
    expect(cmp).toContain("if (skaters.length === 0) return null");
    // Bar/winner logic comes from the tested pure helper.
    expect(cmp).toContain('from "@/app/lib/stat-bar-compare"');
    expect(cmp).toContain("compareStat(homeVal, partnerVal, higherIsBetter)");
    // The old abs()-scaled geometry is gone.
    expect(cmp).not.toContain("Math.abs(homeVal) / max * 100");
  });
});

describe("Canary — SIM request validation (audit #4)", () => {
  it("validates and bounds the request before running the sim", () => {
    const route = read("app/api/simulate/route.ts");
    expect(route).toContain('from "@/app/lib/sim-request-schema"');
    expect(route).toContain("simRequestSchema.safeParse(rawBody)");
    expect(route).toContain("{ status: 400 }");
    // No longer a blind cast of req.json() straight to the request type.
    expect(route).not.toContain("const body: SimRequest = await req.json();");
    const schema = read("app/lib/sim-request-schema.ts");
    expect(schema).toContain("MAX_PLAYERS");
    expect(schema).toContain(".passthrough()");        // engine fields survive
    expect(schema).toContain("Duplicate player id");     // unique-id guard
  });
});

describe("Canary — trade UI state bugs (audit #6/#7)", () => {
  it("#6: a package change clears the in-flight audit flag so it can't stick on 'Auditing'", () => {
    const src = read("app/components/QuickTradeMachine.tsx");
    // The outgoing/incoming effect that aborts the verdict also resets evaluating.
    expect(src).toMatch(/setVerdict\(null\);\s*\n\s*setShareUrl\(""\);\s*\n[\s\S]*?setEvaluating\(false\);\s*\n\s*\}, \[outgoing, incoming\]\)/);
  });

  it("#7: generated proposals require a whitelisted accepted status and pass the live cap", () => {
    const gate = read("app/lib/trade-proposal-audit.ts");
    expect(gate).toContain('ACCEPTED_AUDIT_STATUSES');
    expect(gate).toContain('"FAIR", "WIN", "LOSS"');
    const proposal = read("app/components/TradeProposal.tsx");
    expect(proposal).toContain('from "@/app/lib/trade-proposal-audit"');
    // The proposal audit now passes capCeiling, matching the main trade audit.
    expect(proposal).toMatch(/partnerRoster,\s*\n\s*ctrl\.signal,\s*\n\s*capCeiling,/);
    // And the old fail-open inline check is gone.
    expect(proposal).not.toContain('status !== "BLOCKED" && status !== "DECLINED"');
  });
});

describe("Canary — SIM RNG determinism (audit #2/#3)", () => {
  it("uses independent named streams for awards, calder, and playoffs", () => {
    const route = read("app/api/simulate/route.ts");
    expect(route).toContain('mulberry32(seed + hashString("awards"))');
    expect(route).toContain('mulberry32(seed + hashString("calder"))');
    expect(route).toContain('mulberry32(seed + hashString("playoffs"))');
    // Playoffs no longer share the awards/calder stream.
    expect(route).toContain("simulatePlayoffs(standings, playoffRand)");
    expect(route).toContain("findLeagueLeaders(standings, awardsRand)");
    expect(route).not.toContain("simulatePlayoffs(standings, rand)");
  });

  it("folds the Cup Run year + run seed into each season's seed", () => {
    const hook = read("app/armchair-gm/useSimDispatch.ts");
    expect(hook).toContain("cupRunSeed: cupRunContext.runSeed");
    expect(hook).toContain("cupRunYear: cupRunContext.year");
    // The run seed is threaded from the Cup Run state.
    expect(read("app/armchair-gm/page.tsx")).toContain("runSeed: cupRun.seed");
  });
});

describe("Canary — SIM retention-aware cap deltas (audit #1)", () => {
  it("computes trade cap movement via the shared effectiveCapHit, not raw capHit", () => {
    const route = read("app/api/simulate/route.ts");
    expect(route).toContain('from "@/app/lib/cap-delta"');
    // Both sides of the per-trade cap delta use the retention-aware helper.
    expect(route).toContain("skaters(trade.outgoing).reduce((s, p) => s + effectiveCapHit(p), 0)");
    expect(route).toContain("skaters(trade.incoming).reduce((s, p) => s + effectiveCapHit(p), 0)");
    // And never the old raw-capHit sum that ignored retention.
    expect(route).not.toContain("reduce((s, p) => s + p.capHit,  0)");
    // The helper is exported from the canonical module.
    expect(read("app/lib/cap-delta.ts")).toContain("export const effectiveCapHit");
  });
});

describe("Canary — drafted rookie keeps its context through dedup (VAL1)", () => {
  it("reconciles by backfilling draft context, not by dropping the rookie", () => {
    const lib = read("app/lib/draft-reconcile.ts");
    expect(lib).toContain("export function reconcileDraftedRookies");
    expect(lib).toContain("draftOverall:    p.draftOverall ?? r.draftOverall");
    // The armchair draft-complete handler uses it instead of the old drop-filter.
    const page = read("app/armchair-gm/page.tsx");
    expect(page).toContain("reconcileDraftedRookies(withoutPicks, rookies)");
    expect(page).not.toMatch(/\.filter\(r => !existingIds\.has\(r\.id\) && !existingNames/);
  });
});

describe("Canary — injury year keeps a star's historical floor (VAL4)", () => {
  it("keeps the injury-vs-decline gate in the pedigree floor", () => {
    const src = read("app/lib/player-data.ts");
    expect(src).toContain("isInjuryShortenedPrime");
    // The decline gate is skipped for a prime-age injury sample.
    expect(src).toContain("!isInjuryShortenedPrime(asset)");
    // The multiplier drops the games/pace collapse for that case.
    expect(src).toMatch(/isInjuryShortenedPrime\(asset\)\)\s*return Math\.max\(0\.25, ageDecay\)/);
  });
});

describe("Canary — playoff bracket advancement (SIM1)", () => {
  it("keeps the bracket a pure, tested lib that advances winners by adjacency", () => {
    const lib = read("app/lib/playoff-bracket.ts");
    expect(lib).toContain("export function simulateConference");
    expect(lib).toContain("export function simulatePlayoffs");
    // R2 pairs adjacent R1 winners (rows 0+1, rows 2+3) — not the old 0+2/1+3
    // pairing that let the third series' winner jump into the top slot.
    expect(lib).toMatch(/getW\(r1\[0\]\), getW\(r1\[1\]\)/);
    expect(lib).toMatch(/getW\(r1\[2\]\), getW\(r1\[3\]\)/);
    // The route consumes the lib rather than carrying its own copy.
    const route = read("app/api/simulate/route.ts");
    expect(route).toContain('from "@/app/lib/playoff-bracket"');
    expect(route).not.toContain("function simulateConference");
  });
});

// ── ST1: a new Cup Run restarts on the league as first loaded ────────────────
// `originalDb` is overwritten by every season rollover, so it ages with the run.
// Without a separate immutable baseline, starting a second run begins on a
// league a previous run already advanced three years while the run says Year 1.
describe("ST1 — Cup Run start/abandon restore the entry baseline", () => {
  const src = () => read("app/armchair-gm/page.tsx");

  it("captures an entry baseline at load and never rewrites it", () => {
    const s = src();
    expect(s).toContain("entryBaselineRef");
    expect(s).toMatch(/entryBaselineRef\.current = cloneLeague\(data\)/);
    // Exactly one assignment — the whole point is that it is written once.
    expect(s.match(/entryBaselineRef\.current\s*=/g) ?? []).toHaveLength(1);
  });

  it("restores that baseline when a run starts and when one is abandoned", () => {
    const s = src();
    expect(s).toContain("restoreEntryBaseline");
    // Both handlers must call it; a run that starts on a rolled league is ST1.
    expect(s.match(/restoreEntryBaseline\(\)/g) ?? []).toHaveLength(2);
  });

  it("shares ONE season reset between rollover and new run", () => {
    // Two parallel reset lists drift: a field gets added to one and forgotten in
    // the other. The rollover ref must point at the same function the new-run
    // handler calls.
    const s = src();
    expect(s).toContain("const resetSeasonState = ");
    expect(s).toContain("onSeasonRolledRef.current = resetSeasonState");
    expect(s).toContain("resetSeasonState()");
  });

  it("clears a previous run's draft summary on restore", () => {
    expect(src()).toMatch(/restoreEntryBaseline[\s\S]{0,600}setCupDraftSummary\(null\)/);
  });

  it("does not reopen franchise selection when a run starts", () => {
    // resetTrades() sets showTeamSelect(true); calling it from onStart popped the
    // team picker over a team the user had just chosen.
    const s = src();
    const onStart = s.slice(s.indexOf("onStart={"), s.indexOf("onRecordAndAdvance="));
    expect(onStart).not.toContain("resetTrades()");
    expect(onStart).toContain("restoreEntryBaseline()");
  });
});

// ── ST2: a held draft spends that year's picks ──────────────────────────────
// The boundary was written twice with two different comparisons; the rollover's
// `>=` kept the picks it had just converted into rookies.
describe("ST2 — spent draft picks leave every selector", () => {
  it("routes both call sites through the shared rule", () => {
    const lifecycle = read("app/armchair-gm/useCupRunLifecycle.ts");
    const page = read("app/armchair-gm/page.tsx");
    expect(lifecycle).toContain("dropSpentDraftPicks(");
    expect(page).toContain("dropSpentDraftPicks(");
    // The off-by-one that let a spent pick stay tradeable.
    expect(lifecycle).not.toMatch(/\(p\.year \?\? 9999\) >= /);
    expect(page).not.toMatch(/p\.position === "Pick" && p\.year === SEASON\.draftYear/);
  });

  it("keeps the boundary inclusive of the draft just held", () => {
    // Assert the expression itself rather than the absence of ">=", so the
    // file's own explanation of the old bug cannot trip its canary.
    const lib = read("app/lib/draft-picks.ts");
    expect(lib).toContain("export function dropSpentDraftPicks");
    expect(lib).toContain("(p.year ?? Number.POSITIVE_INFINITY) > completedThroughYear");
  });

  it("derives the draft year from the run year in one place", () => {
    const lib = read("app/lib/draft-picks.ts");
    expect(lib).toContain("export function draftYearForCupYear");
    expect(lib).toContain("SEASON.draftYear + Math.max(1, cupYear) - 1");
  });
});

// ── ST3: the alternate-position map is matched by slug, never raw ────────────
// A raw MAP[p.name] lookup silently missed every mapped player whose feed name
// carries diacritics — including Teräväinen, the example lineup-order.ts cites.
describe("ST3 — alternate positions resolve through a normalised key", () => {
  it("exposes a lookup function and no raw index access survives", () => {
    const data = read("app/data/secondary-positions.ts");
    expect(data).toContain("export function secondaryPositionFor");
    expect(data).toContain("canonicalNameSlug");
    const assembly = read("app/lib/roster-assembly.ts");
    expect(assembly).toContain("secondaryPositionFor(p.name)");
    expect(assembly).not.toMatch(/SECONDARY_POSITIONS\[/);
  });

  it("keeps eligibility as one shared source of truth", () => {
    // The editor and the default ordering must agree, or a slot the editor
    // allows gets re-derived away on the next hydrate.
    const editor = read("app/components/LineupEditor.tsx");
    expect(editor).toMatch(/isC, isW, isF, isD, isG,/);
    expect(editor).toContain('from "@/app/lib/lineup-order"');
    const order = read("app/lib/lineup-order.ts");
    expect(order).toContain("export const isC");
    expect(order).toContain("secondaryPosition");
  });
});

// ── No third-party imagery anywhere ─────────────────────────────────────────
// Club logos were hotlinked from assets.nhle.com and player photos were inlined
// into the exported card. The card exists to travel, so that exposure was
// structural.
//
// Policy (owner's call, 2026-07-28, extended 2026-07-30): the SITE may hotlink
// NHL headshots AND club logos — that displays the league's image from the
// league's own server, in context, with nothing copied or rehosted. The
// downloadable PNG may not: baking a copy into a branded file built to be
// shared is redistribution. These canaries pin that asymmetry.
//
// The earlier version of this block asserted the app shipped NO league imagery,
// which was never true of /players or /press-box — it grepped for hardcoded
// hostnames and was structurally blind to a URL arriving as data at runtime.
// What is actually load-bearing is (a) that URL construction lives in ONE
// module, so the policy has a single place to change, and (b) that the module
// is unreachable from the export renderer.
describe("Canary — league imagery is allowed on the site, never in the export", () => {
  const IMAGERY_LIB = "app/lib/league-imagery.ts";

  it("names the NHL asset host in exactly one module", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(tsx?|jsx?)$/.test(entry.name)) continue;
        const rel = path.relative(process.cwd(), full);
        if (rel === IMAGERY_LIB) continue;
        // Comments discuss the host by name; only real code counts.
        if (stripComments(fs.readFileSync(full, "utf8")).includes("assets.nhle.com")) {
          offenders.push(rel);
        }
      }
    };
    walk(path.join(process.cwd(), "app"));
    expect(offenders).toEqual([]);
  });

  it("refuses to render an image from anywhere but the league's own host", () => {
    // A DB row must not be able to point the page at a third-party image.
    const lib = readSource(IMAGERY_LIB);
    expect(lib).toContain("isNhlAssetUrl");
    expect(lib).toContain("isNhlAssetUrl(subject.headshot)");
  });

  it("has no headshot proxy route left to fetch through", () => {
    expect(fs.existsSync(path.join(process.cwd(), "app/api/headshot"))).toBe(false);
  });

  it("draws the exported card's player mark instead of embedding one", () => {
    const route = readSource("app/api/card-image/route.tsx");
    expect(route).toContain("initialsForCard");
    expect(route).not.toContain("headshotDataUrl");
  });

  it("keeps the imagery module unreachable from the export renderer", () => {
    // The strongest form of the policy: the export cannot embed what it has no
    // way to build a URL for.
    for (const f of ["app/api/card-image/route.tsx", "app/lib/card-payload.ts"]) {
      expect(readSource(f), f).not.toContain("league-imagery");
    }
  });

  it("keeps the drawn bust available for the export, photo-free", () => {
    // `playerAvatarSvgMarkup` is what the export draws. It renders outside
    // React, has no error handler, and must never learn about a photo.
    const avatar = readSource("app/components/PlayerAvatar.tsx");
    const markup = avatar.slice(avatar.indexOf("export function playerAvatarSvgMarkup"));
    expect(markup.length).toBeGreaterThan(0);
    expect(markup).not.toContain("headshot");
    expect(markup).not.toContain("<img");
  });

  it("routes club identity through one component, so the type fallback is everywhere", () => {
    for (const f of ["app/components/LedgerDropdown.tsx", "app/armchair-gm/TeamSelectModal.tsx"]) {
      expect(readSource(f), f).toContain("<TeamMark");
    }
    // The abbreviation set in type is the answer when no crest resolves — a
    // broken-image box is not.
    expect(readSource("app/components/TeamMark.tsx")).toContain("{id}");
  });

  it("strips a headshot at the export boundary rather than trusting the renderer", () => {
    // The schema tolerates the key so a stale client bundle isn't rejected,
    // but the validator must discard it — otherwise the policy holds only
    // until someone writes `data.headshotDataUrl`.
    const lib = readSource("app/lib/card-payload.ts");
    expect(lib).toContain("headshotDataUrl: _discarded");
  });
});

// ── Tier 0: the accounting identity ─────────────────────────────────────────
// The dossier and the card printed a "Value Breakdown" whose rows could not
// produce the headline above them: DEF was a descriptive rating rather than the
// figure in the total, UPS re-counted AGE, and four multiplicative steps were
// invisible. `__tests__/nav-identity.test.ts` proves the ENGINE explains itself;
// these pin the DISPLAY to that explanation, so no surface can go back to
// hand-picking components.
describe("Canary — every value breakdown reconciles to its headline", () => {
  const BREAKDOWN_SURFACES = [
    "app/players/[playerId]/page.tsx",
    "app/components/PercentileCard.tsx",
    "app/components/PlayerTimeline.tsx",
    "app/armchair-gm/SeasonResultsPager.tsx",
  ];

  it("draws every breakdown from the engine's waterfall", () => {
    for (const f of BREAKDOWN_SURFACES) {
      expect(readSource(f), f).toContain("navStagesForDisplay");
    }
  });

  it("does not hand-pick components beside a total", () => {
    // The exact shape of the old bug: a literal list of nav fields presented as
    // a decomposition. `xnav.def` and `xnav.upside` are descriptive and must
    // never appear in one of these panels again.
    for (const f of BREAKDOWN_SURFACES) {
      const src = readSource(f);
      expect(src, `${f} prints the descriptive DEF rating as a value row`).not.toMatch(/label:\s*"DEF"/);
      expect(src, `${f} prints upside as a value row`).not.toMatch(/\bnav\.upside\b|\bxnav\.upside\b/);
    }
  });

  it("leaves no plug row computed as total minus the parts", () => {
    // Two surfaces had bolted one on. A plug makes the arithmetic close without
    // saying what the difference is, which is worse than not adding up.
    for (const f of BREAKDOWN_SURFACES.concat("app/armchair-gm/GmAnalysisTabs.tsx")) {
      expect(readSource(f), f).not.toMatch(/total\s*-\s*\(?\s*\w+\.off/);
    }
  });

  it("keeps the engine honest about which defensive figure it used", () => {
    const engine = readSource("app/lib/xnav-engine.ts");
    expect(engine).toContain('stage("def",');
    // The total is built from defTotal; defDisplay is the STRAND rating.
    expect(engine).toContain("trueMarketValue = offTotal + defTotal");
    expect(engine).toMatch(/stage\("def",\s*"On-ice defence",\s*defTotal\)/);
  });

  it("charges a trade request to leverage, not to the contract", () => {
    const engine = readSource("app/lib/xnav-engine.ts");
    expect(engine).toContain('stage("leverage"');
    expect(engine).not.toContain("cap: result.cap - penalty");
  });

  it("states the goalie role ceiling as a row rather than an invisible clamp", () => {
    expect(readSource("app/lib/xnav-engine.ts")).toContain('stage("roleCeiling"');
  });
});

// ── Tier 0: missing data never renders as a measurement ─────────────────────
// Half the STRAND nodes greyed out honestly; the other half substituted a value
// that looked measured — NOIV and SUPP became 50, QoC became 35, and a missing
// DPS fell back onto the NAV defensive component, a different quantity on a
// different scale under the same label. 50 is the worst possible lie: it reads
// as "average", a finding, rather than "we do not know".
describe("Canary — a STRAND node never invents a reading", () => {
  const view = readSource("app/components/StrandView.tsx");
  const lib = readSource("app/lib/strand-traits.ts");

  it("routes every node through the builder that can say 'unavailable'", () => {
    expect(lib).toContain("export function node");
    expect(lib).toContain("unavailable: true");
    // Both trait builders, skater and goalie.
    expect(view).toContain("export function buildAssetTraits");
    expect(view).toContain("export function buildGoalieStrandTraits");
    expect(view.match(/node\(\{/g)?.length ?? 0).toBeGreaterThanOrEqual(14);
  });

  it("carries none of the specific defaults that manufactured a reading", () => {
    for (const pattern of [
      /qocIndex\s*\?\?\s*35/,          // QoC → 35
      /xgRelTM\s*\?\?\s*0/,            // NOIV → 50
      /xgaRelTM\s*\?\?\s*0/,           // SUPP → 50
      /shotsPerGame\s*\?\?\s*30/,      // a fabricated shot rate
      /spg\s*\?\?\s*30/,
      /norm\(nav\.def/,                 // DPS → the NAV defensive component
    ]) {
      expect(view, String(pattern)).not.toMatch(pattern);
    }
  });

  it("treats a real zero as data and absence as absence", () => {
    // The mirror mistake would be just as wrong: a player who genuinely rates
    // 0 on a trait must not be greyed out as unmeasured.
    expect(lib).toContain("v != null && isFinite(v)");
  });

  it("says which measurement is missing, not merely that one is", () => {
    // Every node supplies an `absent` string; a bare "unavailable" tells a
    // reader nothing about what to go and find.
    const absents = view.match(/absent:\s*"[^"]+"/g) ?? [];
    expect(absents.length).toBeGreaterThanOrEqual(14);
    for (const a of absents) expect(a.length).toBeGreaterThan("absent: \"unavailable\"".length);
  });

  it("counts coverage so a thin profile is visibly thin", () => {
    // A greyed node says one input is missing. Only a count says most of the
    // shape is — which is what matters before comparing two players.
    expect(lib).toContain("export function strandCoverage");
    expect(readSource("app/components/StrandDisplay.tsx")).toContain("coverageLabel");
  });

  it("keeps one definition of the trait shape", () => {
    // StrandDisplay re-exports rather than declaring a second copy.
    expect(readSource("app/components/StrandDisplay.tsx")).not.toMatch(/export interface StrandTrait/);
  });
});

// ── Tier 0: goalie units mean what they say ─────────────────────────────────
// Two numbers carried the wrong unit. `gamesStarted` was fed MoneyPuck's
// games-played, so relief outings counted as starts — and that field gates the
// role ceiling on G-NAV, so it moved valuations. And STRAND's "GAA" was
// `(1 - savePct) * shotsPerGame`: goals per APPEARANCE, off an assumed shot
// rate when volume was missing.
describe("Canary — a goalie stat is the unit it claims", () => {
  const lib = readSource("app/lib/goalie-units.ts");
  const assembly = readSource("app/lib/roster-assembly.ts");
  const view = readSource("app/components/StrandView.tsx");

  it("keeps the unit rules in a tested module", () => {
    for (const fn of ["goalsAgainstAverage", "resolveWorkload", "workloadLabel"]) {
      expect(lib, fn).toContain(`export function ${fn}`);
    }
  });

  it("computes goals against per sixty minutes, not per appearance", () => {
    expect(lib).toContain("SECONDS_PER_HOUR");
    expect(view).not.toMatch(/1 - svPct\)\s*\*/);
    expect(view).not.toMatch(/spg\s*\?\?\s*30/);
    // The node reads a precomputed figure rather than deriving one from a rate
    // it does not have the denominator for.
    expect(view).toMatch(/label: "GAA"[\s\S]{0,200}per 60 minutes/);
  });

  it("uses the ice time the assembly already parsed and threw away", () => {
    expect(assembly).toContain("goalsAgainstAverage(goals, ice)");
  });

  it("never relabels appearances as starts", () => {
    // MoneyPuck has no starts column, so it must not write the field.
    expect(assembly).not.toMatch(/gamesStarted:\s+g,/);
    expect(assembly).not.toMatch(/g\.gamesStarted \?\? g\.starts \?\? games/);
    expect(lib).toContain("startsKnown");
  });

  it("records whether a workload figure is genuinely starts", () => {
    expect(assembly).toContain("startsKnown:    goalieWorkload.startsKnown");
    // And the label follows it, rather than always saying GS.
    expect(lib).toContain('${w.startsKnown ? "GS" : "GP"}');
  });

  it("says so when a role was classified on appearances", () => {
    // The classification thresholds are start counts. Running them on
    // relief-inclusive numbers is sometimes unavoidable; claiming otherwise
    // is not.
    expect(readSource("app/components/AssetBadges.tsx")).toContain("resolveWorkload");
    expect(readSource("app/components/AssetBadges.tsx")).toContain("starts not published by this source");
  });
});

// ── The goalie valuation prices against a real market ───────────────────────
describe("Canary — G-NAV uses the fitted FMV, in the right units", () => {
  const engine = readSource("app/lib/xnav-engine.ts");

  it("prices goalies from the fitted model, not a hand-written curve", () => {
    expect(engine).toContain("goalieFmvCapPct");
    // The retired sigmoid's constants. If any come back, so has the $2.71M.
    expect(engine).not.toContain("MAX_CAP_PCT_G");
    expect(engine).not.toContain("MIDPOINT_G");
    expect(engine).not.toContain("K_FACTOR_G");
  });

  it("converts GSAx to the units the model was fitted on", () => {
    // The engine's own `gsaxPer60` is per sixty GAMES — roughly a season total.
    // The fit wants goals per sixty MINUTES, ~58x smaller. Feeding the wrong one
    // clamped every positive goalie to the domain ceiling and priced a -1.8
    // GSAx season above an +18.5 one.
    expect(engine).toContain("rawGsaxPer60Min");
    expect(engine).toMatch(/rawGsaxPer60Min\s*=[\s\S]{0,120}3600/);
    expect(engine).toContain('reliability("gsaxPer60"');
  });

  it("regresses against the sample the fit used, not a single season", () => {
    // The fitted feature is a three-season average. One season shrinks more
    // than twice as hard and compresses every goalie toward the mean.
    expect(engine).toContain("careerPer60Min");
    expect(engine).toContain("effectiveIce");
  });

  it("falls back to replacement level rather than inventing a mid-range price", () => {
    expect(engine).toContain("GOALIE_LEAGUE_MIN_CAP_PCT");
  });
});

// ── Brand ───────────────────────────────────────────────────────────────────
// "The Hockey Ledger" collided with two live hockey products (hockeyledger.com,
// thehockeyledger.ca). The rename touched forty-odd inline strings, which is
// exactly why the name now lives in one constant.
describe("Canary — the masthead is Cap & Crease, from one source", () => {
  it("keeps the brand in a single definition", () => {
    const brand = read("app/lib/brand.ts");
    expect(brand).toContain('name: "Cap & Crease"');
    expect(brand).toContain('domain: "capandcrease.com"');
    expect(brand).toContain("disclaimer");
  });

  it("builds page metadata from it rather than a literal", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain("${BRAND.name}");
    expect(layout).toContain("siteName: BRAND.name");
  });

  it("leaves no trace of the old name in shipped code", () => {
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) { walk(full); continue; }
        if (!/\.(tsx?|jsx?)$/.test(entry.name)) continue;
        const src = fs.readFileSync(full, "utf8");
        // brand.ts explains the rename in a comment. The buymeacoffee handle
        // is an external account under the old name — the owner's to migrate,
        // and breaking the link would be worse than the stale slug.
        const shipped = stripComments(src)
          .replace(/buymeacoffee\.com\/hockeyledger/g, "");
        if (/hockey.?ledger/i.test(shipped) && !full.endsWith("brand.ts")) offenders.push(full);
      }
    };
    walk(path.join(process.cwd(), "app"));
    expect(offenders).toEqual([]);
  });

  it("states non-affiliation where a reader will see it", () => {
    expect(read("app/components/Footer.tsx")).toContain("BRAND.disclaimer");
  });

  it("does not build the league's mark into the product's identity", () => {
    // Descriptive use in a subtitle is defensible; a brand named after it is not.
    const brand = read("app/lib/brand.ts");
    expect(brand).toMatch(/name: "(?!.*NHL)/);
  });
});

describe("Canary — regulation wins survive the NHL's two field names", () => {
  it("resolves the field in one place instead of per route", () => {
    const lib = read("app/lib/nhl-standings-fields.ts");
    expect(lib).toContain("winsInRegulation");
    expect(lib).toContain("regulationWins");
  });

  it("leaves no route reading a single spelling off a raw feed row", () => {
    for (const route of ["app/api/league/route.ts", "app/api/league/teams/route.ts"]) {
      const src = read(route);
      expect(src).toContain("regulationWinsFrom");
      // `t.regulationWins` / `b.regulationWins` — the raw-row reads that
      // returned undefined for every stats-endpoint club.
      expect(src).not.toMatch(/\b[a-z]\.regulationWins\b/);
    }
  });
});

describe("Canary — the Docket says which way the assets went", () => {
  it("derives received from the other side rather than mislabelling given", () => {
    const view = read("app/lib/docket-view.ts");
    expect(view).toContain("docketReturns");
    expect(view).toContain('direction: "received"');
    expect(view).toContain('direction: "sent"');
  });

  it("never heads a package list with a hardcoded RECEIVED", () => {
    const client = read("app/docket/DocketClient.tsx");
    expect(client).toContain("docketReturns(entry)");
    expect(client).not.toContain("RECEIVED VALUE");
  });
});

describe("Canary — standings tier and roster window are separate facts", () => {
  it("keeps both on the team and reads them through one accessor", () => {
    const types = read("app/lib/trade-types.ts");
    expect(types).toContain("rosterWindow?: string;");
    expect(read("app/lib/team-window.ts")).toContain("export function teamWindow");
  });

  it("does not let Armchair GM destroy the standings tier", () => {
    const page = read("app/armchair-gm/page.tsx");
    expect(page).toContain("rosterWindow: window");
    // The old effect wrote `{ ...team, phase }`, erasing the API's tier.
    expect(page).not.toMatch(/\{\s*\.\.\.team,\s*phase\s*\}/);
  });

  it("routes competitive-window readers through the accessor", () => {
    for (const file of [
      "app/api/match/route.ts",
      "app/api/simulate/route.ts",
      "app/lib/need-targets.ts",
      "app/lib/cup-run.ts",
      "app/armchair-gm/GmAnalysisTabs.tsx",
    ]) {
      expect(read(file)).toContain("teamWindow");
    }
  });

  it("leaves Team Analytics on the standings tier, which is what its chip means", () => {
    expect(read("app/teams/page.tsx")).toContain("team.phase");
  });
});

describe("Canary — Redis is found under either provisioning name", () => {
  it("accepts the Vercel integration's KV_ names, not just UPSTASH_", () => {
    const src = read("app/lib/redis-credentials.ts");
    expect(src).toContain("UPSTASH_REDIS_REST_URL");
    expect(src).toContain("KV_REST_API_URL");
    expect(src).toContain("KV_REST_API_TOKEN");
  });

  it("never reaches for the read-only token or a TCP connection string", () => {
    // Both sit beside the real credentials in the Upstash panel. Either one
    // produces a client that fails silently behind the swallowed catch.
    const resolver = readSource("app/lib/redis-credentials.ts")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(resolver).not.toContain("READ_ONLY");
    expect(resolver).not.toContain("env.KV_URL");
    expect(resolver).not.toContain("env.REDIS_URL");
  });

  it("builds the client from the resolver rather than reading env inline", () => {
    const client = read("app/lib/redis.ts");
    expect(client).toContain("resolveRedisCredentials");
    expect(client).not.toContain("process.env.UPSTASH_REDIS_REST_URL");
  });
});

describe("Canary — CXS batch: shared state, recap headings, simulated clock", () => {
  it("CXS1 — TeamSelectModal copies before sorting shared store state", () => {
    const src = read("app/armchair-gm/TeamSelectModal.tsx");
    expect(src).toContain("[...teams]");
    expect(src).not.toMatch(/\{teams\s*\n?\s*\.sort\(/);
  });

  it("CXS4 — recap headings are detected structurally, not by club name", () => {
    // Comments stripped: the fix's own note names the prefixes it removed.
    const src = readSource("app/armchair-gm/SeasonResultsPager.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(src).not.toContain("EDMONTON");
    expect(src).not.toContain("**AROUND");
  });

  it("CXS5 — no simulated surface reads the wall clock for expiry", () => {
    const card = read("app/components/AssetCard.tsx");
    expect(card).toContain("contractExpiryYear");
    expect(card).not.toContain("new Date().getFullYear()");
  });

  it("RL8 — lineup rows carry counting stats rather than a per-82 rate", () => {
    const src = read("app/components/LineupEditor.tsx");
    expect(src).not.toContain("P82");
    expect(src).toContain("goalsPace");
    expect(src).toContain("assistsPace");
  });
});

describe("Canary — RL4 leadership letters and RL7 goalie tandem", () => {
  it("RL4 — leadership resolves through a slug, not a raw name index", () => {
    const data = read("app/data/leadership.ts");
    expect(data).toContain("canonicalNameSlug");
    expect(data).toContain("export function leadershipFor");
    // The raw `LEADERSHIP[name]` lookup is the ST3 failure mode.
    expect(data).not.toContain("LEADERSHIP[name]");
  });

  it("RL4 — the lineup shows the letters it already scored with", () => {
    const src = read("app/components/LineupEditor.tsx");
    expect(src).toContain("teamLeadership");
    expect(src).toContain("letterFor");
    // Identity must not be colour or glyph alone.
    expect(src).toContain("alternate captain");
  });

  it("RL7 — starter and backup share one projection model", () => {
    const route = read("app/api/simulate/route.ts");
    expect(route).toContain("projectOneGoalie");
    expect(route).toContain("splitGoalieStarts");
    expect(route).toContain("backupGoalie");
  });

  it("RL7 — the start draw happens before either projection", () => {
    // Adding the backup must not shift the starter's position in the rand()
    // sequence, or every existing seed reprojects.
    const route = read("app/api/simulate/route.ts");
    const draw = route.indexOf("const drawnStarts");
    const starter = route.indexOf("starter: projectOneGoalie");
    expect(draw).toBeGreaterThan(-1);
    expect(draw).toBeLessThan(starter);
  });
});

describe("Canary — RL3 trade-card tabs", () => {
  it("drops DEV and offers Gravity and Outlook instead", () => {
    const card = read("app/components/AssetCard.tsx");
    expect(card).toContain('"GRAVITY"');
    expect(card).toContain('"OUTLOOK"');
    expect(card).not.toMatch(/AssetCardView\s*=\s*[^;]*"DEV"/);
  });

  it("gates the Gravity tab on the profile the panel will render", () => {
    // The tab's existence, its panel and the STATS strip must agree — a tab
    // that opens onto nothing is worse than no tab.
    const card = read("app/components/AssetCard.tsx");
    expect(card).toContain('...(gravProfile ? ["GRAVITY"] : [])');
    expect(card).toContain('view === "GRAVITY" && gravProfile');
  });

  it("computes gravity once rather than per render site", () => {
    const card = read("app/components/AssetCard.tsx");
    const calls = card.match(/computeGravity\(/g) ?? [];
    expect(calls.length).toBe(1);
  });
});

describe("Canary — RL5 line locks", () => {
  it("keeps the lock rules in one pure, tested module", () => {
    const lib = read("app/lib/lineup-locks.ts");
    for (const fn of ["applyLocks", "toggleLock", "pruneLocks", "swapLocks"]) {
      expect(lib).toContain(`export function ${fn}`);
    }
  });

  it("re-seats locks on BOTH automatic reorder paths, not just one", () => {
    // A lock that survives a trade but not Best Lines is not a lock.
    const src = read("app/components/LineupEditor.tsx");
    expect(src).toContain("seatLocks(defaultLineupOrdersForRoster(effective))");
    expect(src).toContain("setOrders(seatLocks({");
    expect(src).toContain("return seatLocks({ F: merge(");
  });

  it("carries a lock with its player on a manual swap", () => {
    const src = read("app/components/LineupEditor.tsx");
    // The lock follows the player, not the slot. Pinned as intent — the call
    // used to read `prev.idx` from inside a setSelected updater, which CXH2
    // removed in favour of reading the selection directly.
    expect(src).toMatch(/setLocks\(l => \(\{ \.\.\.l, \[group\]: swapLocks\(l\[group\], \w+, idx\) \}\)\)/);
  });

  it("prunes locks when the roster changes", () => {
    const src = read("app/components/LineupEditor.tsx");
    expect(src).toContain("pruneAllLocks(prev, effective.map(p => p.id))");
  });

  it("does not nest a state update inside another updater (CXH2)", () => {
    const src = read("app/components/LineupEditor.tsx");
    expect(src).not.toMatch(/setOrders\(o => \{[\s\S]{0,200}setLocks\(/);
  });

  it("states the locked condition in text, never colour alone", () => {
    const src = read("app/components/LineupEditor.tsx");
    expect(src).toContain("locked to this slot");
    expect(src).toContain("locked");
  });
});

describe("Canary — brand kit implementation", () => {
  it("does not type the ampersand as text in the masthead", () => {
    // The kit: "The red ampersand is a custom vector. Do not recreate it with
    // a typed &." The old masthead did exactly that, in whatever serif the
    // browser happened to have.
    // Pinned as intent: the masthead renders the kit's lockup artwork, in
    // whichever cut. V3 added an untextured variant for the header, so
    // asserting one exact filename was asserting a delivery choice rather than
    // the rule the kit actually states.
    const header = read("app/components/Header.tsx");
    expect(header).toMatch(/cap-and-crease-lockup-horizontal(-clean)?\.svg/);
    expect(header).not.toContain("Cap & Crease\n");
  });

  it("keeps a real heading for search and screen readers", () => {
    // Swapping an <h1> for an image must not cost the page its heading.
    const header = read("app/components/Header.tsx");
    expect(header).toContain('<h1 className="sr-only">{BRAND.name}</h1>');
    expect(header).toContain('alt=""');
  });

  it("serves icons and manifest from the kit rather than ad-hoc files", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain('manifest: "/brand/favicon/site.webmanifest"');
    expect(layout).toContain("/brand/favicon/favicon.svg");
    expect(layout).toContain("/brand/png/cap-and-crease-og-1200x630.png");
  });

  it("keeps the name in BRAND, not re-hardcoded alongside the kit", () => {
    const layout = read("app/layout.tsx");
    expect(layout).toContain("applicationName: BRAND.name");
    expect(layout).toContain("metadataBase: new URL(BRAND.url)");
  });

  it("renders the mark inline rather than through next/image", () => {
    // next/image refuses to optimise SVG without dangerouslyAllowSVG, which
    // would have to be enabled globally for every image, for a logo.
    // Comments stripped — the component's own note explains why it avoids it.
    const mark = readSource("app/components/BrandMark.tsx")
      .replace(/\/\*[\s\S]*?\*\//g, "");
    expect(mark).not.toContain("next/image");
    expect(mark).toContain("export function BrandMark");
  });
});

describe("Canary — the front page wears the brand kit", () => {
  it("types the name nowhere on the home page", () => {
    // Both nameplates — the dark hero and the sheet below it — used Libre
    // Baskerville with a typed ampersand, which the kit forbids.
    for (const file of ["app/page.tsx", "app/components/ScrollNameplate.tsx"]) {
      const src = readSource(file);
      expect(src, file).not.toContain("Cap & Crease");
    }
  });

  it("uses the kit wordmark on both nameplates, cream cut on the dark desk", () => {
    expect(read("app/page.tsx")).toContain("/brand/svg/cap-and-crease-wordmark.svg");
    expect(read("app/components/ScrollNameplate.tsx"))
      .toContain("/brand/svg/cap-and-crease-wordmark-cream.svg");
  });

  it("keeps a real heading on the front page", () => {
    expect(read("app/page.tsx")).toContain('<h1 className="sr-only">{BRAND.name}</h1>');
  });

  it("shows the mark as a crest above the nameplate", () => {
    expect(read("app/page.tsx")).toContain("<BrandMark size={44}");
  });

  it("does not announce the brand twice to a screen reader", () => {
    // Wordmark images sit beside real headings, so they are decorative.
    const page = read("app/page.tsx");
    expect(page).toContain('alt=""');
    expect(page).not.toContain('alt="Cap & Crease"');
  });
});

describe("Canary — RL2 roster tab", () => {
  it("puts Roster ahead of Lineups and opens on it", () => {
    const src = read("app/armchair-gm/GmAnalysisTabs.tsx");
    const roster = src.indexOf('{ key: "roster"');
    const lineups = src.indexOf('{ key: "lineups"');
    expect(roster).toBeGreaterThan(-1);
    expect(roster).toBeLessThan(lineups);
    // The deck opens on Roster. Pinned through the named default rather than
    // the literal, which CXH1 moved into app/lib/gm-tabs.ts.
    expect(src).toContain("useState<GmTab>(GM_TAB_FALLBACK)");
    expect(read("app/lib/gm-tabs.ts")).toContain('GM_TAB_FALLBACK: GmTab = "roster"');
  });

  it("keeps the ordering and sim-merge rules in a tested module", () => {
    const lib = read("app/lib/roster-view.ts");
    for (const fn of ["buildRosterRows", "projectedSeasonIndex", "simTeamFor"]) {
      expect(lib).toContain(`export function ${fn}`);
    }
    expect(read("app/armchair-gm/RosterTab.tsx")).toContain("buildRosterRows");
  });

  it("reuses the shared analytics panel rather than a second copy", () => {
    // A hand-rolled expander here would drift from the offseason screens,
    // which is exactly what OFF4 extracted ExpandedStats to prevent.
    const tab = read("app/armchair-gm/RosterTab.tsx");
    expect(tab).toContain("ExpandedStats");
    expect(tab).toContain("PlayerOutlook");
    expect(tab).toContain("AssetBadges");
  });

  it("shows whether the numbers are simulated or baseline", () => {
    // Reporting last season's points after a sim would misstate the one thing
    // the tab exists for. Pinned to the guarantee — the view distinguishes the
    // two and names the season — rather than to the wording, which changed
    // once already when the label gained the season name.
    const tab = read("app/armchair-gm/RosterTab.tsx");
    expect(tab).toContain("simulated");
    expect(tab).toContain("baseline");
    expect(tab).toMatch(/simulated\s*\?/);
  });

  it("no longer opens the Season Results roster table by default", () => {
    const pager = read("app/armchair-gm/SeasonResultsPager.tsx");
    expect(pager).not.toContain('<details className="mt-2.5" open>');
    expect(pager).toContain("Season Review — Performance vs Expectation");
  });
});

describe("Canary — Roster and Season Review state which is which", () => {
  it("names each view's job, since both show points", () => {
    expect(read("app/armchair-gm/RosterTab.tsx")).toContain("Who you hold.");
    expect(read("app/armchair-gm/SeasonResultsPager.tsx")).toContain("How it went.");
  });

  it("cross-references so neither reads as a contradiction", () => {
    expect(read("app/armchair-gm/RosterTab.tsx")).toContain("Season Review");
    expect(read("app/armchair-gm/SeasonResultsPager.tsx")).toContain("Roster</span>");
  });

  it("labels the roster's numbers with the season they came from", () => {
    const tab = read("app/armchair-gm/RosterTab.tsx");
    expect(tab).toContain("SEASON.label");
    expect(tab).toContain("SEASON.replaySeason");
  });
});

// The tab's first form was one flat table with a two-line badge block under
// every name: tall, thin, and missing the columns a GM opens a roster for.
// These pin the shape of the redesign, not its markup.
describe("Canary — the roster reads like a roster page", () => {
  it("keeps grouping, columns and sort in a tested module", () => {
    const lib = readSource("app/lib/roster-table.ts");
    for (const fn of ["unitOf", "groupRosterRows", "sortRosterRows", "nextSort", "unitTotals"]) {
      expect(lib, fn).toContain(`export function ${fn}`);
    }
    expect(readSource("app/armchair-gm/RosterTab.tsx")).toContain("groupRosterRows");
  });

  it("splits forwards, defence and goaltenders", () => {
    expect(groupRosterRows([
      rosterRowFor("C"), rosterRowFor("D"), rosterRowFor("G"),
    ]).map(g => g.unit)).toEqual(["F", "D", "G"]);
  });

  it("gives goalies goalie columns instead of zeroes where the scoring goes", () => {
    const goalie = columnsFor("G").map(c => c.key);
    const skater = columnsFor("F").map(c => c.key);
    for (const k of ["svPct", "gsax", "gs"]) expect(goalie, k).toContain(k);
    for (const k of ["g", "a", "pts", "plusMinus"]) expect(goalie, k).not.toContain(k);
    for (const k of ["g", "a", "pts"]) expect(skater, k).toContain(k);
  });

  it("carries the columns the old table was missing", () => {
    const skater = columnsFor("F").map(c => c.key);
    for (const k of ["age", "plusMinus", "term"]) expect(skater, k).toContain(k);
  });

  it("sorts on a total order, so the rows cannot jitter", () => {
    const rows = [rosterRowFor("C", "Zeta", 40), rosterRowFor("C", "Alpha", 40)];
    const sort = { key: "pts", direction: "desc" as const };
    const a = sortRosterRows(rows, sort, columnsFor("F")).map(r => r.asset.name);
    const b = sortRosterRows([...rows].reverse(), sort, columnsFor("F")).map(r => r.asset.name);
    expect(a).toEqual(b);
  });

  it("keeps rows with no value at the bottom whichever way the sort runs", () => {
    // Reversing must not promote a row of dashes to the top.
    const rows = [rosterRowFor("C", "Has", 40, 50), rosterRowFor("C", "None", 40, null)];
    for (const direction of ["asc", "desc"] as const) {
      const out = sortRosterRows(rows, { key: "nav", direction }, columnsFor("F"));
      expect(out[out.length - 1].asset.name, direction).toBe("None");
    }
  });

  it("shows one line per player, with the full badge ledger in the expansion", () => {
    // The compact badge strip is what keeps a row one line high; the Ledger
    // strip (awards, injury, scenery) moved into the expanded panel.
    const tab = readSource("app/armchair-gm/RosterTab.tsx");
    expect(tab).toContain("compact");
    const badges = readSource("app/components/AssetBadges.tsx");
    expect(badges).toContain("hasLedger && !compact");
  });

  it("announces the sort rather than only drawing a caret", () => {
    expect(readSource("app/armchair-gm/RosterTab.tsx")).toContain("aria-sort");
  });
});

describe("Canary — RL6 special teams", () => {
  it("keeps the unit rules in a tested module", () => {
    const lib = read("app/lib/special-teams.ts");
    for (const fn of ["defaultPowerPlay", "defaultPenaltyKill", "hydrateSpecialTeams",
                      "specialTeamsPointMultiplier", "specialTeamsGamesBonus"]) {
      // Some are `export const` arrows, some `export function` — assert the
      // export exists, not which form it happens to take.
      expect(lib, fn).toMatch(new RegExp(`export (const|function) ${fn}\\b`));
    }
  });

  it("offers all three situations in the editor", () => {
    const src = read("app/components/LineupEditor.tsx");
    expect(src).toContain('"5-on-5"');
    expect(src).toContain('"Power Play"');
    expect(src).toContain('"Penalty Kill"');
    expect(src).toContain('role="tablist"');
  });

  it("carries the sheets through the lineup payload", () => {
    expect(read("app/lib/lineup-order.ts")).toContain("powerPlay?: string[]");
    expect(read("app/components/LineupEditor.tsx")).toContain("powerPlay: specialTeams.powerPlay");
  });

  it("makes the sim actually respect the units", () => {
    // "sim deployment must respect them" is the half of RL6 that matters.
    const route = read("app/api/simulate/route.ts");
    expect(route).toContain("specialTeamsPointMultiplier");
    expect(route).toContain("specialTeamsGamesBonus");
    expect(route).toContain("specialTeamsMultiplier");
  });

  it("rehydrates units across a roster change rather than playing short", () => {
    expect(read("app/components/LineupEditor.tsx")).toContain("hydrateSpecialTeams(effective, prev)");
  });
});

describe("Canary — CX8 one canonical trade-value model", () => {
  it("the bench calls the engine instead of reimplementing compression", () => {
    const page = read("app/armchair-gm/page.tsx");
    expect(page).toContain("compressPackage");
    // The copy summed penalties separately and clamped once; the engine clamps
    // each marginal asset. Two implementations is the defect.
    expect(page).not.toContain("penaltySum");
    expect(page).not.toContain("decaySum");
  });

  it("pick protection moves a number rather than only a colour", () => {
    const engine = read("app/lib/xnav-engine.ts");
    expect(engine).toContain("PROTECTION_DISCOUNT");
    expect(engine).toContain("asset.isProtected");
  });

  it("protection survives serialisation", () => {
    const share = read("app/lib/trade-share.ts");
    expect(share).toContain("isProtected");
    expect(read("app/armchair-gm/page.tsx")).toContain("isProtected: true as const");
  });

  it("retention limits are not gated on a Cup Run", () => {
    // Three slots, 50% a contract, a share of the ceiling — league rules, not
    // run rules. The check used to sit inside `if (cupRun?.status === ACTIVE)`.
    const bench = read("app/armchair-gm/useTradeBench.ts");
    expect(bench).toContain("sessionRetention");
    expect(bench).not.toMatch(/if \(cupRun\?\.status === "ACTIVE"\) \{\s*const retainedOutgoing/);
  });
});

describe("Canary — CXH7 visuals agree with the models they display", () => {
  it("the quadrant chart reads the model's thresholds, not its own crosshair", () => {
    const chart = read("app/components/ContentionQuadrant.tsx");
    expect(chart).toContain("CONTENTION_THRESHOLDS");
    expect(chart).toContain("classifyContention");
    // The invented 5.0/5.0 crosshair.
    expect(chart).not.toContain("ratingToX(5.0)");
    expect(chart).not.toContain("ratingToY(5.0)");
  });

  it("labels and shading come from the same regions", () => {
    // A cell tinted one verdict and captioned another is the defect.
    const chart = read("app/components/ContentionQuadrant.tsx");
    const uses = chart.match(/REGIONS\.map/g) ?? [];
    expect(uses.length).toBe(2);
  });

  it("future strength counts picks and unproven youth", () => {
    const src = read("app/armchair-gm/contention.ts");
    expect(src).toContain("pickBonus");
    expect(src).toContain("unprovenBonus");
    expect(src).toContain("PICK_FUTURE_WEIGHT");
  });

  it("STRAND reference lines follow per-trait thresholds", () => {
    // A flat mean wearing a threshold's colour is not a threshold.
    const src = read("app/components/TeamStrand.tsx");
    expect(src).toContain("buildRef = (vals: number[]");
    expect(src).not.toContain("buildRef(avg(");
  });

  it("a league-average EDGE value is neutral, not red", () => {
    const src = read("app/armchair-gm/TeamEdgeTiles.tsx");
    expect(src).toContain("EDGE_NEUTRAL_BAND");
  });

  it("PlayerComparison quotes the compressed package, like the verdict beside it", () => {
    const src = read("app/components/PlayerComparison.tsx");
    expect(src).toContain("compressPackage");
  });

  it("keeps goalies out of the skater rate block", () => {
    // A goalie's ptsPace is structurally near zero and his TOI is a different
    // quantity, so including him made any trade with a goalie read as a
    // downgrade.
    const src = read("app/components/PlayerComparison.tsx");
    const guards = src.match(/a\.position !== "Pick" && a\.position !== "G"/g) ?? [];
    expect(guards.length).toBeGreaterThanOrEqual(2);
  });
});

describe("Canary — CXH8 overlays are usable by keyboard", () => {
  const OVERLAYS = [
    "app/armchair-gm/TeamSelectModal.tsx",
    "app/armchair-gm/ModeSelectModal.tsx",
    "app/armchair-gm/MemoModal.tsx",
    "app/armchair-gm/CupRunResumePrompt.tsx",
    "app/components/TradeProposal.tsx",
    "app/components/DraftNight.tsx",
  ];

  it("every overlay uses the shared dialog hook", () => {
    // Six overlays each half-accessible in a different way is how this got
    // filed. One hook means one place to be right.
    for (const f of OVERLAYS) expect(read(f), f).toContain("useDialog");
  });

  it("no overlay hand-rolls dialog semantics any more", () => {
    for (const f of OVERLAYS) {
      expect(read(f), f).not.toContain('role="dialog"');
      expect(read(f), f).not.toContain('aria-modal="true"');
    }
  });

  it("the hook supplies trap, escape, restore and scroll lock", () => {
    const hook = read("app/lib/use-dialog.ts");
    expect(hook).toContain("useBodyScrollLock(open)");
    expect(hook).toContain('event.key === "Escape"');
    expect(hook).toContain('event.key !== "Tab"');
    expect(hook).toContain("restoreRef");
    expect(hook).toContain("nextFocusIndex");
  });

  it("keeps the cycling rule pure and tested", () => {
    const lib = read("app/lib/focus-trap.ts");
    expect(lib).toContain("export function nextFocusIndex");
    expect(lib).toContain("export function initialFocusIndex");
  });

  it("gives season rows a keyboard path to the breakdown", () => {
    // The row carried a click handler and nothing else.
    const src = read("app/armchair-gm/SeasonResultsPager.tsx");
    expect(src).toContain("aria-expanded={isOpen}");
    expect(src).toContain("valuation breakdown for");
  });
});

describe("Canary — CXH9 public endpoints validate before they work", () => {
  it("no public route casts req.json() to its request type", () => {
    // The defect: `await req.json() as MatchRequest`. These endpoints do not
    // authenticate, so "the client only sends thirty players" is an assumption
    // about a program that is not the one making the request.
    for (const route of [
      "app/api/match/route.ts",
      "app/api/simulate/route.ts",
      "app/api/evaluate/route.ts",
      "app/api/claude/route.ts",
    ]) {
      const src = readSource(route);
      expect(src, route).not.toMatch(/await req\.json\(\)\s+as\s+\w/);
    }
  });

  it("match validates through a bounded schema", () => {
    const src = read("app/api/match/route.ts");
    expect(src).toContain("matchRequestSchema");
    expect(src).toContain("safeParse");
    expect(src).toContain("PUBLIC_LIMITS");
  });

  it("evaluate bounds its arrays, strings and numbers", () => {
    // The schema moved into app/lib so it can be imported and proved; a route
    // file cannot export anything but its handlers.
    const src = read("app/lib/evaluate-request-schema.ts");
    expect(src).toContain("PUBLIC_LIMITS.MAX_PACKAGE");
    expect(src).toContain("PUBLIC_LIMITS.MAX_ROSTER");
    expect(src).toContain("z.number().finite()");
    // Unbounded `z.string()` for an id was the reported gap.
    expect(src).toContain("id: idString");
    expect(read("app/api/evaluate/route.ts")).toContain("EvaluateRequestSchema.safeParse");
  });

  it("does not put a trade-package ceiling on a bulk-NAV field", () => {
    // `assets` is the NAV batch — Armchair GM posts a whole league to price
    // every player at once. Capping it at MAX_PACKAGE 400'd a normal 3 MB
    // page load and left the app with no NAV for anything.
    const src = read("app/lib/evaluate-request-schema.ts");
    expect(src).toContain("assets: z.array(AssetSchema).max(PUBLIC_LIMITS.MAX_PLAYERS)");
    expect(src).not.toContain("assets: z.array(AssetSchema).max(PUBLIC_LIMITS.MAX_PACKAGE)");
  });

  it("claude validates before charging the rate limit", () => {
    // Limits protect the upstream bill; a malformed request never reaches
    // upstream, so counting it against a global daily budget lets garbage deny
    // the feature to real users at no cost to the attacker.
    const src = read("app/api/claude/route.ts");
    const parse = src.indexOf("ClaudeRequestSchema.safeParse");
    const limit = src.indexOf("await checkRateLimit");
    expect(parse).toBeGreaterThan(-1);
    expect(limit).toBeGreaterThan(-1);
    expect(parse).toBeLessThan(limit);
  });

  it("claude times out its upstream call and does not leak the reason", () => {
    const src = read("app/api/claude/route.ts");
    expect(src).toContain("UPSTREAM_TIMEOUT_MS");
    expect(src).toContain("upstream.abort()");
    expect(src).toContain("signal: upstream.signal");
    // The upstream message can carry request detail.
    expect(src).not.toContain("{ error: e.message }");
  });
});

describe("Canary — CXH2 lineup state does not leak or churn", () => {
  it("a lineup sheet is keyed to its club", () => {
    // `TeamLineup` is rendered twice with the same shape. Without a key React
    // reuses the instance across a franchise change, so the previous club's
    // order stayed on screen under the new club's name.
    const src = read("app/components/LineupEditor.tsx");
    expect(src).toContain("key={home.teamId}");
    expect(src).toContain("key={partner.teamId}");
  });

  it("no state setter is called inside another setter's updater", () => {
    // A state updater must be pure. StrictMode double-invokes it, and a swap
    // performed twice is a swap not performed at all — the bug hid itself.
    //
    // Scanned by balancing parens rather than by a fixed window, so the check
    // covers the whole updater body however long it grows.
    const src = read("app/components/LineupEditor.tsx");
    const setter = /\bset[A-Z]\w*\(/g;
    for (let m = setter.exec(src); m; m = setter.exec(src)) {
      let depth = 1;
      let i = m.index + m[0].length;
      for (; i < src.length && depth > 0; i++) {
        if (src[i] === "(") depth++;
        else if (src[i] === ")") depth--;
      }
      const body = src.slice(m.index + m[0].length, i - 1);
      // Only an updater form can be double-invoked; `setX(value)` is fine.
      if (!/^\s*(\(?\w+\)?|\([^)]*\))\s*=>/.test(body)) continue;
      expect(body, `${m[0]} at index ${m.index}`).not.toMatch(/\bset[A-Z]\w*\(/);
    }
  });

  it("lineup cells are render helpers, not components declared in render", () => {
    // Declared in the body, each was a new component type every render, so
    // React remounted all 18 cells on any state change and threw away focus
    // mid-interaction — undoing the CXH8 keyboard work.
    const src = read("app/components/LineupEditor.tsx");
    for (const name of ["Cell", "UnitCell", "UnitSheet", "SectionHead", "RowLabel"]) {
      expect(src, name).not.toMatch(new RegExp(`\\n  const ${name} = \\(`));
      expect(src, name).not.toContain(`<${name} `);
    }
    expect(src).toContain("renderCell(");
    expect(src).toContain("renderUnitSheet(");
  });

  it("reset clears the lineup orders, not only the goalies", () => {
    // Reset restores the original database. An order left behind was re-applied
    // to a roster that no longer held those players.
    const src = read("app/armchair-gm/useTradeBench.ts");
    const reset = src.slice(src.indexOf("const resetTrades"));
    expect(reset).toContain("setLineupStartingGoalies({})");
    expect(reset).toContain("setLineupOrders({})");
  });
});

describe("Canary — an admin-recorded extension reaches Armchair GM", () => {
  const assembly = read("app/lib/roster-assembly.ts");

  it("contract status asks about the extension", () => {
    // The reported bug: Carlsson and Celebrini signed long-term deals entered
    // in the admin panel and still derived as RFAs. The extension reached the
    // valuation engine and nothing else.
    expect(assembly).toContain("extensionCapHit: fin?.extensionCapHit");
    expect(assembly).toContain("extensionYears: fin?.extensionYears");
    expect(assembly).toContain("resolveRecordedExtension");
    expect(assembly).toContain("expiresThisOffseason = currentDealExpires && extension.state === \"NONE\"");
  });

  it("an active extension becomes the contract rather than a $0 expiry", () => {
    expect(assembly).toContain("extensionActive = extension.state === \"ACTIVE\"");
    expect(assembly).toMatch(/rawCapHit\s+= extensionActive \? extension\.aav/);
    expect(assembly).toMatch(/extensionActive \? extension\.term/);
  });

  it("a pending extension is recorded where the offseason flow reads it", () => {
    // pendingExtension is what the cap horizon, the extension-eligibility gate
    // and the rollover all read. Without it the signing was a number only the
    // valuation engine could see.
    expect(assembly).toContain("pendingExtension: extension.state === \"PENDING\"");
    expect(assembly).toContain("wouldHaveBeen: normExpiry ?? \"UFA\"");
  });

  it("an extended player is not injected into the free-agent pool", () => {
    const pool = assembly.slice(assembly.indexOf("Free-agent pool: teamless FA entries"));
    expect(pool).toContain("d.extensionCapHit != null && d.extensionCapHit > 0");
  });
});

describe("Canary — CXH1 the analysis deck never shows an empty panel", () => {
  const deck = read("app/armchair-gm/GmAnalysisTabs.tsx");

  it("the shown tab is derived, not stored", () => {
    // Storing it needs an effect to repair, which paints the empty panel for a
    // frame and throws away the user's choice permanently.
    expect(deck).toContain("visibleTab(tabs, selectedTab)");
    expect(deck).not.toMatch(/useState<GmTab>\(\s*"(comparison|breakdown)"/);
  });

  it("a disabled tab cannot be the visible one", () => {
    const rule = read("app/lib/gm-tabs.ts");
    expect(rule).toContain("if (match && !match.disabled) return selected");
    expect(rule).toContain("GM_TAB_FALLBACK");
  });

  it("EVERY executed trade lands the user on the Sim tab, not just the first", () => {
    // The first fix keyed on `showSimPanel`, which is set true on execute and
    // only cleared on reset — so a second trade in the same session had no edge
    // to detect and left the user on Roster while Sim grew a second entry.
    // A count answers "did another trade just happen"; a latched flag cannot.
    expect(deck).toContain("executedTrades.length > tradeCountWas.current");
    expect(deck).toContain('}, [executedTrades.length]);');
  });

  it("carries no latched trade flag that can disagree with the trade list", () => {
    // showSimPanel duplicated a fact already derivable from executedTrades, and
    // the two could disagree — which is exactly how the second trade was lost.
    for (const file of [
      "app/armchair-gm/GmAnalysisTabs.tsx",
      "app/armchair-gm/useTradeBench.ts",
      "app/armchair-gm/page.tsx",
    ]) {
      const src = readSource(file);
      expect(src, file).not.toContain("showSimPanel");
    }
  });

  it("keeps the selection so it can come back", () => {
    // The tab returns when assets go back on the block; nothing overwrites it.
    expect(deck).not.toMatch(/setSelectedTab\(GM_TAB_FALLBACK\)/);
  });

  it("arrow keys skip disabled tabs", () => {
    expect(deck).toContain("nextTab(tabs, activeTab, dir)");
    expect(read("app/lib/gm-tabs.ts")).toContain("tabs.filter(t => !t.disabled)");
  });
});

describe("Canary — Press Box deals a constructed puzzle", () => {
  const engine = read("app/lib/press-box-engine.ts");

  it("the deal is curated, not a slice off a shuffle", () => {
    // `shuffled.slice(0, 6)` sat under a comment claiming it ensured scoring
    // potential. It ensured nothing, and one day in six weeks had no puzzle.
    expect(engine).toContain("dealIsPlayable");
    expect(engine).toContain("DEAL_RULES");
    expect(engine).not.toMatch(/const dealt = shuffled\.slice\(0, 6\)/);
  });

  it("keeps a fallback so a drifting pool can never blank the page", () => {
    expect(engine).toContain("dealPenalty");
    expect(engine).toContain("chosen ?? fallback");
  });

  it("no fixed score ceiling survives", () => {
    // MAX_SCORE = 15 while the real optimum ran 3-19, so a perfect hand
    // displayed as "8/15 PERFECT HAND".
    for (const file of ["app/lib/press-box-engine.ts", "app/press-box/page.tsx"]) {
      const src = readSource(file);
      expect(src, file).not.toContain("MAX_SCORE");
    }
    expect(engine).toContain("PEG_BOARD_LENGTH = DEAL_RULES.MAX_OPTIMUM");
  });

  it("discards saved games from the six-card deal", () => {
    // A v2 save holds picks naming cards no longer on the table.
    const page = read("app/press-box/page.tsx");
    expect(page).toContain("const STATE_VERSION = 3");
    expect(page).toContain("saved.version === STATE_VERSION");
  });
});

describe("Canary — Press Box rules describe the game being scored", () => {
  const page = read("app/press-box/page.tsx");

  it("states that the call-up joins the hand", () => {
    // scoreHand builds a FIVE-card hand, so a breakdown reads "2x OTT = 2"
    // when only one of your picks is a Senator. The rules never said so.
    expect(page).toContain("The call-up is the fifth card in your hand");
  });

  it("prices Pipeline per year, which is what the engine pays", () => {
    // Four cards spanning 2019/2019/2020/2021 score 3, not 4.
    expect(page).toContain("1 pt per year in a run");
    expect(page).not.toContain("1 pt per card in a run");
  });

  it("admits the flat categories are flat", () => {
    expect(page).toMatch(/Country Club<\/strong> — 3 pts if 3 or more share a country \(flat/);
  });

  it("keeps one copy of the rules", () => {
    // Two verbatim copies is how the text drifted from the engine.
    expect(page).toContain("function HowToScore()");
    expect((page.match(/2 pts per pair on the same NHL team/g) ?? []).length).toBe(1);
  });

  it("shows the answer when the attempts run out", () => {
    // A daily puzzle that never reveals its answer teaches nothing.
    expect(page).toContain("gameOver && !foundOptimal && perfectHand");
    expect(page).toContain("The Perfect Hand");
  });

  it("keeps every guess on screen WHILE the next one is being made", () => {
    // The history lived inside the SCORED panel, so it vanished the moment the
    // player pressed Try Again — gone exactly when it was needed.
    expect(page).toContain("function AttemptHistory(");
    expect((page.match(/<AttemptHistory/g) ?? []).length).toBe(2);
    const drafting = page.slice(page.indexOf("Hands You Have Tried") - 400,
                                page.indexOf("Hands You Have Tried") + 100);
    expect(drafting).toContain('phase === "DRAFTING"');
    expect(page).toContain("belonged");
  });

  it("does not tell the player to waive two cards out of eight", () => {
    // "Waive the other 2" was left over from the six-card deal.
    expect(page).not.toContain("Waive the other 2.");
    expect(page).toContain("Waive the other {CARDS_DEALT - 4}");
  });

  it("does not point at a scoring breakdown that is off screen", () => {
    expect(page).not.toContain("Use the scoring breakdown to improve your hand");
  });

  it("takes the optimum the curator already computed", () => {
    // Recomputing is a second answer that can disagree with the accepted one.
    expect(page).toContain("const optimalResult = hand?.optimal ?? null");
  });
});

describe("Canary — CXH4 proposal generation is deterministic and honest", () => {
  const panel = read("app/components/TradeProposal.tsx");

  it("does not let arrival order pick the surviving package", () => {
    // Every package from one club shares a fitScore, so `>` never fired
    // between them and the first audit to RESOLVE won.
    expect(panel).not.toMatch(/if \(candidate\.fitScore > existing\.fitScore\)/);
    expect(panel).toContain("bestPerTeam(viable)");
  });

  it("carries the tiebreak keys on every candidate", () => {
    expect(panel).toContain("packageIndex");
    // Built through one helper so a new candidate branch cannot omit them.
    expect((panel.match(/\.\.\.planKeys\(team, /g) ?? []).length).toBeGreaterThanOrEqual(4);
  });

  it("audits breadth-first, so one club cannot eat the budget", () => {
    expect(panel).toContain("planAuditOrder(screened)");
    expect(read("app/lib/proposal-plan.ts")).toContain("byRound");
  });

  it("checks the early exit only at a settled wave boundary", () => {
    // Checking mid-flight would hand the cutoff back to the network.
    expect(panel).toContain("stopAfterWave(");
    expect(panel).not.toContain("while (cursor < preScreened.length)");
  });

  it("keeps a failed audit distinct from a declined trade", () => {
    // Errors were swallowed as "not viable", so a dead network reported
    // "No realistic trade partners found."
    expect(panel).toContain("summariseAudit(");
    expect(panel).toContain('outcome?.kind === "INCOMPLETE"');
    expect(panel).toContain("The audit could not be completed.");
  });

  it("does not count a user abort as a failure", () => {
    expect(panel).toContain("if (ctrl.signal.aborted) return { failed: true }");
  });
});

describe("Canary — CXH5 Partner Finder folders mean one thing each", () => {
  it("the route classifies through the shared rule", () => {
    const route = read("app/api/match/route.ts");
    expect(route).toContain("classifyMatch(finalScore, capFit)");
    // The ladder that tested cap fit between the score bands.
    expect(route).not.toMatch(/capFit === "FITS"\s+\? "CAP_CLEAR"/);
  });

  it("cap space no longer promotes a club into an interest folder", () => {
    // Strip the header comment, which quotes the old ladder verbatim.
    const rule = readSource("app/lib/match-fit.ts");
    // capFit is consulted once, for OVER, and never again.
    expect(rule).toContain('if (capFit === "OVER") return "BLOCKED"');
    expect(rule).not.toContain('capFit === "FITS"');
  });

  it("no folder is named after a cap condition", () => {
    for (const file of ["app/api/match/route.ts", "app/armchair-gm/MatchResultsPanel.tsx"]) {
      const src = readSource(file);
      expect(src, file).not.toContain("CAP_CLEAR");
    }
  });

  it("says what the open folder claims", () => {
    const panel = read("app/armchair-gm/MatchResultsPanel.tsx");
    expect(panel).toContain("TIER_MEANING[activeFolder]");
  });

  it("lets a scanned club be loaded as the partner", () => {
    // The scan named a partner and then made you find them in the picker.
    const panel = read("app/armchair-gm/MatchResultsPanel.tsx");
    expect(panel).toContain("onSelectPartner");
    expect(panel).toContain("Open Trade");
    const page = read("app/armchair-gm/page.tsx");
    expect(page).toContain("onSelectPartner={(teamId)");
    // The shopped package is the point of the scan — it must survive.
    expect(page).toContain("setBlocks([blocks[0], []])");
  });
});

describe("Canary — CXH6 the payroll range is checked the same way at both ends", () => {
  const route = read("app/api/evaluate/route.ts");

  it("both clubs go through one rule", () => {
    // The ceiling was checked for both sides, the floor for home only.
    expect(route).toContain("findCapBreaches(");
    expect(route).toContain("side: 0");
    expect(route).toContain("side: 1");
    expect(route).not.toMatch(/newCapUsedHome < SEASON\.capFloor/);
  });

  it("uses a live floor, not the season constant", () => {
    // There is a cap_floor override in admin settings and this route ignored
    // it, so raising the ceiling left the two ends describing different leagues.
    expect(route).toContain("getLiveCapFloor");
    expect(route).toContain('r.key === "cap_floor"');
    expect(route).toContain("await getLiveCapFloor()");
  });

  it("does not gate the floor on an arbitrary dollar threshold", () => {
    // `capDelta < -3` cleared a club just above the floor that shed $2M.
    expect(route).not.toContain("capDeltaHome < -3");
    const rule = readSource("app/lib/cap-limits.ts");
    expect(rule).not.toMatch(/capDelta < -\d/);
    // What replaced it: only a trade that reduces payroll can breach the floor.
    expect(rule).toContain("s.capDelta < 0");
  });

  it("separates causing a breach from deepening one", () => {
    expect(read("app/lib/cap-limits.ts")).toContain("causedByTrade");
  });
});

describe("Canary — CXS2 Draft Night says what it actually does to picks", () => {
  const panel = read("app/components/DraftNight.tsx");
  const rendered = readSource("app/components/DraftNight.tsx");

  it("makes no blanket promise about picks", () => {
    // "your picks stay tradeable assets" was true only by accident of which
    // years the inventory happens to carry.
    expect(rendered).not.toContain("your picks stay tradeable assets");
  });

  it("names the years it is talking about, from config", () => {
    // A literal year in the copy drifts the moment the season rolls over.
    expect(panel).toContain("SEASON.firstTradablePickYear");
    expect(panel).toContain("This draft's picks were spent when it was held");
  });

  it("shows the draft year from config rather than a literal", () => {
    expect(panel).toContain("{SEASON.draftYear} Draft Night");
    expect(rendered).not.toContain("2026 Draft Night —");
  });

  it("still spends picks on completion", () => {
    // The no-op for Year 1 is correct, but the rule must stay wired.
    expect(read("app/armchair-gm/page.tsx"))
      .toContain("dropSpentDraftPicks(prev.players, draftYearForCupYear(1))");
  });
});

describe("Canary — CXS6 filed reports can be reopened, and only real trades filed", () => {
  const bar = readSource("app/components/TradeHistoryBar.tsx");

  it("a selected club is not a saveable trade", () => {
    // Armchair GM picks a home club at startup, so the old gate had Save live
    // from page load, filing reports reading "nothing" against "nothing".
    expect(bar).toContain("isSaveableTrade(blocks)");
    expect(bar).not.toMatch(/disabled=\{!hasActiveTrade\}[\s\S]{0,200}\+ Save/);
  });

  it("a filed report can be loaded back onto the bench", () => {
    expect(bar).toContain("restoreScenario(scenario, pool)");
    expect(bar).toContain("Load");
    expect(read("app/armchair-gm/page.tsx"))
      .toContain("<TradeHistoryBar pool={{ teams: db.teams, players: db.players }} />");
  });

  it("restores by lookup, never by rebuilding the asset", () => {
    // A SavedScenario keeps none of the paces the engine reads, so a rebuilt
    // player would price at zero — the CXH3 failure again.
    const rule = readSource("app/lib/scenario-restore.ts");
    expect(rule).toContain("byId.get(stored.id)");
    expect(rule).toContain("canonicalNameSlug");
  });

  it("says so when the saved trade no longer fully exists", () => {
    // Loading a smaller trade than the one filed, silently, is the bad outcome.
    expect(readSource("app/lib/scenario-restore.ts")).toContain("missingAssets");
    expect(bar).toContain("no longer in the league");
  });
});

describe("Canary — CX7c a simulation reports the season it actually played", () => {
  it("the sim response stamps the simulated year, not the configured one", () => {
    // Year 3 of a Cup Run came back labelled the same season as Year 1.
    const route = readSource("app/api/simulate/route.ts");
    expect(route).toContain("simSeasonIdentity(");
    expect(route).toContain("season: simSeason.season");
    expect(route).toContain("simulationMode: simSeason.simulationMode");
    expect(route).not.toContain("season: SEASON.label");
    expect(route).not.toContain("simulationMode: SEASON.simulationMode,\n      replaySeason: SEASON.replaySeason");
  });

  it("the client tells the route which run year it is", () => {
    expect(readSource("app/armchair-gm/useSimDispatch.ts")).toContain("cupRunYear: cupRunContext.year");
    expect(readSource("app/lib/sim-request-schema.ts")).toContain("cupRunYear");
  });

  it("the recap prompt names the simulated season", () => {
    // The prompt asked for a recap of SEASON.label while its own Cup Run
    // preamble listed the prior years under their correct labels.
    const claude = readSource("app/api/claude/route.ts");
    expect(claude).toContain("const recapSeason = payload.season ?? SEASON.label");
    expect(claude).toContain("recap of the PROJECTED ${recapSeason} NHL season");
    expect(claude).not.toContain("PROJECTED ${SEASON.label}");
  });

  it("does not assert a completed season its own preamble contradicts", () => {
    // Past Year 1 the most recent completed season is the previous run year.
    const claude = readSource("app/api/claude/route.ts");
    expect(claude).toContain("priorRunSeason");
    expect(claude).toContain("lastCompletedChampion");
  });

  it("Year 1 still reports exactly the configured season", () => {
    const rule = readSource("app/lib/sim-season.ts");
    expect(rule).toContain("safeYear === 1 ? SEASON.replaySeason");
  });
});

describe("Canary — OFF7 AI clubs must live under the cap too", () => {
  const rule = readSource("app/lib/ai-trades.ts");

  it("the offseason resolves AI cap-clearing trades", () => {
    // Before this, an AI club could sit over the ceiling all season while the
    // user was held to it.
    const fa = readSource("app/lib/free-agency.ts");
    expect(fa).toContain("resolveAiTrades(players");
    expect(fa).toContain("aiTrades");
    expect(fa).toContain("applyAiTrades(players, res.aiTrades");
  });

  it("only a club with a cap problem trades", () => {
    expect(rule).toContain("(capSpace.get(t.id) ?? 0) < 0");
  });

  it("the buyer has to want the player", () => {
    expect(rule).toContain("blockFitsTeam(");
    expect(rule).toContain("AI_TRADE_RULES.MIN_FIT_SCORE");
  });

  it("a club does not dump its core", () => {
    expect(rule).toContain("lineupContributionScore");
    expect(rule).toContain("PROTECTED_CORE");
  });

  it("a body comes back, so rosters do not shrink over a Cup Run", () => {
    expect(rule).toContain("MAX_RETURN_FRACTION");
    expect(rule).toContain("inPlayerId");
  });

  it("holds AI trades to the same payroll range as the user's", () => {
    expect(rule).toContain("findCapBreaches(");
  });

  it("leaves the user's club alone", () => {
    expect(rule).toContain("t.id !== userTeamId");
    expect(rule).toContain("t.id !== s.userTeamId");
  });

  it("is deterministic — no RNG decides which trades happened", () => {
    expect(rule).not.toMatch(/Math\.random|mulberry32|rand\(\)/);
    expect(rule).toContain("localeCompare");
  });
});

describe("Canary — special-teams sheets are actually editable", () => {
  const editor = readSource("app/components/LineupEditor.tsx");

  it("offers a bench in PP and PK, not only at even strength", () => {
    // The bench was gated `situation === "EV"`, so on a unit sheet the only
    // reachable players were the ones hydrateSpecialTeams happened to place.
    expect(editor).toContain('situation !== "EV" && (');
    expect(editor).toContain("stBenchPlayers");
  });

  it("can put a bench player into a unit slot", () => {
    // A slot-to-slot swap cannot do this: a bench player has no slot index.
    expect(editor).toContain("placeFromBench(");
    expect(editor).toContain("stBenchPick");
  });

  it("never dresses the same man twice on one unit", () => {
    expect(editor).toContain("const existing = arr.indexOf(playerId)");
  });

  it("keeps goalies off the special-teams bench", () => {
    expect(editor).toContain("!isG(p) && !onSheet.has(p.id)");
  });

  it("shows the alternate position on the tile, not just in the tooltip", () => {
    // displayPosition was used in the title attribute and on the EV bench, but
    // the visible badge printed the primary position alone.
    const badges = editor.match(/displayPosition\(p\.position, p\.secondaryPosition\)/g) ?? [];
    expect(badges.length).toBeGreaterThanOrEqual(4);
  });
});

describe("Canary — a rookie's baseline must not vouch for itself", () => {
  // `skater-prior.ts` pools a season against the MoneyPuck multi-season
  // baseline. How much authority that baseline gets depends on how many
  // seasons are behind it — a rookie carries 0.50, and that half IS the
  // current season. Without the weight sum the prior assumes a complete
  // baseline and hands one year the standing of a career.
  //
  // The plumbing crosses three files and nothing type-checks it away: drop the
  // roster-assembly line and every rookie is quietly over-credited, with no
  // unit test able to see it.
  it("the roster reads the weight sum off the baseline", () => {
    expect(readSource("app/lib/roster-assembly.ts"))
      .toContain("baselineSeasonsWeighted: baselines.totalSeasonsWeighted");
  });

  it("the asset carries it and the request schema accepts it", () => {
    expect(readSource("app/lib/trade-types.ts")).toContain("baselineSeasonsWeighted");
    expect(readSource("app/lib/evaluate-request-schema.ts")).toContain("baselineSeasonsWeighted");
  });

  it("the prior spends it rather than ignoring it", () => {
    const prior = readSource("app/lib/skater-prior.ts");
    expect(prior).toContain("baselineSeasonsWeighted");
    expect(prior).toMatch(/baselineEvidence\(input\.baselineSeasonsWeighted\)/);
  });
});

describe("Canary — skater FMV comes from the fitted model, not a logistic curve", () => {
  const engine = readSource("app/lib/xnav-engine.ts");

  it("the retired sigmoid's constants stay retired", () => {
    // MAX_CAP_PCT was 0.20 — the CBA's legal maximum, used as the top of the
    // curve. At a $104M ceiling that asymptote is $20.8M, and every good
    // skater piled up against it: Robertson $19.66M, Suzuki $20.14M, a
    // third-pair defenceman $16.83M. Worse, the tail is flat, so the contract
    // stage stopped telling stars apart at all.
    expect(engine).not.toContain("MAX_CAP_PCT");
    expect(engine).not.toContain("K_FACTOR");
    expect(engine).not.toContain("LEAGUE_MIN_PCT");
    expect(engine).not.toMatch(/const MIDPOINT\b/);
  });

  it("prices from the fitted contract model", () => {
    expect(engine).toContain("skaterFmvCapPct");
    expect(engine).toContain("@/app/lib/skater-fmv");
  });

  it("feeds it pooled inputs rather than one raw season", () => {
    // Without the prior, a shortened season becomes the player: Matthews read
    // as a $8.30M forward off 67 games.
    expect(engine).toContain("skaterSeasonPrior");
    expect(engine).toContain("baselineToiPerGame");
  });

  it("re-prices each contract year instead of holding today's figure", () => {
    // The per-year loop is what makes a long deal for a pre-peak player worth
    // more than a rental. Collapsing it back to a constant would quietly undo
    // the whole term model.
    expect(engine).toMatch(/fmvCapPctAtYear\s*=/);
    expect(engine).toMatch(/fmvAt\(/);
  });

  it("falls back to replacement level, never to a mid-range guess", () => {
    // A skater with no production rate has no market read. Inventing one is
    // exactly what the sigmoid did.
    expect(engine).toContain("SKATER_LEAGUE_MIN_CAP_PCT");
  });

  it("the deployment baseline is actually built and carried", () => {
    expect(readSource("scripts/process-moneypuck-baselines.ts")).toContain("baselineToiPerGame");
    expect(readSource("app/lib/roster-assembly.ts"))
      .toContain("baselineToiPerGame: baselines.baselineToiPerGame");
  });
});

describe("Canary — future contract years use the announced cap, not a guess", () => {
  const engine = readSource("app/lib/xnav-engine.ts");

  it("no flat escalator survives in either NAV loop", () => {
    // 4% a year against announced ceilings of 104.0 → 113.5 → 123.0, which are
    // 9.1% and 8.4%. Every future year of every contract was priced against a
    // cap several points too low, compounding worst on the long deals.
    expect(engine).not.toContain("CAP_GROWTH_RATE");
    expect(engine).not.toMatch(/Math\.pow\(\s*1\.0[0-9]\s*,\s*i\s*\)/);
  });

  it("both the skater and goalie loops escalate off the announced curve", () => {
    const uses = engine.match(/BASE_CAP_CEILING \* capGrowthFactor\(i\)/g) ?? [];
    expect(uses.length).toBe(2);
  });

  it("scales off the asset's own ceiling so a custom cap still governs", () => {
    // Armchair GM lets a user set the cap. Calling projectedCapCeiling directly
    // would price contracts against the real league instead of theirs.
    expect(engine).not.toMatch(/=\s*projectedCapCeiling\(i\)/);
  });
});

describe("Canary — one place decides whether a contract is a bargain", () => {
  // Three surfaces each carried `surplus >= 1 ? "BARGAIN" : surplus <= -1 ?
  // "OVERPAY" : "FAIR"`. The $1M was hand-picked and smaller than the model is
  // wrong by, so a gap inside the noise was printed as a verdict. Worse, three
  // copies meant fixing one fixed one.
  const surfaces = [
    "app/components/PercentileCard.tsx",
    "app/components/PlayerTimeline.tsx",
    "app/players/[playerId]/page.tsx",
    "app/components/TrendingPlayers.tsx",
  ];

  it("no surface decides the verdict with its own threshold", () => {
    for (const f of surfaces) {
      expect(readSource(f), f).not.toMatch(/surplus\s*[><]=?\s*-?1\s*\?/);
      expect(readSource(f), f).not.toContain('"BARGAIN"');
    }
  });

  it("every surface goes through the shared verdict", () => {
    for (const f of surfaces) expect(readSource(f), f).toContain("contractVerdict");
  });

  it("the threshold is the fit's published error, not a constant", () => {
    const v = readSource("app/lib/contract-verdict.ts");
    expect(v).toContain("SKATER_FMV_VALIDATION");
    expect(v).toContain("maeCapPct");
    // A literal margin would go stale the moment either model is refitted.
    expect(v).not.toMatch(/margin\s*=\s*1(\.\d+)?[;,]/);
  });

  it("nothing on screen still calls it Fair Market Value", () => {
    // The name asserts what a player is WORTH. The model predicts what clubs
    // pay, fitted on their mistakes as well as their successes.
    for (const f of [...surfaces, "app/components/MetricTip.tsx", "app/armchair-gm/SeasonResultsPager.tsx"]) {
      expect(readSource(f), f).not.toMatch(/Fair Market Value/i);
    }
  });
});

describe("Canary — the dossier shows the player apart from his contract", () => {
  const dossier = readSource("app/players/[playerId]/page.tsx");

  it("splits the headline into on-ice value and what the deal does to it", () => {
    // The blended total is the right number for a trade — no GM is indifferent
    // between an $18.8M Celebrini and a $1M one — but it lets a rich contract
    // swallow a good player. Both readings, or neither.
    expect(dossier).toContain("navSplit");
    expect(dossier).toContain("On the ice");
    expect(dossier).toContain("His contract");
  });

  it("keeps the split summing to the headline", () => {
    // navSplit takes the contract half as the remainder for exactly this
    // reason; a surface that recomputed it independently could drift.
    const lib = readSource("app/lib/nav-breakdown.ts");
    expect(lib).toContain("contract: target - production");
  });

  it("counts the goalie cost-controlled floor as contract, not as the goalie", () => {
    // It is an `adjustment` by kind, so a kind-first test sent it into the
    // apportioned pool and credited most of it to the player.
    const lib = readSource("app/lib/nav-breakdown.ts");
    expect(lib).toMatch(/CONTRACT_STAGE_KEYS[\s\S]{0,80}youngFloor/);
  });
});

describe("Canary — a pending free agent is never sold as a bargain", () => {
  // roster-assembly zeroes capHit for pending FAs on purpose and keeps the real
  // figure in lastCapHit. Six surfaces render contracts; only two knew. The
  // other four printed "$0.0M x 0yr" beside a $9.6M market price and coloured
  // the difference green.
  const surfaces = [
    "app/components/PercentileCard.tsx",
    "app/components/PlayerTimeline.tsx",
    "app/players/[playerId]/page.tsx",
    "app/components/TrendingPlayers.tsx",
  ];

  it("every surface tells the verdict whether he is actually signed", () => {
    for (const f of surfaces) {
      expect(readSource(f), f).toContain("expiresThisOffseason");
      expect(readSource(f), f).toContain("lastCapHit");
    }
  });

  it("the verdict knows that no contract is not a cheap contract", () => {
    const v = readSource("app/lib/contract-verdict.ts");
    expect(v).toContain("noContract");
    expect(v).toMatch(/expiresThisOffseason\s*\|\|/);
  });

  it("the dossier prints the expiring deal, not the zero", () => {
    expect(readSource("app/players/[playerId]/page.tsx")).toContain("Expiring deal");
  });
});

describe("Canary — the roster's contract gaps are actually visible", () => {
  // roster-assembly has computed `contractMissing` all along, under a comment
  // saying it was "surfaced for the admin's needs-data view". No such view
  // existed, so the flag was computed and dropped — which is why a pending free
  // agent advertised as a $9.6M bargain had to be found by reading a player
  // page instead of a list.
  const route = readSource("app/api/admin/needs-data/route.ts");
  const panel = readSource("app/admin/contracts/NeedsDataPanel.tsx");
  const page = readSource("app/admin/contracts/page.tsx");

  it("the flag the pipeline computes reaches an endpoint", () => {
    expect(route).toContain("contractMissing");
    expect(route).toContain("assembleCanonicalRoster");
  });

  it("the endpoint is behind the admin gate like every other one", () => {
    expect(route).toContain("requireAdmin");
  });

  it("keeps the three problems apart instead of one 'bad data' count", () => {
    // A missing contract needs hand entry, a pending FA is correct behaviour
    // worth eyeballing, and a league-minimum placeholder is usually fine.
    // Merging them would bury the one that matters.
    for (const bucket of ["missing", "pendingFa", "placeholder"]) {
      expect(route, bucket).toContain(bucket);
      expect(panel, bucket).toContain(bucket);
    }
  });

  it("the panel is mounted, not merely written", () => {
    expect(page).toContain("<NeedsDataPanel");
  });

  it("reports a failure rather than an empty list it cannot vouch for", () => {
    // A silent empty panel reads as "no problems", which is the one thing it
    // must never claim when the roster would not assemble.
    expect(route).toMatch(/status:\s*500/);
    expect(panel).toContain("setError");
  });
});

describe("Canary — nothing in the app fetches CapWages", () => {
  // They sell an API and began returning 403. Coding around a bot check to
  // avoid paying for the product somebody sells is not a thing this project
  // does, so the dependency was removed rather than disguised.
  //
  // The public league route was the one that mattered: it scraped 32 team
  // pages on every load, in batches of eight with an eight-second timeout
  // each, wrapped in a try/catch that made the failure invisible. After the
  // 403 that was up to half a minute of requests that could only fail.
  const files = [
    "app/api/league/route.ts",
    "app/api/admin/contracts/route.ts",
    "app/api/admin/prune-stale/route.ts",
    "app/api/admin/health/route.ts",
  ];

  it("no code path requests capwages.com", () => {
    for (const f of files) {
      expect(readSource(f), f).not.toMatch(/capwages\.com/i);
    }
  });

  it("the scraper module is gone, not merely unused", () => {
    expect(() => readSource("app/services/scraper.ts")).toThrow();
  });

  it("cap space falls back without it", () => {
    // resolveTeamCapSpace already treated the live figure as optional, which is
    // why removing the scrape needed no downstream change.
    expect(readSource("app/lib/team-cap-space.ts")).toContain("liveCapSpace");
    expect(readSource("app/api/league/route.ts")).toContain("resolveTeamCapSpace");
  });

  it("still credits them for the baseline the project was built on", () => {
    // Independence is not the same as pretending the debt never existed.
    expect(readSource("app/components/Footer.tsx")).toMatch(/CapWages/);
    expect(readSource("app/methodology/page.tsx")).toMatch(/CapWages/);
  });
});

describe("Canary — the paste box is how contracts get in now", () => {
  const panel = readSource("app/admin/contracts/PastePanel.tsx");
  const page = readSource("app/admin/contracts/page.tsx");
  const parser = readSource("app/lib/puckpedia-paste.ts");

  it("is mounted, not merely written", () => {
    expect(page).toContain("<PastePanel");
  });

  it("shows the operator what it read before writing anything", () => {
    // The whole point of a paste box over a scrape is that a human looks at it.
    // A version that posted straight through would be a scraper with extra
    // steps and no review.
    expect(panel).toContain("WRITE ");
    expect(panel).toMatch(/checkbox/);
    expect(panel).toContain("not understood");
  });

  it("checks itself three ways rather than trusting the regexes", () => {
    // The format is internally redundant, so the parser can verify its own
    // work: the name appears twice, cap hit times term should equal the total,
    // and cap hit over percent-of-cap must land on a real ceiling.
    expect(parser).toContain("did not appear twice");
    expect(parser).toMatch(/total says/);
    expect(parser).toContain("do not agree with any season");
  });

  it("refuses to guess a forward's real position", () => {
    // PuckPedia's "F" cannot be told from a centre or a winger, and the roster
    // already knows. Overwriting a correct value with a guess is worse than
    // leaving the field alone.
    expect(parser).toMatch(/rawPosition === "D" \|\| rawPosition === "G"/);
  });

  it("never silently drops a line it did not understand", () => {
    expect(parser).toContain("skipped");
    expect(parser).toContain("no cap hit found");
  });
});
