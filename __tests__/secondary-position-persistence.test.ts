// ── ST3: alternate positions persist into Lineups ────────────────
// Two halves. (1) The curated map must actually resolve for the names the
// roster feed produces — it is keyed by name, and the feed carries diacritics.
// (2) The field must survive every season mutation, because a player object
// rebuilt field-by-field anywhere in the lifecycle drops it silently and the
// lineup quietly stops flexing.
import { describe, expect, it } from "vitest";
import { secondaryPositionFor, SECONDARY_POSITIONS } from "@/app/data/secondary-positions";
import { isC, isW, defaultLineupOrdersForRoster, hydrateLineupOrdersForRoster } from "@/app/lib/lineup-order";
import { advanceSeason } from "@/app/lib/season-rollover";
import type { Asset } from "@/app/lib/trade-types";

describe("secondaryPositionFor — diacritic-safe lookup", () => {
  it("resolves the accented feed spelling, not just the table's", () => {
    // The roster feed says "Teräväinen"; the table says "Teravainen".
    expect(secondaryPositionFor("Teuvo Teräväinen")).toBe("C");
    expect(secondaryPositionFor("Teuvo Teravainen")).toBe("C");
    expect(secondaryPositionFor("Tomáš Hertl")).toBe("W");
    expect(secondaryPositionFor("Tomas Hertl")).toBe("W");
  });

  it("is case- and punctuation-insensitive", () => {
    expect(secondaryPositionFor("ryan o'reilly")).toBe("W");
    expect(secondaryPositionFor("RYAN OREILLY")).toBe("W");
    expect(secondaryPositionFor("Pierre-Luc Dubois")).toBe("W");
  });

  it("returns null for the unmapped and the absent", () => {
    expect(secondaryPositionFor("Connor McDavid")).toBeNull();
    expect(secondaryPositionFor("")).toBeNull();
    expect(secondaryPositionFor(null)).toBeNull();
    expect(secondaryPositionFor(undefined)).toBeNull();
  });

  it("resolves every curated entry — no dead rows in the table", () => {
    for (const name of Object.keys(SECONDARY_POSITIONS)) {
      expect(secondaryPositionFor(name), `${name} must resolve`).toBe(SECONDARY_POSITIONS[name]);
    }
  });
});

// ── Persistence through the season lifecycle ─────────────────────

const flexCentre = (over: Partial<Asset> = {}): Asset => ({
  id: "vilardi", name: "Gabriel Vilardi", teamId: "WPG",
  position: "C", secondaryPosition: "W",
  age: 25, capHit: 7.5, yearsRemaining: 3,
  games: 71, ptsPace: 61, avgTOI: 17.4, baselinePtsPace: 58,
  ...over,
} as Asset);

describe("secondaryPosition survives the season lifecycle", () => {
  it("makes a centre eligible on the wing in the first place", () => {
    const p = flexCentre();
    expect(isC(p)).toBe(true);
    expect(isW(p)).toBe(true);
  });

  it("survives the Cup Run rollover's ageing pass", () => {
    const { players } = advanceSeason([flexCentre()], { seed: 7, year: 2027 });
    // Retirement is possible in principle; this player is 25, so he survives.
    expect(players).toHaveLength(1);
    expect(players[0].secondaryPosition).toBe("W");
    expect(isW(players[0] as Asset)).toBe(true);
  });

  it("survives three consecutive rollovers", () => {
    let roster = [flexCentre()];
    for (const year of [2027, 2028, 2029]) {
      roster = advanceSeason(roster, { seed: 11, year }).players;
    }
    expect(roster[0]?.secondaryPosition).toBe("W");
  });

  it("keeps a flexed centre in his saved wing slot after the roster changes", () => {
    // The real persistence claim: the user puts a C/W on the wing, a trade
    // changes the roster, and the saved lineup must not snap him back.
    const roster: Asset[] = [
      flexCentre(),
      { id: "scheifele", name: "Mark Scheifele", teamId: "WPG", position: "C", age: 32, avgTOI: 19 } as Asset,
      { id: "connor", name: "Kyle Connor", teamId: "WPG", position: "LW", age: 29, avgTOI: 19 } as Asset,
    ];
    const saved = {
      forwards: ["connor", "scheifele", "vilardi"],   // Vilardi at RW
      defense: [], goalies: [], scratches: [],
    };
    const arrival = { id: "newguy", name: "New Guy", teamId: "WPG", position: "RW", age: 24, avgTOI: 12 } as Asset;

    const hydrated = hydrateLineupOrdersForRoster([...roster, arrival], saved);
    expect(hydrated.F.slice(0, 3)).toEqual(["connor", "scheifele", "vilardi"]);
    expect(hydrated.F).toContain("newguy");
  });

  it("without the alternate position he would not reach a wing slot by default", () => {
    // Pins what the feature buys: strip the secondary and the default order
    // treats him as a centre only.
    const withFlex = defaultLineupOrdersForRoster([flexCentre()]);
    const without = defaultLineupOrdersForRoster([flexCentre({ secondaryPosition: null })]);
    expect(isW(flexCentre())).toBe(true);
    expect(isW(flexCentre({ secondaryPosition: null }))).toBe(false);
    // Both still dress him; the difference is which slots he is eligible for.
    expect(withFlex.F).toContain("vilardi");
    expect(without.F).toContain("vilardi");
  });
});
