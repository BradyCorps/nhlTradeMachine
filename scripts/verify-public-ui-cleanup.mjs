// Isolated browser checks. API fixtures are captured public reads, never writes.
// node --import tsx scripts/verify-public-ui-cleanup.mjs
// UI_PLAYERS_FIXTURE / UI_TEAMS_FIXTURE must point to captured API JSON files.
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright-core";
import { build } from "esbuild";
import { buildLeagueProvenance } from "../app/lib/data-context.ts";
import { decodeTradeSharePayload } from "../app/lib/trade-share.ts";

const base = process.env.UI_BASE_URL ?? "http://localhost:3004";
const output = process.env.UI_OUTPUT ?? "/tmp/ui-cleanup";
const players = JSON.parse(await readFile(process.env.UI_PLAYERS_FIXTURE, "utf8"));
const teams = JSON.parse(await readFile(process.env.UI_TEAMS_FIXTURE, "utf8"));
players.provenance = buildLeagueProvenance({ kind: "players", generatedAt: players.generatedAt,
  cacheState: players.provenance.cacheState, liveStats: players.liveStats, ...players.debug });
const fixture = await build({ stdin: { contents: `
  import React from 'react';
  import {createRoot} from 'react-dom/client';
  import DocketClient from './app/docket/DocketClient';
  const verdict = {status:'FAIR',message:'Even value',flags:[],metrics:{navOut:20,navIn:20,
    homeNetGain:0,ptsGain:0,defGain:0,capDelta:0,variance:0,ewaHome:0,cwiYears:0}};
  const entry = {id:'pending',executedDate:'2026-10-01',sourceUrl:null,season:'2026-27',teams:['WPG','FLA'],
    winner:'WPG',fairness:'WIN',navMargin:12,packages:[],conditions:null,lockedVerdict:null,
    atTradeVerdict:'Frozen WPG result',todayVerdict:'Pending live re-grade',todayWinner:null,
    todayNavMargin:null,todayLockedVerdict:null,rosterMutating:false};
  createRoot(document.getElementById('fixture')).render(<DocketClient entries={[
    entry,{...entry,id:'unavailable',todayVerdict:'Today grade unavailable'},
    {...entry,id:'even',winner:null,fairness:'FAIR',navMargin:0,todayVerdict:'Even value',
      todayNavMargin:0,todayLockedVerdict:verdict}
  ]}/>);
`, loader: "tsx", resolveDir: process.cwd() }, bundle: true, write: false, platform: "browser",
  jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ["--no-sandbox"] });
