// Isolated Welcome/home and Season Review regression: synthetic league, real local simulation engine.
// No welcome acknowledgement, external narrative call, or Production writes.
// node --import tsx scripts/verify-welcome-season-review.mjs
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { TEAMS_DB } from "../app/lib/db.ts";
import { buildLeagueNavMap } from "../app/lib/league-nav.ts";
import { buildLeagueProvenance } from "../app/lib/data-context.ts";

const base = process.env.MOB_BASE_URL ?? "http://127.0.0.1:3000";
const output = process.env.MOB_OUTPUT ?? "artifacts/mob/welcome-season-review";
const teams = TEAMS_DB.map(t => ({ ...t, capSpace: 35, capBreakdown: null }));
const roster = teams.flatMap(t => Array.from({ length: 22 }, (_, index) => ({
  id: `fixture-${t.id}-${index}`, teamId: t.id, name: `${t.id} Test Player ${index + 1}`,
  position: index < 14 ? "C" : index < 20 ? "D" : "G", age: 27,
  games: 82, ptsPace: index < 14 ? 65 - index : 30, goalsPace: 20, assistsPace: 30,
  xGPace: 20, defRate: 0.4, avgTOI: 20, capHit: 3, yearsRemaining: 4,
  hasNMC: false, hasNTC: false, canRetain: true, retainedPct: 0, multiplier: 1,
  hasLiveStats: true, gsax: 10, savePct: 0.92, gamesStarted: index === 20 ? 55 : 27,
})));
const pickRows = teams.flatMap(t => [2027, 2028, 2029, 2030, 2031].flatMap(year =>
  [1, 2, 3, 4, 5, 6, 7].map(round => ({ ...roster[0], id: `pick-${t.id}-${year}-${round}`,
    name: `${year} Round ${round} (${t.id})`, position: "Pick", teamId: t.id, year, round,
    capHit: 0, yearsRemaining: 0, teamStanding: t.standing }))));
