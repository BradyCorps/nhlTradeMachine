// ── VAL4/VAL3 — injury year must not erase a star's floor ─────────
// A prime-age pedigreed star who misses most of a season to injury shows
// depressed counting stats. That is injury, not decline: the historical
// (pedigree) floor must hold. A player the same low sample but well past his
// peak age is genuinely declining and is left to decay as before.
import { describe, it, expect } from "vitest";
import { getHistoricalFloor } from "../app/lib/player-data";

describe("historical floor — injury vs decline (VAL4)", () => {
  const talent = 82; // Barkov-shaped on-ice talent, before contract drag

  it("holds a prime star's floor through an injury-shortened season", () => {
    // Barkov (peak 96 pts/82), age 30, only 20 games, suppressed 30-pt pace.
    const injured = getHistoricalFloor("Aleksander Barkov", talent, {
      position: "C", age: 30, games: 20, ptsPace: 30,
    });
    // The pedigree floor lifts him well above the injury-suppressed talent …
    expect(injured).toBeGreaterThan(120);
    expect(injured).toBeGreaterThan(talent);
  });

  it("does NOT floor up a full-season fade at the same low pace (real decline)", () => {
    // Same low 30-pt pace, but over a full 70-game season — that is decline,
    // not injury, and must not be rescued.
    const declined = getHistoricalFloor("Aleksander Barkov", talent, {
      position: "C", age: 30, games: 70, ptsPace: 30,
    });
    expect(declined).toBeLessThanOrEqual(talent + 1);
  });

  it("still decays a genuinely aging vet with a low sample (Karlsson unchanged)", () => {
    // Age 36 is well past a defenseman's peak — not the injury case.
    const decayed = getHistoricalFloor("Erik Karlsson", 25, {
      position: "D", age: 36, games: 38, ptsPace: 34,
    });
    expect(decayed).toBeLessThan(60); // collapses toward current, as before
  });
});

describe("VAL3 — an injured star cannot equal a replacement scrub", () => {
  it("floors a pedigreed injured elite far above an unpedigreed depth callup", () => {
    // Barkov-shaped injured elite vs Duehr-shaped scrub (no pedigree entry).
    const barkov = getHistoricalFloor("Aleksander Barkov", 82, {
      position: "C", age: 30, games: 20, ptsPace: 30,
    });
    const duehr = getHistoricalFloor("Walker Duehr", 21, {
      position: "W", age: 28, games: 3, ptsPace: 27,
    });
    // Duehr has no pedigree → no floor lift; Barkov's pedigree floor holds.
    expect(duehr).toBe(21);
    expect(barkov).toBeGreaterThan(duehr + 50);
  });
});
