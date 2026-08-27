import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/app/db/schema";

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
  ensureTeamTable: vi.fn(async () => undefined),
}));

vi.mock("@/app/lib/redis", () => ({ redis: null }));

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

async function seedPlayer({
  id,
  name,
  position = "C",
  capHit = 2,
  yearsRemaining = 2,
  source = "sync",
}: {
  id: string;
  name: string;
  position?: string;
  capHit?: number;
  yearsRemaining?: number;
  source?: string;
}) {
  await client.execute({
    sql: `INSERT INTO players
      (id, name, position, team_id, cap_hit, years_remaining, retired, source)
      VALUES (?, ?, ?, 'WPG', ?, ?, 0, ?)`,
    args: [id, name, position, capHit, yearsRemaining, source],
  });
}

async function put(players: Record<string, Record<string, unknown>>) {
  const { PUT } = await import("../app/api/admin/contracts/route");
  return PUT(new Request("http://localhost/api/admin/contracts", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ players }),
  }));
}

describe("admin contract ingestion counts", () => {
  beforeEach(async () => {
    vi.resetModules();
    state.clearTeamCaches.mockReset();
    state.clearTeamCaches.mockResolvedValue([]);

    databaseDirectory = await mkdtemp(join(tmpdir(), "contracts-ingestion-"));
    client = createClient({ url: `file:${join(databaseDirectory, "test.db")}` });
    state.db = drizzle(client, { schema });

    await client.execute(`CREATE TABLE teams (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phase_override TEXT,
      standing_override INTEGER
    )`);
    await client.execute("INSERT INTO teams (id, name) VALUES ('WPG', 'Winnipeg Jets')");
    await client.execute(`CREATE TABLE players (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      position TEXT NOT NULL,
      secondary_position TEXT,
      team_id TEXT,
      age INTEGER,
      birth_date TEXT,
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
      retired INTEGER DEFAULT 0,
      retired_date TEXT,
      source TEXT DEFAULT 'seed',
      expiry_status TEXT,
      expiry_year INTEGER,
      exclude_from_roster INTEGER DEFAULT 0,
      extension_cap_hit REAL,
      extension_years INTEGER,
      extension_signed_at TEXT
    )`);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    client.close();
    await rm(databaseDirectory, { recursive: true });
  });

  it("counts only the row inserted when two input names resolve to the same player id", async () => {
    const response = await put({
      "Alexis Lafrenière": {
        capHit: 7.45, yearsRemaining: 7, position: "W", teamSlug: "new_york_rangers",
      },
      "Alexis Lafreniere": {
        capHit: 7.45, yearsRemaining: 7, position: "W", teamSlug: "new_york_rangers",
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      ok: true,
      added: 1,
      updated: 0,
      total: 1,
      newEntries: ["Alexis Lafrenière"],
      writeConflicts: ["Alexis Lafreniere — player id alexislafreniere already exists"],
    });
  });

  it("counts and reports an existing row only after the update succeeds", async () => {
    await seedPlayer({ id: "knownplayer", name: "Known Player" });

    const response = await put({
      "Known Player": {
        capHit: 6.25, yearsRemaining: 4, position: "C", teamSlug: "winnipeg_jets",
      },
    });
    const body = await response.json();
    const stored = await client.execute("SELECT cap_hit AS capHit, years_remaining AS yearsRemaining FROM players WHERE id = 'knownplayer'");

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      added: 0,
      updated: 1,
      updatedEntries: ["Known Player"],
      writeConflicts: [],
    });
    expect(stored.rows[0]).toMatchObject({ capHit: 6.25, yearsRemaining: 4 });
  });

  it("does not count an existing row when the update affects nothing", async () => {
    await seedPlayer({ id: "vanishes", name: "Vanishes" });
    await client.execute(`CREATE TRIGGER remove_contract_target
      BEFORE UPDATE OF cap_hit ON players
      WHEN OLD.id = 'vanishes'
      BEGIN
        DELETE FROM players WHERE id = OLD.id;
        SELECT RAISE(IGNORE);
      END`);

    const response = await put({
      Vanishes: {
        capHit: 3.5, yearsRemaining: 3, position: "C", teamSlug: "winnipeg_jets",
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body).toMatchObject({
      added: 0,
      updated: 0,
      updatedEntries: [],
      writeConflicts: ["Vanishes — existing player changed before the contract could be written"],
    });
  });

  it("reports an extension only after its target row is updated", async () => {
    await seedPlayer({ id: "extended", name: "Extended Player" });

    const response = await put({
      "Extended Player": {
        extensionCapHit: 8.5,
        extensionYears: 6,
        extensionSignedAt: "2026-08-01",
        teamSlug: "winnipeg_jets",
      },
    });
    const body = await response.json();
    const stored = await client.execute("SELECT extension_cap_hit AS capHit, extension_years AS years FROM players WHERE id = 'extended'");

    expect(response.status).toBe(200);
    expect(body.extensionsRecorded).toEqual(["Extended Player — $8.5M × 6"]);
    expect(body.writeConflicts).toEqual([]);
    expect(stored.rows[0]).toMatchObject({ capHit: 8.5, years: 6 });
  });

  it("does not count a best-effort position backfill whose write fails", async () => {
    await seedPlayer({ id: "needsposition", name: "Needs Position", position: "Unknown" });
    await client.execute(`CREATE TRIGGER fail_position_backfill
      BEFORE UPDATE OF position ON players
      WHEN OLD.id = 'needsposition'
      BEGIN
        SELECT RAISE(ABORT, 'forced position failure');
      END`);

    const fetchMock = vi.spyOn(globalThis, "fetch").mockImplementation(async (input) => {
      const isWinnipeg = String(input).includes("/WPG/");
      return {
        ok: true,
        json: async () => isWinnipeg ? {
          forwards: [{
            firstName: { default: "Needs" },
            lastName: { default: "Position" },
            positionCode: "C",
          }],
        } : {},
      } as Response;
    });
    const timerMock = vi.spyOn(globalThis, "setTimeout").mockImplementation(((callback: (...args: any[]) => void, _delay?: number, ...args: any[]) => {
      callback(...args);
      return 0 as unknown as ReturnType<typeof setTimeout>;
    }) as typeof setTimeout);

    const response = await put({
      "New Player": {
        capHit: 1.25, yearsRemaining: 2, position: "W", teamSlug: "winnipeg_jets",
      },
    });
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.added).toBe(1);
    expect(body.positionsBackfilled).toBe(0);
    expect(fetchMock).toHaveBeenCalled();
    expect(timerMock).toHaveBeenCalled();
  });
});
