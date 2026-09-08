import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.MOB_BASE_URL ?? "http://127.0.0.1:3000";
const output = process.env.MOB_OUTPUT ?? "artifacts/mob/workflows";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true, reducedMotion: "reduce", bypassCSP: true });
await context.addInitScript(() => localStorage.setItem("cap-and-crease-welcomed-v1", "1"));
const page = await context.newPage();
const results = [];
async function check(name, run) {
  try { await run(); results.push({ name, pass: true }); console.log(`PASS ${name}`); }
  catch (error) { results.push({ name, pass: false, error: String(error) }); console.error(`FAIL ${name}: ${error}`); }
  await writeFile(`${output}/report.json`, JSON.stringify(results, null, 2));
}
async function sheet(trigger, title) {
  await trigger.click();
  const dialog = page.getByRole("dialog", { name: new RegExp(`^${title.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`, "i") });
  await dialog.waitFor({ state: "visible", timeout: 15000 });
  for (let index = 0; index < 48; index++) {
    await page.keyboard.press(index < 24 ? "Tab" : "Shift+Tab");
    assert(await dialog.evaluate(element => element.contains(document.activeElement)), "Focus left the sheet");
  }
  await page.screenshot({ path: `${output}/${title.replaceAll(/[^a-z0-9]/gi, "_")}.png` });
  await page.keyboard.press("Escape");
  await dialog.waitFor({ state: "detached" });
  assert(await trigger.evaluate(element => element === document.activeElement), "Focus was not restored");
  await trigger.click();
  await dialog.waitFor({ state: "visible" });
  const pathname = new URL(page.url()).pathname;
  await page.goBack();
  await dialog.waitFor({ state: "detached" });
  assert.equal(new URL(page.url()).pathname, pathname, "Back left the workflow");
}
try {
  await check("Player filters and sheet Back/focus", async () => {
    await page.goto(`${base}/players`, { waitUntil: "networkidle", timeout: 120000 });
    const trigger = page.locator(".player-row-mobile .player-row-expand").first();
    await trigger.waitFor({ state: "visible", timeout: 90000 });
    await page.getByRole("button", { name: /^Filter/ }).click();
    await page.getByRole("button", { name: "Defence", exact: true }).click();
    await page.getByRole("button", { name: "Remove D filter" }).waitFor();
    await page.getByRole("button", { name: "Remove D filter" }).click();
    await page.getByRole("button", { name: /^Filter/ }).click();
    const title = (await trigger.getAttribute("aria-label")).replace(/^Expand /, "") + " details";
    await sheet(trigger, title);
  });
  await check("Team sheet and persistent chart pin", async () => {
    await page.goto(`${base}/teams`, { waitUntil: "networkidle", timeout: 120000 });
    const chart = page.getByRole("region", { name: "League NAV rankings chart", exact: true });
    const bar = chart.getByRole("button").first();
    await bar.click();
    await page.mouse.move(0, 0);
    assert.equal(await bar.getAttribute("aria-pressed"), "true");
    await page.getByRole("button", { name: "Clear pin", exact: true }).click();
    const data = page.locator(".chart-data").filter({ hasText: "League NAV comparison" }).first();
    await data.locator("summary").click();
    await data.getByRole("button").nth(0).click();
    await data.getByRole("button").nth(1).click();
    assert.equal(await data.locator('[aria-pressed="true"]').count(), 2);
    await data.locator("summary").click();
    const trigger = page.locator(".border.font-mono > .items-stretch > button").first();
    const name = (await trigger.locator("span").first().innerText()).trim();
    await sheet(trigger, `${name} team details`);
  });
  await check("Fantasy outlook sheet", async () => {
    await page.goto(`${base}/fantasy`, { waitUntil: "networkidle", timeout: 120000 });
    const trigger = page.locator('button[aria-label*="Ledger outlook"]:visible').first();
    await trigger.waitFor({ state: "visible", timeout: 90000 });
    const name = (await trigger.getAttribute("aria-label")).replace(/^Show /, "").replace(/'s Ledger outlook$/, "");
    await sheet(trigger, `${name} Ledger outlook`);
  });
  await check("Trade scouting preserves the package", async () => {
    await page.goto(`${base}/trade-machine`, { waitUntil: "networkidle", timeout: 120000 });
    await page.getByLabel("Team sending assets").selectOption("EDM", { timeout: 90000 });
    await page.getByRole("button", { name: "Add Connor McDavid to the package", exact: true }).click();
    const trigger = page.getByRole("button", { name: "Show Connor McDavid scouting detail", exact: true });
    await sheet(trigger, "Connor McDavid scouting");
    assert(await trigger.isVisible(), "The selected package was lost");
  });
} finally { await browser.close(); }
if (results.some(result => !result.pass)) process.exitCode = 1;
