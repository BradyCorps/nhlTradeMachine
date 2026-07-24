import { describe, expect, it } from "vitest";
import {
  buildTradeQueryString,
  createTradeSharePayload,
  decodeTradeSharePayload,
  encodeTradeSharePayload,
  parseTradeQueryState,
  resolveTradeShareAssets,
  summarizeTradeSharePayload,
  TRADE_SHARE_SCHEMA,
} from "@/app/lib/trade-share";
import type { Asset, Team, TradeVerdict } from "@/app/lib/trade-types";

const team = (id: string): Team => ({
  id,
  name: `${id} Hockey Club`,
  capSpace: 10,
  standing: 12,
});

const asset = (id: string, teamId: string, retainedPct = 0): Asset => ({
  id,
  teamId,
  name: id,
  position: "C",
  age: 25,
  games: 82,
  ptsPace: 60,
  defRate: 0,
  avgTOI: 18,
  capHit: 5,
  yearsRemaining: 2,
  hasNMC: false,
  hasNTC: false,
  canRetain: true,
  retainedPct,
  multiplier: 1,
});

const verdict: TradeVerdict = {
  status: "FAIR",
  message: "Fair trade at creation time.",
  flags: [{
    severity: "INFO",
    category: "GOOD",
    headline: "Balanced package",
    explanation: "Both clubs can defend the value.",
  }],
  metrics: {
    navOut: 50,
    navIn: 52,
    homeNetGain: 2,
    ptsGain: 4,
    defGain: 1,
    capDelta: -1.5,
    variance: 0.2,
    ewaHome: 1.1,
    cwiYears: 2,
  },
};

describe("trade share payload", () => {
  it("creates a stable versioned payload with a locked verdict snapshot", () => {
    const payload = createTradeSharePayload({
      homeTeam: team("WPG"),
      partnerTeam: team("SJS"),
      outgoing: [asset("player-out", "WPG", 0.5)],
      incoming: [asset("player-in", "SJS")],
      verdict,
      createdAt: "2026-06-17T00:00:00.000Z",
      season: "2025-26",
      valueTimeline: [{
        asOf: "2026-06-17",
        assetValues: { "player-out": 50, "player-in": 52 },
        packageValues: { outgoing: 50, incoming: 52, homeNetGain: 2 },
      }],
    });

    expect(payload.schema).toBe(TRADE_SHARE_SCHEMA);
    expect(payload.version).toBe(1);
    expect(payload.teams).toEqual({ homeTeamId: "WPG", partnerTeamId: "SJS" });
    expect(payload.blocks.outgoing).toEqual([{ id: "player-out", retainedPct: 0.5 }]);
    expect(payload.lockedVerdict?.status).toBe("FAIR");
    expect(payload.valueTimeline[0].packageValues.homeNetGain).toBe(2);
  });

  it("round-trips through a base64url share code", () => {
    const payload = createTradeSharePayload({
      homeTeam: team("WPG"),
      partnerTeam: team("SJS"),
      outgoing: [asset("player-out", "WPG", 0.25)],
      incoming: [asset("player-in", "SJS")],
      verdict,
      createdAt: "2026-06-17T00:00:00.000Z",
    });

    const code = encodeTradeSharePayload(payload);

    expect(code).not.toContain("+");
    expect(code).not.toContain("/");
    expect(code).not.toContain("=");
    expect(decodeTradeSharePayload(code)).toEqual(payload);
  });

  it("serializes and parses the current query-string trade state", () => {
    const query = buildTradeQueryString({
      homeTeamId: "WPG",
      partnerTeamId: "SJS",
      outgoing: [{ id: "player-out", retainedPct: 0.5 }],
      incoming: [{ id: "player-in", retainedPct: 0 }],
    });

    expect(parseTradeQueryState(query)).toEqual({
      homeTeamId: "WPG",
      partnerTeamId: "SJS",
      outgoing: [{ id: "player-out", retainedPct: 0.5 }],
      incoming: [{ id: "player-in", retainedPct: 0 }],
    });
  });

  it("reconstructs selected assets and preserves placeholders for missing assets", () => {
    const resolved = resolveTradeShareAssets(
      [
        { id: "player-out", retainedPct: 0.25 },
        { id: "missing-player", retainedPct: 0 },
      ],
      [asset("player-out", "WPG")],
    );

    expect(resolved).toHaveLength(2);
    expect(resolved[0]).toMatchObject({ id: "player-out", retainedPct: 0.25 });
    expect(resolved[1]).toMatchObject({
      id: "missing-player",
      name: "Unavailable asset (missing-player)",
      retainedPct: 0,
    });
  });

  it("enforces team ownership on the execute path — no third-team or phantom assets (CX2)", () => {
    const league = [
      asset("home-player", "WPG"),
      asset("partner-player", "SJS"),
      asset("third-team-player", "TOR"),
    ];
    // Outgoing must belong to the home team (WPG).
    const outgoing = resolveTradeShareAssets(
      [
        { id: "home-player", retainedPct: 0 },
        { id: "third-team-player", retainedPct: 0 }, // crafted: a rival's asset
        { id: "ghost", retainedPct: 0 },             // crafted: nonexistent
      ],
      league,
      "WPG",
    );
    expect(outgoing.map(a => a.id)).toEqual(["home-player"]);

    // Incoming must belong to the partner team (SJS).
    const incoming = resolveTradeShareAssets(
      [{ id: "partner-player", retainedPct: 0 }, { id: "home-player", retainedPct: 0 }],
      league,
      "SJS",
    );
    expect(incoming.map(a => a.id)).toEqual(["partner-player"]);
  });

  it("summarizes a shared trade for social previews", () => {
    const payload = createTradeSharePayload({
      homeTeam: team("WPG"),
      partnerTeam: team("SJS"),
      outgoing: [asset("player-out", "WPG")],
      incoming: [asset("player-in", "SJS"), asset("pick-in", "SJS")],
      verdict,
      createdAt: "2026-06-18T00:00:00.000Z",
    });

    const preview = summarizeTradeSharePayload(payload);

    expect(preview.title).toBe("WPG / SJS Trade: FAIR");
    expect(preview.description).toContain("WPG sends 1 asset; SJS sends 2 assets");
    expect(preview.description).toContain("Net value for WPG: +2 NAV");
    expect(preview.imageAlt).toContain("verdict FAIR");
  });
});
