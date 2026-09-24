// Players workflow audit across the stabilization viewport matrix.
// Usage: next build && next start, then `node scripts/mob-players-stabilization.mjs`.
// Env: MOB_BASE_URL, MOB_OUTPUT, MOB_AXE_PATH (axe-core 4.10.3 min build), MOB_VIEWPORTS ("320x568,…").
import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const base = process.env.MOB_BASE_URL ?? "http://127.0.0.1:3000";
const output = process.env.MOB_OUTPUT ?? "artifacts/mob/players-stabilization";
const axeSource = await readFile(process.env.MOB_AXE_PATH ?? "/tmp/mob-axe-4.10.3.min.js", "utf8");
const viewports = (process.env.MOB_VIEWPORTS ?? "320x568,360x800,390x844,412x915,540x720,768x1024,1024x768,1440x900")
  .split(",").map(v => { const [width, height] = v.split("x").map(Number); return { width, height }; });
const detailRoutes = (process.env.MOB_DETAIL ?? "/players/8478402,/players/8479973,/players/8480045").split(",");
const smokeRoutes = (process.env.MOB_SMOKE ?? "/,/teams/edm,/trade-machine,/admin/labs").split(",");
await mkdir(output, { recursive: true });

// Layout probe: page overflow, elements escaping the viewport outside a
// scroll container, sub-44px targets, and clipped text inside fixed boxes.
const probe = () => {
  const visible = el => el.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true });
  const describe = el => `${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${el.className && typeof el.className === "string" ? `.${el.className.trim().split(/\s+/).slice(0, 3).join(".")}` : ""}`;
  const scroller = el => {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const o = getComputedStyle(p).overflowX;
      if (o === "auto" || o === "scroll" || o === "hidden" || o === "clip") return p;
    }
    return null;
  };
  const escapes = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;
    if (r.right <= innerWidth + 1 && r.left >= -1) continue;
    const s = scroller(el);
    if (s) { const sr = s.getBoundingClientRect(); if (sr.right <= innerWidth + 1 && sr.left >= -1) continue; }
    escapes.push({ el: describe(el), left: Math.round(r.left), right: Math.round(r.right), text: el.textContent?.trim().slice(0, 40) });
  }
  // Keep only the outermost escaping elements.
  const targetRect = el => {
    const label = el.matches('input[type="checkbox"], input[type="radio"]') ? el.labels?.[0] : null;
    return (label && visible(label) ? label : el).getBoundingClientRect();
  };
  const smallTargets = [...document.querySelectorAll("button, input, select, summary, a[href], [role=tab], [role=button]")]
    .filter(visible).filter(el => !el.closest("footer"))
    .filter(el => { const r = targetRect(el); return r.width > 0 && (r.height < 44 || r.width < 44); })
    .map(el => ({ el: describe(el), name: (el.getAttribute("aria-label") ?? el.textContent ?? "").trim().slice(0, 50), w: Math.round(targetRect(el).width), h: Math.round(targetRect(el).height) }));
  const clipped = [...document.querySelectorAll("h1, h2, h3, button, a, span, div, td, th")]
    .filter(visible)
    .filter(el => {
      const cs = getComputedStyle(el);
      if (!["hidden", "clip"].includes(cs.overflowX) || cs.textOverflow === "ellipsis") return false;
      return el.scrollWidth > el.clientWidth + 2 && el.children.length === 0;
    })
    .map(el => ({ el: describe(el), text: el.textContent.trim().slice(0, 40) }));
  // Text that spills out of its own box (e.g. a long word in a narrow grid
  // cell) overlaps its neighbour without ever widening the page.
  const spills = [...document.querySelectorAll("main *")]
    .filter(visible)
    .filter(el => {
      const cs = getComputedStyle(el);
      if (cs.display.startsWith("inline") || cs.overflowX !== "visible" || el.closest("svg")) return false;
      const hasText = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
      return hasText && el.scrollWidth > el.clientWidth + 2;
    })
    .map(el => ({ el: describe(el), text: el.textContent.trim().slice(0, 40), over: el.scrollWidth - el.clientWidth }));
  return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, escapes: escapes.slice(0, 25), escapeCount: escapes.length, smallTargets, clipped: clipped.slice(0, 20), spills: spills.slice(0, 20), spillCount: spills.length };
};

