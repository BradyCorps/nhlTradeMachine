import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Asset } from "@/app/lib/trade-types";
import { AssetBadges } from "@/app/components/AssetBadges";
import { ExpandedStats } from "@/app/components/OffseasonPlayerAnalytics";
import { displayPosition } from "@/app/lib/display-position";
import {
  PLAYER_STATS_CONTEXT,
  PLAYER_TERMINOLOGY,
  expiringRightsLabel,
  navLabelForPosition,
  playerCountLabel,
  prospectTierLabel,
} from "@/app/lib/player-terminology";
import { columnsFor, termLabel, unitOf } from "@/app/lib/roster-table";

const asset = (over: Partial<Asset>): Asset => ({
  id: String(over.name ?? "player").toLowerCase().replace(/\W/g, ""),
  teamId: "BUF",
  name: "Test Player",
  position: "C",
  age: 26,
  games: 82,
  ptsPace: 60,
  defRate: 0.08,
  avgTOI: 18,
  capHit: 5,
  yearsRemaining: 3,
  hasNMC: false,
  hasNTC: false,
  canRetain: true,
  retainedPct: 0,
  multiplier: 1,
  ...over,
});

describe("QW-01 player terminology", () => {
  it("snapshots forward, defence, goalie, prospect, RFA, and UFA rows", () => {
    const fixtures = [
      { kind: "forward", player: asset({ name: "Tage Thompson", position: "C", secondaryPosition: "C" }), prospectTier: null },
      { kind: "defence", player: asset({ name: "Quinn Hughes", position: "D", secondaryPosition: "RD" }), prospectTier: null },
      { kind: "goalie", player: asset({ name: "Logan Thompson", position: "G", teamId: "WSH" }), prospectTier: null },
      { kind: "prospect", player: asset({ name: "Owen Beck", position: "C", age: 22, games: 12 }), prospectTier: 2 as const },
      {
        kind: "RFA",
        player: asset({
          name: "Kevin Korchinski",
          position: "D",
          teamId: "CHI",
          yearsRemaining: 0,
          expiresThisOffseason: true,
          contractStatus: "RFA",
        }), prospectTier: null,
      },
      {
        kind: "UFA",
        player: asset({
          name: "Ian Cole",
          position: "D",
          teamId: "CHI",
          yearsRemaining: 0,
          expiresThisOffseason: true,
          contractStatus: "UFA",
        }), prospectTier: null,
      },
    ];

    const snapshot = fixtures.map(({ kind, player, prospectTier }) => {
      const columns = columnsFor(unitOf(player.position));
      return {
        kind,
        identity: `${player.name} · ${displayPosition(player.position, player.secondaryPosition)}`,
        positionHeading: PLAYER_TERMINOLOGY.position,
        statusChip: expiringRightsLabel(player) ?? prospectTierLabel(prospectTier),
        navHeading: columns.find(column => column.key === "nav")?.label,
        expectedNavLabel: navLabelForPosition(player.position),
        contractHeading: columns.find(column => column.key === "cap")?.label,
        yearsLeftHeading: columns.find(column => column.key === "term")?.label,
        yearsLeftValue: termLabel(player),
        statsContext: PLAYER_STATS_CONTEXT,
      };
    });

    expect(snapshot).toMatchInlineSnapshot(`
      [
        {
          "contractHeading": "Contract",
          "expectedNavLabel": "X-NAV",
          "identity": "Tage Thompson · C",
          "kind": "forward",
          "navHeading": "X-NAV",
          "positionHeading": "Position",
          "statsContext": "2025-26 regular season · all situations unless noted",
          "statusChip": null,
          "yearsLeftHeading": "Years left",
          "yearsLeftValue": "3y",
        },
        {
          "contractHeading": "Contract",
          "expectedNavLabel": "X-NAV",
          "identity": "Quinn Hughes · D/RD",
          "kind": "defence",
          "navHeading": "X-NAV",
          "positionHeading": "Position",
          "statsContext": "2025-26 regular season · all situations unless noted",
          "statusChip": null,
          "yearsLeftHeading": "Years left",
          "yearsLeftValue": "3y",
        },
        {
          "contractHeading": "Contract",
          "expectedNavLabel": "G-NAV",
          "identity": "Logan Thompson · G",
          "kind": "goalie",
          "navHeading": "G-NAV",
          "positionHeading": "Position",
          "statsContext": "2025-26 regular season · all situations unless noted",
          "statusChip": null,
          "yearsLeftHeading": "Years left",
          "yearsLeftValue": "3y",
        },
        {
          "contractHeading": "Contract",
          "expectedNavLabel": "X-NAV",
          "identity": "Owen Beck · C",
          "kind": "prospect",
          "navHeading": "X-NAV",
          "positionHeading": "Position",
          "statsContext": "2025-26 regular season · all situations unless noted",
          "statusChip": "PROSPECT: TOP",
          "yearsLeftHeading": "Years left",
          "yearsLeftValue": "3y",
        },
        {
          "contractHeading": "Contract",
          "expectedNavLabel": "X-NAV",
          "identity": "Kevin Korchinski · D",
          "kind": "RFA",
          "navHeading": "X-NAV",
          "positionHeading": "Position",
          "statsContext": "2025-26 regular season · all situations unless noted",
          "statusChip": "RFA",
          "yearsLeftHeading": "Years left",
          "yearsLeftValue": "RFA",
        },
        {
          "contractHeading": "Contract",
          "expectedNavLabel": "X-NAV",
          "identity": "Ian Cole · D",
          "kind": "UFA",
          "navHeading": "X-NAV",
          "positionHeading": "Position",
          "statsContext": "2025-26 regular season · all situations unless noted",
          "statusChip": "UFA",
          "yearsLeftHeading": "Years left",
          "yearsLeftValue": "UFA",
        },
      ]
    `);
  });

  it("uses grammatical player counts", () => {
    expect(playerCountLabel(0)).toBe("0 players");
    expect(playerCountLabel(1)).toBe("1 player");
    expect(playerCountLabel(2)).toBe("2 players");
  });

  it("renders explicit player chips instead of overloaded glyphs", () => {
    const html = renderToStaticMarkup(React.createElement(AssetBadges, {
      asset: asset({
        name: "Zach Benson",
        age: 21,
        games: 30,
        yearsRemaining: 0,
        expiresThisOffseason: true,
        contractStatus: "RFA",
      }),
      xnav: { total: 80, off: 30, def: 10, age: 10, cap: 12, upside: 18 },
    }));

    expect(html).toContain("RFA");
    expect(html).toContain("PROSPECT: TOP");
    expect(html).toContain("ROLE:");
    expect(html).not.toMatch(/[★◆✦]/);
  });

  it("labels the shared goalie stats surface G-NAV, never X-NAV", () => {
    const html = renderToStaticMarkup(React.createElement(ExpandedStats, {
      p: asset({
        name: "Logan Thompson",
        position: "G",
        gamesStarted: 52,
        savePct: 0.914,
        gsax: 11.2,
      }),
      nav: { total: 72, off: 0, def: 58, age: 2, cap: 12, upside: 0 },
    }));

    expect(html).toContain("G-NAV");
    expect(html).not.toContain("X-NAV");
  });
});
