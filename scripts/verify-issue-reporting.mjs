// Built app + disposable local libSQL database; no Production services or writes.
// node --import tsx scripts/verify-issue-reporting.mjs
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawn } from "node:child_process";
import { createClient } from "@libsql/client";
import { drizzle } from "drizzle-orm/libsql";
import { migrate } from "drizzle-orm/libsql/migrator";
import { chromium } from "playwright-core";
import { createAdminSessionValue } from "../app/lib/admin-auth.ts";

const directory = await mkdtemp(join(tmpdir(), "issue-report-browser-"));
const output = process.env.ISSUE_REPORT_OUTPUT ?? "artifacts/mob/issue-reporting";
await mkdir(output, { recursive: true });
const databaseUrl = `file:${join(directory, "reports.db")}`;
const client = createClient({ url: databaseUrl });
await migrate(drizzle(client), { migrationsFolder: join(process.cwd(), "drizzle") });
const secret = `isolated-${randomUUID()}`;
const previousKey = process.env.ADMIN_KEY;
process.env.ADMIN_KEY = secret;
const session = await createAdminSessionValue();
if (previousKey === undefined) delete process.env.ADMIN_KEY; else process.env.ADMIN_KEY = previousKey;
const port = Number(process.env.ISSUE_REPORT_PORT ?? 3108);
const base = `http://localhost:${port}`;
const server = spawn("npm", ["run", "start", "--", "--port", String(port)], {
  env: { ...process.env, DATABASE_URL: databaseUrl, DATABASE_AUTH_TOKEN: "", ADMIN_KEY: secret, ADMIN_PASSWORD: "", ADMIN_DISABLE_AUTH: "0",
    UPSTASH_REDIS_REST_URL: "", UPSTASH_REDIS_REST_TOKEN: "", KV_REST_API_URL: "", KV_REST_API_TOKEN: "" }, stdio: "ignore", detached: true,
});
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const report = [];
async function checkAccessibility(page) {
  const axePath = "/tmp/mob-axe-4.10.3.min.js";
  if (!existsSync(axePath)) return "Pinned axe unavailable; keyboard/focus checks only";
  await page.addScriptTag({ path: axePath });
  const result = await page.evaluate(async () => {
    const scan = await window.axe.run(document.querySelector("main"));
    return scan.violations.filter(violation => ["serious", "critical"].includes(violation.impact));
  });
  assert.deepEqual(result, [], "New reporting main has serious/critical accessibility violations");
  return "No serious/critical axe findings in reporting main";
}
try {
  let ready = false;
  for (let i = 0; i < 30; i++) {
    try { if ((await fetch(base + "/report-issue", { signal: AbortSignal.timeout(1000) })).ok) { ready = true; break; } } catch { /* startup */ }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  assert.ok(ready, "Isolated production server did not start");
  for (const width of [320, 412, 1440]) {
    const ip = `fixture-${width}-${randomUUID()}`;
    const context = await browser.newContext({ viewport: { width, height: 1000 }, extraHTTPHeaders: { "x-forwarded-for": ip }, bypassCSP: true });
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    const errors = []; let claude = 0; const requests = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("request", request => { if (new URL(request.url()).pathname === "/api/claude") claude++; });
    assert.equal((await context.request.get(base + "/api/issue-reports")).status(), 405, "Public list exposed");
    assert.equal((await context.request.get(base + "/api/admin/issue-reports")).status(), 401);
    const from = `${base}/players?token=private&season=20262027&gameType=2&q=private#secret`;
    await page.goto(base + "/report-issue?from=" + encodeURIComponent(from));
    const description = page.getByLabel("What went wrong?", { exact: false });
    const submit = page.getByRole("button", { name: "Submit report", exact: true });
    await submit.click();
    await page.getByRole("alert").filter({ hasText: "Please check" }).waitFor();
    assert.equal(await description.getAttribute("aria-invalid"), "true");
    assert.equal(await page.getByLabel("Page URL", { exact: false }).inputValue(), `${base}/players?season=20262027&gameType=2`);
    assert.equal(await page.locator('input[type="file"]').count(), 0);
    await page.getByText("Screenshots are currently unavailable.", { exact: false }).waitFor();
    const text = `Isolated ${width}px report: a long player badge overlaps the numeric statistics.`;
    await description.fill(text);
    assert.equal(await description.getAttribute("aria-invalid"), "false", "Editing did not clear stale field error");
    await description.focus(); await page.keyboard.press("Tab");
    assert.equal(await page.getByLabel("Page URL", { exact: false }).evaluate(e => e === document.activeElement), true);
    assert.ok(await page.getByLabel("Page URL", { exact: false }).evaluate(e => getComputedStyle(e).outlineStyle !== "none"));
    if (width === 412) {
      await page.getByLabel("Steps to reproduce", { exact: false }).fill("Open Players and expand a player.");
      await page.getByLabel("Email for a reply", { exact: false }).fill("fixture@example.com");
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    const publicAccessibility = await checkAccessibility(page);
    await page.screenshot({ path: `${output}/public-form-${width}.png`, fullPage: true });
    let id;
    await page.route("**/api/issue-reports", async route => {
      requests.push(route.request().postDataJSON());
      const response = await route.fetch();
      if (requests.length === 1) {
        assert.equal(response.status(), 201);
        id = (await response.json()).id;
        // Simulate a lost success acknowledgement: the server already saved.
        await route.fulfill({ status: 503, json: { error: "Fixture connection interrupted. Try again." } });
      } else { assert.equal(response.status(), 200); await route.fulfill({ response }); }
    });
    await submit.evaluate(button => { button.click(); button.click(); });
    await page.getByRole("alert").filter({ hasText: "Fixture connection interrupted" }).waitFor();
    assert.equal(requests.length, 1, "Double click duplicated submission");
    assert.equal(await description.inputValue(), text, "Failure erased entered text");
    await submit.focus(); await page.keyboard.press("Enter");
    await page.getByRole("status").filter({ hasText: "Thank you" }).waitFor();
    assert.equal(requests.length, 2); assert.deepEqual(requests[1], requests[0], "Retry changed identity or captured metadata");
    assert.equal(Number((await client.execute({ sql: "SELECT count(*) AS total FROM issue_reports WHERE id = ?", args: [id] })).rows[0].total), 1);
    assert.equal((await context.request.get(base + `/api/admin/issue-reports/${id}`)).status(), 401);
    await page.screenshot({ path: `${output}/public-success-${width}.png`, fullPage: true });
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    // Local signed Admin session, never a Production session or authorization bypass.
    const admin = await browser.newContext({ viewport: { width, height: 1000 }, bypassCSP: true });
    await admin.addCookies([{ name: "admin_session", value: session, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" }]);
    const review = await admin.newPage(); review.setDefaultTimeout(12000);
    review.on("pageerror", error => errors.push(error.message));
    await review.goto(base + "/admin/issue-reports");
    await review.getByRole("button").filter({ hasText: text }).click();
    await review.getByRole("heading", { name: "Report details" }).waitFor();
    await review.getByLabel("Status", { exact: true }).selectOption("Investigating");
    await review.getByLabel("Internal note", { exact: false }).fill("Private fixture note.");
    const save = review.getByRole("button", { name: "Save review" });
    await save.focus(); await review.keyboard.press("Enter");
    await review.getByRole("status").filter({ hasText: "saved" }).waitFor();
    const row = (await client.execute({ sql: "SELECT * FROM issue_reports WHERE id = ?", args: [id] })).rows[0];
    assert.equal(row.status, "Investigating"); assert.equal(row.internal_note, "Private fixture note.");
    assert.equal(row.email, width === 412 ? "fixture@example.com" : "");
    assert.equal(await review.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    await review.evaluate(() => window.scrollTo(0, 0));
    const adminAccessibility = await checkAccessibility(review);
    await review.screenshot({ path: `${output}/admin-detail-${width}.png`, fullPage: true });
    const remove = review.getByRole("button", { name: "Delete report permanently" });
    review.once("dialog", dialog => dialog.dismiss()); await remove.click();
    assert.equal((await client.execute({ sql: "SELECT id FROM issue_reports WHERE id = ?", args: [id] })).rows.length, 1);
    await client.execute("CREATE TRIGGER fixture_delete_failure BEFORE DELETE ON issue_reports BEGIN SELECT RAISE(ABORT, 'isolated deletion failure'); END");
    try {
      review.once("dialog", dialog => dialog.accept()); await remove.click();
      await review.getByRole("alert").filter({ hasText: "could not be deleted" }).waitFor();
      assert.equal((await client.execute({ sql: "SELECT id FROM issue_reports WHERE id = ?", args: [id] })).rows.length, 1);
    } finally { await client.execute("DROP TRIGGER fixture_delete_failure"); }
    review.once("dialog", dialog => dialog.accept()); await remove.click();
    await review.getByRole("status").filter({ hasText: "Report deleted" }).waitFor();
    assert.equal((await client.execute({ sql: "SELECT id FROM issue_reports WHERE id = ?", args: [id] })).rows.length, 0);
    assert.equal((await admin.request.get(base + `/api/admin/issue-reports/${id}`)).status(), 404);
    assert.deepEqual(errors, []); assert.equal(claude, 0);
    report.push({ width, submission: "validated; lost acknowledgement retry deduplicated", review: "signed-session read/update/delete; cancelled and failed deletion preserve record", focus: "visible keyboard focus", overflow: 0, errors, screenshots: "explicitly unavailable", publicAccessibility, adminAccessibility });
    console.log(`${width}px issue reporting passed`);
    await admin.close(); await context.close();
  }
} finally {
  await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
  await browser.close();
  try { process.kill(-server.pid, "SIGTERM"); } catch { /* Already stopped. */ }
  client.close();
  await rm(directory, { recursive: true, force: true });
}
