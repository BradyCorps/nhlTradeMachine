import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/app/db/schema";
import { SEASON_START_YEAR } from "@/app/lib/contract-expiry";

const state = vi.hoisted(() => ({
  db: null as any,
  clearTeamCaches: vi.fn(),
}));

vi.mock("@/app/lib/admin-auth", () => ({
  requireAdmin: vi.fn(async () => null),
}));

vi.mock("@/app/db/ensure-schema", () => ({
  ensurePlayerTable: vi.fn(async () => undefined),
  ensurePlayerColumns: vi.fn(async () => undefined),
}));

vi.mock("@/app/lib/redis", () => ({ redis: {} }));

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

interface PlayerSeed {
  id: string;
  name?: string;
  yearsRemaining?: number;
  expiryYear?: number | null;
  expiryStatus?: string | null;
  retired?: boolean;
}

async function seedPlayer({
  id,
  name = id,
  yearsRemaining = 2,
  expiryYear = null,
  expiryStatus = null,
  retired = false,
}: PlayerSeed) {
  await client.execute({
    sql: `INSERT INTO players
      (id, name, position, team_id, cap_hit, years_remaining, expiry_year, expiry_status, retired, source)
      VALUES (?, ?, 'C', 'WPG', 5, ?, ?, ?, ?, 'sync')`,
    args: [id, name, yearsRemaining, expiryYear, expiryStatus, retired ? 1 : 0],
  });
}

async function storedTerm(id: string) {
  const result = await client.execute({
    sql: "SELECT expiry_year AS expiryYear, years_remaining AS yearsRemaining FROM players WHERE id = ?",
    args: [id],
  });
  return result.rows[0];
}

async function post(action: "backfill" | "reconcile", dryRun = false) {
  const { POST } = await import("../app/api/admin/contract-terms/route");
  return POST(new Request("http://localhost/api/admin/contract-terms", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, dryRun }),
  }));
}

describe("admin contract-term writes", () => {
  beforeEach(async () => {
    vi.resetModules();
    state.clearTeamCaches.mockReset();
    state.clearTeamCaches.mockResolvedValue(["cache:league:players:v1"]);

    databaseDirectory = await mkdtemp(join(tmpdir(), "contract-term-route-"));
    client = createClient({ url: `file:${join(databaseDirectory, "test.db")}` });
    state.db = drizzle(client, { schema });
    await client.execute(`CREATE TABLE players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      position TEXT NOT NULL,
      team_id TEXT,
      cap_hit REAL NOT NULL,
      years_remaining INTEGER NOT NULL,
      expiry_year INTEGER,
      expiry_status TEXT,
      retired INTEGER DEFAULT 0,
      source TEXT DEFAULT 'seed'
    )`);
  });

  afterEach(async () => {
    client.close();
    await rm(databaseDirectory, { recursive: true });
  });

  it("commits every planned backfill before clearing caches and reporting success", async () => {
    await seedPlayer({ id: "first", yearsRemaining: 2 });
    await seedPlayer({ id: "second", yearsRemaining: 3 });
    state.clearTeamCaches.mockImplementation(async () => {
      expect((await storedTerm("first"))?.expiryYear).toBe(SEASON_START_YEAR + 2);
      expect((await storedTerm("second"))?.expiryYear).toBe(SEASON_START_YEAR + 3);
      return ["cache:league:players:v1"];
    });

    const response = await post("backfill");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      dryRun: false,
      changedCount: 2,
      clearedCacheKeys: ["cache:league:players:v1"],
    });
    expect(body.changed.map((change: { id: string }) => change.id)).toEqual(["first", "second"]);
    expect(state.clearTeamCaches).toHaveBeenCalledOnce();
  });

  it("reconciles a stored term from its anchor", async () => {
    await seedPlayer({
      id: "anchored",
      yearsRemaining: 1,
      expiryYear: SEASON_START_YEAR + 4,
    });

    const response = await post("reconcile");
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.changedCount).toBe(1);
    expect((await storedTerm("anchored"))?.yearsRemaining).toBe(4);
  });

  it("rolls back earlier writes and leaves caches alone when a later update fails", async () => {
    await seedPlayer({ id: "first", yearsRemaining: 2 });
    await seedPlayer({ id: "second", yearsRemaining: 3 });
    await client.execute(`CREATE TRIGGER fail_second_contract_term_update
      BEFORE UPDATE OF expiry_year ON players
      WHEN OLD.id = 'second'
      BEGIN
        SELECT RAISE(ABORT, 'forced contract-term failure');
      END`);

    const response = await post("backfill");
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toContain("second");
    expect((await storedTerm("first"))?.expiryYear).toBeNull();
    expect((await storedTerm("second"))?.expiryYear).toBeNull();
    expect(state.clearTeamCaches).not.toHaveBeenCalled();
  });

  it("fails the whole batch when an update affects no row", async () => {
    await seedPlayer({ id: "vanishes" });
    await client.execute(`CREATE TRIGGER remove_contract_term_target
      BEFORE UPDATE OF expiry_year ON players
      WHEN OLD.id = 'vanishes'
      BEGIN
        DELETE FROM players WHERE id = OLD.id;
        SELECT RAISE(IGNORE);
      END`);

    const response = await post("backfill");
    const body = await response.json();

    expect(response.status).toBe(500);
    expect(body.error).toMatch(/expected to update one player for vanishes; updated 0/);
    expect(await storedTerm("vanishes")).toBeDefined();
    expect(state.clearTeamCaches).not.toHaveBeenCalled();
  });

  it("previews without opening a transaction, writing, or clearing caches", async () => {
    await seedPlayer({ id: "preview", yearsRemaining: 2 });
    const transaction = vi.spyOn(state.db, "transaction");

    const response = await post("backfill", true);
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({ ok: true, dryRun: true, changedCount: 1 });
    expect((await storedTerm("preview"))?.expiryYear).toBeNull();
    expect(transaction).not.toHaveBeenCalled();
    expect(state.clearTeamCaches).not.toHaveBeenCalled();
  });
});
