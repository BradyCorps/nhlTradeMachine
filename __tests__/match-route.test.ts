import { describe, expect, it } from "vitest";
import { POST } from "../app/api/match/route";
import type { Asset, Team } from "../app/lib/trade-types";

const team = (id: string, phase: string, capSpace: number, standing: number): Team => ({
  id,
  name: id,
  phase,
  capSpace,
  standing,
});

const asset = (overrides: Partial<Asset> = {}): Asset => ({
  id: "negative-player",
  teamId: "WPG",
  name: "Negative NAV Player",
  position: "C",
  age: 29,
  games: 70,
  ptsPace: 35,
  xGPace: 12,
  defRate: 0,
  avgTOI: 15,
  capHit: 6,
  yearsRemaining: 2,
  hasNMC: false,
  hasNTC: false,
  canRetain: true,
  retainedPct: 0,
  multiplier: 1,
  ...overrides,
});

async function match(body: unknown) {
  const res = await POST(new Request("http://localhost/api/match", {
    method: "POST",
    body: JSON.stringify(body),
  }) as any);
  return res.json();
}

describe("match route negative NAV packages", () => {
  it("keeps a negative-NAV player visible when max retention can solve the cap", async () => {
    const player = asset();
    const body = await match({
      assets: [player],
      homeTeamId: "WPG",
      allTeams: [
        team("WPG", "Contender", 2, 4),
        team("ANA", "Rebuilding", 3, 28),
      ],
      allPlayers: [],
      navMap: {
        [player.id]: { total: -12, off: 5, def: 0, age: 0, cap: -17 },
      },
    });

    const ana = body.matches.find((m: any) => m.teamId === "ANA");
    expect(ana.capFit).toBe("TIGHT");
    expect(ana.fitTier).toBe("LONG_SHOT");
    expect(ana.returnProfile).toBe("Salary retained + conditional pick");
    expect(ana.warnReasons.join(" ")).toContain("Needs retention");
  });

  it("ranks cap-room rebuilders as leads for moderate negative-NAV buy-low targets", async () => {
    const player = asset({ capHit: 4 });
    const body = await match({
      assets: [player],
      homeTeamId: "WPG",
      allTeams: [
        team("WPG", "Contender", 2, 4),
        team("CHI", "Rebuilding", 10, 30),
      ],
      allPlayers: [],
      navMap: {
        [player.id]: { total: -10, off: 5, def: 0, age: 0, cap: -15 },
      },
    });

    const chi = body.matches.find((m: any) => m.teamId === "CHI");
    expect(chi.fitTier).toBe("LEAD");
    expect(chi.fitReasons).toContain("Cap room to buy low");
    expect(chi.returnProfile).toBe("Minimal return or future considerations");
  });
});
