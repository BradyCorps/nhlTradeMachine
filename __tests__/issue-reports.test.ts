import { randomUUID } from "node:crypto";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "@/app/api/issue-reports/route";
import { GET as listReports } from "@/app/api/admin/issue-reports/route";
import { GET, PATCH, DELETE } from "@/app/api/admin/issue-reports/[id]/route";
import { createAdminSessionValue } from "@/app/lib/admin-auth";
import { sanitizeReportUrl } from "@/app/lib/issue-report-input";
import { assertJournalIsCompatible, migrationFolder, readJournal } from "@/scripts/db-migration-ops";

const context = vi.hoisted(() => ({ database: null as unknown }));
vi.mock("@/app/db/client", () => ({ get db() { return context.database; } }));
vi.mock("@/app/lib/redis", () => ({ redis: null }));
const client = createClient({ url: ":memory:" });
let cookie: string;
const payload = () => ({ id: randomUUID(), description: "The player badge overlaps the statistics.", pageUrl: "https://capandcrease.com/players?token=secret&season=20262027#private",
  steps: "Open the player.", email: "reader@example.com", website: "", viewport: { width: 412, height: 915 } });
const request = (body?: unknown, options: { method?: string; admin?: boolean; ip?: string; origin?: string } = {}) => new Request("https://capandcrease.com/api/issue-reports", {
  method: options.method ?? "POST", headers: { "content-type": "application/json", "x-forwarded-for": options.ip ?? randomUUID(),
    "user-agent": "Fixture Browser", ...(options.admin ? { cookie } : {}), ...(options.origin ? { origin: options.origin } : {}) },
  ...(body === undefined ? {} : { body: JSON.stringify(body) }),
});
const routeContext = (id: string) => ({ params: Promise.resolve({ id }) });
async function rows() { return (await client.execute("SELECT * FROM issue_reports")).rows; }

beforeAll(async () => {
  vi.stubEnv("ADMIN_KEY", "isolated-issue-report-test-secret"); vi.stubEnv("ADMIN_DISABLE_AUTH", "0");
  cookie = `admin_session=${encodeURIComponent(await createAdminSessionValue())}`;
  context.database = drizzle(client);
  await migrate(drizzle(client), { migrationsFolder: migrationFolder() });
});
beforeEach(async () => { await client.execute("DELETE FROM issue_reports"); });
afterAll(() => { client.close(); vi.unstubAllEnvs(); });

