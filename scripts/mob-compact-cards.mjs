import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.MOB_BASE_URL ?? "http://127.0.0.1:3000";
const output = process.env.MOB_OUTPUT ?? "artifacts/mob/compact-cards";
const widths = [320, 360, 390, 412, 540, 667, 768, 844, 1024];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const results = [];
try {
  const context = await browser.newContext({ hasTouch: true, reducedMotion: "reduce", bypassCSP: true });
  await context.addInitScript(() => localStorage.setItem("cap-and-crease-welcomed-v1", "1"));
  const page = await context.newPage();
  page.on("pageerror", error => console.error(`Page error: ${error.message}`));
  for (const route of ["/players", "/teams"]) {
    const cards = page.locator(route === "/players" ? ".compact-player-intelligence" : ".compact-team-intelligence");
    for (const width of widths) {
      try {
        await page.setViewportSize({ width, height: width >= 667 && width <= 844 ? 390 : 844 });
        await page.goto(`${base}${route}`, { waitUntil: "domcontentloaded", timeout: 120000 });
        await cards.first().waitFor({ state: "attached", timeout: 120000 });
        await page.evaluate(() => window.scrollTo(0, 0));
        const filter = page.getByRole("button", { name: /^Filter(?: \(\d+\))?$/ });
        assert.equal(await filter.getAttribute("aria-expanded"), "false");
        await filter.click();
        const label = route === "/players" ? "Defence" : "Contender";
        await page.locator(".compact-filter-options").getByRole("button", { name: label, exact: route === "/players" }).click();
        const remove = page.getByRole("button", { name: `Remove ${route === "/players" ? "D" : "Contender"} filter`, exact: true });
        await remove.waitFor({ state: "visible" });
        assert.match(await page.locator(".compact-filter-summary [role=status]").innerText(), /\d+ (player|team)s?/);
        await remove.click();
        await filter.click();
        assert.equal(await filter.getAttribute("aria-expanded"), "false");
        assert(await cards.first().isVisible());
        const summaries = await cards.allTextContents();
        for (const summary of summaries) {
          if (route === "/players") {
            assert.match(summary, /Role:/);
            assert.match(summary, /[FDG]-NAV/);
            assert.match(summary, /NAV trend: unavailable/);
            assert.match(summary, /Contract:/);
            assert.match(summary, /Annual surplus:/);
            assert.match(summary, /Open player dossier/);
            assert.doesNotMatch(summary, /\b(?:ELITE_1ST_LINE|TOP_PAIR|MIDDLE_SIX|BOTTOM_SIX)\b/);
            if (/Contract: (Unsigned|No signed contract)/.test(summary)) assert.match(summary, /Annual surplus: no signed deal to price/);
          } else {
            assert.match(summary, /Present .*Future .*Signed roster assets/);
            assert.match(summary, /Cap flexibility:/);
            assert.match(summary, /Lineup vacancies:/);
          }
        }
        const layout = await cards.evaluateAll(elements => ({
          pageWidth: document.documentElement.scrollWidth,
          viewport: innerWidth,
          overflow: elements.filter(element => {
            const rect = element.getBoundingClientRect();
            return rect.left < -1 || rect.right > innerWidth + 1 || element.scrollWidth > element.clientWidth + 1;
          }).length,
        }));
        assert(layout.pageWidth <= layout.viewport + 1, "Page overflows");
        assert.equal(layout.overflow, 0, "Card text overflows");
        await cards.first().scrollIntoViewIfNeeded();
        const sticky = await filter.evaluate(element => {
          const rect = element.getBoundingClientRect();
          const header = Number.parseFloat(getComputedStyle(document.documentElement).getPropertyValue("--sticky-header-height"));
          return { top: rect.top, width: rect.width, height: rect.height, header };
        });
        assert(sticky.width >= 44 && sticky.height >= 44, "Filter target is too small");
        assert(sticky.top >= sticky.header - 1, "Filter collides with the header");
        const background = await page.locator(".compact-filters").evaluate(element => getComputedStyle(element).backgroundColor);
        assert.notEqual(background, "rgba(0, 0, 0, 0)", "Sticky filters have no opaque background");
        await page.screenshot({ path: `${output}/${width}-${route.slice(1)}.png` });
        results.push({ route, width, pass: true, cards: summaries.length, layout });
        console.log(`PASS ${route} ${width}px`);
      } catch (error) {
        results.push({ route, width, pass: false, error: String(error) });
        console.error(`FAIL ${route} ${width}px: ${error}`);
      }
      await writeFile(`${output}/report.json`, JSON.stringify(results, null, 2));
    }
  }
} finally { await browser.close(); }
if (results.some(result => !result.pass)) process.exitCode = 1;
