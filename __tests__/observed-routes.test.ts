import { beforeEach, expect, it, vi } from "vitest";
import { missingObservedStats, type ObservedSelection } from "@/app/lib/observed-season";
const state = vi.hoisted(() => ({ roster: null as any }));
vi.mock("@/app/lib/cached-roster", () => ({ getCachedRoster: vi.fn(async () => ({ value: state.roster, state: "fresh", blocked: false })) }));
vi.mock("@/app/lib/observed-stats.server", () => ({ readObservedPlayers: vi.fn(async (selection: ObservedSelection) => ({
  selection, byId: new Map([["8478402", { ...missingObservedStats(selection), coverage: "available", games: selection.season === "20262027" ? 2 : 82, points: selection.season === "20262027" ? 7 : 138 }]]),
  skaters: { coverage: "available" }, goalies: { coverage: "available" },
})) }));
vi.mock("@/app/lib/observed-edge.server", () => ({ readObservedEdge: vi.fn(async (_id: number, selection: ObservedSelection) => ({
  ...selection, playerId: _id, coverage: "available", capturedAt: 100, source: "snapshot",
  raw: { player: { gamesPlayed: 82 }, sogDetails: [{ area: "Crease", shots: selection.gameType === 3 ? 6 : 82 }] },
})) }));
const { GET } = await import("@/app/api/league/players/route");
const { GET: edgeGET } = await import("@/app/api/player-edge/[playerId]/route");
const { getCachedRoster } = await import("@/app/lib/cached-roster");
beforeEach(() => {
  vi.clearAllMocks();
  state.roster = { generatedAt: 100, capCeiling: 104, teams: [], liveStats: true,
    players: [{ id: "8478402", position: "C", games: 82, ptsPace: 138, capHit: 12.5 }, { id: "uncovered", position: "C", games: 50, ptsPace: 30 }],
    navMap: { "8478402": { total: 100, modelVersion: "X-NAV 4.2" } } };
});
it("rejects invalid observation requests before roster or upstream reads", async () => {
  expect((await GET(new Request("http://localhost/api/league/players?season=20242025"))).status).toBe(400);
  expect(getCachedRoster).not.toHaveBeenCalled();
});
it("changes only observations across selections while preserving every model field and valuation", async () => {
  const before = structuredClone(state.roster);
  for (const [season, points] of [["20262027", 7], ["20252026", 138], ["20262027", 7]] as const) {
    const body = await (await GET(new Request(`http://localhost/api/league/players?season=${season}&gameType=2`))).json();
    expect(body.players[0]).toMatchObject({ games: 82, ptsPace: 138, observedStats: { season, points } });
    expect(body.players[1].observedStats).toMatchObject({ coverage: "missing", games: null });
    expect(body.navMap).toEqual(before.navMap);
  }
  expect(state.roster).toEqual(before);
});
it("keeps unqualified calculator callers on the existing analytical contract", async () => {
  expect((await (await GET()).json()).players).toEqual(state.roster.players);
});
it("carries regular/playoff selection through the EDGE route", async () => {
  for (const gameType of [2, 3]) {
    const response = await edgeGET(new Request(`http://localhost/api/player-edge/8478402?season=20252026&gameType=${gameType}`), { params: Promise.resolve({ playerId: "8478402" }) });
    const result = await response.json();
    expect(result).toMatchObject({ season: "20252026", gameType, sogDetails: [{ shots: gameType === 3 ? 6 : 82 }] });
    expect(result.raw).toBeUndefined();
  }
});