describe("isolated issue reporting and journaled migration", () => {
  it("records the new migration, reruns safely and retains existing records", async () => {
    const input = payload(); await POST(request(input));
    const before = await rows();
    await migrate(drizzle(client), { migrationsFolder: migrationFolder() });
    expect(await rows()).toEqual(before);
    expect((await assertJournalIsCompatible(client, readJournal())).pending).toEqual([]);
    expect((await client.execute("PRAGMA foreign_key_check")).rows).toEqual([]);
    await expect(client.execute("UPDATE issue_reports SET status = 'Invalid'")).rejects.toThrow();
  });
  it("accepts optional fields omitted and records time/browser/viewport without private URL parameters", async () => {
    const input = payload();
    const { steps: _steps, email: _email, website: _website, ...minimal } = input;
    expect((await POST(request(minimal))).status).toBe(201);
    expect(await rows()).toEqual([expect.objectContaining({ steps: "", email: "", page_url: "https://capandcrease.com/players?season=20262027",
      browser: "Fixture Browser", viewport_width: 412, status: "New", created_at: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/) })]);
  });
  it("accepts only the exact retry and arbitrates concurrent duplicates without rewriting review fields", async () => {
    const input = payload();
    const responses = await Promise.all([POST(request(input)), POST(request(input))]);
    expect(responses.every(response => response.ok)).toBe(true); expect(await rows()).toHaveLength(1);
    await PATCH(request({ status: "Investigating", internalNote: "Private follow-up" }, { method: "PATCH", admin: true }), routeContext(input.id));
    const before = await rows();
    expect((await POST(request(input))).status).toBe(200); expect(await rows()).toEqual(before);
    expect((await POST(request({ ...input, description: "Changed report details here." }))).status).toBe(409);
    expect(await rows()).toEqual(before);
  });
  it.each([
    { description: "short" }, { description: "x".repeat(4001) }, { email: "bad-address" }, { pageUrl: "javascript:alert(1)" },
    { website: "spam" }, { screenshots: ["data:image/png;base64,not-supported"] }, { viewport: { width: 0, height: 915 } },
  ])("rejects invalid content without writing: %j", async change => {
    expect((await POST(request({ ...payload(), ...change }))).status).toBe(400); expect(await rows()).toHaveLength(0);
  });
  it("rejects oversized bodies and cross-origin submissions", async () => {
    expect((await POST(request({ ...payload(), steps: "x".repeat(40000) }))).status).toBe(400);
    expect((await POST(request(payload(), { origin: "https://elsewhere.example" }))).status).toBe(403);
    expect(await rows()).toHaveLength(0);
  });
  it("rate limits new reports while permitting a confirmed exact retry", async () => {
    const ip = randomUUID(); const first = payload();
    expect((await POST(request(first, { ip }))).status).toBe(201);
    expect((await POST(request(payload(), { ip }))).status).toBe(201);
    expect((await POST(request(payload(), { ip }))).status).toBe(201);
    const limited = await POST(request(payload(), { ip }));
    expect(limited.status).toBe(429); expect(limited.headers.get("retry-after")).toBe("60");
    expect((await POST(request(first, { ip }))).status).toBe(200); expect(await rows()).toHaveLength(3);
  });
  it("recovers from failed insert and retry without partial or orphan records", async () => {
    const input = payload();
    await client.execute("CREATE TRIGGER reject_issue BEFORE INSERT ON issue_reports BEGIN SELECT RAISE(ABORT, 'fixture failure'); END");
    try { expect((await POST(request(input))).status).toBe(503); expect(await rows()).toHaveLength(0); }
    finally { await client.execute("DROP TRIGGER reject_issue"); }
    expect((await POST(request(input))).status).toBe(201); expect(await rows()).toHaveLength(1);
  });
  it("protects all Admin reads and writes, including signed-session management", async () => {
    const input = payload(); await POST(request(input));
    for (const handler of [GET, DELETE]) expect((await handler(request(undefined, { method: handler === GET ? "GET" : "DELETE" }), routeContext(input.id))).status).toBe(401);
    expect((await listReports(request(undefined, { method: "GET" }))).status).toBe(401);
    expect((await PATCH(request({ status: "Resolved", internalNote: "secret" }, { method: "PATCH" }), routeContext(input.id))).status).toBe(401);
    expect((await GET(request(undefined, { method: "GET", admin: true }), routeContext(input.id))).headers.get("cache-control")).toBe("no-store");
    expect((await PATCH(request({ status: "Resolved", internalNote: "Private note" }, { method: "PATCH", admin: true }), routeContext(input.id))).status).toBe(200);
    expect((await rows())[0]).toMatchObject({ status: "Resolved", internal_note: "Private note", email: input.email });
    expect((await PATCH(request({ status: "New", internalNote: "" }, { method: "PATCH", admin: true, origin: "https://elsewhere.example" }), routeContext(input.id))).status).toBe(403);
    expect((await DELETE(request(undefined, { method: "DELETE", admin: true }), routeContext(input.id))).status).toBe(200);
    expect(await rows()).toHaveLength(0);
    expect((await GET(request(undefined, { method: "GET", admin: true }), routeContext(input.id))).status).toBe(404);
  });
  it("does not expose contact/note/browser fields in list summaries and orders newest first", async () => {
    const first = payload(); const second = payload(); await POST(request(first)); await POST(request(second));
    await client.execute({ sql: "UPDATE issue_reports SET created_at = '2025-01-01' WHERE id = ?", args: [first.id] });
    const response = await listReports(request(undefined, { method: "GET", admin: true }));
    const data = await response.json();
    expect(data.reports.map((row: { id: string }) => row.id)).toEqual([second.id, first.id]);
    expect(Object.keys(data.reports[0]).sort()).toEqual(["createdAt", "description", "id", "pageUrl", "status"]);
  });
  it("supports every review status and rejects attempts to rewrite report contents", async () => {
    const input = payload(); await POST(request(input));
    for (const status of ["Investigating", "Resolved", "Dismissed", "New"]) {
      const response = await PATCH(request({ status, internalNote: `Note for ${status}` }, { method: "PATCH", admin: true }), routeContext(input.id));
      expect(response.status).toBe(200);
      expect((await rows())[0]).toMatchObject({ status, description: input.description, email: input.email });
    }
    for (const invalid of [{ status: "Invalid", internalNote: "" }, { status: "New", internalNote: "x".repeat(4001) }, { status: "New", internalNote: "", email: "changed@example.com" }]) {
      expect((await PATCH(request(invalid, { method: "PATCH", admin: true }), routeContext(input.id))).status).toBe(400);
    }
  });
});

describe("automatic URL privacy", () => {
  it("strips arbitrary query parameters, fragments and embedded credentials", () => {
    expect(sanitizeReportUrl("https://user:password@capandcrease.com/players?token=abc&email=x&q=private&season=20262027&gameType=2&player=8478402#secret"))
      .toBe("https://capandcrease.com/players?season=20262027&gameType=2&player=8478402");
  });
});
