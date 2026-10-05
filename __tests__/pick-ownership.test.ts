import { describe, expect, it } from "vitest";
import { canOfferPick, pickOffersSupported, resolvePickOwnership, teamPickAssets } from "@/app/lib/pick-ownership";
import { PICK_OWNERSHIP_EVIDENCE } from "@/app/data/pick-ownership-2026-10-05";
import { groupTeamRoster } from "@/app/lib/roster-picker";
import type { Asset } from "@/app/lib/trade-types";
import type { TradeRecord } from "@/app/lib/trades";

const pick = (year = 2027, round = 2): Asset => ({ id: `pick-TOR-${year}-${round}`,
  teamId: "TOR", position: "Pick", year, round, name: `${year} pick` } as Asset);
const trade = (id: string, from: string, to: string, date = "2026-10-06", conditions: string | null = null): TradeRecord => ({
  id, executedDate: date, published: true, rosterMutating: true, conditions,
  sides: [{ teamId: from, assetsGiven: [{ kind: "pick", ref: { id: pick().id, nameSlug: "" }, inputSnapshot: {}, navAtTrade: 20 }] },
    { teamId: to, assetsGiven: [] }],
} as TradeRecord);

describe("effective draft-pick ownership", () => {
  it("moves one stable identity, once, through deterministic published trades", () => {
    const later = trade("b", "CBJ", "VAN");
    const earlier = trade("a", "TOR", "CBJ");
    const result = resolvePickOwnership([pick(), pick()], [], [later, earlier, earlier]);
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: pick().id, originalOwnerId: "TOR", teamId: "VAN", pickOwnership: "verified" });
    expect(teamPickAssets(result, "TOR")).toEqual([]);
    expect(teamPickAssets(result, "CBJ")).toEqual([]);
    expect(teamPickAssets(result, "VAN")).toHaveLength(1);
    expect(canOfferPick(result[0])).toBe(true);
  });
  it("ignores unpublished and non-roster records", () => {
    const result = resolvePickOwnership([pick()], [], [
      { ...trade("a", "TOR", "CBJ"), published: false },
      { ...trade("b", "TOR", "VAN"), rosterMutating: false },
    ]);
    expect(result[0]).toMatchObject({ teamId: "", currentOwnerId: null, pickOwnership: "unverified" });
    expect(canOfferPick(result[0])).toBe(false);
    expect(canOfferPick(pick())).toBe(false); // legacy generated/cached pick
  });
  it("does not replay older trades over a current sourced inventory", () => {
    const evidence = [{ id: pick().id, currentOwnerId: "CBJ", sourceUrls: ["https://example.test/source"], asOf: "2026-10-05" }];
    expect(resolvePickOwnership([pick()], evidence, [trade("old", "TOR", "VAN", "2026-09-01")])[0].teamId).toBe("CBJ");
  });
  it("reserves conditional alternative years and never counts them as unconditional capital", () => {
    const obligation = trade("a", "TOR", "CBJ", "2026-10-06", "2027 top-10 protected first; unprotected 2028 first instead");
    const result = resolvePickOwnership([pick(), pick(2028), pick(2028, 1)], [], [obligation]);
    expect(result.every(p => !canOfferPick(p) && p.teamId === "")).toBe(true);
    expect(result[0].conditions).toContain("2028");
  });
  it("keeps unresolved rights unavailable even if an original owner is in the id", () => {
    const result = resolvePickOwnership([pick()], [], []);
    expect(teamPickAssets(result, "TOR")).toHaveLength(1); // explanatory unavailable row
    expect(groupTeamRoster(result, "TOR", new Set()).picks).toEqual(result);
    expect(result[0].teamId).toBe("");
  });
  it("respects an Armchair session transfer instead of restoring real-world ownership", () => {
    const result = resolvePickOwnership([pick()], [], [trade("a", "TOR", "CBJ")]);
    const session = result.map(p => ({ ...p, teamId: "WPG" }));
    expect(teamPickAssets(session, "CBJ")).toEqual([]);
    expect(groupTeamRoster(session, "WPG", new Set()).picks).toEqual(session);
    expect(canOfferPick(session[0])).toBe(true);
    expect(session[0].originalOwnerId).toBe("TOR");
  });
  it("rejects stale saved offers, conflicting/duplicate assets, and the wrong offering team", () => {
    const inventory = resolvePickOwnership([pick()], [], [trade("a", "TOR", "CBJ")]);
    expect(pickOffersSupported([pick()], inventory, "TOR")).toBe(false);
    expect(pickOffersSupported([pick()], inventory, "CBJ")).toBe(true);
    expect(pickOffersSupported([pick(), pick()], inventory, "CBJ")).toBe(false);
    expect(pickOffersSupported([pick()], [...inventory, ...inventory], "CBJ")).toBe(false);
    expect(pickOffersSupported([pick()], [], "CBJ")).toBe(false);
  });
  it("keeps the reviewed conditional group unavailable on both years", () => {
    const picks = [2027, 2028].map(year => ({ ...pick(year, 1), id: `pick-COL-${year}-1` }));
    const result = resolvePickOwnership(picks, PICK_OWNERSHIP_EVIDENCE, []);
    expect(result.every(p => p.pickOwnership === "conditional" && !canOfferPick(p))).toBe(true);
    expect(result[0].conditions).toEqual(result[1].conditions);
  });
  it("blocks both original identities when the current tracker conflicts with frozen trade evidence", () => {
    const picks = ["TOR", "CBJ"].map(team => ({ ...pick(), id: `pick-${team}-2027-2` }));
    const result = resolvePickOwnership(picks, PICK_OWNERSHIP_EVIDENCE, [trade("historic", "TOR", "CBJ", "2026-09-28")]);
    expect(result.every(p => p.pickOwnership === "conditional" && !canOfferPick(p) && p.teamId === "")).toBe(true);
    expect(result[0].conditions).toContain("Original identity and conditions conflict");
    expect(result[1].conditions).toBe(result[0].conditions);
    expect(result[1].ownershipSources).toContain("https://puckpedia.com/team/columbus-blue-jackets/draftpicks");
  });
});
