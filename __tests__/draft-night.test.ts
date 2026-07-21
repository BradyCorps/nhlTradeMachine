// ── Draft Night — board completeness invariant ───────────────────
// Regression: a shrunk board (from over-eager exclusion) caused
// autoCpuPicks to splice an empty array and push results with an
// undefined prospect, crashing the draft log on `r.prospect.name`.

import { describe, it, expect } from "vitest";
import {
  DRAFT_2026_ORDER,
  DRAFT_2026_PROSPECTS,
  autoCpuPicks,
  createDraftRng,
  runDraftNight,
  type DraftResult,
} from "@/app/lib/draft-2026";

describe("Draft Night — every result has a defined prospect", () => {
  it("runDraftNight fills all 32 slots, each with a real prospect", () => {
    const results = runDraftNight(12345);
    expect(results.length).toBe(DRAFT_2026_ORDER.length);
    for (const r of results) {
      expect(r.prospect).toBeDefined();
      expect(typeof r.prospect.name).toBe("string");
    }
  });

  it("a GM-controlled draft never produces an undefined prospect", () => {
    // Simulate a full draft where the GM picks best-available at each of
    // their slots — the path the Armchair GM modal drives.
    const homeTeamId = DRAFT_2026_ORDER[7].team; // owns pick #8 in the order
    const rand = createDraftRng(999);
    const results: DraftResult[] = [];
    const board = [...DRAFT_2026_PROSPECTS];

    autoCpuPicks(results, board, rand, homeTeamId);
    while (results.length < DRAFT_2026_ORDER.length) {
      const slot = DRAFT_2026_ORDER[results.length];
      expect(slot.team).toBe(homeTeamId); // paused on the GM's clock
      const prospect = board.shift()!;    // GM takes best-available
      results.push({ ...slot, prospect });
      autoCpuPicks(results, board, rand, homeTeamId);
    }

    expect(results.length).toBe(DRAFT_2026_ORDER.length);
    for (const r of results) expect(r.prospect).toBeDefined();
  });

  it("autoCpuPicks stops rather than pushing undefined when the board empties", () => {
    // A deliberately starved board must never yield undefined prospects.
    const rand = createDraftRng(7);
    const results: DraftResult[] = [];
    const board = DRAFT_2026_PROSPECTS.slice(0, 5); // only 5 for 32 slots
    autoCpuPicks(results, board, rand, null);
    expect(results.length).toBe(5);
    for (const r of results) expect(r.prospect).toBeDefined();
  });
});