const results = [];
try {
  for (const width of [320, 412, 768, 1024, 1440]) {
    const page = await browser.newPage({ viewport: { width, height: 1000 }, bypassCSP: true });
    page.setDefaultTimeout(8000);
    await page.route("**/*", route => route.request().headers()["next-router-prefetch"]
      ? route.abort() : route.continue());
    await page.route("**/api/league**", route => {
      const u = new URL(route.request().url());
      if (u.pathname.endsWith("/teams")) return route.fulfill({ json: teams });
      const season = u.searchParams.get("season") ?? "20262027";
      const gameType = Number(u.searchParams.get("gameType") ?? 2);
      if (u.pathname === "/api/league") return route.fulfill({ json: { ...players, ...teams,
        provenance: players.provenance,
        teams: teams.teams.map(t => ({ ...t, observedSelection: { season, gameType } })),
      } });
      return route.fulfill({ json: { ...players, players: players.players.map(p => ({ ...p,
        observedStats: { ...p.observedStats, season, gameType },
      })) } });
    });
    await page.goto(`${base}/players?q=mcdavid&season=20262027&gameType=2`, { waitUntil: "networkidle" });
    const visibleRows = page.locator(".player-row-mobile:visible, .player-row-desktop:visible");
    await visibleRows.first().waitFor();
    const context = page.locator('section[aria-label="Data context"]');
    assert.match(await context.innerText(), /Observed statistics:\s*2026–27 regular season/i);
    assert.match(await context.innerText(), /Model inputs:\s*2025-26/i);
    const measure = async () => page.evaluate(() => {
      const bad = [];
      for (const row of document.querySelectorAll(".player-row-desktop, .player-row-mobile")) {
        if (!row.checkVisibility()) continue;
        const bounds = el => el.getBoundingClientRect();
        const badge = row.querySelector(".player-icon-badges");
        if (!badge) continue;
        const cell = row.matches(".player-row-desktop") ? row.children[2] : badge.parentElement;
        const b = bounds(cell);
        for (const el of [badge, ...badge.querySelectorAll("button, span")]) {
          const r = bounds(el);
          if (r.left < b.left - 1 || r.right > b.right + 1) bad.push(`${row.textContent.slice(0,40)}: badge escaped player column`);
        }
        if (row.matches(".player-row-desktop")) {
          const r = bounds(badge);
          for (const numeric of [...row.children].slice(3)) {
            const n = bounds(numeric);
            if (r.right > n.left && r.left < n.right && r.bottom > n.top && r.top < n.bottom) bad.push("badge overlaps STRAND/stat column");
          }
        }
      }
      // Check actual text fragments: a whole word must not split across lines.
      for (const header of document.querySelectorAll(".players-column-header .col-header")) {
        if (!header.checkVisibility()) continue;
        for (const node of header.childNodes) {
          if (node.nodeType !== Node.TEXT_NODE) continue;
          for (const word of node.textContent.matchAll(/[A-Za-z]+/g)) {
            const range = document.createRange();
            range.setStart(node, word.index); range.setEnd(node, word.index + word[0].length);
            if (range.getClientRects().length > 1) bad.push(`heading word split: ${word[0]}`);
          }
        }
      }
      return { bad, overflow: document.documentElement.scrollWidth - innerWidth };
    });
    assert.deepEqual((await measure()).bad, []);
    const flags = page.getByRole("button", { name: "Explain Connor McDavid player flags", exact: true }).filter({ visible: true });
    await flags.scrollIntoViewIfNeeded(); await flags.focus();
    await page.waitForTimeout(250); // The flag dialog deliberately closes on scroll.
    await page.keyboard.press("Enter");
    await page.getByRole("dialog").waitFor(); await page.keyboard.press("Escape");
    const expand = page.getByRole("button", { name: "Expand Connor McDavid", exact: true }).filter({ visible: true });
    await expand.focus(); await page.keyboard.press("Enter");
    await page.getByRole("tab", { name: "Player Card", exact: true }).waitFor();
    if (await page.getByRole("dialog").count()) await page.keyboard.press("Escape");
    else await page.getByRole("button", { name: "Collapse Connor McDavid", exact: true }).filter({ visible: true }).click();
    await page.screenshot({ path: `${output}/after-players-${width}.png`, fullPage: true });
    await page.getByRole("combobox", { name: "Statistics season", exact: true }).selectOption("20252026");
    await page.getByRole("combobox", { name: "Statistics competition", exact: true }).selectOption("3");
    await page.waitForFunction(() => location.search.includes("gameType=3"));
    assert.match(await context.innerText(), /Observed statistics:\s*2025–26 playoffs/i);
    await page.getByRole("button", { name: /^Filter/ }).click();
    const search = page.getByRole("textbox", { name: "Search players by name or team" });
    // Real long names and high-flag players from the captured source, no name exceptions in the app.
    const names = ["Oliver Ekman-Larsson", "Ryan Nugent-Hopkins", "Alexander Ovechkin"]
      .filter(name => players.players.some(p => p.name === name));
    for (const name of names) {
      await search.fill(name);
      await page.waitForFunction(name => [...document.querySelectorAll(".player-row-mobile, .player-row-desktop")]
        .some(el => el.checkVisibility() && el.textContent.includes(name)), name);
      assert.deepEqual((await measure()).bad, []);
    }
    await search.fill("");
    const compactSort = page.getByRole("combobox", { name: "Forwards sort metric", exact: true });
    if (await compactSort.isVisible()) await compactSort.selectOption("cap");
    else await page.locator(".players-column-header:visible").first().getByRole("button", { name: /^Contract/ }).click();
    assert.deepEqual((await measure()).bad, []);
    await page.goto(`${base}/teams?season=20252026&gameType=3`, { waitUntil: "networkidle" });
    await page.locator('section[aria-label="Data context"]').first().waitFor();
    assert.match(await page.locator('section[aria-label="Data context"]').first().innerText(), /Observed statistics:\s*2025–26 playoffs/i);
    assert.match(await page.locator('section[aria-label="Data context"]').first().innerText(), /Model inputs:\s*2025-26/i);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    await page.screenshot({ path: `${output}/after-teams-${width}.png`, fullPage: true });
    // Render only the existing Docket client with isolated absent/valid grades.
    const styles = await page.locator('link[rel="stylesheet"]').evaluateAll(els => els.map(el => el.outerHTML).join(""));
    await page.setContent(`<html><head>${styles}</head><body style="background:var(--paper);color:var(--ledger-ink)"><main style="max-width:1180px;margin:auto;padding:18px"><div id="fixture"></div></main></body></html>`);
    await page.addScriptTag({ content: fixture.outputFiles[0].text });
    await page.getByText("TODAY: Not yet graded", { exact: true }).waitFor();
    const articles = page.locator("article");
    assert.equal(await articles.filter({ hasText: "Not yet graded" }).count(), 1);
    assert.equal(await articles.filter({ hasText: "Grade unavailable" }).count(), 1);
    assert.equal(await articles.filter({ hasText: "TODAY: EVEN +0.0 NAV" }).count(), 1);
    await page.screenshot({ path: `${output}/after-docket-${width}.png`, fullPage: true });
    await page.getByRole("combobox", { name: "AT-TRADE WINNER", exact: true }).selectOption("EVEN");
    assert.equal(await articles.count(), 1);
    assert.match(await articles.first().innerText(), /Frozen WPG result/);
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    await page.goto(`${base}/trade-machine`, { waitUntil: "networkidle" });
    await page.getByLabel("Team sending assets").selectOption("WPG");
    await page.getByRole("button", { name: "Add Connor Hellebuyck to the package", exact: true }).click();
    await page.evaluate(() => document.getElementById("trade-team-b-tab")?.click());
    await page.getByLabel("Team sending return").selectOption("FLA");
    await page.getByRole("button", { name: "Add Anton Lundell to the package", exact: true }).click();
    const audit = page.getByRole("button", { name: /Run GM Audit/ });
    await audit.click();
    const generate = page.getByRole("button", { name: /Generate Share Link/ });
    await page.waitForFunction(() => ![...document.querySelectorAll("button")]
      .find(b => /Generate Share/.test(b.textContent))?.disabled);
    assert.match(await page.locator("main").innerText(), /Team fit assessment/);
    await page.screenshot({ path: `${output}/after-trade-${width}.png`, fullPage: true });
    await generate.click();
    const url = await page.getByLabel("Locked verdict share link").inputValue();
    const locked = decodeTradeSharePayload(new URL(url).pathname.split("/").at(-1)).lockedVerdict;
    await page.goto(url, { waitUntil: "networkidle" });
    const shared = await page.locator("main").innerText();
    assert.match(shared, /Connor Hellebuyck/); assert.match(shared, /Anton Lundell/);
    assert.match(shared, /LOCKED AUDIT · NAV BALANCE \/ FEASIBILITY/);
    if (locked.sideOutcomes?.length) assert.match(shared, /Team fit assessment/);
    assert.ok(shared.includes(locked.status));
    assert.ok(shared.includes(locked.metrics.homeNetGain.toFixed(1)));
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth), 0);
    await page.screenshot({ path: `${output}/after-shared-${width}.png`, fullPage: true });
    results.push({ width, badges: "contained; no STRAND/stat overlap", interactions: "search, selection, flags, expansion, sorting, keyboard passed", docket: "pending/unavailable/zero and frozen filter passed", trade: "audit, share/reopen, locked NAV and status passed" });
    console.log(`${width}px passed`);
    await page.close();
  }
} finally {
  await writeFile(`${output}/ui-report.json`, JSON.stringify(results, null, 2));
  await browser.close();
}
