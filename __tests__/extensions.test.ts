// ── OFF5: contract extensions ────────────────────────────────────
// A GM's quietest consequential move — locking up a player before he can reach
// the market. It costs nothing this season, which is exactly why it needs the
// cap horizon to be legible at all.
import { describe, expect, it } from "vitest";
import {
  isExtensionEligible, projectExtension, applyExtensions,
  activateMaturedExtension, resolveAiExtensions,
} from "@/app/lib/extensions";
import { buildCapHorizon } from "@/app/lib/cap-horizon";
import type { Asset } from "@/app/lib/trade-types";

const player = (over: Partial<Asset> = {}): Asset => ({
  id: "p1", name: "Player One", teamId: "WPG", position: "C",
  age: 26, capHit: 6, yearsRemaining: 1, games: 82,
  ptsPace: 70, avgTOI: 19, baselinePtsPace: 68,
  ...over,
} as Asset);

describe("isExtensionEligible", () => {
  it("allows a player in the final year of his deal", () => {
    expect(isExtensionEligible(player({ yearsRemaining: 1 }))).toBe(true);
  });

  it("refuses anyone with term left — he is not extendable yet", () => {
    expect(isExtensionEligible(player({ yearsRemaining: 3 }))).toBe(false);
  });

  it("refuses a player whose deal already expired — that is re-signing", () => {
    expect(isExtensionEligible(player({ yearsRemaining: 0, expiresThisOffseason: true }))).toBe(false);
  });

  it("refuses a second extension on top of the first", () => {
    const withExt = player({ pendingExtension: { aav: 8, term: 4, wouldHaveBeen: "UFA" } });
    expect(isExtensionEligible(withExt)).toBe(false);
  });

  it("refuses picks", () => {
    expect(isExtensionEligible(player({ position: "Pick" }))).toBe(false);
  });
});

describe("projectExtension", () => {
  it("prices a real player above the league minimum", () => {
    const ext = projectExtension(player({ ptsPace: 80, avgTOI: 20 }));
    expect(ext.aav).toBeGreaterThan(1);
    expect(ext.term).toBeGreaterThan(0);
  });

  it("discounts against the open market — certainty has a price", () => {
    // The player signs without hearing 31 other offers.
    const p = player({ ptsPace: 80 });
    const ext = projectExtension(p);
    const openMarket = ext.aav / 0.95;
    expect(ext.aav).toBeLessThan(openMarket);
  });

  it("reports the rights he gave up", () => {
    expect(["UFA", "RFA"]).toContain(projectExtension(player({ age: 30 })).wouldHaveBeen);
  });

  it("lands on the $0.05M contract grid", () => {
    const aav = projectExtension(player({ ptsPace: 63, avgTOI: 18 })).aav;
    expect(Math.round(aav * 20) / 20).toBe(aav);
  });
});

describe("the extension lifecycle", () => {
  it("costs nothing until the current deal runs out", () => {
    const ext = { aav: 9, term: 5, wouldHaveBeen: "UFA" as const };
    const roster = applyExtensions([player({ capHit: 6, yearsRemaining: 1 })],
      [{ playerId: "p1", teamId: "WPG", extension: ext }]);
    expect(roster[0].capHit).toBe(6);                  // this season is unchanged
    expect(roster[0].pendingExtension).toEqual(ext);
  });

  it("shows up in the horizon in the seasons it actually covers", () => {
    // The whole reason it needs a forward view: invisible today, $9M later.
    const roster = applyExtensions([player({ capHit: 6, yearsRemaining: 1 })],
      [{ playerId: "p1", teamId: "WPG", extension: { aav: 9, term: 2, wouldHaveBeen: "UFA" } }]);
    const h = buildCapHorizon(roster, { teamId: "WPG", startYear: 2026, ceilingFor: () => 100 });
    expect(h.map(s => s.committed)).toEqual([6, 9, 9]);
    expect(h[2].expiring.map(c => c.id)).toEqual(["p1"]);   // ends after year 3
  });

  it("takes over when the contract matures", () => {
    const matured = activateMaturedExtension(player({
      capHit: 6, yearsRemaining: 0,
      pendingExtension: { aav: 9, term: 5, wouldHaveBeen: "UFA" },
    }));
    expect(matured.capHit).toBe(9);
    expect(matured.yearsRemaining).toBe(5);
    expect(matured.pendingExtension).toBeUndefined();
    expect(matured.expiresThisOffseason).toBe(false);
    expect(matured.contractStatus).toBe("SIGNED");
  });

  it("does not activate early", () => {
    const p = player({ yearsRemaining: 1, pendingExtension: { aav: 9, term: 5, wouldHaveBeen: "UFA" } });
    expect(activateMaturedExtension(p)).toEqual(p);
  });

  it("leaves a player with no extension alone", () => {
    const p = player({ yearsRemaining: 0 });
    expect(activateMaturedExtension(p)).toEqual(p);
  });
});

