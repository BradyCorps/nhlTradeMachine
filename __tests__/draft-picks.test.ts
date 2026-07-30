// ── ST2: spent draft picks leave every selector ──────────────────
// A pick is an asset until its draft is held. The Cup Run rollover HOLDS a
// draft (Year 2 → 2027), so that year's picks are converted to rookies and
// must vanish. The old boundary kept them, leaving a traded 2027 first
// tradeable after it had already conveyed.
import { describe, expect, it } from "vitest";
import { dropSpentDraftPicks, draftYearForCupYear } from "@/app/lib/draft-picks";
import { SEASON } from "@/app/lib/season-config";
import type { Asset } from "@/app/lib/trade-types";

const pick = (origTeam: string, year: number, round: number, owner = origTeam): Asset =>
  ({
    id: `pick-${origTeam}-${year}-${round}`,
    name: `${year} Round ${round}`,
    teamId: owner, position: "Pick", year, round,
  } as Asset);

const skater = (id: string, teamId: string): Asset =>
  ({ id, name: id, teamId, position: "C" } as Asset);

describe("draftYearForCupYear", () => {
  it("enters Year 1 through the base draft and advances one per year", () => {
    expect(draftYearForCupYear(1)).toBe(SEASON.draftYear);       // 2026
    expect(draftYearForCupYear(2)).toBe(SEASON.draftYear + 1);   // 2027
    expect(draftYearForCupYear(3)).toBe(SEASON.draftYear + 2);   // 2028
  });

  it("never resolves below the base draft", () => {
    expect(draftYearForCupYear(0)).toBe(SEASON.draftYear);
  });
});

describe("dropSpentDraftPicks", () => {
  const league: Asset[] = [
    skater("mcdavid", "EDM"),
    pick("WPG", 2027, 1),
    pick("WPG", 2028, 1),
    pick("WPG", 2029, 2),
  ];

  it("removes the draft just held, not only the ones before it", () => {
    // Rolling into Year 2 holds 2027. Keeping `>= 2027` was the bug.
    const live = dropSpentDraftPicks(league, draftYearForCupYear(2));
    expect(live.filter(p => p.position === "Pick").map(p => p.year)).toEqual([2028, 2029]);
  });

  it("keeps every future pick", () => {
    const live = dropSpentDraftPicks(league, 2027);
    expect(live.some(p => p.year === 2028)).toBe(true);
    expect(live.some(p => p.year === 2029)).toBe(true);
  });

  it("never touches skaters", () => {
    const live = dropSpentDraftPicks(league, 2029);
    expect(live.map(p => p.id)).toEqual(["mcdavid"]);
  });

  it("removes a traded pick from its NEW owner too", () => {
    // The audit case: a 2027 first traded WPG → SJS must not reappear in the
    // 2027 draft, and must not stay tradeable for SJS afterwards.
    const traded = [pick("WPG", 2027, 1, "SJS"), pick("WPG", 2028, 1, "SJS")];
    const live = dropSpentDraftPicks(traded, draftYearForCupYear(2));
    expect(live).toHaveLength(1);
    expect(live[0].year).toBe(2028);
    expect(live[0].teamId).toBe("SJS");
  });

  it("keeps a pick with no year rather than silently deleting an asset", () => {
    const odd = [{ id: "pick-???", name: "?", teamId: "WPG", position: "Pick" } as Asset];
    expect(dropSpentDraftPicks(odd, 2030)).toHaveLength(1);
  });

  it("is stable across repeated rollovers", () => {
    const y2 = dropSpentDraftPicks(league, draftYearForCupYear(2));
    const y3 = dropSpentDraftPicks(y2, draftYearForCupYear(3));
    expect(y3.filter(p => p.position === "Pick").map(p => p.year)).toEqual([2029]);
  });
});

// ── CXS2: Draft Night's claim about picks must be true ───────────
//
// The panel used to promise "your picks stay tradeable assets" as a blanket
// statement. It happened to hold, but only by accident of which years the
// inventory carries — nothing tied the sentence to the behaviour, so a change
// to either would have turned it into a lie without a test noticing.
describe("Draft Night completion and the picks it claims not to touch", () => {
  const inventoryYears = [
    SEASON.firstTradablePickYear,
    SEASON.firstTradablePickYear + 1,
    SEASON.firstTradablePickYear + 2,
    SEASON.firstTradablePickYear + 3,
    SEASON.firstTradablePickYear + 4,
  ];
  const inventory = inventoryYears.flatMap(year =>
    [1, 2].map(round => pick("WPG", year, round)));

  it("the draft it holds was already held before the scenario begins", () => {
    // Which is exactly why the pool starts a year later.
    expect(draftYearForCupYear(1)).toBe(SEASON.draftYear);
    expect(SEASON.firstTradablePickYear).toBeGreaterThan(SEASON.draftYear);
  });

  it("takes none of the picks the user actually holds", () => {
    const after = dropSpentDraftPicks(inventory, draftYearForCupYear(1));
    expect(after).toHaveLength(inventory.length);
    expect(after.map(p => p.year)).toEqual(inventory.map(p => p.year));
  });

  it("would still drop a stale current-year pick if one ever appeared", () => {
    // The call is not decoration: a pool carrying a pick for a completed draft
    // must not leave it tradeable.
    const withStale = [pick("WPG", SEASON.draftYear, 1), ...inventory];
    const after = dropSpentDraftPicks(withStale, draftYearForCupYear(1));
    expect(after).toHaveLength(inventory.length);
    expect(after.some(p => p.year === SEASON.draftYear)).toBe(false);
  });

  it("does spend picks in the Cup Run years, where the draft is real", () => {
    const afterYear2 = dropSpentDraftPicks(inventory, draftYearForCupYear(2));
    expect(afterYear2.length).toBeLessThan(inventory.length);
    expect(afterYear2.some(p => p.year === draftYearForCupYear(2))).toBe(false);
  });
});
