// Mobile journey checks for Home reveal, Armchair GM tabs/badges, Trade
// Machine franchise DNA, and the share-link flow (WPG ↔ FLA).
// Usage: next build && next start, then `node scripts/mob-journeys.mjs`.
// Env: MOB_BASE_URL, MOB_OUTPUT, MOB_AXE_PATH, MOB_WIDTHS, MOB_CHROMIUM.
import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";

const base = process.env.MOB_BASE_URL ?? "http://127.0.0.1:3000";
const output = process.env.MOB_OUTPUT ?? "artifacts/mob/journeys";
const widths = (process.env.MOB_WIDTHS ?? "320,360,390,412,768,1024").split(",").map(Number);
const axeSource = await readFile(process.env.MOB_AXE_PATH ?? "/tmp/mob-axe-4.10.3.min.js", "utf8");
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"], executablePath: process.env.MOB_CHROMIUM || undefined });
const results = [];
const save = () => writeFile(`${output}/report.json`, JSON.stringify(results, null, 2));

const axe = async page => {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } }))
    .violations.filter(v => ["serious", "critical"].includes(v.impact)).map(v => `${v.id}×${v.nodes.length}`));
};
const overflow = page => page.evaluate(() => document.documentElement.scrollWidth - innerWidth);
// Tab through N stops: each must be on screen and carry a visible indicator.
const keyboard = async (page, stops = 12) => {
  const bad = [];
  for (let i = 0; i < stops; i++) {
    await page.keyboard.press("Tab");
    await page.waitForTimeout(200); // .filter-btn transitions all properties, outline included
    const r = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const cs = getComputedStyle(el); const b = el.getBoundingClientRect();
      return { name: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 30), ring: (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none", on: b.bottom > 0 && b.top < innerHeight };
    });
    if (r && (!r.ring || !r.on)) bad.push(r.name);
  }
  return bad;
};

async function buildTrade(page) {
  await page.goto(`${base}/trade-machine`, { waitUntil: "networkidle", timeout: 120000 });
  await page.getByLabel("Team sending assets").selectOption("WPG", { timeout: 90000 });
  await page.getByRole("button", { name: "Add Connor Hellebuyck to the package", exact: true }).click();
  await page.evaluate(() => document.getElementById("trade-team-b-tab")?.click());
  await page.getByLabel("Team sending return").selectOption("FLA");
  await page.getByRole("button", { name: "Add Anton Lundell to the package", exact: true }).click();
  await page.getByRole("button", { name: "Add Niko Mikkola to the package", exact: true }).click();
  await page.waitForLoadState("networkidle");
}

