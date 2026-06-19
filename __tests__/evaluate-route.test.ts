import { describe, expect, it } from "vitest";
import { POST as evaluatePOST } from "../app/api/evaluate/route";
import type { Asset, Team } from "../app/lib/trade-types";

const team = (overrides: Partial<Team> = {}): Team => ({
  id: "WPG",
  name: "Winnipeg Jets",
  capSpace: 10,
  standing: 12,
  phase: "Bubble",
  ...overrides,
});

const asset = (overrides: Partial<Asset> = {}): Asset => ({
  id: "asset",
  teamId: "WPG",
  name: "Test Player",
  position: "W",
  age: 28,
  games: 82,
  ptsPace: 45,
  baselinePtsPace: 45,
  xGPace: 20,
  defRate: 0,
  avgTOI: 16,
  capHit: 4,
  yearsRemaining: 2,
  hasNMC: false,
  hasNTC: false,
  canRetain: true,
  retainedPct: 0,
  multiplier: 1,
  qocIndex: 45,
  ...overrides,
});

const postEvaluate = async (body: unknown) => {
  const response = await evaluatePOST(new Request("http://localhost/api/evaluate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  }) as any);
  return {
    response,
    body: await response.json(),
  };
};

describe("evaluate route integration", () => {
  it("blocks a trade that puts the home team over the cap ceiling", async () => {
    const home = team({ id: "WPG", name: "Winnipeg Jets", capSpace: 1, phase: "Contender", standing: 4 });
    const partner = team({ id: "SJS", name: "San Jose Sharks", capSpace: 20, phase: "Rebuilding", standing: 29 });
    const outgoing = [asset({ id: "cheap", name: "Cheap Depth", teamId: "WPG", capHit: 1, ptsPace: 20 })];
    const incoming = [asset({ id: "expensive", name: "Expensive Star", teamId: "SJS", capHit: 8, ptsPace: 70 })];

    const { response, body } = await postEvaluate({
      assets: [...outgoing, ...incoming],
      tradeOutgoing: outgoing,
      tradeIncoming: incoming,
      homeTeam: home,
      partnerTeam: partner,
      allHomeRoster: outgoing,
      allPartnerRoster: incoming,
      runTrade: true,
      capCeiling: 95.5,
    });

    expect(response.status).toBe(200);
    expect(body.verdict.status).toBe("BLOCKED");
    expect(body.verdict.flags).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: "HARD",
        category: "CAP_VIOLATION",
        vetoesSide: 0,
      }),
    ]));
  });

  it("hard-vetoes an untouchable partner asset", async () => {
    const home = team({ id: "EDM", name: "Edmonton Oilers", capSpace: 20, phase: "Contender", standing: 3 });
    const partner = team({ id: "SJS", name: "San Jose Sharks", capSpace: 20, phase: "Rebuilding", standing: 29 });
    const outgoing = [asset({ id: "return", name: "Return Piece", teamId: "EDM", ptsPace: 60, capHit: 5 })];
    const incoming = [asset({
      id: "untouchable",
      name: "Untouchable Core",
      teamId: "SJS",
      age: 22,
      ptsPace: 65,
      capHit: 3,
      tradeBlockStatus: "untouchable",
    })];

    const { response, body } = await postEvaluate({
      assets: [...outgoing, ...incoming],
      tradeOutgoing: outgoing,
      tradeIncoming: incoming,
      homeTeam: home,
      partnerTeam: partner,
      allHomeRoster: outgoing,
      allPartnerRoster: incoming,
      runTrade: true,
      capCeiling: 95.5,
    });

    expect(response.status).toBe(200);
    expect(body.verdict.status).toBe("BLOCKED");
    expect(body.verdict.flags).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: "HARD",
        category: "UNTOUCHABLE",
        vetoesSide: 1,
      }),
    ]));
  });

  it("returns FAIR for a balanced low-risk swap", async () => {
    const home = team({ id: "WPG", name: "Winnipeg Jets", capSpace: 10, phase: "Retooling", standing: 16 });
    const partner = team({ id: "SJS", name: "San Jose Sharks", capSpace: 10, phase: "Retooling", standing: 17 });
    const outgoing = [asset({ id: "wpg-wing", name: "WPG Wing", teamId: "WPG", ptsPace: 45, capHit: 4 })];
    const incoming = [asset({ id: "sjs-wing", name: "SJS Wing", teamId: "SJS", ptsPace: 45, capHit: 4 })];

    const { response, body } = await postEvaluate({
      assets: [...outgoing, ...incoming],
      tradeOutgoing: outgoing,
      tradeIncoming: incoming,
      homeTeam: home,
      partnerTeam: partner,
      allHomeRoster: [outgoing[0], asset({ id: "wpg-c", name: "WPG Center", teamId: "WPG", position: "C" })],
      allPartnerRoster: [incoming[0], asset({ id: "sjs-c", name: "SJS Center", teamId: "SJS", position: "C" })],
      runTrade: true,
      capCeiling: 95.5,
    });

    expect(response.status).toBe(200);
    expect(body.verdict.status).toBe("FAIR");
    expect(body.verdict.message).toBe("Balanced Exchange");
    expect(Math.abs(body.verdict.metrics.homeNetGain)).toBeLessThanOrEqual(1);
  });

  it("surfaces goalie volatility in trade flags", async () => {
    const home = team({ id: "WPG", name: "Winnipeg Jets", capSpace: 15, phase: "Contender", standing: 6 });
    const partner = team({ id: "CGY", name: "Calgary Flames", capSpace: 15, phase: "Retooling", standing: 18 });
    const outgoing = [asset({
      id: "wpg-forward",
      name: "WPG Forward",
      teamId: "WPG",
      ptsPace: 62,
      capHit: 5,
    })];
    const incoming = [asset({
      id: "volatile-goalie",
      name: "Volatile Goalie",
      teamId: "CGY",
      position: "G",
      age: 25,
      games: 57,
      gamesStarted: 57,
      gsax: -1.8,
      teamXga60: 3.22,
      ptsPace: 0,
      xGPace: 0,
      defRate: 0,
      avgTOI: 0,
      capHit: 0.875,
      yearsRemaining: 2,
    })];

    const { response, body } = await postEvaluate({
      assets: [...outgoing, ...incoming],
      tradeOutgoing: outgoing,
      tradeIncoming: incoming,
      homeTeam: home,
      partnerTeam: partner,
      allHomeRoster: outgoing,
      allPartnerRoster: incoming,
      runTrade: true,
      capCeiling: 95.5,
    });

    expect(response.status).toBe(200);
    expect(body.navMap["volatile-goalie"].volatility).toBeGreaterThanOrEqual(40);
    expect(body.verdict.flags).toEqual(expect.arrayContaining([
      expect.objectContaining({
        severity: "WARN",
        category: "ASSET_SHAPE_MISMATCH",
        affectedAsset: "Volatile Goalie",
      }),
    ]));
  });

  it("keeps production metrics numeric when a draft pick is included", async () => {
    const home = team({ id: "WPG", name: "Winnipeg Jets", capSpace: 10, phase: "Retooling", standing: 16 });
    const partner = team({ id: "SJS", name: "San Jose Sharks", capSpace: 10, phase: "Rebuilding", standing: 29 });
    const outgoing = [
      asset({ id: "wpg-wing", name: "WPG Wing", teamId: "WPG", ptsPace: 40, defRate: 1, avgTOI: 14 }),
    ];
    const incoming = [
      asset({ id: "sjs-2027-2", name: "2027 2nd Round Pick (SJS)", teamId: "SJS", position: "Pick", round: 2, year: 2027 }),
    ];

    const { response, body } = await postEvaluate({
      assets: [...outgoing, ...incoming],
      tradeOutgoing: outgoing,
      tradeIncoming: incoming,
      homeTeam: home,
      partnerTeam: partner,
      allHomeRoster: outgoing,
      allPartnerRoster: [],
      runTrade: true,
      capCeiling: 95.5,
    });

    expect(response.status).toBe(200);
    expect(Number.isFinite(body.verdict.metrics.ptsGain)).toBe(true);
    expect(Number.isFinite(body.verdict.metrics.defGain)).toBe(true);
  });

  it("does not treat pedigree-only prospect defensemen as established depletion losses", async () => {
    const home = team({ id: "WPG", name: "Winnipeg Jets", capSpace: 10, phase: "Contender", standing: 4 });
    const partner = team({ id: "FLA", name: "Florida Panthers", capSpace: 10, phase: "Contender", standing: 5 });
    const outgoing = [asset({ id: "wpg-wing", name: "WPG Wing", teamId: "WPG", ptsPace: 40, capHit: 4 })];
    const incoming = [asset({
      id: "future-d",
      name: "Future D",
      teamId: "FLA",
      position: "D",
      age: 18,
      games: 0,
      ptsPace: 0,
      avgTOI: 0,
      draftOverall: 2,
      hasLiveStats: false,
      capHit: 0.975,
      yearsRemaining: 3,
    })];

    const { response, body } = await postEvaluate({
      assets: [...outgoing, ...incoming],
      tradeOutgoing: outgoing,
      tradeIncoming: incoming,
      homeTeam: home,
      partnerTeam: partner,
      allHomeRoster: outgoing,
      allPartnerRoster: incoming,
      runTrade: true,
      capCeiling: 95.5,
    });

    expect(response.status).toBe(200);
    expect(body.verdict.flags).not.toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: "ASSET_SHAPE_MISMATCH",
        headline: expect.stringContaining("D corps can't absorb losing Future D"),
      }),
    ]));
  });

  it("still flags established top-pair defensemen as depletion losses", async () => {
    const home = team({ id: "WPG", name: "Winnipeg Jets", capSpace: 10, phase: "Contender", standing: 4 });
    const partner = team({ id: "FLA", name: "Florida Panthers", capSpace: 10, phase: "Contender", standing: 5 });
    const outgoing = [asset({ id: "wpg-wing", name: "WPG Wing", teamId: "WPG", ptsPace: 40, capHit: 4 })];
    const incoming = [asset({
      id: "top-pair-d",
      name: "Top Pair D",
      teamId: "FLA",
      position: "D",
      age: 27,
      games: 70,
      ptsPace: 44,
      avgTOI: 23,
      hasLiveStats: true,
      capHit: 6,
      yearsRemaining: 3,
    })];

    const { response, body } = await postEvaluate({
      assets: [...outgoing, ...incoming],
      tradeOutgoing: outgoing,
      tradeIncoming: incoming,
      homeTeam: home,
      partnerTeam: partner,
      allHomeRoster: outgoing,
      allPartnerRoster: incoming,
      runTrade: true,
      capCeiling: 95.5,
    });

    expect(response.status).toBe(200);
    expect(body.verdict.flags).toEqual(expect.arrayContaining([
      expect.objectContaining({
        category: "ASSET_SHAPE_MISMATCH",
        headline: "Florida Panthers's D corps can't absorb losing Top Pair D",
        affectedAsset: "Top Pair D",
      }),
    ]));
  });
});