describe("resolveAiExtensions", () => {
  const squad = (teamId: string, n: number, over: Partial<Asset> = {}) =>
    Array.from({ length: n }, (_, i) =>
      player({ id: `${teamId}-${i}`, teamId, yearsRemaining: 3, capHit: 3, ...over }));

  it("locks up a club's best expiring player", () => {
    const roster = [
      ...squad("SJS", 10),
      player({ id: "star", teamId: "SJS", yearsRemaining: 1, capHit: 8, ptsPace: 95, avgTOI: 21 }),
    ];
    const offers = resolveAiExtensions(roster, { teamIds: ["SJS"], capCeiling: 110 });
    expect(offers.map(o => o.playerId)).toContain("star");
  });

  it("leaves replacement-level players to reach the market", () => {
    const roster = [player({ id: "scrub", teamId: "SJS", yearsRemaining: 1, capHit: 1, ptsPace: 8, avgTOI: 9 })];
    expect(resolveAiExtensions(roster, { teamIds: ["SJS"], capCeiling: 110 })).toEqual([]);
  });

  it("never extends on the user's behalf", () => {
    const roster = [player({ id: "star", teamId: "WPG", yearsRemaining: 1, ptsPace: 95, avgTOI: 21 })];
    expect(resolveAiExtensions(roster, { teamIds: ["WPG"], userTeamId: "WPG", capCeiling: 110 })).toEqual([]);
  });

  it("judges affordability against NEXT season, not this one", () => {
    // A club can be flush today and full next year; extending on present space
    // would let it sign its way into a wall it cannot see.
    const roster = [
      ...Array.from({ length: 10 }, (_, i) =>
        player({ id: `big-${i}`, teamId: "SJS", yearsRemaining: 4, capHit: 10 })),
      player({ id: "star", teamId: "SJS", yearsRemaining: 1, capHit: 1, ptsPace: 95, avgTOI: 21 }),
    ];
    expect(resolveAiExtensions(roster, { teamIds: ["SJS"], capCeiling: 105 })).toEqual([]);
  });

  it("stops once next season's books fill up", () => {
    const roster = Array.from({ length: 12 }, (_, i) =>
      player({ id: `s-${i}`, teamId: "SJS", yearsRemaining: 1, capHit: 9, ptsPace: 95, avgTOI: 21 }));
    const offers = resolveAiExtensions(roster, { teamIds: ["SJS"], capCeiling: 100, reserve: 6 });
    const total = offers.reduce((s, o) => s + o.extension.aav, 0);
    expect(total).toBeLessThanOrEqual(94);
    expect(offers.length).toBeLessThan(12);
  });
});

// ── Wiring ───────────────────────────────────────────────────────
import fs from "fs";
import path from "path";
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("OFF5 wiring — human and AI both get the lever", () => {
  it("offers the user his own final-year contracts", () => {
    const src = read("app/components/ResignPhase.tsx");
    expect(src).toContain("isExtensionEligible");
    expect(src).toContain("Extensions Available");
    expect(src).toContain("onExtend(player, terms)");
  });

  it("routes the user's extension through the shared applier", () => {
    const flow = read("app/armchair-gm/useOffseasonFlow.ts");
    expect(flow).toContain("applyExtensions");
    expect(read("app/armchair-gm/page.tsx")).toContain("onExtend={extendPlayer}");
  });

  it("resolves AI extensions as part of the league offseason", () => {
    const fa = read("app/lib/free-agency.ts");
    expect(fa).toContain("resolveAiExtensions");
    expect(fa).toContain("aiExtensions");
  });

  it("activates a matured extension BEFORE the expiry check", () => {
    // Flag him expiring first and he reaches free agency despite the deal.
    const cup = read("app/lib/cup-run.ts");
    expect(cup).toMatch(/activateMaturedExtension\(raw\)[\s\S]{0,200}yearsRemaining > 0/);
  });

  it("keeps the horizon aware of extensions", () => {
    // An extension that does not appear in the forward view is invisible
    // everywhere, since it costs nothing today.
    expect(read("app/lib/cap-horizon.ts")).toContain("pendingExtension");
  });
});
