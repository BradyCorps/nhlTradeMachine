import { describe, expect, it } from "vitest";
import { loadLeagueSeed, seedPlayersTable } from "../app/lib/league-seed";

// A minimal fake of the drizzle DB that records inserts/updates, passed straight
// to seedPlayersTable(database) so we never touch a real database.
function makeFakeDb(existing: any[]) {
  const inserted: any[] = [];
  const updated: any[] = [];
  return {
    _inserted: inserted,
    _updated: updated,
    run: async () => undefined,
    select: () => ({ from: () => Promise.resolve(existing) }),
    insert: () => ({
      values: (rows: any) => {
        inserted.push(...(Array.isArray(rows) ? rows : [rows]));
        return { onConflictDoNothing: () => ({ catch: () => Promise.resolve() }) };
      },
    }),
    update: () => ({
      set: (patch: any) => ({
        where: () => {
          updated.push(patch);
          return { catch: () => Promise.resolve() };
        },
      }),
    }),
  } as any;
}

describe("league seed", () => {
  it("ships a committed baseline with curated FA marks (Nyquist as a 2026 UFA)", () => {
    const seed = loadLeagueSeed();
    expect(seed.players.length).toBeGreaterThan(1000);
    const nyquist = seed.players.find((p) => p.id === "gustavnyquist");
    expect(nyquist).toMatchObject({ expiryStatus: "UFA", expiryYear: 2026 });
  });

  it("DATA-01: Korchinski and Del Mastro carry a birthdate and current Group 2 RFA status", () => {
    const seed = loadLeagueSeed();
    const korchinski = seed.players.find((p) => p.id === "kevinkorchinski");
    const delMastro = seed.players.find((p) => p.id === "ethandelmastro");
    expect(korchinski).toMatchObject({ expiryStatus: "RFA", expiryYear: 2026, birthDate: "2004-06-21" });
    expect(delMastro).toMatchObject({ expiryStatus: "RFA", expiryYear: 2026, birthDate: "2003-01-15" });
  });

  it("inserts the full baseline into an empty table", async () => {
    const seed = loadLeagueSeed();
    const fake = makeFakeDb([]);
    const result = await seedPlayersTable(fake);
    expect(result.inserted).toBe(seed.players.length);
    expect(result.total).toBe(seed.players.length);
    // Every inserted row is stamped as seed provenance.
    expect(fake._inserted.every((r: any) => r.source === "seed")).toBe(true);
  });

  it("never clobbers editor-curated rows", async () => {
    const fake = makeFakeDb([{ id: "gustavnyquist", source: "editor", expiryStatus: "RFA" }]);
    const result = await seedPlayersTable(fake);
    expect(result.skipped).toBeGreaterThanOrEqual(1);
    expect(fake._inserted.some((r: any) => r.id === "gustavnyquist")).toBe(false);
    expect(fake._updated.length).toBe(0);
  });

  it("fills a curated FA mark onto a sync row with no expiry, without re-inserting it", async () => {
    const fake = makeFakeDb([{ id: "gustavnyquist", source: "sync", expiryStatus: null }]);
    const result = await seedPlayersTable(fake);
    expect(result.filled).toBe(1);
    expect(fake._inserted.some((r: any) => r.id === "gustavnyquist")).toBe(false);
    expect(fake._updated[0]).toMatchObject({ expiryStatus: "UFA", expiryYear: 2026 });
  });

  it("fills a missing birthdate onto an existing row without overwriting one already set", async () => {
    const fake = makeFakeDb([
      { id: "kevinkorchinski", source: "sync", expiryStatus: "RFA", expiryYear: 2026, birthDate: null },
      { id: "ethandelmastro", source: "editor", expiryStatus: "RFA", expiryYear: 2026, birthDate: "1999-01-01" },
    ]);
    const result = await seedPlayersTable(fake);
    expect(result.filled).toBeGreaterThanOrEqual(1);
    expect(fake._updated.some((u: any) => u.birthDate === "2004-06-21")).toBe(true);
    // Editor row is never touched, so its (deliberately wrong here) birthdate stands.
    expect(fake._updated.some((u: any) => u.birthDate === "2003-01-15")).toBe(false);
  });
});
