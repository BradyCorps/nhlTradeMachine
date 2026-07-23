// ── VAL1 — drafted rookie context survives the accent-strip dedup ─
import { describe, it, expect } from "vitest";
import { reconcileDraftedRookies } from "@/app/lib/draft-reconcile";
import type { Asset } from "@/app/lib/trade-types";

const asset = (over: Partial<Asset> & { id: string; name: string }): Asset => ({
  teamId: "WPG", position: "C", age: 18, games: 0, ptsPace: 0, avgTOI: 0,
  capHit: 0.95, yearsRemaining: 3, hasNMC: false, hasNTC: false,
  contractStatus: "SIGNED", hasLiveStats: false,
  ...over,
} as Asset);

describe("reconcileDraftedRookies (VAL1)", () => {
  it("backfills draft context onto an accent-stripped roster duplicate", () => {
    // Seeded from the live feed with the accent stripped and NO draft context.
    const seeded = asset({ id: "wpg-bjorck", name: "Viggo Bjorck", draftOverall: null, prospectPtsPace: null });
    // The draft just selected him (accent intact) — carries the context.
    const drafted = asset({
      id: "draft-2026-8-viggo-bjorck", name: "Viggo Björck",
      draftYear: 2026, draftOverall: 8, prospectPtsPace: 17,
    });

    const out = reconcileDraftedRookies([seeded], [drafted]);

    // One entry, not two.
    expect(out).toHaveLength(1);
    const bjorck = out[0];
    // The roster entry kept its identity but gained the draft pedigree — so it
    // now routes through the prospect NAV path instead of valuing at 0.
    expect(bjorck.id).toBe("wpg-bjorck");
    expect(bjorck.draftOverall).toBe(8);
    expect(bjorck.prospectPtsPace).toBe(17);
    expect(bjorck.draftYear).toBe(2026);
  });

  it("does not overwrite context a roster player already has", () => {
    const seeded = asset({ id: "s1", name: "Someone Else", draftOverall: 3, prospectPtsPace: 40 });
    const drafted = asset({ id: "d1", name: "Someone Else", draftOverall: 8, prospectPtsPace: 17 });
    const out = reconcileDraftedRookies([seeded], [drafted]);
    expect(out).toHaveLength(1);
    expect(out[0].draftOverall).toBe(3);   // existing value preserved
    expect(out[0].prospectPtsPace).toBe(40);
  });

  it("appends genuinely new rookies who are not already rostered", () => {
    const roster = [asset({ id: "vet", name: "Established Vet", age: 30 })];
    const rookies = [
      asset({ id: "draft-2026-1-gavin-mckenna", name: "Gavin McKenna", draftOverall: 1, prospectPtsPace: 60 }),
    ];
    const out = reconcileDraftedRookies(roster, rookies);
    expect(out).toHaveLength(2);
    expect(out.map(p => p.name)).toContain("Gavin McKenna");
  });

  it("collapses a within-class duplicate to a single addition", () => {
    const dup1 = asset({ id: "a", name: "Viggo Björck", draftOverall: 8, prospectPtsPace: 17 });
    const dup2 = asset({ id: "b", name: "Viggo Bjorck", draftOverall: 8, prospectPtsPace: 17 });
    const out = reconcileDraftedRookies([], [dup1, dup2]);
    expect(out).toHaveLength(1);
  });
});
