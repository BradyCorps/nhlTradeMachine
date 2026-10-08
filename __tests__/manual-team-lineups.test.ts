import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextResponse } from "next/server";
import * as schema from "@/app/db/schema";
import { emptyManualLineup, manualLineupSchema, validateLineupPlayers } from "@/app/lib/manual-team-lineups";

const state = vi.hoisted(() => ({ db: null as any, authorized: true, touches: vi.fn(), roster: vi.fn() }));
vi.mock("@/app/db/client", () => ({ db: new Proxy({}, { get(_target, property) {
  state.touches();
  const value = state.db[property];
  return typeof value === "function" ? value.bind(state.db) : value;
} }) }));
vi.mock("@/app/lib/admin-auth", () => ({ requireAdmin: async () => state.authorized ? null : NextResponse.json({ error: "Unauthorized" }, { status: 401 }) }));
vi.mock("@/app/lib/cached-roster", () => ({ getCachedRoster: state.roster }));

const selection = { season: "20262027", gameType: 2 } as const;
const roster = [
  { id: "8486025", name: "Viggo Björck", position: "C", teamId: "WPG" },
  { id: "8483532", name: "Clay Stevenson", position: "G", teamId: "WPG" },
  { id: "8477504", name: "Josh Morrissey", position: "D", teamId: "WPG" },
  { id: "other", name: "Other team player", position: "W", teamId: "COL" },
];
function input() {
  const lineup = emptyManualLineup("WPG", selection, "2026-10-08");
  lineup.forwards[1][1] = "8486025";
  lineup.goalies[1] = "8483532";
  lineup.defense[0][0] = "8477504";
  return lineup;
}

describe("manual lineup validation", () => {
  it("allows a rookie at second-line center independently of model rank", () => {
    const lineup = manualLineupSchema.parse(input());
    expect(() => validateLineupPlayers(lineup, roster)).not.toThrow();
    expect(lineup.forwards[1][1]).toBe("8486025");
  });
  it.each(["duplicate", "wrong-team", "wrong-position", "excluded", "scratch-duplicate"])("rejects %s selections", kind => {
    const lineup = input();
    if (kind === "duplicate") lineup.forwards[0][0] = "8486025";
    if (kind === "wrong-team") lineup.forwards[0][0] = "other";
    if (kind === "wrong-position") lineup.forwards[0][0] = "8483532";
    if (kind === "excluded") lineup.forwards[0][0] = "8476945";
    if (kind === "scratch-duplicate") lineup.scratches = ["8486025"];
    expect(() => validateLineupPlayers(lineup, roster)).toThrow();
  });
  it("rejects empty, oversized, unsafe-source and invalid-date inputs", () => {
    expect(() => validateLineupPlayers(emptyManualLineup("WPG", selection, "2026-10-08"), roster)).toThrow();
    expect(manualLineupSchema.safeParse({ ...input(), sourceUrl: "javascript:alert(1)" }).success).toBe(false);
    expect(manualLineupSchema.safeParse({ ...input(), asOfDate: "2026-02-30" }).success).toBe(false);
    expect(manualLineupSchema.safeParse({ ...input(), forwards: [...input().forwards, [null, null, null]] }).success).toBe(false);
    expect(manualLineupSchema.safeParse({ ...input(), updatedAt: "forged" }).success).toBe(false);
  });
});