const axe = async page => {
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async () => (await window.axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } }))
    .violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0, 3).map(n => n.target.join(" ")) })));
};

// Tab through the page; every focus stop must be visible on screen and carry a focus indicator.
const keyboard = async (page, stops = 25) => {
  const results = [];
  await page.evaluate(() => { document.activeElement?.blur(); window.scrollTo(0, 0); });
  for (let i = 0; i < stops; i++) {
    await page.keyboard.press("Tab");
    results.push(await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return { name: "body", ok: false };
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      const indicator = (cs.outlineStyle !== "none" && parseFloat(cs.outlineWidth) > 0) || cs.boxShadow !== "none";
      const onScreen = r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth;
      return { name: (el.getAttribute("aria-label") ?? el.textContent ?? el.tagName).trim().slice(0, 40), indicator, onScreen, ok: indicator && onScreen };
    }));
  }
  return results;
};

const browser = await chromium.launch({ args: ["--no-sandbox"], executablePath: process.env.MOB_CHROMIUM || undefined });
const report = [];
const save = () => writeFile(path.join(output, "report.json"), JSON.stringify(report, null, 2));
try {
  for (const vp of viewports) {
    const tag = `${vp.width}x${vp.height}`;
    const isTouch = vp.width < 1024;
    const context = await browser.newContext({ viewport: vp, hasTouch: isTouch, reducedMotion: "reduce", bypassCSP: true });
    await context.addInitScript(() => localStorage.setItem("cap-and-crease-welcomed-v1", "1"));
    const page = await context.newPage();
    const entry = { viewport: tag, steps: {} };
    const step = async (name, run) => {
      try { entry.steps[name] = await run(); }
      catch (error) {
        entry.steps[name] = { error: String(error).slice(0, 300) };
        console.error(`${tag} ${name}: ${String(error).split("\n")[0]}`);
        await page.screenshot({ path: path.join(output, `${tag}-FAILED-${name.replaceAll(/[^a-z0-9]/gi, "_")}.png`) }).catch(() => {});
      }
      await save();
    };
    const shot = name => page.screenshot({ path: path.join(output, `${tag}-${name}.png`), fullPage: true });
    const rows = () => page.locator(".player-row-mobile:visible, .player-row-desktop:visible");

    await step("home-to-players", async () => {
      await page.goto(`${base}/`, { waitUntil: "networkidle", timeout: 120000 });
      const headerProbe = await page.evaluate(() => { const h = document.querySelector("header, nav"); const r = h?.getBoundingClientRect(); return r ? { height: Math.round(r.height), right: Math.round(r.right) } : null; });
      await page.screenshot({ path: path.join(output, `${tag}-home-top.png`) });
      const link = page.locator('a[href="/players"]:visible').first();
      let via = "visible-link";
      if (await link.count() === 0) {
        via = "menu";
        const menu = page.getByRole("button", { name: /menu|navigation/i }).first();
        await menu.click();
        await page.locator('a[href="/players"]:visible').first().click();
      } else await link.click();
      await page.waitForURL(/\/players$/, { timeout: 30000 });
      return { via, headerProbe };
    });

    await step("players-load", async () => {
      await page.goto(`${base}/players`, { waitUntil: "networkidle", timeout: 120000 });
      await rows().first().waitFor({ state: "visible", timeout: 90000 });
      await page.screenshot({ path: path.join(output, `${tag}-players-top.png`) });
      await shot("players-full");
      return { layout: await page.evaluate(probe), axe: await axe(page) };
    });

    // Sticky chrome while browsing: header + filter bar must leave most of the viewport for results.
    await step("players-scrolled", async () => {
      await page.evaluate(() => window.scrollTo(0, 2400));
      await page.waitForTimeout(400);
      await page.screenshot({ path: path.join(output, `${tag}-players-scrolled.png`) });
      return page.evaluate(() => {
        const covered = [...document.querySelectorAll("body *")].filter(el => ["sticky", "fixed"].includes(getComputedStyle(el).position))
          .map(el => el.getBoundingClientRect()).filter(r => r.top <= 1 && r.bottom > 0 && r.height > 0)
          .reduce((max, r) => Math.max(max, r.bottom), 0);
        return { stickyBottom: Math.round(covered), share: +(covered / innerHeight).toFixed(2) };
      });
    });

    await step("players-keyboard", () => keyboard(page));

    await step("search", async () => {
      const input = page.getByLabel("Search players by name or team");
      if (!(await input.isVisible())) await page.getByRole("button", { name: /^Filter/ }).click();
      const box = await input.boundingBox();
      await input.fill("zzzzqq");
      await page.getByText("NO PLAYERS MATCH YOUR SEARCH").waitFor({ timeout: 10000 });
      await page.screenshot({ path: path.join(output, `${tag}-search-empty.png`) });
      const empty = await page.evaluate(probe);
      await input.fill("Pettersson");
      await rows().first().waitFor({ state: "visible" });
      const count = await rows().count();
      await page.screenshot({ path: path.join(output, `${tag}-search-results.png`) });
      await input.fill("");
      return { inputBox: box, emptyLayout: empty, count };
    });

    await step("filters", async () => {
      const def = page.getByRole("button", { name: "Defence", exact: true });
      if (!(await def.isVisible())) await page.getByRole("button", { name: /^Filter/ }).click();
      await def.click();
      await page.getByLabel("Filter by team").selectOption("EDM");
      await rows().first().waitFor({ state: "visible" });
      await page.screenshot({ path: path.join(output, `${tag}-filters.png`) });
      const layout = await page.evaluate(probe);
      const chips = await page.locator(".compact-filter-summary button").allInnerTexts();
      // Reset.
      await page.getByRole("button", { name: "All", exact: true }).click();
      await page.getByLabel("Filter by team").selectOption("ALL");
      return { layout, chips };
    });

    await step("sort", async () => {
      const compact = page.locator(".players-compact-sort select:visible").first();
      if (await compact.count()) {
        await compact.selectOption({ index: 2 });
        const reverse = page.locator(".players-compact-sort button:visible").first();
        await reverse.click();
        const box = await reverse.boundingBox();
        await page.screenshot({ path: path.join(output, `${tag}-sort.png`) });
        return { mode: "compact", reverseBox: box };
      }
      const header = page.locator(".players-column-header:visible button, .players-column-header:visible [role=button]").nth(2);
      await header.click();
      await page.screenshot({ path: path.join(output, `${tag}-sort.png`) });
      return { mode: "columns" };
    });

    await step("pager", async () => {
      const next = page.locator(".section-shell").first().getByRole("button", { name: /next|›|→/i }).first();
      const box = await next.boundingBox();
      await next.click();
      await page.screenshot({ path: path.join(output, `${tag}-pager.png`) });
      return { box };
    });

    // Open a dossier from deep in the list (a link already on screen, so the
    // click itself does not scroll), go Back, and compare the first card on screen.
    await step("open-and-return", async () => {
      await page.goto(`${base}/players`, { waitUntil: "networkidle", timeout: 120000 });
      await rows().first().waitFor({ state: "visible", timeout: 90000 });
      await page.evaluate(() => window.scrollTo(0, 2400));
      await page.waitForTimeout(300);
      const firstVisible = () => page.evaluate(() => {
        const row = [...document.querySelectorAll(".player-row-mobile, .player-row-desktop")]
          .filter(r => r.checkVisibility()).find(r => r.getBoundingClientRect().top > 60);
        return row?.querySelector("[aria-label^=Expand], [aria-label^=Collapse]")?.getAttribute("aria-label")?.replace(/^(Expand|Collapse) /, "") ?? null;
      });
      const before = await firstVisible();
      const scrollBefore = await page.evaluate(() => scrollY);
      let href = await page.evaluate(() => {
        const a = [...document.querySelectorAll('.player-row-mobile a[href^="/players/"]')]
          .find(el => { const r = el.getBoundingClientRect(); return el.checkVisibility() && r.top > 120 && r.bottom < innerHeight - 20; });
        if (!a) return null;
        a.click();
        return a.getAttribute("href");
      });
      if (!href) {
        await page.evaluate(() => [...document.querySelectorAll(".player-row-desktop")].find(r => { const x = r.getBoundingClientRect(); return r.checkVisibility() && x.top > 200 && x.bottom < innerHeight - 300; })?.click());
        await page.waitForTimeout(300);
        href = await page.evaluate(() => { const a = document.querySelector('.player-expanded-panel a[href^="/players/"]'); a.click(); return a.getAttribute("href"); });
      }
      await page.waitForURL(u => u.pathname === href, { timeout: 60000 });
      await page.waitForLoadState("networkidle");
      await page.screenshot({ path: path.join(output, `${tag}-detail-from-list.png`) });
      await page.goBack();
      await page.waitForURL(/\/players(\?|$)/);
      await rows().first().waitFor({ state: "visible", timeout: 90000 });
      await page.waitForTimeout(1200);
      await page.screenshot({ path: path.join(output, `${tag}-returned.png`) });
      return { href, scrollBefore, scrollAfter: await page.evaluate(() => scrollY), firstVisibleBefore: before, firstVisibleAfter: await firstVisible() };
    });

    for (const route of detailRoutes) {
      await step(`detail ${route}`, async () => {
        const response = await page.goto(`${base}${route}`, { waitUntil: "networkidle", timeout: 120000 });
        await page.screenshot({ path: path.join(output, `${tag}-detail${route.replaceAll("/", "_")}-top.png`) });
        await shot(`detail${route.replaceAll("/", "_")}`);
        const back = await page.getByRole("link", { name: /back|players/i }).first().boundingBox().catch(() => null);
        return { status: response?.status(), layout: await page.evaluate(probe), axe: await axe(page), keyboard: await keyboard(page, 15), back };
      });
    }

    await step("loading-state", async () => {
      const p2 = await context.newPage();
      await p2.route("**/api/league/players**", async route => { await new Promise(r => setTimeout(r, 4000)); await route.continue(); });
      await p2.goto(`${base}/players`, { waitUntil: "domcontentloaded" });
      await p2.waitForTimeout(1500);
      await p2.screenshot({ path: path.join(output, `${tag}-loading.png`) });
      const layout = await p2.evaluate(probe);
      const text = await p2.locator("main").innerText();
      await p2.close();
      return { layout, hasLoadingCopy: /loading/i.test(text) };
    });

    await step("error-state", async () => {
      const p2 = await context.newPage();
      await p2.route("**/api/league/players**", route => route.fulfill({ status: 500, body: "{}" }));
      await p2.goto(`${base}/players`, { waitUntil: "networkidle" });
      await p2.waitForTimeout(500);
      await p2.screenshot({ path: path.join(output, `${tag}-error.png`) });
      const layout = await p2.evaluate(probe);
      const text = await p2.locator("main").innerText();
      await p2.close();
      return { layout, errorCopy: text.match(/LOAD FAILED[^\n]*/)?.[0] ?? null };
    });

    for (const route of smokeRoutes) {
      await step(`smoke ${route}`, async () => {
        const response = await page.goto(`${base}${route}`, { waitUntil: "networkidle", timeout: 120000 });
        await page.screenshot({ path: path.join(output, `${tag}-smoke${route.replaceAll("/", "_") || "_home"}.png`) });
        const l = await page.evaluate(probe);
        return { status: response?.status(), scrollWidth: l.scrollWidth, width: l.width, escapeCount: l.escapeCount };
      });
    }

    report.push(entry);
    await save();
    console.log(`${tag} done`);
    await context.close();
  }
} finally { await browser.close(); }
