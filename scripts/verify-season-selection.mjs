// Focused public selector check with isolated response fixtures. No Production requests/writes.
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const baseURL = process.env.SEASON_TEST_BASE_URL ?? "http://127.0.0.1:3002";
const output = process.env.SEASON_TEST_OUTPUT ?? "/tmp/season-selector-verification";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const results = [];
const requests = [];
const modelPlayer = { id: "8478402", name: "Connor McDavid", position: "C", teamId: "EDM", age: 29,
  games: 82, ptsPace: 138, xGPace: 40, goalsPace: 48, assistsPace: 90, avgTOI: 22,
  capHit: 12.5, yearsRemaining: 2, ops: 12, dps: 3, hasLiveStats: true };
const modelTeam = { id: "EDM", name: "Edmonton Oilers", phase: "Contender", standing: 2, capSpace: 1, conference: "Western", division: "Pacific" };

async function installFixtures(page) {
  await page.route("**/api/league**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/league/teams") return route.fulfill({ json: { teams: [modelTeam], capCeiling: 104 } });
    const season = url.searchParams.get("season");
    const gameType = Number(url.searchParams.get("gameType"));
    requests.push({ path: url.pathname, season, gameType });
    const missing = season === "20262027" && gameType === 3;
    const points = season === "20262027" ? 7 : gameType === 3 ? 6 : 138;
    const games = season === "20262027" ? 2 : gameType === 3 ? 6 : 82;
    const observedStats = { season, gameType, coverage: missing ? "missing" : "available", points: missing ? null : points,
      games: missing ? null : games, goals: 1, assists: missing ? null : points - 1, plusMinus: 1, toiMinutes: 22, savePct: null, gaa: null };
    const record = missing ? null : { wins: games - 1, losses: 1, otLosses: 0, points, gamesPlayed: games,
      goalsFor: points, goalsAgainst: 2, powerPlayPct: .2, penaltyKillPct: .8, shotsForPerGame: 30, shotsAgainstPerGame: 30,
      faceoffWinPct: .5, regulationWins: games - 1, streakCode: "", streakCount: 0, l10Record: "", clinchIndicator: "", playoffPosition: "" };
    return route.fulfill({ json: { players: [{ ...modelPlayer, observedStats }], capCeiling: 104, navMap: {},
      teams: [{ ...modelTeam, observedSelection: { season, gameType }, observedCoverage: missing ? "missing" : "available", record }] } });
  });
}
async function waitForPoints(page, value) {
  const row = page.locator(".player-row-mobile").filter({ hasText: "Connor McDavid" });
  await row.waitFor({ state: "visible" });
  await page.waitForFunction(({ value }) => [...document.querySelectorAll(".player-row-mobile")]
    .some(el => el.textContent.includes("Connor McDavid") && new RegExp(`(?:^|\\s)${value}(?:\\s|$)`).test(el.innerText)), { value });
}
try {
  for (const width of [320, 412]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    await installFixtures(page);
    await page.goto(`${baseURL}/players`, { waitUntil: "networkidle" });
    await waitForPoints(page, "7");
    const select = page.getByRole("combobox", { name: "Statistics season", exact: true });
    assert.equal(await select.inputValue(), "20262027");
    assert.ok((await select.boundingBox()).height >= 44);
    await select.selectOption("20252026");
    await waitForPoints(page, "138");
    assert.equal(new URL(page.url()).searchParams.get("season"), "20252026");
    assert.ok((await page.getByRole("link", { name: /Open player dossier/i }).first().getAttribute("href")).includes("season=20252026"));
    await page.getByRole("combobox", { name: "Statistics competition" }).selectOption("3");
    await waitForPoints(page, "6");
    await select.selectOption("20262027");
    await waitForPoints(page, "—");
    await page.getByRole("combobox", { name: "Statistics competition" }).selectOption("2");
    await waitForPoints(page, "7");
    await page.reload({ waitUntil: "networkidle" });
    await waitForPoints(page, "7");
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await mkdir(output, { recursive: true });
    await page.screenshot({ path: `${output}/players-${width}.png` });
    results.push({ surface: "players", width, switching: "passed", url: "passed", overflow: false });
    await page.close();
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  await installFixtures(page);
  await page.goto(`${baseURL}/players`, { waitUntil: "networkidle" });
  const season = page.getByRole("combobox", { name: "Statistics season", exact: true });
  await season.focus(); await page.keyboard.press("ArrowDown");
  await page.waitForFunction(() => document.querySelector('[aria-label="Statistics season"]').value === "20252026");
  assert.equal(await season.evaluate(el => el === document.activeElement), true);
  await page.keyboard.press("Tab");
  assert.equal(await page.getByRole("combobox", { name: "Statistics competition" }).evaluate(el => el === document.activeElement), true);
  await page.keyboard.press("ArrowDown");
  await page.waitForFunction(() => document.querySelector('[aria-label="Statistics competition"]').value === "3");
  results.push({ surface: "players", keyboard: "passed" });
  await page.goto(`${baseURL}/teams`, { waitUntil: "networkidle" });
  await page.getByRole("combobox", { name: "Statistics season", exact: true }).selectOption("20252026");
  await page.waitForFunction(() => location.search.includes("season=20252026"));
  await page.getByRole("combobox", { name: "Statistics competition" }).waitFor();
  assert.ok(requests.some(r => r.path === "/api/league" && r.season === "20252026" && r.gameType === 2));
  results.push({ surface: "teams", switching: "passed" });
  await writeFile(`${output}/results.json`, JSON.stringify({ results, requests }, null, 2));
  console.log(JSON.stringify({ results, requests: requests.length, evidence: output }));
} finally { await browser.close(); }
