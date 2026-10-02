import { expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  value: { teams: [{ id: "EDM", name: "Edmonton Oilers", standing: 2, phase: "Contender", capSpace: 1, record: { wins: 50 } }],
    players: [], navMap: { player: { total: 100 } }, capCeiling: 104, generatedAt: 100, liveStats: true },
}));
vi.mock("@/app/lib/swr-cache", () => ({ swrCache: vi.fn(async () => ({ value: state.value, state: "fresh", blocked: false })) }));
vi.mock("@/app/lib/observed-stats.server", async importOriginal => ({
  ...await importOriginal<typeof import("@/app/lib/observed-stats.server")>(),
  readObservedSummary: vi.fn(async (selection: { season: string; gameType: number }) => ({ selection, coverage: "available",
    rows: selection.season === "20262027" && selection.gameType === 3 ? [] : [{ teamFullName: "Edmonton Oilers",
      seasonId: Number(selection.season), gamesPlayed: selection.season === "20262027" ? 2 : 82,
      wins: selection.season === "20262027" ? 1 : 50, losses: 1, otLosses: selection.gameType === 3 ? null : 0,
      points: 2, winsInRegulation: 1 }] })),
}));
const { GET } = await import("@/app/api/league/route");
it("switches team observations without relabelling current contracts or model results", async () => {
  const before = structuredClone(state.value);
  for (const [season, wins] of [["20262027", 1], ["20252026", 50], ["20262027", 1]] as const) {
    const result = await (await GET(new Request(`http://localhost/api/league?season=${season}&gameType=2`))).json();
    expect(result.teams[0]).toMatchObject({ observedSelection: { season, gameType: 2 }, record: { wins, regulationWins: 1 }, capSpace: 1, phase: "Contender" });
    expect(result.navMap).toEqual(before.navMap);
  }
  expect(state.value).toEqual(before);
});
it("removes historical records and ranks when selected coverage is missing", async () => {
  const result = await (await GET(new Request("http://localhost/api/league?season=20262027&gameType=3"))).json();
  expect(result.teams[0]).toMatchObject({ record: null, standing: null, observedCoverage: "missing" });
});
it("rejects unsupported team selections", async () => {
  expect((await GET(new Request("http://localhost/api/league?season=20242025"))).status).toBe(400);
});
