import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/app/db/schema";
import { SEASON } from "@/app/lib/season-config";

const state = vi.hoisted(() => ({
  db: null as any,
  clearTeamCaches: vi.fn(),
  redisDel: vi.fn(),
}));

vi.mock("@/app/lib/admin-auth", () => ({
  requireAdmin: vi.fn(async () => null),
}));

vi.mock("@/app/db/ensure-schema", () => ({
  ensurePlayerTable: vi.fn(async () => undefined),
  ensurePlayerColumns: vi.fn(async () => undefined),
}));

vi.mock("@/app/lib/redis", () => ({
  redis: { del: state.redisDel },
}));

vi.mock("@/app/lib/team-cache", () => ({
  clearTeamCaches: state.clearTeamCaches,
}));

vi.mock("@/app/db/client", () => ({
  db: new Proxy({}, {
    get(_target, property) {
      const value = state.db[property];
      return typeof value === "function" ? value.bind(state.db) : value;
    },
  }),
}));

let client: ReturnType<typeof createClient>;
let databaseDirectory: string;

async function seedPlayer(id: string, name: string) {
  await client.execute({
    sql: `INSERT INTO players
      (id, name, position, cap_hit, years_remaining, retired, expiry_status, expiry_year, exclude_from_roster, source)
      VALUES (?, ?, 'C', 2, 2, 0, null, null, 0, 'sync')`,
    args: [id, name],
  });
}

async function storedPlayer(id: string) {
  const result = await client.execute({
    sql: `SELECT expiry_status AS expiryStatus, expiry_year AS expiryYear,
      exclude_from_roster AS excluded, source, cap_hit AS capHit,
      years_remaining AS yearsRemaining FROM players WHERE id = ?`,
    args: [id],
  });
  return result.rows[0];
}

async function post(names: string[] | string, status: "UFA" | "RFA" | "SIGNED" | "EXCLUDE") {
  const { POST } = await import("../app/api/admin/fa-bulk/route");
  return POST(new Request("http://localhost/api/admin/fa-bulk", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ names, status }),
  }));
}

describe("admin bulk free-agent writes", () => {
  beforeEach(async () => {
    vi.resetModules();
    state.clearTeamCaches.mockReset();
    state.clearTeamCaches.mockResolvedValue(["cache:league:players:v1"]);
    state.redisDel.mockReset();
    state.redisDel.mockResolvedValue(1);

    databaseDirectory = await mkdtemp(join(tmpdir(), "fa-bulk-route-"));
    client = createClient({ url: `file:${join(databaseDirectory, "test.db")}` });
    state.db = drizzle(client, { schema });
    await client.execute(`CREATE TABLE players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      position TEXT NOT NULL,
      secondary_position TEXT,
      team_id TEXT,
      age INTEGER,
      cap_hit REAL NOT NULL,
      years_remaining INTEGER NOT NULL,
      has_nmc INTEGER DEFAULT 0,
      has_ntc INTEGER DEFAULT 0,
      is_ltir INTEGER DEFAULT 0,
      is_retained INTEGER DEFAULT 0,
      retained_salary REAL DEFAULT 0,
      draft_year INTEGER,
      draft_round INTEGER,
      draft_overall INTEGER,
      prospect_pts_pace REAL,
      injury_status TEXT,
      extension_cap_hit REAL,
      extension_years INTEGER,
      extension_signed_at TEXT,
      retired INTEGER DEFAULT 0,
      retired_date TEXT,
      expiry_status TEXT,
      expiry_year INTEGER,
      exclude_from_roster INTEGER DEFAULT 0,
      source TEXT DEFAULT 'seed'
    )`);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    client.close();
    await rm(databaseDirectory, { recursive: true });
  });

  it("commits one update and one insert before clearing caches", async () => {
    await seedPlayer("existingplayer", "Existing Player");
    const offseasonYear = Number(SEASON.label.slice(0, 4));
    state.clearTeamCaches.mockImplementation(async () => {
      expect(await storedPlayer("existingplayer")).toMatchObject({
        expiryStatus: "UFA", expiryYear: offseasonYear, source: "editor",
      });
      expect(await storedPlayer("newplayer")).toMatchObject({
        expiryStatus: "UFA", expiryYear: offseasonYear, source: "editor",
        capHit: 0, yearsRemaining: 0,
      });
      return ["cache:league:players:v1"];
    });

    const response = await post(["Existing Player", "New Player"], "UFA");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      status: "UFA",
      updated: 1,
      created: 1,
      total: 2,
      submitted: 2,
      skipped: [],
    });
    expect(state.clearTeamCaches).toHaveBeenCalledOnce();
    expect(state.redisDel).toHaveBeenCalledTimes(2);
  });

  it("deduplicates names that collapse to the same player identity", async () => {
    const response = await post([
      "Alexis Lafrenière",
      "Alexis Lafreniere",
      "Alexis Lafreniere",
    ], "SIGNED");
    const body = await response.json();
    const rows = await client.execute("SELECT id, name FROM players");

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      updated: 0,
      created: 1,
      total: 1,
      submitted: 3,
      skipped: [
        "Alexis Lafreniere — same player as Alexis Lafrenière",
        "Alexis Lafreniere — same player as Alexis Lafrenière",
      ],
    });
    expect(rows.rows).toHaveLength(1);
  });

  it("rolls back an earlier update when a later insert fails", async () => {
    await seedPlayer("first", "First");
    await client.execute(`CREATE TRIGGER fail_second_fa_write
      BEFORE INSERT ON players
      WHEN NEW.id = 'second'
      BEGIN
        SELECT RAISE(ABORT, 'forced FA write failure');
      END`);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await post(["First", "Second"], "RFA");
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain("second");
    expect(await storedPlayer("first")).toMatchObject({
      expiryStatus: null, expiryYear: null, source: "sync",
    });
    expect(await storedPlayer("second")).toBeUndefined();
    expect(state.clearTeamCaches).not.toHaveBeenCalled();
    expect(state.redisDel).not.toHaveBeenCalled();
  });

  it("rolls back and fails when an update affects no row", async () => {
    await seedPlayer("vanishes", "Vanishes");
    await client.execute(`CREATE TRIGGER remove_fa_target
      BEFORE UPDATE OF exclude_from_roster ON players
      WHEN OLD.id = 'vanishes'
      BEGIN
        DELETE FROM players WHERE id = OLD.id;
        SELECT RAISE(IGNORE);
      END`);
    vi.spyOn(console, "error").mockImplementation(() => {});

    const response = await post("Vanishes", "EXCLUDE");
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/expected to update one player for vanishes; updated 0/);
    expect(await storedPlayer("vanishes")).toMatchObject({ excluded: 0, source: "sync" });
    expect(state.clearTeamCaches).not.toHaveBeenCalled();
    expect(state.redisDel).not.toHaveBeenCalled();
  });

  it("rejects names that cannot produce a player identity before opening a transaction", async () => {
    const transaction = vi.spyOn(state.db, "transaction");

    const response = await post(["!!!", "---"], "UFA");
    const body = await response.json();

    expect(response.status).toBe(400);
    expect(body.error).toBe("Provide at least one valid player name");
    expect(transaction).not.toHaveBeenCalled();
    expect(state.clearTeamCaches).not.toHaveBeenCalled();
    expect(state.redisDel).not.toHaveBeenCalled();
  });
});
