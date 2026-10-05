import { afterEach, describe, expect, it, vi } from "vitest";
import { useSimDispatch } from "@/app/armchair-gm/useSimDispatch";

const { setters } = vi.hoisted(() => ({ setters: [] as ReturnType<typeof vi.fn>[] }));
vi.mock("react", () => ({
  useState: (initial: unknown) => {
    const setter = vi.fn(); setters.push(setter); return [initial, setter];
  },
  useRef: (current: unknown) => ({ current }),
  useCallback: (callback: unknown) => callback,
}));
vi.mock("@/app/lib/sim-engine", () => ({ scenarioSeed: () => 123 }));
vi.mock("@/app/lib/ledger-toast", () => ({ toast: vi.fn() }));
afterEach(() => { setters.length = 0; vi.unstubAllGlobals(); });

describe("paused automatic recap dispatch", () => {
  it.each([null, 1, 3])("retains simulation results without calling Claude (Cup Run year %s)", async year => {
    const simulation = { seed: 123, homeTeam: { teamId: "WPG", projectedPoints: 98 } };
    const fetch = vi.fn().mockResolvedValue({ ok: true, json: async () => simulation });
    vi.stubGlobal("fetch", fetch);
    const team = { id: "WPG", name: "Winnipeg Jets" };
    const players = Array.from({ length: 20 }, (_, index) => ({
      id: `fixture-${index}`, teamId: "WPG", position: index < 12 ? "C" : index < 18 ? "D" : "G",
    }));
    const controls = useSimDispatch({
      homeTeam: team, partnerTeam: null, db: { teams: [team], players },
      originalDb: null, executedTrades: [], navMap: {},
      lineupStartingGoalies: {}, lineupOrders: {}, computeContention: vi.fn(),
      cupRunContext: year === null ? null : {
        teamId: "WPG", teamName: "Winnipeg Jets", year, runSeed: 123,
        difficultyLabel: "Normal", stars: 3, seasons: [],
      },
    } as unknown as Parameters<typeof useSimDispatch>[0]);
    await controls.simYear();
    expect(fetch).toHaveBeenCalledTimes(1);
    expect(fetch.mock.calls[0][0]).toBe("/api/simulate");
    expect(setters[2]).toHaveBeenLastCalledWith(simulation);
    expect(setters[1]).toHaveBeenLastCalledWith(false);
    expect(setters[0]).toHaveBeenLastCalledWith(null);
  });
});