try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width >= 1024 ? 768 : 844 }, hasTouch: width < 1024, bypassCSP: true });
    await context.addInitScript(() => localStorage.setItem("cap-and-crease-welcomed-v1", "1"));
    const page = await context.newPage();
    const entry = { width };
    const step = async (name, run) => {
      try { entry[name] = await run(); }
      catch (error) { entry[name] = { error: String(error).split("\n")[0].slice(0, 200) }; }
    };

    // 1. Home: flick one viewport at a time; no sample may be mostly transparent.
    await step("home", async () => {
      await page.goto(`${base}/`, { waitUntil: "networkidle", timeout: 120000 });
      const height = await page.evaluate(() => document.documentElement.scrollHeight);
      const viewport = page.viewportSize().height;
      let worst = 0;
      for (let y = 0; y < height; y += Math.round(viewport * 0.9)) {
        await page.mouse.wheel(0, Math.round(viewport * 0.9));
        await page.waitForTimeout(150);
        worst = Math.max(worst, await page.evaluate(() => {
          let hidden = 0;
          for (const el of document.querySelectorAll(".fp-armed")) {
            if (+getComputedStyle(el).opacity >= 0.25) continue;
            const r = el.getBoundingClientRect();
            hidden += Math.max(0, Math.min(r.bottom, innerHeight) - Math.max(r.top, 0));
          }
          return Math.round(100 * hidden / innerHeight);
        }));
      }
      return { worstHiddenPct: worst, overflow: await overflow(page), axe: await axe(page) };
    });

    // 2–3. Armchair GM tabs and captain/alternate badges.
    await step("armchair", async () => {
      await page.goto(`${base}/armchair-gm`, { waitUntil: "networkidle", timeout: 120000 });
      await page.getByRole("button", { name: /WPG.*Winnipeg/i }).click({ timeout: 90000 });
      await page.getByRole("button", { name: /Single Season/i }).click();
      await page.waitForTimeout(800);
      const list = page.locator('[role=tablist][aria-label="Analysis views"]').first();
      const tabs = await list.evaluate(el => [...el.querySelectorAll("[role=tab]")].map(t => {
        const r = t.getBoundingClientRect();
        return { text: t.textContent.trim(), clipped: t.scrollWidth > t.clientWidth + 1, small: r.width < 44 || r.height < 44 };
      }));
      const badges = await page.evaluate(() => [...document.querySelectorAll('button[aria-label="Explain Captain"], button[aria-label="Explain Alternate captain"]')]
        .filter(e => e.checkVisibility()).map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
      await page.screenshot({ path: `${output}/${width}-armchair.png` });
      return { clippedTabs: tabs.filter(t => t.clipped).map(t => t.text), smallTabs: tabs.filter(t => t.small).map(t => t.text), badges, overflow: await overflow(page) };
    });

    // 4–5. Trade Machine: franchise DNA, then share (double tap) and the shared page.
    await step("trade", async () => {
      await buildTrade(page);
      const dna = page.locator("details.chart-data").filter({ hasText: "Winnipeg Jets franchise DNA" }).first();
      await dna.evaluate(d => d.scrollIntoView({ block: "center" }));
      await dna.locator("summary").click({ force: true });
      const scroll = dna.locator(".chart-data-scroll");
      const inner = await scroll.evaluate(el => el.scrollWidth - el.clientWidth);
      const height = await dna.evaluate(d => Math.round(d.getBoundingClientRect().height));
      await dna.evaluate(d => d.scrollIntoView({ block: "start" }));
      await page.screenshot({ path: `${output}/${width}-dna.png` });
      const kb = await keyboard(page, 10);
      const axeTrade = await axe(page);
      const audit = page.getByRole("button", { name: /Run GM Audit/ });
      await audit.scrollIntoViewIfNeeded();
      await audit.click();
      await page.waitForFunction(() => ![...document.querySelectorAll("button")].find(b => /Generate Share/.test(b.textContent))?.disabled, null, { timeout: 60000 });
      const generate = page.getByRole("button", { name: /Generate Share Link/ });
      await generate.scrollIntoViewIfNeeded();
      await generate.dblclick();
      const input = page.getByLabel("Locked verdict share link");
      await input.waitFor();
      await page.waitForTimeout(300);
      const url = await input.inputValue();
      const linkFocused = await input.evaluate(el => el === document.activeElement);
      const linkInView = await input.evaluate(el => { const r = el.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; });
      const buttonText = (await page.getByRole("button", { name: /Show share link|Generate Share Link/ }).innerText()).trim();
      const status = (await page.locator('p[role="status"]').filter({ hasText: /Share link/ }).innerText()).trim();
      const verdictHere = (await page.locator("main").innerText()).match(/LOCKED VERDICT\s+(\S+)/)?.[1];
      await page.screenshot({ path: `${output}/${width}-share-ready.png` });
      const shared = await context.newPage();
      await shared.route("**/api/league/**", async route => { await new Promise(r => setTimeout(r, 3000)); await route.continue(); });
      await shared.goto(url, { waitUntil: "domcontentloaded" });
      // League data is held back 3s; after hydration the busy state must show.
      const sharedLoadingStatus = await shared.getByText("Loading the traded players…").waitFor({ timeout: 2800 }).then(() => true, () => false);
      const loadingText = await shared.locator("main").innerText();
      await shared.screenshot({ path: `${output}/${width}-shared-loading.png` });
      await shared.getByText("Anton Lundell").first().waitFor({ timeout: 60000 });
      await shared.waitForLoadState("networkidle");
      const sharedText = await shared.locator("main").innerText();
      const result = {
        dnaHeight: height, dnaInnerOverflow: inner, keyboardBad: kb, axe: axeTrade,
        linkFocused, linkInView, buttonText, status,
        sharedLoadingStatus,
        sharedPlaceholder: /\? round pick/.test(loadingText),
        sharedSameDeal: ["Connor Hellebuyck", "Anton Lundell", "Niko Mikkola"].every(n => sharedText.includes(n)),
        verdictHere, verdictShared: sharedText.match(/LOCKED VERDICT\s+(\S+)/)?.[1],
        sharedOverflow: await overflow(shared), sharedAxe: await axe(shared), overflow: await overflow(page),
      };
      await shared.close();
      return result;
    });

    results.push(entry);
    await save();
    console.log(JSON.stringify(entry));
    await context.close();
  }
} finally { await browser.close(); }
