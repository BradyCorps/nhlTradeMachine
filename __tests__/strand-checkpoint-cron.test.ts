import { createClient, type Client } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { readMigrationFiles } from "drizzle-orm/migrator";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ensureNhlSnapshotTable } from "../app/db/ensure-schema";
import * as schema from "../app/db/schema";
import { runStrandCheckpointCapture, MAX_WRITES, BUDGET_MS } from "../app/lib/strand-checkpoint-cron.server";
import { captureStrandCheckpoints, readStoredCheckpoints } from "../app/lib/strand-checkpoints.server";
import { checkpointBudget, CheckpointBudgetExceeded } from "../app/lib/strand-checkpoint-budget.server";
import { captureGoalieEdgeDetail } from "../app/lib/goalie-edge";

// Isolated database + injected NHL summary. Nothing here touches the network or Production.
const SEASON = "20262027";
const migration = readMigrationFiles({ migrationsFolder: "drizzle" }).find(m => m.sql.join("").includes("strand_checkpoints"))!;
const holder: { db: any; client: Client } = { db: null, client: null as any };

vi.mock("@/app/db/client", () => ({ get db() { return holder.db; } }));
vi.mock("@/app/lib/admin-auth", () => ({ isAuthorized: vi.fn(async () => false) }));
vi.mock("@/app/lib/nhl-feed-capture", () => ({
  rosterPlayerIds: vi.fn(async () => []),
  capturePlayerSnapshots: vi.fn(async () => ({ requested: 0, landingStored: 0, edgeStored: 0, failures: [], day: "" })),
}));
vi.mock("@/app/lib/goalie-edge", () => ({ captureGoalieEdgeBoards: vi.fn(async () => ({ ok: true })), captureGoalieEdgeDetail: vi.fn(async () => ({ ok: true })) }));
vi.mock("@/app/lib/nhl-active-players", () => ({ activeGoalieIdsForTeams: vi.fn(() => []) }));
const summaryMock = vi.hoisted(() => ({ read: vi.fn() }));
vi.mock("@/app/lib/observed-stats.server", () => ({ readObservedSummary: summaryMock.read }));

const row = (playerId: number, gp: number, points: number, pos = "C") =>
  ({ playerId, positionCode: pos, gamesPlayed: gp, points, timeOnIcePerGame: 1080 + playerId });
const league = (gp: number, n = 25) => [row(100, gp, 6), ...Array.from({ length: n - 1 }, (_, i) => row(200 + i, gp, 2 + i % 9))];
const available = (rows: any[]) => ({ selection: { season: SEASON, gameType: 2 }, coverage: "available", rows, source: "test", retrievedAt: 5_000 });
const edge = (gp: number) => ({ player: { id: 1, gamesPlayed: gp }, sogSummary: [{ locationCode: "all", shots: 30 }, { locationCode: "high", shots: 8 }], zoneTimeDetails: { offensiveZonePctg: 0.5, defensiveZonePctg: 0.3 } });
const count = async (t = "strand_checkpoints") => Number((await holder.client.execute(`SELECT COUNT(*) AS n FROM ${t}`)).rows[0].n);
const ON = { STRAND_CHECKPOINT_CAPTURE: "1" };
const noEdge = async () => new Map();

beforeEach(async () => {
  holder.client = createClient({ url: `file:/tmp/strand-cron-${crypto.randomUUID()}.db` });
  holder.db = drizzle(holder.client, { schema });
  for (const s of migration.sql) await holder.client.execute(s);
  await ensureNhlSnapshotTable(holder.db);
  summaryMock.read.mockReset();
});
afterEach(() => { vi.useRealTimers(); vi.restoreAllMocks(); vi.unstubAllEnvs(); });

