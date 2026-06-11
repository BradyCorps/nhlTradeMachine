import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { POST as simulatePOST } from "../app/api/simulate/route";
import { POST as claudePOST } from "../app/api/claude/route";
import { projectTopScorer, scenarioSeed } from "../app/lib/sim-engine";
import { SEASON } from "../app/lib/season-config";

const teamIds = [
  "BOS","BUF","DET","FLA","MTL","OTT","TBL","TOR",
  "CAR","CBJ","NJD","NYI","NYR","PHI","PIT","WSH",
  "UTA","CHI","COL","DAL","MIN","NSH","STL","WPG",
  "ANA","CGY","EDM","LAK","SEA","SJS","VAN","VGK",
];

const teams = teamIds.map((id, i) => ({
  id,
  name: id,
  phase: i < 8 ? "Contender" : i < 16 ? "Bubble" : i < 24 ? "Retooling" : "Rebuilding",
  standing: i + 1,
  capSpace: 8,
}));

const player = (id: string, name: string, teamId: string, ptsPace: number, position = "W") => ({
  id,
  name,
  teamId,
  position,
  age: 28,
  ptsPace,
  baselinePtsPace: ptsPace,
  xGPace: 20,
  avgTOI: 18,
  capHit: 5,
  yearsRemaining: 3,
  games: 82,
});

describe("simulate route", () => {
  it("selects the actual projected top scorer after injury variance", () => {
    const scheifele = player("scheifele", "Mark Scheifele", "WPG", 95, "C");
    const connor = player("connor", "Kyle Connor", "WPG", 92, "W");

    const top = projectTopScorer([scheifele, connor], "WPG", 18);

    expect(top?.name).toBe("Kyle Connor");
    expect(top?.projectedPts).toBeGreaterThan(80);
  });

  it("returns locked traded-player outcomes for moved players", async () => {
    const connor = player("connor", "Kyle Connor", "WPG", 92, "W");
    const andersson = player("andersson", "Rasmus Andersson", "CGY", 45, "D");
    const depth = teamIds.flatMap((teamId) => [
      player(`${teamId}-f1`, `${teamId} Forward`, teamId, 42, "C"),
      player(`${teamId}-d1`, `${teamId} Defender`, teamId, 25, "D"),
      {
        ...player(`${teamId}-g1`, `${teamId} Goalie`, teamId, 0, "G"),
        gsax: 0,
        gamesStarted: 45,
        savePct: 0.905,
      },
    ]);

    const req = new Request("http://localhost/api/simulate", {
      method: "POST",
      body: JSON.stringify({
        homeTeamId: "WPG",
        partnerTeamId: "CGY",
        teams,
        players: [...depth, connor, andersson],
        seed: 18,
        trades: [{
          homeTeamId: "WPG",
          partnerTeamId: "CGY",
          outgoing: [connor],
          incoming: [andersson],
        }],
      }),
    });

    const res = await simulatePOST(req as any);
    const body = await res.json();

    expect(body.simulationMode).toBe(SEASON.simulationMode);
    expect(body.tradedPlayerOutcomes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          playerId: "connor",
          name: "Kyle Connor",
          oldTeamId: "WPG",
          newTeamId: "CGY",
          projectedPts: expect.any(Number),
        }),
      ])
    );
  });

  it("derives a stable seed when one is not supplied", async () => {
    const connor = player("connor", "Kyle Connor", "WPG", 92, "W");
    const andersson = player("andersson", "Rasmus Andersson", "CGY", 45, "D");
    const depth = teamIds.flatMap((teamId) => [
      player(`${teamId}-f1`, `${teamId} Forward`, teamId, 42, "C"),
      player(`${teamId}-d1`, `${teamId} Defender`, teamId, 25, "D"),
      {
        ...player(`${teamId}-g1`, `${teamId} Goalie`, teamId, 0, "G"),
        gsax: 0,
        gamesStarted: 45,
        savePct: 0.905,
      },
    ]);
    const body = {
      homeTeamId: "WPG",
      partnerTeamId: "CGY",
      teams,
      players: [...depth, connor, andersson],
      trades: [{
        homeTeamId: "WPG",
        partnerTeamId: "CGY",
        outgoing: [connor],
        incoming: [andersson],
      }],
    };

    const first = await simulatePOST(new Request("http://localhost/api/simulate", {
      method: "POST",
      body: JSON.stringify(body),
    }) as any);
    const second = await simulatePOST(new Request("http://localhost/api/simulate", {
      method: "POST",
      body: JSON.stringify(body),
    }) as any);

    const firstBody = await first.json();
    const secondBody = await second.json();

    expect(firstBody.seed).toBe(secondBody.seed);
    expect(firstBody.homeTeam.projectedPoints).toBe(secondBody.homeTeam.projectedPoints);
  });

  it("uses order-insensitive object keys for scenario seeds", () => {
    expect(scenarioSeed({ b: 2, a: 1 })).toBe(scenarioSeed({ a: 1, b: 2 }));
  });
});

describe("claude narrative route contract", () => {
  const originalKey = process.env.ANTHROPIC_API_KEY;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  afterEach(() => {
    process.env.ANTHROPIC_API_KEY = originalKey;
    vi.restoreAllMocks();
  });

  it("rejects raw Anthropic messages from clients", async () => {
    const req = new Request("http://localhost/api/claude", {
      method: "POST",
      body: JSON.stringify({
        model: "claude-sonnet-4-5",
        messages: [{ role: "user", content: "Please simulate a season" }],
      }),
    });

    const res = await claudePOST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe("Invalid narrative request");
  });

  it("accepts locked season recap payloads", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({
      content: [{ text: "Locked recap." }],
    })));

    const req = new Request("http://localhost/api/claude", {
      method: "POST",
      body: JSON.stringify({
        kind: "season_recap",
        model: "claude-sonnet-4-5",
        max_tokens: 300,
        payload: {
          lockedReport: `Simulation mode: ${SEASON.simulationMode}\nKyle Connor: 76 GP, 84 pts`,
        },
      }),
    });

    const res = await claudePOST(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.content[0].text).toBe("Locked recap.");
  });
});
