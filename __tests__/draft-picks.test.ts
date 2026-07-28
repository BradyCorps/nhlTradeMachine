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