describe("checkpoint stage", () => {
  it("is off unless explicitly enabled, and then touches neither upstream nor database", async () => {
    const readSummary = vi.fn();
    const out = await runStrandCheckpointCapture({ db: holder.db, env: {}, readSummary: readSummary as any });
    expect(out).toEqual({ status: "disabled" });
    expect(readSummary).not.toHaveBeenCalled();
    expect(await count()).toBe(0);
  });

  it("makes exactly one shared summary request and none per player", async () => {
    const readSummary = vi.fn(async () => available(league(12)));
    const out = await runStrandCheckpointCapture({ db: holder.db, env: ON, readSummary: readSummary as any, readEdge: noEdge as any });
    expect(readSummary).toHaveBeenCalledTimes(1);
    expect(out).toMatchObject({ status: "ok", report: { considered: 25, inserted: 25 } });
  });

  it("is idle outside every window: no EDGE table read, no writes", async () => {
    const readEdge = vi.fn(noEdge);
    const out = await runStrandCheckpointCapture({ db: holder.db, env: ON, readSummary: (async () => available(league(17))) as any, readEdge: readEdge as any });
    expect(out).toMatchObject({ status: "ok", idle: true });
    expect(readEdge).not.toHaveBeenCalled();
    expect(await count()).toBe(0);
  });

  it("duplicate retries add nothing", async () => {
    const readSummary = vi.fn(async () => available(league(12)));
    const run = () => runStrandCheckpointCapture({ db: holder.db, env: ON, readSummary: readSummary as any, readEdge: noEdge as any });
    await run();
    const again = await run();
    expect(again.report).toMatchObject({ inserted: 0, unchanged: 25 });
    expect(await count()).toBe(25);
    expect(await count("strand_reference_cohorts")).toBe(1);
  });

  it("records a source correction as a new revision and keeps the original", async () => {
    const run = (rows: any[]) => runStrandCheckpointCapture({ db: holder.db, env: ON, readSummary: (async () => available(rows)) as any, readEdge: noEdge as any });
    await run(league(12));
    const corrected = league(12).map(r => r.playerId === 100 ? { ...r, points: 7 } : r);
    const out = await run(corrected);
    expect(out.report).toMatchObject({ corrected: 1, inserted: 0 });
    expect(await count()).toBe(26);
    const stored = await readStoredCheckpoints(holder.db, 100, SEASON, 2);
    expect(stored.map(s => s.revision).sort()).toEqual([0, 1]);
  });

  it("respects milestone windows: no row outside them, and a later GP is not the same milestone", async () => {
    const run = (gp: number) => runStrandCheckpointCapture({ db: holder.db, env: ON, readSummary: (async () => available(league(gp))) as any, readEdge: noEdge as any });
    expect((await run(9)).report?.inserted).toBe(0);
    expect((await run(17)).report?.inserted).toBe(0);
    expect((await run(11)).report?.inserted).toBe(25);
    expect((await run(14)).report?.inserted).toBe(0);
    expect(await count()).toBe(25);
  });

  it("bounds writes per run and finishes the rest on the next run without duplicates", async () => {
    const big = league(12, MAX_WRITES + 50);
    const run = () => runStrandCheckpointCapture({ db: holder.db, env: ON, readSummary: (async () => available(big)) as any, readEdge: noEdge as any });
    const first = await run();
    expect(first.report).toMatchObject({ inserted: MAX_WRITES, deferred: 50 });
    const second = await run();
    expect(second.report).toMatchObject({ inserted: 50, unchanged: MAX_WRITES, deferred: 0 });
    expect(await count()).toBe(MAX_WRITES + 50);
  });

  it("captures deferred players before repeated earlier corrections, regardless of source order", async () => {
    const big = league(12, MAX_WRITES + 1);
    const run = (rows: any[]) => runStrandCheckpointCapture({ db: holder.db, env: ON, readSummary: (async () => available(rows)) as any, readEdge: noEdge as any });
    expect((await run(big)).report).toMatchObject({ inserted: MAX_WRITES, deferred: 1 });
    const deferredId = big[big.length - 1].playerId;
    for (let revision = 1; revision <= 3; revision++) {
      const corrected = big.map(r => r.playerId === deferredId ? r : { ...r, points: r.points + revision });
      const result = await run(corrected.reverse());
      if (revision === 1) expect(result.report).toMatchObject({ inserted: 1, corrected: MAX_WRITES - 1, deferred: 1 });
      expect(await readStoredCheckpoints(holder.db, deferredId, SEASON, 2)).toHaveLength(1);
    }
  }, 15_000);

  it("prioritizes a window near expiry over an earlier source row", async () => {
    const report = await captureStrandCheckpoints(holder.db, {
      season: SEASON, gameType: 2, summaryRows: [row(100, 10, 6), row(200, 15, 6)],
      summaryRetrievedAt: 5_000, edgeByPlayer: new Map(), now: Date.now(), maxWrites: 1,
    });
    expect(report).toMatchObject({ inserted: 1, deferred: 1 });
    expect(await readStoredCheckpoints(holder.db, 200, SEASON, 2)).toHaveLength(1);
    expect(await readStoredCheckpoints(holder.db, 100, SEASON, 2)).toHaveLength(0);
  });

  it("skips all checkpoint work when the enclosing route budget is already exhausted", async () => {
    const readSummary = vi.fn();
    const out = await runStrandCheckpointCapture({ db: holder.db, env: ON, now: () => 100, deadlineMs: 100, readSummary: readSummary as any });
    expect(out.status).toBe("budget-exhausted");
    expect(readSummary).not.toHaveBeenCalled();
  });

  it.each(["summary", "edge", "checkpoint-read"])("bounds a hanging %s read without starting later work", async stage => {
    vi.useFakeTimers();
    let release!: (value: any) => void;
    const hanging = new Promise<any>(resolve => { release = resolve; });
    const readSummary = vi.fn(() => stage === "summary" ? hanging : Promise.resolve(available(league(12))));
    const readEdge = vi.fn(() => stage === "edge" ? hanging : Promise.resolve(new Map()));
    const insert = vi.spyOn(holder.db, "insert");
    if (stage === "checkpoint-read") vi.spyOn(holder.db, "select").mockReturnValue({ from: () => ({ where: () => hanging }) });
    const result = runStrandCheckpointCapture({ db: holder.db, env: ON, readSummary: readSummary as any, readEdge: readEdge as any });
    await vi.advanceTimersByTimeAsync(BUDGET_MS);
    expect((await result).status).toBe("budget-exhausted");
    release(stage === "summary" ? available(league(12)) : stage === "edge" ? new Map() : []);
    await vi.advanceTimersByTimeAsync(1);
    expect(insert).not.toHaveBeenCalled();
    if (stage === "summary") expect(readEdge).not.toHaveBeenCalled();
  });

  it("does not start a checkpoint write when the cohort insert crosses the deadline", async () => {
    let clock = 0;
    const realInsert = holder.db.insert.bind(holder.db);
    const insert = vi.spyOn(holder.db, "insert").mockImplementation((table: any) => ({
      values: (values: any) => ({ onConflictDoNothing: () => ({ returning: async (fields: any) => {
        const result = await realInsert(table).values(values).onConflictDoNothing().returning(fields);
        clock = 10_000;
        return result;
      } }) }),
    }));
    const out = await runStrandCheckpointCapture({ db: holder.db, env: ON, now: () => clock, deadlineMs: 10_000,
      readSummary: (async () => available(league(12))) as any, readEdge: noEdge as any });
    expect(out.status).toBe("budget-exhausted");
    expect(insert).toHaveBeenCalledTimes(1);
    expect(await count("strand_reference_cohorts")).toBe(1);
    expect(await count()).toBe(0);
  });

  it("reports a timed-out checkpoint write, starts no more writes, and safely retries a late commit", async () => {
    vi.useFakeTimers();
    const realInsert = holder.db.insert.bind(holder.db);
    let release!: () => void;
    let started!: () => void;
    const writeStarted = new Promise<void>(resolve => { started = resolve; });
    const pendingWrite = new Promise<void>(resolve => { release = resolve; });
    const insert = vi.spyOn(holder.db, "insert").mockImplementation((table: any) => {
      if (table !== schema.strandCheckpoints) return realInsert(table);
      return { values: (values: any) => ({ onConflictDoNothing: () => ({ returning: async (fields: any) => {
        started();
        await pendingWrite;
        return realInsert(table).values(values).onConflictDoNothing().returning(fields);
      } }) }) };
    });
    const run = () => runStrandCheckpointCapture({ db: holder.db, env: ON,
      readSummary: (async () => available(league(12, 2))) as any, readEdge: noEdge as any });
    const first = run();
    await writeStarted;
    await vi.advanceTimersByTimeAsync(BUDGET_MS);
    expect((await first).status).toBe("budget-exhausted");
    expect(insert).toHaveBeenCalledTimes(2); // one cohort, one checkpoint
    release();
    vi.useRealTimers();
    // Wait for the simulated remote commit, rather than assuming timeout cancelled it.
    await vi.waitFor(async () => { expect(await count()).toBe(1); });
    expect(insert).toHaveBeenCalledTimes(2);
    insert.mockRestore();
    expect((await run()).report).toMatchObject({ inserted: 1, unchanged: 1, deferred: 0 });
    expect(await count()).toBe(2);
  });

  it("rejects operations after expiry without starting them", async () => {
    let clock = 0;
    const budget = checkpointBudget(100, () => clock);
    clock = 100;
    const operation = vi.fn(async () => 1);
    await expect(budget.run(operation)).rejects.toBeInstanceOf(CheckpointBudgetExceeded);
    expect(operation).not.toHaveBeenCalled();
  });

  it("dry run counts and writes nothing", async () => {
    const out = await runStrandCheckpointCapture({ db: holder.db, env: ON, dryRun: true, readSummary: (async () => available(league(12))) as any, readEdge: noEdge as any });
    expect(out).toMatchObject({ status: "ok", dryRun: true, report: { inserted: 25 } });
    expect(await count()).toBe(0);
    expect(await count("strand_reference_cohorts")).toBe(0);
  });

  it("supports an authenticated route dry run while capture stays disabled", async () => {
    vi.stubEnv("CRON_SECRET", "s3cret");
    vi.stubEnv("STRAND_CHECKPOINT_CAPTURE", "0");
    summaryMock.read.mockResolvedValue(available(league(12)));
    const { GET } = await import("../app/api/cron/nhl-feed/route");
    const url = "http://x/api/cron/nhl-feed?only=strand&strandDryRun=1";
    expect((await GET(new Request(url))).status).toBe(401);
    expect(summaryMock.read).not.toHaveBeenCalled();
    const res = await GET(new Request(url, { headers: { authorization: "Bearer s3cret" } }));
    expect(await res.json()).toMatchObject({ only: "strand", strandCheckpoints: { status: "ok", dryRun: true, report: { inserted: 25 } } });
    expect(await count()).toBe(0);
    expect(await count("strand_reference_cohorts")).toBe(0);
    summaryMock.read.mockClear();
    const off = await GET(new Request("http://x/api/cron/nhl-feed?only=strand", { headers: { authorization: "Bearer s3cret" } }));
    expect(await off.json()).toMatchObject({ strandCheckpoints: { status: "disabled" } });
    expect(summaryMock.read).not.toHaveBeenCalled();
  });

  it("keeps the missing-data reason and withholds EDGE when GP is not aligned", async () => {
    const readEdge = async () => new Map([[100, { raw: edge(9), capturedAt: 1_000 }]]);
    await runStrandCheckpointCapture({ db: holder.db, env: ON, readSummary: (async () => available(league(12))) as any, readEdge: readEdge as any });
    const r = (await holder.client.execute("SELECT missing_json FROM strand_checkpoints WHERE player_id = 100")).rows[0];
    expect(JSON.parse(r.missing_json as string).sog_gp).toMatch(/EDGE sample is 9 GP but the NHL summary says 12 GP/);
  });

  it("reports each failure distinctly and never throws", async () => {
    const base = { db: holder.db, env: ON, readEdge: noEdge as any };
    expect(await runStrandCheckpointCapture({ ...base, readSummary: (async () => ({ ...available([]), coverage: "unavailable" })) as any }))
      .toMatchObject({ status: "summary-unavailable" });
    expect(await runStrandCheckpointCapture({ ...base, readSummary: (async () => { throw new Error("boom"); }) as any }))
      .toMatchObject({ status: "failed", error: "boom" });
    const bare = drizzle(createClient({ url: `file:/tmp/strand-bare-${crypto.randomUUID()}.db` }), { schema });
    await ensureNhlSnapshotTable(bare as any);
    expect(await runStrandCheckpointCapture({ ...base, readEdge: undefined, db: bare, readSummary: (async () => available(league(12))) as any }))
      .toMatchObject({ status: "store-unavailable" });
  });

  it("leaves other tables untouched", async () => {
    await holder.client.execute("CREATE TABLE season_snapshot_batches (id TEXT PRIMARY KEY)");
    await holder.client.execute("INSERT INTO season_snapshot_batches VALUES ('keep')");
    await runStrandCheckpointCapture({ db: holder.db, env: ON, readSummary: (async () => available(league(12))) as any, readEdge: noEdge as any });
    expect((await holder.client.execute("SELECT id FROM season_snapshot_batches")).rows.map(r => r.id)).toEqual(["keep"]);
  });
});

