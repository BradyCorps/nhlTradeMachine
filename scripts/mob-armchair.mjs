import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import assert from "node:assert/strict";

const base = process.env.MOB_BASE_URL ?? "http://127.0.0.1:3000";
const output = process.env.MOB_OUTPUT ?? "artifacts/mob/armchair";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: "reduce", bypassCSP: true });
await context.addInitScript(() => localStorage.setItem("cap-and-crease-welcomed-v1", "1"));
const page = await context.newPage();
const axeSource = await readFile(process.env.MOB_AXE_PATH ?? "/tmp/mob-axe-4.10.3.min.js", "utf8");
const states = [];
async function capture(name) {
  await page.addScriptTag({ content: axeSource });
  const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.filter(v => ["serious", "critical"].includes(v.impact)).map(v => ({ id: v.id, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })));
  await page.screenshot({ path: `${output}/${name}.png`, fullPage: true });
  states.push({ name, violations });
  await writeFile(`${output}/report.json`, JSON.stringify(states, null, 2));
  console.log(`${name}: ${violations.length} serious/critical issues`);
}
async function clickVisible(name) {
  const button = page.getByRole("button", { name }).filter({ visible: true }).first();
  if (await button.count() && await button.isEnabled()) { await button.click(); return true; }
  return false;
}
try {
  await page.goto(`${base}/armchair-gm`, { waitUntil: "networkidle", timeout: 120000 });
  await page.getByRole("button", { name: /SJS.*San Jose/i }).click({ timeout: 90000 });
  await page.getByRole("button", { name: /Cup Run Challenge/ }).click();
  await capture("draft");
  let seasons = 0;
  let simulated = false;
  const deadline = Date.now() + 15 * 60 * 1000;
  while (seasons < 3 && Date.now() < deadline) {
    if (await clickVisible(/Record Season/)) {
      seasons++;
      simulated = false;
      await capture(`year-${seasons}-recorded`);
      continue;
    }
    if (await clickVisible(/^Done —/)) continue;
    if (await clickVisible(/^Let them walk$/)) continue;
    if (await clickVisible(/^Re-sign /i)) continue;
    const board = page.getByPlaceholder("Filter prospects…");
    if (await board.isVisible()) {
      const modal = board.locator('xpath=ancestor::*[@role="dialog"]');
      await modal.locator("button").first().click();
      continue;
    }
    if (!simulated && await clickVisible("Open advanced views")) {
      const dialog = page.getByRole("dialog", { name: "Armchair advanced views" });
      await dialog.waitFor({ state: "visible" });
      await dialog.getByRole("tab", { name: /^Sim/ }).click();
      await capture(`year-${seasons + 1}-advanced`);
      await dialog.getByRole("button", { name: "Simulate one season" }).click();
      simulated = true;
      await dialog.getByRole("button", { name: "Close details" }).click();
      continue;
    }
    // UI-driven season calculation and CPU draft ticks have no network-idle
    // signal; wait briefly between bounded checks for the next enabled action.
    await page.waitForTimeout(500);
  }
  assert.equal(seasons, 3, `Completed only ${seasons} seasons; visible controls: ${(await page.locator("button:visible").allTextContents()).join(" | ")}`);
  await capture("three-season-complete");
} catch (error) {
  states.push({ error: String(error), buttons: await page.locator("button:visible").allTextContents() });
  await writeFile(`${output}/report.json`, JSON.stringify(states, null, 2));
  console.error(error);
  process.exitCode = 1;
} finally { await browser.close(); }
if (states.some(state => state.violations?.length)) process.exitCode = 1;
