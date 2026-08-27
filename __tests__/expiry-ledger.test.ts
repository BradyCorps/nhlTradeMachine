import { describe, expect, it } from "vitest";
import { expiryCountsByYear, teamExpiryCountsByYear, type ExpiringPlayerFacts } from "@/app/lib/expiry-ledger";
import { loadLeagueSeed } from "@/app/lib/league-seed";

describe("expiryCountsByYear", () => {
  it("groups by the calendar year rights reach the market, not only this offseason", () => {
    const players: ExpiringPlayerFacts[] = [
      { id: "a", name: "A", teamId: "CHI", expiryStatus: "UFA", expiryYear: 2026 },
      { id: "b", name: "B", teamId: "CHI", expiryStatus: "RFA", expiryYear: 2026 },
      { id: "c", name: "C", teamId: "CHI", expiryStatus: "UFA", expiryYear: 2027 },
    ];
    const counts = expiryCountsByYear(players);
    expect(counts.get(2026)).toMatchObject({ ufa: 1, rfa: 1, total: 2 });
    expect(counts.get(2027)).toMatchObject({ ufa: 1, rfa: 0, total: 1 });
  });

  it("DATA-03: Ian Cole (signed through 2026-27, UFA in 2027) is not an unexplained zero", () => {
    const players: ExpiringPlayerFacts[] = [
      { id: "iancole", name: "Ian Cole", teamId: "CHI", expiryStatus: "UFA", expiryYear: 2027 },
    ];
    const counts = expiryCountsByYear(players);
    expect(counts.get(2027)?.total).toBe(1);
    expect(counts.get(2027)?.players.map((p) => p.name)).toContain("Ian Cole");
  });

  it("ignores players with no known expiry class or year", () => {
    const players: ExpiringPlayerFacts[] = [
      { id: "a", name: "A", expiryStatus: null, expiryYear: null },
      { id: "b", name: "B", expiryStatus: "UFA", expiryYear: null },
      { id: "c", name: "C", expiryStatus: null, expiryYear: 2027 },
    ];
    expect(expiryCountsByYear(players).size).toBe(0);
  });

  it("returns years in ascending order", () => {
    const players: ExpiringPlayerFacts[] = [
      { id: "a", name: "A", expiryStatus: "UFA", expiryYear: 2028 },
      { id: "b", name: "B", expiryStatus: "UFA", expiryYear: 2026 },
      { id: "c", name: "C", expiryStatus: "UFA", expiryYear: 2027 },
    ];
    expect([...expiryCountsByYear(players).keys()]).toEqual([2026, 2027, 2028]);
  });

  it("narrows to one club via teamExpiryCountsByYear", () => {
    const players: ExpiringPlayerFacts[] = [
      { id: "a", name: "A", teamId: "CHI", expiryStatus: "UFA", expiryYear: 2027 },
      { id: "b", name: "B", teamId: "NYR", expiryStatus: "UFA", expiryYear: 2027 },
    ];
    const chi = teamExpiryCountsByYear(players, "CHI");
    expect(chi.get(2027)?.total).toBe(1);
    expect(chi.get(2027)?.players[0].name).toBe("A");
  });

  it("live check: the committed seed carries Ian Cole as a named 2027 UFA", () => {
    const seed = loadLeagueSeed();
    const cole = seed.players.find((p) => p.id === "iancole");
    expect(cole).toMatchObject({ expiryStatus: "UFA", expiryYear: 2027, capHit: 4 });
    const counts = expiryCountsByYear(
      seed.players.map((p) => ({ id: p.id, name: p.name, expiryStatus: p.expiryStatus, expiryYear: p.expiryYear })),
    );
    expect(counts.get(2027)!.players.some((p) => p.name === "Ian Cole")).toBe(true);
  });
});
