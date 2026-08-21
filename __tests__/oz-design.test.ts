// ── oz-design.test.ts ────────────────────────────────────────────
//
// The OZ design estimates gravity directly: each on-ice attacker's OWN xG
// regressed on his finish + his teammates' gravity + opponents' defense. These
// pin the layout a sign or indexing slip would corrupt — ten rows per stint,
// a focal's own gravity absent from his own row, his shots as the response,
// teammates in the gravity block, opponents in the defense block, and the
// context controls flipped for the away side.

import { describe, it, expect } from "vitest";
import { buildOzDesign } from "@/scripts/gravity-v4/oz-design";
import type { PossessionObservation } from "@/scripts/gravity-v4/possession-states";

const obs = (o: Partial<PossessionObservation>): PossessionObservation => ({
  gameId: 1, stintIdx: 0, durationSec: 3600, homeTeamId: 10, awayTeamId: 20,
  homeSkaters: [1, 2, 3, 4, 5], awaySkaters: [6, 7, 8, 9, 11],
  scoreStateHome: 0, startZoneHome: "N", homeXg: 0, awayXg: 0, shots: [], ...o,
});

// Players 5 and 11 are defensemen; the rest forwards.
const isForward = (id: number): boolean => id !== 5 && id !== 11;

describe("buildOzDesign", () => {
  it("emits ten rows per stint — one per attacker on each side", () => {
    const d = buildOzDesign([obs({})], isForward);
    expect(d.rows).toHaveLength(10);
    expect(d.nPlayers).toBe(10);
    expect(d.nFeatures).toBe(3 * 10 + 6);   // 3 player blocks + 6 context (incl. focalFwd)
  });

  it("regresses a focal's own xG on teammates' gravity, not his own", () => {
    // Player 3 (home) takes a 0.6 xG shot; duration 3600s → rate 0.6.
    const d = buildOzDesign([obs({ homeXg: 0.6, shots: [{ team: "H", shooterId: 3, xg: 0.6 }] })], isForward);
    const p = (id: number) => d.players.indexOf(id);
    const focalRow = d.rows.find(r => r.idx.includes(d.finishOffset + p(3)))!;

    expect(focalRow.y).toBeCloseTo(0.6, 6);           // his own xG rate is the response
    expect(focalRow.w).toBe(3600);
    // His own gravity index must NOT be in his own row (no self-credit).
    expect(focalRow.idx).not.toContain(d.gravityOffset + p(3));
    // His four home teammates' gravity IS in his row.
    for (const id of [1, 2, 4, 5]) expect(focalRow.idx).toContain(d.gravityOffset + p(id));
    // The five away players sit in the defense block.
    for (const id of [6, 7, 8, 9, 11]) expect(focalRow.idx).toContain(d.defenseOffset + p(id));
    // A non-shooting teammate's own row has response 0.
    const teammateRow = d.rows.find(r => r.idx.includes(d.finishOffset + p(1)))!;
    expect(teammateRow.y).toBe(0);
  });

  it("flips home-ice, score and zone context for the away attackers", () => {
    const d = buildOzDesign([obs({ startZoneHome: "O", scoreStateHome: 2 })], isForward);
    const p = (id: number) => d.players.indexOf(id);
    const homeRow = d.rows.find(r => r.idx.includes(d.finishOffset + p(1)))!;   // a home attacker
    const awayRow = d.rows.find(r => r.idx.includes(d.finishOffset + p(6)))!;   // an away attacker
    const ctx = (r: typeof homeRow, nm: string) => r.val[r.idx.indexOf(d.contextOffset + d.contextNames.indexOf(nm))];
    expect(ctx(homeRow, "homeIce")).toBe(1);
    expect(ctx(awayRow, "homeIce")).toBe(0);
    expect(ctx(homeRow, "scoreState")).toBe(2);
    expect(ctx(awayRow, "scoreState")).toBe(-2);
    expect(ctx(homeRow, "zoneOZ")).toBe(1);      // home started in its OZ
    expect(ctx(awayRow, "zoneOZ")).toBe(0);      // = away DZ
    expect(ctx(awayRow, "zoneDZ")).toBe(1);
    // focalFwd marks the focal's position: player 1 (home) is a forward,
    // player 11 (away) is a defenseman.
    const p11Row = d.rows.find(r => r.idx.includes(d.finishOffset + p(11)))!;
    expect(ctx(homeRow, "focalFwd")).toBe(1);
    expect(ctx(p11Row, "focalFwd")).toBe(0);
  });

  it("accumulates ice time for every on-ice skater", () => {
    const d = buildOzDesign([obs({ durationSec: 120 })], isForward);
    for (let i = 0; i < d.nPlayers; i++) expect(d.toiSec[i]).toBe(120);
  });
});