describe("cron route integration", () => {
  const call = async (url = "http://x/api/cron/nhl-feed", headers: Record<string, string> = {}) => {
    const { GET } = await import("../app/api/cron/nhl-feed/route");
    return GET(new Request(url, { headers }));
  };
  beforeEach(() => { vi.stubEnv("CRON_SECRET", "s3cret"); vi.stubEnv("STRAND_CHECKPOINT_CAPTURE", "1"); });

  it("rejects an unauthenticated request before any capture or write", async () => {
    summaryMock.read.mockResolvedValue(available(league(12)));
    const res = await call();
    expect(res.status).toBe(401);
    expect(summaryMock.read).not.toHaveBeenCalled();
    expect(await count()).toBe(0);
  });

  it("runs the stage under its own key with the cron secret", async () => {
    summaryMock.read.mockResolvedValue(available(league(12)));
    const body = await (await call("http://x/api/cron/nhl-feed", { authorization: "Bearer s3cret" })).json();
    expect(body.ok).toBe(true);
    expect(body.strandCheckpoints).toMatchObject({ status: "ok", report: { inserted: 25 } });
    expect(await count()).toBe(25);
  });

  it("a checkpoint failure is reported without failing the existing feed capture", async () => {
    summaryMock.read.mockRejectedValue(new Error("summary exploded"));
    const res = await call("http://x/api/cron/nhl-feed", { authorization: "Bearer s3cret" });
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body).toMatchObject({ ok: true, requested: 0, strandCheckpoints: { status: "failed" } });
  });

  it("preserves the feed response when preceding work uses the checkpoint allowance", async () => {
    let clock = 0;
    vi.spyOn(Date, "now").mockImplementation(() => clock);
    vi.mocked(captureGoalieEdgeDetail).mockImplementationOnce(async () => { clock = 55_000; return { ok: true } as any; });
    const res = await call("http://x/api/cron/nhl-feed", { authorization: "Bearer s3cret" });
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, requested: 0, strandCheckpoints: { status: "budget-exhausted" } });
    expect(summaryMock.read).not.toHaveBeenCalled();
  });

  it("returns the existing feed results when a checkpoint read hangs near the route deadline", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(0);
    vi.mocked(captureGoalieEdgeDetail).mockImplementationOnce(async () => { vi.setSystemTime(54_000); return { ok: true } as any; });
    summaryMock.read.mockImplementation(() => new Promise(() => {}));
    const response = call("http://x/api/cron/nhl-feed", { authorization: "Bearer s3cret" });
    await vi.advanceTimersByTimeAsync(1_000);
    const res = await response;
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true, requested: 0, goalieDetail: { ok: true }, strandCheckpoints: { status: "budget-exhausted" } });
    expect(Date.now()).toBe(55_000);
  });

  it("is a no-op stage when the flag is off, and only=strand skips the feed capture", async () => {
    vi.stubEnv("STRAND_CHECKPOINT_CAPTURE", "0");
    const off = await (await call("http://x/api/cron/nhl-feed", { authorization: "Bearer s3cret" })).json();
    expect(off.strandCheckpoints).toEqual({ status: "disabled" });
    vi.stubEnv("STRAND_CHECKPOINT_CAPTURE", "1");
    summaryMock.read.mockResolvedValue(available(league(12)));
    const only = await (await call("http://x/api/cron/nhl-feed?only=strand&strandDryRun=1", { authorization: "Bearer s3cret" })).json();
    expect(only).toMatchObject({ only: "strand", strandCheckpoints: { status: "ok", dryRun: true } });
    expect(only.teams).toBeUndefined();
    expect(await count()).toBe(0);
  });

  it("records the END checkpoint only when asked", async () => {
    summaryMock.read.mockResolvedValue(available(league(82)));
    const plain = await (await call("http://x/api/cron/nhl-feed?only=strand", { authorization: "Bearer s3cret" })).json();
    expect(plain.strandCheckpoints.report.inserted).toBe(0);
    const end = await (await call("http://x/api/cron/nhl-feed?only=strand&strandEnd=1", { authorization: "Bearer s3cret" })).json();
    expect(end.strandCheckpoints.report.inserted).toBe(25);
  });
});
