// ── oz-design.test.ts ────────────────────────────────────────────
//
// The OZ RAPM design is where a subtle sign or indexing slip would quietly
// bias every coefficient, so these pin the layout: two rows per stint, home
// offense vs away defense (and the mirror), the context controls flipped for
// the away row, rate responses with duration weights, and the direct-rate
// accounting the gravity decomposition subtracts.

import { describe, it, expect } from "vitest";
import { buildOzDesign, computeDirectRates } from "@/scripts/gravity-v4/oz-design";
import type { PossessionObservation } from "@/scripts/gravity-v4/possession-states";

const obs = (o: Partial<PossessionObservation>): PossessionObservation => ({
  gameId: 1, stintIdx: 0, durationSec: 60, homeTeamId: 10, awayTeamId: 20,
  homeSkaters: [1, 2, 3, 4, 5], awaySkaters: [6, 7, 8, 9, 11],
  scoreStateHome: 0, startZoneHome: "N", homeXg: 0, awayXg: 0, shots: [], ...o,
});

describe("buildOzDesign", () => {
  it("emits two rows per stint with off/def blocks and flipped context", () => {
    const d = buildOzDesign([obs({ durationSec: 3600, homeXg: 2, awayXg: 1, startZoneHome: "O", scoreStateHome: 1 })]);
    expect(d.rows).toHaveLength(2);
    expect(d.nPlayers).toBe(10);

    const [homeRow, awayRow] = d.rows;
    // Home xGF row: rate = homeXg / (duration/3600) = 2 / 1 = 2; weight = 3600s.
    expect(homeRow.y).toBeCloseTo(2, 6);
    expect(homeRow.w).toBe(3600);
    // Home skaters occupy the OFFENSE block (index < nPlayers)...
    const homeOff = d.players.slice(0, 5).map(id => d.players.indexOf(id));
    for (const p of homeOff) expect(homeRow.idx).toContain(p);
    // ...and away skaters occupy the DEFENSE block (index >= nPlayers).
    const awayDefIdx = [6, 7, 8, 9, 11].map(id => d.nPlayers + d.players.indexOf(id));
    for (const j of awayDefIdx) expect(homeRow.idx).toContain(j);

    // Context: home-ice = 1 on the home row, 0 on the away row; score/zone flip.
    const ctx = (r: typeof homeRow, name: string) => r.val[r.idx.indexOf(d.contextOffset + d.contextNames.indexOf(name))];
    expect(ctx(homeRow, "homeIce")).toBe(1);
    expect(ctx(awayRow, "homeIce")).toBe(0);
    expect(ctx(homeRow, "scoreState")).toBe(1);
    expect(ctx(awayRow, "scoreState")).toBe(-1);     // away's lead is the negative
    expect(ctx(homeRow, "zoneOZ")).toBe(1);          // home started in its OZ
    expect(ctx(awayRow, "zoneOZ")).toBe(0);          // which is the away DZ
    expect(ctx(awayRow, "zoneDZ")).toBe(1);
  });

  it("credits direct xG to the shooter and ice time to everyone on", () => {
    const { directRate, toiSec } = computeDirectRates([
      obs({ durationSec: 3600, homeXg: 0.5, shots: [{ team: "H", shooterId: 3, xg: 0.5 }] }),
    ], [1, 2, 3, 4, 5, 6, 7, 8, 9, 11]);
    // Player 3 shot 0.5 xG over 3600s on ice → 0.5 xG/60.
    expect(directRate[2]).toBeCloseTo(0.5, 6);
    // A non-shooting on-ice skater has ice time but no direct xG.
    expect(directRate[0]).toBe(0);
    expect(toiSec[0]).toBe(3600);
    // An away skater accrued ice time too.
    expect(toiSec[5]).toBe(3600);
  });
});
