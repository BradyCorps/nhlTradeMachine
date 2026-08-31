import { describe, expect, it } from "vitest";
import { loadLeagueSeed, seedPlayersTable } from "../app/lib/league-seed";

// A minimal fake of the drizzle DB that records inserts/updates, passed straight
// to seedPlayersTable(database) so we never touch a real database.
// `eq(playersTable.id, targetId)` embeds `targetId` inside a drizzle `Param`
// query chunk — pull it back out so a test can assert WHICH row's id an
// update actually targeted, not just that some update fired.
function targetIdFromEqCondition(condition: any): string | undefined {
  const param = condition?.queryChunks?.find((c: any) => c?.constructor?.name === "Param");
  return param?.value;
}

function makeFakeDb(existing: any[]) {
  const inserted: any[] = [];
  const updated: { patch: any; targetId: string | undefined }[] = [];
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
        where: (condition: any) => {
          updated.push({ patch, targetId: targetIdFromEqCondition(condition) });
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
    expect(fake._updated[0].patch).toMatchObject({ expiryStatus: "UFA", expiryYear: 2026 });
  });

  it("fills a missing birthdate onto an existing row without overwriting one already set", async () => {
    const fake = makeFakeDb([
      { id: "kevinkorchinski", name: "Kevin Korchinski", source: "sync", expiryStatus: "RFA", expiryYear: 2026, birthDate: null },
      { id: "ethandelmastro", name: "Ethan Del Mastro", source: "editor", expiryStatus: "RFA", expiryYear: 2026, birthDate: "1999-01-01" },
    ]);
    const result = await seedPlayersTable(fake);
    expect(result.filled).toBeGreaterThanOrEqual(1);
    expect(fake._updated.some((u: any) => u.patch.birthDate === "2004-06-21")).toBe(true);
    // Editor row is never touched, so its (deliberately wrong here) birthdate stands.
    expect(fake._updated.some((u: any) => u.patch.birthDate === "2003-01-15")).toBe(false);
  });

  // Live production data (Aug 31, 2026) showed exactly this: Kevin Korchinski
  // and Ian Cole already existed in the players table under their real NHL
  // numeric ids (from a contract sync), not the seed's name-derived id
  // ("kevinkorchinski"/"iancole") — so the DATA-01/03 corrections in the
  // committed seed never reached the row the app actually reads, and
  // `seedPlayersTable` could not fill them no matter how many times it ran.
  describe("DATA-01/03 production regression: a real-id row must still receive the seed correction", () => {
    it("matches by canonical name when the id does not match a live NHL numeric id", async () => {
      const fake = makeFakeDb([
        // Real production shape: numeric NHL id, stale/missing expiry, no birthdate.
        { id: "8483466", name: "Kevin Korchinski", source: "sync", expiryStatus: null, expiryYear: 2029, birthDate: null },
      ]);
      const result = await seedPlayersTable(fake);
      expect(result.filled).toBe(1);
      // Must NOT create a second, duplicate "kevinkorchinski" row alongside
      // the real "8483466" one — every other unmatched seed player still
      // inserts normally since this fake DB is otherwise empty.
      expect(fake._inserted.some((r: any) => r.id === "kevinkorchinski")).toBe(false);
      const update = fake._updated[0];
      expect(update.targetId).toBe("8483466"); // written to the REAL row, not the seed's guessed id
      expect(update.patch).toMatchObject({ expiryStatus: "RFA", expiryYear: 2026, birthDate: "2004-06-21" });
    });

    it("Ian Cole: forceExpiry fills a missing expiryStatus even though the anchor guard would otherwise trust the row's own (correct) future expiryYear", async () => {
      const fake = makeFakeDb([
        { id: "8474013", name: "Ian Cole", source: "sync", expiryStatus: null, expiryYear: 2027, birthDate: null },
      ]);
      const result = await seedPlayersTable(fake);
      expect(result.filled).toBe(1);
      const update = fake._updated[0];
      expect(update.targetId).toBe("8474013");
      expect(update.patch).toMatchObject({ expiryStatus: "UFA", expiryYear: 2027 });
    });

    it("still never touches an editor row reached only by name", async () => {
      const fake = makeFakeDb([
        { id: "8474013", name: "Ian Cole", source: "editor", expiryStatus: null, expiryYear: 2027, birthDate: null },
      ]);
      const result = await seedPlayersTable(fake);
      expect(result.skipped).toBeGreaterThanOrEqual(1);
      expect(fake._updated.length).toBe(0);
      expect(fake._inserted.some((r: any) => r.id === "iancole")).toBe(false);
    });
  });
});
