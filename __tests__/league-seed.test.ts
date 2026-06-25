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
});
