import { describe, expect, it } from "vitest";
import { checkEvolutionSources } from "../app/lib/strand-source-check";

const rows = [
  ...Array.from({ length: 30 }, (_, i) => ({ playerId: 1000 + i, gamesPlayed: 12, points: 4 + (i % 6), timeOnIcePerGame: 900 + i * 12 })),
  { playerId: 8478402, gamesPlayed: 82, points: 130, timeOnIcePerGame: 1280 },
];
// Shape of the repo's recorded EDGE fixture (__tests__/nhl-player-feed.test.ts).
const edge = (over: Record<string, unknown> = {}) => ({
  player: { id: 8478402, gamesPlayed: 82 },
  sogSummary: [{ locationCode: "all", shots: 306 }, { locationCode: "high", shots: 120 }],
  sogDetails: [{ area: "Low Slot", shots: 100 }, { area: "L Circle", shots: 60 }],
  zoneTimeDetails: { offensiveZonePctg: 0.47688 },
  ...over,
});
const run = (summary = rows, body: unknown = edge()) =>
  checkEvolutionSources({ summaryRows: summary, edgeBodies: new Map([[8478402, body]]) });
const failing = (r: ReturnType<typeof run>) => r.checks.filter(c => c.status === "fail").map(c => c.name);

describe("source checker (proves the checker, not the live feed)", () => {
  it("passes feeds shaped like the recorded fixtures and reports alignment", () => {
    const r = run();
    expect(failing(r)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.checks.find(c => c.name.includes("EDGE games equal summary games"))!.detail).toMatch(/aligned/);
    expect(r.checks.find(c => c.name === "joint: alignment rate")!.detail).toBe("1/1 sampled players had identical EDGE and summary games");
  });
  it("fails ice time reported in minutes instead of seconds", () => {
    const minutes = rows.map(r => ({ ...r, timeOnIcePerGame: r.timeOnIcePerGame / 60 }));
    expect(failing(run(minutes))).toContain("summary: timeOnIcePerGame is plausible seconds per game");
  });
  it("accepts fractional seconds per game from the real summary unit", () => {
    expect(run(rows.map(r => ({ ...r, timeOnIcePerGame: 1423.6666 }))).ok).toBe(true);
  });
  it("fails missing requested responses, including an empty EDGE sample", () => {
    const partial = checkEvolutionSources({ summaryRows: rows, edgeBodies: new Map([[8478402, edge()]]), expectedPlayerIds: [8478402, 8482149] });
    expect(partial.ok).toBe(false);
    expect(failing(partial)).toContain("EDGE 8482149: body");
    expect(checkEvolutionSources({ summaryRows: rows, edgeBodies: new Map() }).ok).toBe(false);
    expect(checkEvolutionSources({ summaryRows: rows, edgeBodies: new Map([[8478402, null]]), expectedPlayerIds: [8478402] }).ok).toBe(false);
  });
  it("fails a missing summary field and a percent-style zone share", () => {
    expect(failing(run(rows.map(({ points, ...r }) => r as never)))).toContain("summary: required fields");
    expect(failing(run(rows, edge({ zoneTimeDetails: { offensiveZonePctg: 47.7 } })))).toContain("EDGE 8478402: offensiveZonePctg is a 0–1 fraction");
  });
  it("fails inconsistent shot counts and a wrong player id", () => {
    expect(failing(run(rows, edge({ sogSummary: [{ locationCode: "all", shots: 10 }, { locationCode: "high", shots: 40 }] })))).toContain("EDGE 8478402: sogSummary all/high shots");
    expect(failing(run(rows, edge({ player: { id: 1, gamesPlayed: 82 } })))).toContain("EDGE 8478402: identity");
  });
  it("reports, rather than hides, an EDGE row that lags the summary", () => {
    const r = run(rows, edge({ player: { id: 8478402, gamesPlayed: 79 } }));
    expect(r.checks.find(c => c.name.includes("EDGE games equal summary games"))!.detail).toMatch(/NOT aligned/);
    expect(r.checks.find(c => c.name === "joint: alignment rate")!.detail).toMatch(/^0\/1/);
  });
  it("lists any as-of field the payload carries, and says when there is none", () => {
    expect(run().checks.find(c => c.name.endsWith("any as-of field?"))!.detail).toMatch(/none at the top level/);
    expect(run(rows, edge({ lastUpdated: "2026-10-05" })).checks.find(c => c.name.endsWith("any as-of field?"))!.detail).toMatch(/lastUpdated/);
  });
});
