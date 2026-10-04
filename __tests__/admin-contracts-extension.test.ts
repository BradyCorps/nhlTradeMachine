import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as schema from "@/app/db/schema";

// Isolated libSQL file database — never the configured Turso.
const state = vi.hoisted(() => ({ db: null as any }));

vi.mock("@/app/lib/admin-auth", () => ({ requireAdmin: vi.fn(async () => null) }));
vi.mock("@/app/db/ensure-schema", () => ({
  ensurePlayerTable: vi.fn(async () => undefined),
  ensurePlayerColumns: vi.fn(async () => undefined),
  ensureTeamTable: vi.fn(async () => undefined),
}));
vi.mock("@/app/lib/redis", () => ({ redis: null }));
vi.mock("@/app/lib/team-cache", () => ({ clearTeamCaches: vi.fn(async () => []) }));
vi.mock("@/app/lib/trades", () => ({ listPublishedTrades: vi.fn(async () => []) }));
vi.mock("@/app/db/client", () => ({
  db: new Proxy({}, {
    get(_t, property) {
      const value = state.db[property];
      return typeof value === "function" ? value.bind(state.db) : value;
    },
  }),
}));

let client: ReturnType<typeof createClient>;
let dir: string;

const PLAYERS_DDL = `CREATE TABLE players (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, position TEXT NOT NULL, secondary_position TEXT,
  team_id TEXT, age INTEGER, birth_date TEXT, cap_hit REAL NOT NULL, years_remaining INTEGER NOT NULL,
  has_nmc INTEGER DEFAULT 0, has_ntc INTEGER DEFAULT 0, is_ltir INTEGER DEFAULT 0, is_retained INTEGER DEFAULT 0,
  retained_salary REAL DEFAULT 0, draft_year INTEGER, draft_round INTEGER, draft_overall INTEGER,
  prospect_pts_pace REAL, injury_status TEXT, extension_cap_hit REAL, extension_years INTEGER,
  extension_signed_at TEXT, retired INTEGER DEFAULT 0, retired_date TEXT, expiry_status TEXT, expiry_year INTEGER,
  exclude_from_roster INTEGER DEFAULT 0, source TEXT DEFAULT 'seed', term_verified_at TEXT
)`;

async function seed(row: Record<string, unknown>) {
  const r = { team_id: "NJD", position: "C", cap_hit: 3.85, years_remaining: 1, expiry_year: 2027,
    expiry_status: null, has_nmc: 0, source: "editor", ...row };
  const cols = Object.keys(r);
  await client.execute({
    sql: `INSERT INTO players (${cols.join(",")}) VALUES (${cols.map(() => "?").join(",")})`,
    args: Object.values(r) as any,
  });
}
const rowOf = async (id: string) =>
  (await client.execute({ sql: "SELECT * FROM players WHERE id = ?", args: [id] })).rows[0] as any;

async function post(body: Record<string, unknown>) {
  const { POST } = await import("../app/api/admin/contracts/route");
  const res = await POST(new Request("http://localhost/api/admin/contracts", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  }));
  return { status: res.status, body: await res.json() };
}

