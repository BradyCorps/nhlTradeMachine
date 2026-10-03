import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { getTableConfig } from "drizzle-orm/sqlite-core";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/app/db/schema";

const state = vi.hoisted(() => ({ db: null as any, authorized: true, invalidate: vi.fn() }));
vi.mock("@/app/db/client", () => ({ db: new Proxy({}, { get(_t, key) { const value = state.db[key]; return typeof value === "function" ? value.bind(state.db) : value; } }) }));
vi.mock("@/app/lib/admin-auth", () => ({ requireAdmin: async () => state.authorized ? null : Response.json({ error: "Unauthorized" }, { status: 401 }) }));
vi.mock("@/app/db/ensure-schema", () => ({ ensurePlayerTable: async () => {}, ensurePlayerColumns: async () => {}, ensureTradeColumns: async () => {}, ensureTeamTable: async () => {} }));
vi.mock("@/app/lib/redis", () => ({ redis: null }));
vi.mock("@/app/lib/team-cache", () => ({ clearTeamCaches: state.invalidate }));
let client: ReturnType<typeof createClient>;
let directory: string;
const request = (body?: object) => new Request("http://localhost/api/admin/contracts", body ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : undefined);

describe("Admin Contracts effective ownership with isolated writes", () => {
  beforeEach(async () => {
    vi.resetModules(); state.authorized = true; state.invalidate.mockReset(); state.invalidate.mockResolvedValue([]);
    directory = await mkdtemp(join(tmpdir(), "effective-contracts-"));
    client = createClient({ url: `file:${join(directory, "test.db")}` });
    state.db = drizzle(client, { schema });
    for (const table of [schema.players, schema.trades, schema.teams]) {
      const config = getTableConfig(table);
      await client.execute(`CREATE TABLE ${config.name} (${config.columns.map(c => `${c.name} ${c.getSQLType()}${c.primary ? " PRIMARY KEY" : ""}`).join(",")})`);
    }
    await state.db.insert(schema.players).values([
      { id: "matthewknies", name: "Matthew Knies", position: "W", teamId: "TOR", capHit: 7.75, yearsRemaining: 5, source: "sync" },
      { id: "eliaspettersson", name: "Elias Pettersson", position: "C", teamId: "VAN", capHit: 11.6, yearsRemaining: 6 },
      { id: "eliaspettersson-d", name: "Elias Pettersson", position: "D", teamId: "VAN", capHit: 1.05, yearsRemaining: 1 },
    ]);
    await state.db.insert(schema.trades).values({ id: "trade-fixture", executedDate: "2026-09-28", season: "2026-27", source: "manual", published: true, rosterMutating: true,
      sides: JSON.stringify([{ teamId: "TOR", assetsGiven: [{ kind: "player", ref: { id: "matthewknies", nameSlug: "matthew-knies" }, inputSnapshot: { name: "Matthew Knies", position: "W", capHit: 7.75 }, retainedPct: 0, navAtTrade: 50 }] }, { teamId: "CBJ", assetsGiven: [] }]) });
  });
  afterEach(async () => { client.close(); await rm(directory, { recursive: true }); });
  it("returns effective and stored teams, retains same-name identities, and does not write on read", async () => {
    const { GET } = await import("@/app/api/admin/contracts/route");
    const before = await state.db.select().from(schema.players);
    const body = await (await GET(request())).json();
    expect(body.contracts.find((r: any) => r.id === "matthewknies")).toMatchObject({ team: "CBJ", storedTeam: "TOR", ownershipTradeId: "trade-fixture" });
    expect(body.contracts.filter((r: any) => r.name === "Elias Pettersson")).toHaveLength(2);
    expect(await state.db.select().from(schema.players)).toEqual(before);
    expect(state.invalidate).not.toHaveBeenCalled();
  });
  it("saves an unrelated field without persisting effective ownership or changing frozen trade evidence", async () => {
    const { POST, GET } = await import("@/app/api/admin/contracts/route");
    const tradeBefore = await state.db.select().from(schema.trades);
    expect((await POST(request({ id: "matthewknies", name: "Matthew Knies", hasNMC: true }))).status).toBe(200);
    const stored = (await state.db.select().from(schema.players)).find((r: any) => r.id === "matthewknies");
    expect(stored).toMatchObject({ teamId: "TOR", hasNmc: true, capHit: 7.75 });
    expect((await (await GET(request())).json()).contracts.find((r: any) => r.id === "matthewknies").team).toBe("CBJ");
    expect(await state.db.select().from(schema.trades)).toEqual(tradeBefore);
    expect(state.invalidate).toHaveBeenCalledOnce();
  });
  it("edits the defender by stable row id rather than the shared name", async () => {
    const { POST } = await import("@/app/api/admin/contracts/route");
    expect((await POST(request({ id: "eliaspettersson-d", name: "Elias Pettersson", hasNTC: true }))).status).toBe(200);
    const rows = await state.db.select().from(schema.players);
    expect(rows.find((r: any) => r.id === "eliaspettersson-d").hasNtc).toBe(true);
    expect(rows.find((r: any) => r.id === "eliaspettersson").hasNtc).toBe(false);
  });
  it("rejects authorization without writes", async () => {
    state.authorized = false;
    const { POST, GET } = await import("@/app/api/admin/contracts/route");
    const before = await state.db.select().from(schema.players);
    expect((await POST(request({ name: "Matthew Knies", capHit: 9 }))).status).toBe(401);
    expect((await GET(request())).status).toBe(401);
    expect(await state.db.select().from(schema.players)).toEqual(before);
    expect(state.invalidate).not.toHaveBeenCalled();
  });
});