const picks = pickRows; // Existing main pick behavior, only an isolated simulation fixture.
const players = [...roster, ...picks];
const navMap = buildLeagueNavMap(players, 104);
const generatedAt = "2026-10-05T16:00:00.000Z";
const league = { teams, players, navMap, capCeiling: 104, capFloor: 76.9, generatedAt,
  liveStats: true, source: "Isolated synthetic browser fixture", debug: {},
  provenance: buildLeagueProvenance({ kind: "players", generatedAt, cacheState: "fresh", liveStats: true }),
};
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const report = [];
try {
  for (const width of [320, 412, 1024, 1440]) {
    const context = await browser.newContext({ viewport: { width, height: 1000 }, hasTouch: true, reducedMotion: "reduce" });
    const page = await context.newPage(); page.setDefaultTimeout(12000);
    const errors = []; let simulations = 0; let recapRequests = 0;
    page.on("pageerror", e => errors.push(e.message));
    page.on("response", r => { if (new URL(r.url()).pathname === "/api/simulate") simulations++; });
    await page.route("**/api/league**", route => {
      const url = new URL(route.request().url());
      const season = url.searchParams.get("season") ?? "20262027";
      const gameType = Number(url.searchParams.get("gameType") ?? 2);
      return route.fulfill({ json: { ...league, players: players.map(p => ({ ...p,
        observedStats: { season, gameType, coverage: "available", games: 3, goals: 1, assists: 2, points: 3 },
      })) } });
    });
    await page.route("**/api/claude", route => {
      recapRequests++;
      return route.fulfill({ status: 400, json: { error: "AI recap must not be requested while paused." } });
    });

    // Each route starts in a fresh browser; no global acknowledgement gate.
    for (const path of ["/", "/players", "/trade-machine", "/armchair-gm"]) {
      await page.goto(base + path, { waitUntil: "networkidle", timeout: 30000 });
      assert.equal(await page.locator("#welcome-title").count(), 0);
      assert.equal(await page.evaluate(() => localStorage.getItem("cap-and-crease-welcomed-v1")), null);
      assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
      if (path === "/") {
        const support = page.getByRole("link", { name: "Buy me a stick tap — support Cap & Crease", exact: true });
        assert.equal(await support.getAttribute("href"), "https://buymeacoffee.com/capandcrease");
        await support.focus(); assert.equal(await support.evaluate(e => e === document.activeElement), true);
        await page.getByText("Turns out, it’s very hard.", { exact: true }).waitFor();
        const editorial = page.locator(".fp-lede");
        assert.equal(await editorial.evaluate(e => getComputedStyle(e).columnCount), "1", "Editorial split into newspaper columns");
        assert.equal(await editorial.locator("p").count(), 6);
        const paragraphs = await editorial.locator("p").evaluateAll(ps => ps.map(p => {
          const box = p.getBoundingClientRect(); return { x: box.x, top: box.top, bottom: box.bottom };
        }));
        assert.ok(paragraphs.every((p, i) => i === 0 || (Math.abs(p.x - paragraphs[0].x) < 2 && p.top >= paragraphs[i - 1].bottom)), "Editorial paragraphs do not read continuously top to bottom");
        await page.screenshot({ path: `${output}/after-home-${width}.png`, fullPage: true });
      }
      if (path === "/players") {
        await page.screenshot({ path: `${output}/players-state-${width}.png`, fullPage: true });
        await page.locator(".player-row-mobile:visible, .player-row-desktop:visible").first().waitFor();
      }

    }
    await page.getByRole("button", { name: /WPG.*Winnipeg/i }).click();
    await page.getByRole("button", { name: /Single Season/i }).click();
    const board = page.getByPlaceholder("Filter prospects…"); await board.waitFor();
    await board.locator('xpath=ancestor::*[@role="dialog"]').locator("button").first().click();
    await page.getByRole("button", { name: /^Done — Proceed to Re-Sign/ }).click();
    await page.getByRole("button", { name: /^Done — RFA Offer Sheets/ }).click();
    if (await page.getByRole("button", { name: "Let them walk", exact: true }).count()) await page.getByRole("button", { name: "Let them walk", exact: true }).click();
    await page.getByRole("button", { name: /^Done — Start Armchair/ }).click();
    const advanced = page.getByRole("button", { name: "Open advanced views" });
    if (await advanced.isVisible()) await advanced.click();
    await page.getByRole("tab", { name: "Open Sim tab", exact: true }).filter({ visible: true }).click();
    await page.getByRole("button", { name: "Simulate one season" }).filter({ visible: true }).click();
    const review = page.locator("details").filter({ has: page.locator("summary").filter({ hasText: "Season Review" }) }).filter({ visible: true }).first();
    await review.locator("summary").click({ timeout: 25000 });
    const player = review.getByRole("button", { name: /Expand valuation breakdown/ }).first();
    await player.waitFor();
    await page.getByText("AI season recap is temporarily unavailable. Simulated results and Season Review remain available.", { exact: true }).filter({ visible: true }).waitFor();
    const label = await player.getAttribute("aria-label");
    const name = label.replace("Expand valuation breakdown for ", "");
    const reviewNode = await review.elementHandle();
    const originalText = await review.innerText();
    await page.screenshot({ path: `${output}/after-review-open-${width}.png`, fullPage: true });
    for (const activation of ["mouse", "touch", "keyboard"]) {
      const expand = review.getByRole("button", { name: `Expand valuation breakdown for ${name}`, exact: true });
      await expand.scrollIntoViewIfNeeded(); await expand.focus();
      const scroll = await page.evaluate(() => ({ y: scrollY, sheet: document.querySelector(".mobile-detail-sheet")?.scrollTop ?? 0 }));
      if (activation === "mouse") await expand.click();
      if (activation === "touch") await expand.tap();
      if (activation === "keyboard") await page.keyboard.press("Enter");
      const collapse = review.getByRole("button", { name: `Collapse valuation breakdown for ${name}`, exact: true });
      await collapse.waitFor();
      assert.equal(await reviewNode.evaluate(e => e.isConnected && e.open), true, "Review remounted/closed on nested expansion");
      const afterScroll = await page.evaluate(() => ({ y: scrollY, sheet: document.querySelector(".mobile-detail-sheet")?.scrollTop ?? 0 }));
      assert.ok(Math.abs(scroll.y - afterScroll.y) <= 2 && Math.abs(scroll.sheet - afterScroll.sheet) <= 2, "Expansion reset scroll position");
      await collapse.focus(); await page.keyboard.press("Space");
      await expand.waitFor();
      assert.equal(await reviewNode.evaluate(e => e.isConnected && e.open), true);
      assert.equal(await review.innerText(), originalText);
    }
    await player.click();
    await page.screenshot({ path: `${output}/after-review-expanded-${width}.png`, fullPage: true });
    assert.equal(simulations, 1, "Nested expansion restarted simulation");
    assert.equal(recapRequests, 0, "Paused AI recap still contacted the service");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    const sheet = page.locator(".mobile-detail-sheet");
    if (await sheet.count()) {
      // Native review is not an overlay; Escape/explicit close belong to the
      // enclosing advanced-view sheet. No new outside-click handler is added.
      await page.keyboard.press("Escape"); await sheet.waitFor({ state: "hidden" });
      await advanced.click(); await page.getByRole("button", { name: "Close details", exact: true }).click();
      await sheet.waitFor({ state: "hidden" });
    } else {
      await review.locator("summary").focus(); await page.keyboard.press("Space");
      assert.equal(await review.evaluate(e => e.open), false);
    }
    assert.deepEqual(errors, []);
    report.push({ width, firstVisit: "no Welcome gate", review: "mouse/touch/keyboard expand and collapse; same disclosure, results, scroll and simulation", errors });
    console.log(`${width}px passed`); await context.close();
  }
} finally { await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2)); await browser.close(); }
