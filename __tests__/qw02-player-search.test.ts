import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  filterPlayersBySearch,
  matchesPlayerSearch,
  normalizeSearchText,
} from "@/app/lib/player-search";

interface FixturePlayer {
  id: string;
  name: string;
  teamId: string;
}

const teams = {
  EDM: { id: "EDM", name: "Edmonton Oilers" },
  MTL: { id: "MTL", name: "Montréal Canadiens" },
  OTT: { id: "OTT", name: "Ottawa Senators" },
  VAN: { id: "VAN", name: "Vancouver Canucks" },
};

const players: FixturePlayer[] = [
  { id: "8478402", name: "Connor McDavid", teamId: "EDM" },
  { id: "8480069", name: "Nick Suzuki", teamId: "MTL" },
  { id: "8482116", name: "Tim Stützle", teamId: "OTT" },
  { id: "8476291", name: "Nicholas Paul", teamId: "OTT" },
  { id: "8480012", name: "Jean-Gabriel Pageau", teamId: "OTT" },
  { id: "8478463", name: "Elias Pettersson", teamId: "VAN" },
  { id: "8484855", name: "Elias Pettersson", teamId: "VAN" },
];

const find = (query: string): FixturePlayer[] =>
  filterPlayersBySearch(players, query, player => teams[player.teamId as keyof typeof teams]);

describe("QW-02 shared player search", () => {
  it.each(["Edmonton", "Oilers", "EDM"])("finds Edmonton by %s", query => {
    expect(find(query).map(player => player.id)).toEqual(["8478402"]);
  });

  it.each(["Montreal", "Montréal", "Canadiens", "MTL"])("finds Montréal by %s", query => {
    expect(find(query).map(player => player.id)).toEqual(["8480069"]);
  });

  it("normalizes accents, punctuation, and hyphens", () => {
    expect(find("Stutzle").map(player => player.id)).toEqual(["8482116"]);
    expect(find("Jean Gabriel Pageau").map(player => player.id)).toEqual(["8480012"]);
    expect(normalizeSearchText("  O’Connor-Jr. ")).toBe("oconnor jr");
  });

  it("matches common and formal first names without changing player identity", () => {
    const formal = players.find(player => player.id === "8476291")!;
    expect(matchesPlayerSearch(formal, "Nick Paul", teams.OTT)).toBe(true);
    expect(matchesPlayerSearch({ ...formal, name: "Nick Paul" }, "Nicholas Paul", teams.OTT)).toBe(true);
    expect(find("Nick Paul").map(player => player.id)).toEqual(["8476291"]);
  });

  it("preserves duplicate-name rows and their distinct NHL IDs", () => {
    expect(find("Elias Pettersson").map(player => player.id)).toEqual(["8478463", "8484855"]);
  });

  it("uses the shared matcher in every requested product search", () => {
    const sources = [
      "app/players/page.tsx",
      "app/components/AssetDropdown.tsx",
      "app/fantasy/page.tsx",
      "app/components/ResignPhase.tsx",
      "app/components/OfferSheetPhase.tsx",
    ].map(file => readFileSync(file, "utf8"));

    for (const source of sources) expect(source).toContain("matchesPlayerSearch");
  });
});
