// Focused hydration/URL checks with isolated API fixtures; never mutates Production.
import { chromium } from "playwright-core";
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";

const base = process.env.PLAYERS_HYDRATION_BASE_URL ?? "http://localhost:3004";
const output = process.env.PLAYERS_HYDRATION_OUTPUT ?? "/tmp/players-hydration-verification";
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const results = [];
const paths = ["/players", "/players?q=mcdavid&season=20262027&gameType=2", "/players?q=mcdavid&player=8478402&season=20252026&gameType=3"];
const players = [
  { id: "8478402", name: "Connor McDavid", position: "C", teamId: "EDM", age: 29, ptsPace: 138, capHit: 12.5 },
  { id: "8479318", name: "Auston Matthews", position: "C", teamId: "TOR", age: 29, ptsPace: 90, capHit: 13.25 },
].map(p => ({ ...p, games: 82, xGPace: 40, goalsPace: 48, assistsPace: 90, avgTOI: 22,
  yearsRemaining: 2, hasLiveStats: true, ops: 12, dps: 3 }));
const teams = [
  { id: "EDM", name: "Edmonton Oilers", capSpace: 1, standing: 2, phase: "Contender" },
  { id: "TOR", name: "Toronto Maple Leafs", capSpace: 2, standing: 5, phase: "Contender" },
];

try {
  await mkdir(output, { recursive: true });
  for (const width of [412, 1280]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, bypassCSP: base.includes("localhost") });
    await page.addInitScript(() => localStorage.setItem("cap-and-crease-welcomed-v1", "1"));
    // Model a browser opening build-time HTML on a different calendar day.
    await page.clock.setFixedTime(new Date("2026-10-05T12:00:00Z"));
    const errors = [];
    const requests = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", msg => { if (msg.type() === "error") errors.push(msg.text()); });
    await page.route("**/api/league**", async route => {
      const url = new URL(route.request().url());
      if (url.pathname === "/api/league/teams") return route.fulfill({ json: { teams, capCeiling: 104 } });
      const season = url.searchParams.get("season");
      const gameType = Number(url.searchParams.get("gameType"));
      if (url.pathname === "/api/league/players") requests.push({ season, gameType });
      const games = season === "20252026" ? 82 : 2;
      const points = season === "20252026" ? 138 : 7;
      return route.fulfill({ json: { teams, capCeiling: 104, navMap: {}, players: players.map(p => ({ ...p,
        observedStats: { season, gameType, coverage: "available", games, points, goals: 1, assists: points - 1, toiMinutes: 22 },
      })) } });
    });
    const input = page.locator('input[aria-label="Search players by name or team"]');
    const seasonSelect = page.getByRole("combobox", { name: "Statistics season", exact: true });
    const row = name => page.locator(width < 640 ? ".player-row-mobile" : ".player-row-desktop").filter({ hasText: name }).first();
    const waitForSearch = async value => page.waitForFunction(value =>
      document.querySelector('input[aria-label="Search players by name or team"]')?.value === value, value);

    for (const path of paths) {
      const response = await page.goto(base + path, { waitUntil: "networkidle" });
      assert.equal(response.status(), 200);
      await row("Connor McDavid").waitFor({ state: "visible" });
      const query = new URL(base + path).searchParams;
      const expectedSearch = query.get("q") ?? "";
      await waitForSearch(expectedSearch);
      assert.equal(new URL(page.url()).searchParams.get("q") ?? "", expectedSearch);
      assert.equal(await seasonSelect.inputValue(), query.get("season") ?? "20262027");
      assert.equal(new URL(page.url()).searchParams.get("gameType"), query.get("gameType") ?? "2");
      assert.equal(new URL(page.url()).searchParams.get("player"), query.get("player"));
      if (query.has("player")) await page.getByRole("tab", { name: "Player Card", exact: true }).waitFor();
      await page.reload({ waitUntil: "networkidle" });
      await waitForSearch(expectedSearch);
      assert.equal(new URL(page.url()).searchParams.get("q") ?? "", expectedSearch);
      assert.equal(new URL(page.url()).searchParams.get("season"), query.get("season") ?? "20262027");
      assert.equal(new URL(page.url()).searchParams.get("gameType"), query.get("gameType") ?? "2");
      assert.equal(new URL(page.url()).searchParams.get("player"), query.get("player"));
      if (query.has("player")) await page.getByRole("tab", { name: "Player Card", exact: true }).waitFor();
      results.push({ width, path, directAndReload: "passed" });
      console.log(`${width}px direct/reload passed: ${path}`);
    }

    await page.goto(base + paths[1], { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /^Filter(?: \(\d+\))?$/ }).click();
    await input.fill("Matthews");
    await row("Auston Matthews").waitFor({ state: "visible" });
    await page.waitForFunction(() => new URL(location.href).searchParams.get("q") === "Matthews");
    await seasonSelect.selectOption("20252026");
    await page.waitForFunction(() => new URL(location.href).searchParams.get("season") === "20252026");
    await page.waitForFunction(() => [...document.querySelectorAll(".player-row-mobile, .player-row-desktop")]
      .some(el => el.textContent.includes("Auston Matthews") && el.textContent.includes("138")));
    assert.equal(requests.at(-1).season, "20252026");
    assert.equal(requests.at(-1).gameType, 2);
    assert.equal(await input.inputValue(), "Matthews");

    await page.goto(base + paths[1], { waitUntil: "networkidle" });
    await page.goto(base + "/players?q=Matthews&season=20252026&gameType=2", { waitUntil: "networkidle" });
    await page.goBack({ waitUntil: "networkidle" });
    await waitForSearch("mcdavid");
    assert.equal(await seasonSelect.inputValue(), "20262027");
    await page.goForward({ waitUntil: "networkidle" });
    await waitForSearch("Matthews");
    assert.equal(await seasonSelect.inputValue(), "20252026");

    // Exercise popstate in the mounted page, independent of full-load/bfcache restoration.
    await page.evaluate(path => {
      history.pushState(history.state, "", path);
      dispatchEvent(new PopStateEvent("popstate"));
    }, paths[2]);
    await waitForSearch("mcdavid");
    await page.getByRole("tab", { name: "Player Card", exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get("gameType"), "3");
    await page.waitForFunction(() => document.querySelector('select[aria-label="Statistics competition"]')?.value === "3");
    assert.ok(requests.some(request => request.season === "20252026" && request.gameType === 3));
    await page.goBack({ waitUntil: "networkidle" });
    await waitForSearch("Matthews");
    assert.equal(new URL(page.url()).searchParams.get("gameType"), "2");
    assert.equal(new URL(page.url()).searchParams.get("player"), null);
    await page.goForward({ waitUntil: "networkidle" });
    await waitForSearch("mcdavid");
    await page.getByRole("tab", { name: "Player Card", exact: true }).waitFor();
    assert.equal(new URL(page.url()).searchParams.get("season"), "20252026");
    assert.equal(new URL(page.url()).searchParams.get("gameType"), "3");
    assert.equal(new URL(page.url()).searchParams.get("player"), "8478402");
    assert.deepEqual(errors, []);
    await page.screenshot({ path: `${output}/players-${width}.png` });
    results.push({ width, searchSeasonBackForward: "passed", errors, requests });
    await page.close();
  }
} finally {
  await browser.close();
  await writeFile(`${output}/results.json`, JSON.stringify(results, null, 2));
}
console.log(JSON.stringify(results, null, 2));