describe("manual lineup routes and isolated storage", () => {
  let client: ReturnType<typeof createClient>;
  let directory: string;
  beforeEach(async () => {
    state.authorized = true;
    state.touches.mockClear();
    state.roster.mockReset();
    state.roster.mockResolvedValue({ value: { players: roster } });
    directory = await mkdtemp(join(tmpdir(), "manual-lineups-"));
    client = createClient({ url: `file:${join(directory, "test.db")}` });
    state.db = drizzle(client, { schema });
    await client.execute("CREATE TABLE site_settings (key TEXT PRIMARY KEY, value TEXT NOT NULL)");
    await client.execute("INSERT INTO site_settings VALUES ('cap_ceiling', '104'), ('protected:history', 'unchanged')");
  });
  afterEach(async () => { client.close(); await rm(directory, { recursive: true }); });

  async function save(lineup = input(), expectedRevision: string | null = null) {
    const { POST } = await import("@/app/api/admin/team-lineups/route");
    return POST(new Request("http://localhost/api/admin/team-lineups", { method: "POST", body: JSON.stringify({ lineup, expectedRevision }) }));
  }
  async function get(query = "team=WPG&season=20262027&gameType=2") {
    const { GET } = await import("@/app/api/team-lineups/route");
    return GET(new Request(`http://localhost/api/team-lineups?${query}`));
  }
  async function remove(expectedRevision: string) {
    const { DELETE } = await import("@/app/api/admin/team-lineups/route");
    return DELETE(new Request("http://localhost/api/admin/team-lineups", { method: "DELETE", body: JSON.stringify({ teamId: "WPG", ...selection, expectedRevision }) }));
  }

  it("rejects unauthorized reads, saves and removals before roster or DB work", async () => {
    state.authorized = false;
    const { GET, POST, DELETE } = await import("@/app/api/admin/team-lineups/route");
    for (const handler of [GET, POST, DELETE]) {
      const response = await handler(new Request("http://localhost/api/admin/team-lineups"));
      expect(response.status).toBe(401);
    }
    expect(state.touches).not.toHaveBeenCalled();
    expect(state.roster).not.toHaveBeenCalled();
  });
  it("creates and reads a manual lineup, retaining partial slots and player identity", async () => {
    const response = await save();
    expect(response.status).toBe(200);
    const saved = (await response.json()).lineup;
    expect(saved).toMatchObject(input());
    expect(saved.revision).toMatch(/^[a-f0-9-]{36}$/);
    const read = await get();
    expect(read.headers.get("Cache-Control")).toBe("no-store");
    expect((await read.json()).lineup).toEqual(saved);
    const { GET } = await import("@/app/api/admin/team-lineups/route");
    const admin = await GET(new Request("http://localhost/api/admin/team-lineups?team=WPG"));
    expect((await admin.json()).players.map((p: any) => p.id)).toEqual(["8486025", "8483532", "8477504"]);
  });
  it("isolates teams, seasons and competitions and never changes other settings", async () => {
    await save();
    for (const query of ["team=COL", "team=WPG&season=20252026", "team=WPG&gameType=3"]) {
      expect((await (await get(query)).json()).lineup).toBeNull();
    }
    const rows = await client.execute("SELECT * FROM site_settings WHERE key NOT LIKE 'manual-lineup:%' ORDER BY key");
    expect(rows.rows.map(row => [row.key, row.value])).toEqual([["cap_ceiling", "104"], ["protected:history", "unchanged"]]);
  });
  it("rejects invalid or duplicate selections without storing a record", async () => {
    const lineup = input(); lineup.scratches = ["8486025"];
    expect((await save(lineup)).status).toBe(400);
    expect((await (await get()).json()).lineup).toBeNull();
  });
  it("rejects stale writes and duplicate retries while retaining the saved original", async () => {
    const original = (await (await save()).json()).lineup;
    const changed = input(); changed.source = "New report";
    expect((await save(changed)).status).toBe(409);
    expect((await (await get()).json()).lineup).toEqual(original);
    expect((await save(changed, original.revision)).status).toBe(200);
    expect((await save(changed, original.revision)).status).toBe(409);
    expect((await client.execute("SELECT key FROM site_settings WHERE key LIKE 'manual-lineup:%'")).rows).toHaveLength(1);
  });
  it("allows only one competing update and protects against stale removal", async () => {
    const original = (await (await save()).json()).lineup;
    const first = input(); first.source = "First editor";
    const second = input(); second.source = "Second editor";
    const responses = await Promise.all([save(first, original.revision), save(second, original.revision)]);
    expect(responses.map(r => r.status).sort()).toEqual([200, 409]);
    expect((await remove(original.revision)).status).toBe(409);
    const current = (await (await get()).json()).lineup;
    expect((await remove(current.revision)).status).toBe(200);
    expect((await (await get()).json()).lineup).toBeNull();
  });
  it("distinguishes unavailable storage from a missing manual lineup", async () => {
    await client.execute("INSERT INTO site_settings VALUES ('manual-lineup:v1:20262027:2:WPG', 'broken JSON')");
    const response = await get();
    expect(response.status).toBe(503);
    expect((await response.json()).error).toBe("Manual lineup is unavailable");
  });
  it("rejects stored identity mismatches and ambiguous public selections", async () => {
    await save();
    await client.execute("UPDATE site_settings SET value = replace(value, 'WPG', 'COL') WHERE key LIKE 'manual-lineup:%'");
    expect((await get()).status).toBe(503);
    expect((await get("team=WPG&team=COL")).status).toBe(400);
    expect((await get("team=WPG&season=20262027&season=20252026")).status).toBe(400);
  });
});
