import { chromium } from "playwright-core";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const baseURL = process.env.MOB_BASE_URL ?? "http://127.0.0.1:3000";
const output = process.env.MOB_OUTPUT ?? "artifacts/mob";
const widths = (process.env.MOB_WIDTHS ?? "320,360,390,412,540,667,768,844,1024").split(",").map(Number);
const axeSource = await readFile(process.env.MOB_AXE_PATH ?? "/tmp/mob-axe-4.10.3.min.js", "utf8");
const routes = process.env.MOB_ROUTES?.split(",") ?? ["/", "/players", "/players/8478402", "/players/8479973", "/teams", "/teams/edm", "/docket", "/trade-machine", "/armchair-gm", "/fantasy", "/press-box", "/methodology", "/glossary"];
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const results = [];
try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: width >= 667 && width <= 844 ? 390 : 844 }, reducedMotion: "reduce", hasTouch: true, bypassCSP: true });
    await context.addInitScript(() => localStorage.setItem("cap-and-crease-welcomed-v1", "1"));
    const page = await context.newPage();
    for (const route of routes) {
      const name = `${width}-${route.replaceAll("/", "_") || "home"}`;
      try {
        const response = await page.goto(`${baseURL}${route}`, { waitUntil: "networkidle", timeout: 120000 });
        if (!response?.ok()) throw new Error(`HTTP ${response?.status()}`);
        if (route === "/players") await page.locator(".player-row-mobile, .player-row-desktop").first().waitFor({ state: "attached", timeout: 90000 });
        await page.addScriptTag({ content: axeSource });
        const violations = await page.evaluate(async () => (await axe.run(document, { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] } })).violations.map(v => ({ id: v.id, impact: v.impact, help: v.help, nodes: v.nodes.map(n => ({ target: n.target, summary: n.failureSummary })) })));
        const layout = await page.evaluate(() => {
          const visible = element => element.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true });
          const overflow = [...document.querySelectorAll("main, section, article, .player-row-mobile")].filter(visible).filter(element => element.getBoundingClientRect().right > innerWidth + 1 || element.getBoundingClientRect().left < -1).map(element => element.className);
          const targetRect = element => {
            // A checkbox's visible 44px label is also its real click target.
            const label = element.matches('input[type="checkbox"], input[type="radio"]') ? element.labels?.[0] : null;
            return (label && visible(label) ? label : element).getBoundingClientRect();
          };
          const smallTargets = [...document.querySelectorAll("button, input, select, summary, a")].filter(visible).filter(element => { const r = targetRect(element); return r.height < 44 || r.width < 44; }).map(element => ({ name: element.getAttribute("aria-label") ?? element.textContent?.trim().slice(0, 60), width: targetRect(element).width, height: targetRect(element).height }));
          return { width: innerWidth, scrollWidth: document.documentElement.scrollWidth, overflow, smallTargets };
        });
        await page.keyboard.press("Tab");
        const keyboard = await page.evaluate(() => document.activeElement !== document.body && document.activeElement?.getAttribute("aria-hidden") !== "true");
        await page.screenshot({ path: path.join(output, `${name}.png`), fullPage: true });
        results.push({ route, width, keyboard, layout, violations });
        console.log(`${name}: ${violations.filter(v => ["critical", "serious"].includes(v.impact)).length} serious/critical, ${layout.overflow.length} overflow, ${layout.smallTargets.length} small targets`);
      } catch (error) {
        results.push({ route, width, error: String(error) });
        console.error(`${name}: ${error}`);
      }
      await writeFile(path.join(output, "report.json"), JSON.stringify(results, null, 2));
    }
    await context.close();
  }
} finally { await browser.close(); }
if (results.some(result => result.error || !result.keyboard || result.layout.overflow.length || result.layout.scrollWidth > result.width + 1 || result.violations.some(v => ["critical", "serious"].includes(v.impact)))) process.exitCode = 1;