describe("admin contracts — signed extensions", () => {
  beforeEach(async () => {
    vi.resetModules();
    dir = await mkdtemp(join(tmpdir(), "contracts-ext-"));
    client = createClient({ url: `file:${join(dir, "test.db")}` });
    state.db = drizzle(client, { schema });
    await client.execute("CREATE TABLE teams (id TEXT PRIMARY KEY, name TEXT NOT NULL, phase_override TEXT, standing_override INTEGER)");
    await client.execute("INSERT INTO teams (id, name) VALUES ('NJD','New Jersey Devils'),('PHI','Philadelphia Flyers')");
    await client.execute(PLAYERS_DDL);
    await seed({ id: "p1", name: "Test Skater" });
  });
  afterEach(async () => {
    vi.restoreAllMocks();
    client.close();
    await rm(dir, { recursive: true });
  });

  it("records a six-year $75M extension as $12.5M annual without touching the current contract", async () => {
    const before = await rowOf("p1");
    const r = await post({ id: "p1", name: "Test Skater", extensionCapHit: 12.5, extensionYears: 6, extensionTotalValue: 75 });
    expect(r.status).toBe(200);
    const after = await rowOf("p1");
    expect(after.extension_cap_hit).toBe(12.5);
    expect(after.extension_years).toBe(6);
    for (const k of ["cap_hit", "years_remaining", "expiry_year", "expiry_status", "team_id", "has_nmc", "exclude_from_roster", "position", "term_verified_at"]) {
      expect(after[k]).toEqual(before[k]);
    }
  });

  it("does not stamp today's date: an unknown signing date stays unknown", async () => {
    await post({ id: "p1", name: "Test Skater", extensionCapHit: 12.5, extensionYears: 6 });
    expect((await rowOf("p1")).extension_signed_at).toBeNull();
  });

  it("records an explicit signing date, distinct from the start season", async () => {
    await post({ id: "p1", name: "Test Skater", extensionCapHit: 12.5, extensionYears: 6, extensionSignedAt: "2026-07-29" });
    expect((await rowOf("p1")).extension_signed_at).toBe("2026-07-29");
  });

  it("editing amount or term preserves the signing date", async () => {
    await post({ id: "p1", name: "Test Skater", extensionCapHit: 12.5, extensionYears: 6, extensionSignedAt: "2026-07-29" });
    await post({ id: "p1", name: "Test Skater", extensionCapHit: 13, extensionYears: 7 });
    const row = await rowOf("p1");
    expect([row.extension_cap_hit, row.extension_years, row.extension_signed_at]).toEqual([13, 7, "2026-07-29"]);
  });

  it("an unrelated current-contract save preserves the extension, its date and stored ownership", async () => {
    await post({ id: "p1", name: "Test Skater", extensionCapHit: 12.5, extensionYears: 6, extensionSignedAt: "2026-07-29" });
    // What the form sends for a current-contract correction: no extension fields.
    const r = await post({ id: "p1", name: "Test Skater", yearsRemaining: 1, capHit: 3.9, expiryStatus: null, expiryYear: 2027, excludeFromRoster: false });
    expect(r.status).toBe(200);
    const row = await rowOf("p1");
    expect([row.extension_cap_hit, row.extension_years, row.extension_signed_at, row.team_id]).toEqual([12.5, 6, "2026-07-29", "NJD"]);
    expect(row.cap_hit).toBe(3.9);
  });

  it("a legacy payload that nulls the extension fields cannot wipe a signed deal", async () => {
    await post({ id: "p1", name: "Test Skater", extensionCapHit: 12.5, extensionYears: 6, extensionSignedAt: "2026-07-29" });
    await post({ id: "p1", name: "Test Skater", capHit: 3.9, extensionCapHit: null, extensionYears: null });
    const row = await rowOf("p1");
    expect([row.extension_cap_hit, row.extension_years, row.extension_signed_at]).toEqual([12.5, 6, "2026-07-29"]);
  });

  it("clearing is explicit and also clears the date; it leaves the current contract alone", async () => {
    await post({ id: "p1", name: "Test Skater", extensionCapHit: 12.5, extensionYears: 6, extensionSignedAt: "2026-07-29" });
    const r = await post({ id: "p1", name: "Test Skater", clearExtension: true });
    expect(r.status).toBe(200);
    const row = await rowOf("p1");
    expect([row.extension_cap_hit, row.extension_years, row.extension_signed_at]).toEqual([null, null, null]);
    expect(row.cap_hit).toBe(3.85);
  });

  it("an explicit null date clears it to unknown without touching the amounts", async () => {
    await post({ id: "p1", name: "Test Skater", extensionCapHit: 12.5, extensionYears: 6, extensionSignedAt: "2026-07-29" });
    await post({ id: "p1", name: "Test Skater", extensionSignedAt: null });
    const row = await rowOf("p1");
    expect([row.extension_cap_hit, row.extension_signed_at]).toEqual([12.5, null]);
  });

  it("validates server-side: annual value, term, total agreement, dates, id", async () => {
    const base = { id: "p1", name: "Test Skater" };
    const bad: [Record<string, unknown>, RegExp][] = [
      [{ extensionCapHit: 75, extensionYears: 6 }, /total/i],                       // $75M typed as annual
      [{ extensionCapHit: 12.5, extensionYears: 5.5 }, /whole number/i],
      [{ extensionCapHit: 12.5, extensionYears: 9 }, /between 1 and 8/],
      [{ extensionCapHit: 12.5 }, /extensionYears is required/],
      [{ extensionCapHit: 12.5, extensionYears: 6, extensionTotalValue: 70 }, /does not equal/],
      [{ extensionCapHit: 12.5, extensionYears: 6, extensionSignedAt: "2026-02-30" }, /real calendar date/],
      [{ extensionCapHit: 12.5, extensionYears: 6, extensionSignedAt: "2999-01-01" }, /future/],
    ];
    for (const [extra, message] of bad) {
      const r = await post({ ...base, ...extra });
      expect(r.status, JSON.stringify(extra)).toBe(400);
      expect(r.body.error).toMatch(message);
    }
    expect((await rowOf("p1")).extension_cap_hit).toBeNull();
    // A name-derived id is never trusted for an extension.
    expect((await post({ name: "Test Skater", extensionCapHit: 12.5, extensionYears: 6 })).status).toBe(400);
    // A date needs an extension to belong to.
    expect((await post({ ...base, extensionSignedAt: "2026-07-29" })).status).toBe(400);
  });

  it("accepts a total-only request and stores the computed annual value", async () => {
    const r = await post({ id: "p1", name: "Test Skater", extensionTotalValue: 36.25, extensionYears: 5 });
    expect(r.status).toBe(200);
    expect((await rowOf("p1")).extension_cap_hit).toBe(7.25);
  });

  it("warns, rather than guessing, when the current contract has no expiry year", async () => {
    await seed({ id: "p2", name: "Anchorless", expiry_year: null });
    const r = await post({ id: "p2", name: "Anchorless", extensionCapHit: 7.25, extensionYears: 5 });
    expect(r.status).toBe(200);
    expect(r.body.warnings.join(" ")).toMatch(/expiry year/);
    expect((await rowOf("p2")).expiry_year).toBeNull();
  });

  it("keeps two Elias Petterssons distinct — only the addressed id changes", async () => {
    await seed({ id: "elias-pettersson-c", name: "Elias Pettersson", position: "C", team_id: "NJD", cap_hit: 11.6, years_remaining: 5, expiry_year: 2031 });
    await seed({ id: "elias-pettersson-d", name: "Elias Pettersson", position: "D", team_id: "PHI", cap_hit: 0.95, years_remaining: 1, expiry_year: 2027 });
    const r = await post({ id: "elias-pettersson-d", name: "Elias Pettersson", extensionCapHit: 7.25, extensionYears: 5 });
    expect(r.status).toBe(200);
    expect((await rowOf("elias-pettersson-d")).extension_cap_hit).toBe(7.25);
    expect((await rowOf("elias-pettersson-c")).extension_cap_hit).toBeNull();
    // The id must belong to the player named.
    expect((await post({ id: "elias-pettersson-c", name: "Someone Else", extensionCapHit: 7, extensionYears: 5 })).status).toBe(400);
  });

  it("GET reports the derived timing and the signing date", async () => {
    await post({ id: "p1", name: "Test Skater", extensionCapHit: 12.5, extensionYears: 6, extensionSignedAt: "2026-07-29" });
    const { GET } = await import("../app/api/admin/contracts/route");
    const body = await (await GET(new Request("http://localhost/api/admin/contracts"))).json();
    const row = body.contracts.find((c: any) => c.id === "p1");
    expect(row.extensionSignedAt).toBe("2026-07-29");
    expect(row.extensionTiming).toMatchObject({ state: "PENDING", startSeason: "2027-28", endSeason: "2032-33", remaining: 6 });
  });

  it("paste ingestion without a date keeps the stored one and never stamps today", async () => {
    await post({ id: "p1", name: "Test Skater", extensionCapHit: 12.5, extensionYears: 6, extensionSignedAt: "2026-07-29" });
    const { PUT } = await import("../app/api/admin/contracts/route");
    const put = (players: Record<string, unknown>) => PUT(new Request("http://localhost/api/admin/contracts", {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ players }),
    }));
    await put({ "Test Skater": { teamSlug: "new_jersey_devils", extensionCapHit: 13, extensionYears: 6 } });
    expect((await rowOf("p1")).extension_signed_at).toBe("2026-07-29");
    await seed({ id: "p3", name: "Undated Skater" });
    await put({ "Undated Skater": { teamSlug: "new_jersey_devils", extensionCapHit: 8, extensionYears: 4 } });
    const undated = await rowOf("p3");
    expect([undated.extension_cap_hit, undated.extension_signed_at]).toEqual([8, null]);
  });
});

describe("extension editing — no default signing date, no extension fields on a current-contract save", () => {
  it("source canaries", async () => {
    const route = await readFile(join(process.cwd(), "app/api/admin/contracts/route.ts"), "utf8");
    expect(route).not.toMatch(/extensionSignedAt[^\n]*new Date\(\)/);
    const form = await readFile(join(process.cwd(), "app/admin/contracts/page.tsx"), "utf8");
    const modal = form.slice(form.indexOf("function EditModal"), form.indexOf("function AddPlayerForm"));
    const saveCurrent = modal.slice(modal.indexOf("await onSave({"), modal.indexOf("excludeFromRoster: exclude"));
    expect(saveCurrent).not.toMatch(/extensionCapHit|extensionYears|clearExtension/);
    // Observed-season (stats) selection must not feed contract timing.
    const assembly = await readFile(join(process.cwd(), "app/lib/roster-assembly.ts"), "utf8");
    const call = assembly.slice(assembly.indexOf("= deriveContractStatus({"), assembly.indexOf("if (/ufa/i.test(String(rawExpiryStatus)))"));
    expect(call).not.toMatch(/offseasonYear|observed/i);
  });
});
