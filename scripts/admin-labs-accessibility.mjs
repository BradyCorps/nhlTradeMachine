import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { chromium } from "playwright-core";

const baseURL = process.env.MOB_BASE_URL ?? "http://127.0.0.1:3000";
const adminSession = process.env.MOB_ADMIN_SESSION_COOKIE;
const axeSource = await readFile(process.env.MOB_AXE_PATH ?? "/tmp/mob-axe-4.10.3.min.js", "utf8");
const widths = (process.env.MOB_WIDTHS ?? "320,360,390,412,540,667,768,844,1024").split(",").map(Number);

if (!adminSession) throw new Error("MOB_ADMIN_SESSION_COOKIE is required for the protected Admin Labs check.");

const browser = await chromium.launch({ headless: true, args: ["--no-sandbox"] });
const results = [];
try {
  for (const width of widths) {
    const context = await browser.newContext({
      viewport: { width, height: width >= 667 && width <= 844 ? 390 : 844 },
      reducedMotion: "reduce",
      hasTouch: true,
      bypassCSP: true,
    });
    await context.addCookies([{
      name: "admin_session",
      value: adminSession,
      url: baseURL,
      httpOnly: true,
      sameSite: "Lax",
    }]);
    const page = await context.newPage();
    const response = await page.goto(`${baseURL}/admin/labs`, { waitUntil: "networkidle", timeout: 120000 });
    assert(response?.ok(), `Admin Labs returned HTTP ${response?.status()}`);
    await page.addScriptTag({ content: axeSource });

    const violations = await page.evaluate(async () => (await axe.run(document, {
      runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21aa"] },
    })).violations.filter(violation => ["serious", "critical"].includes(violation.impact)));
    const layout = await page.evaluate(() => {
      const visible = element => element.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true });
      const targets = [...document.querySelectorAll("button, input, select, summary, a")].filter(visible);
      const smallTargets = targets.filter(element => {
        const rect = element.getBoundingClientRect();
        return rect.width < 44 || rect.height < 44;
      }).map(element => element.getAttribute("aria-label") ?? element.textContent?.trim() ?? element.tagName);
      const overflow = [...document.querySelectorAll("main, section, article")]
        .filter(visible)
        .filter(element => element.getBoundingClientRect().right > innerWidth + 1 || element.getBoundingClientRect().left < -1)
        .map(element => element.className);
      return { scrollWidth: document.documentElement.scrollWidth, smallTargets, overflow };
    });

    let labsLinkFocused = false;
    for (let index = 0; index < 32; index++) {
      await page.keyboard.press("Tab");
      labsLinkFocused = await page.evaluate(() => document.activeElement?.getAttribute("href") === "/admin/labs" && document.activeElement.matches(":focus-visible"));
      if (labsLinkFocused) break;
    }
    assert(labsLinkFocused, "Analytics Labs navigation link was not keyboard reachable with visible focus.");
    await page.keyboard.press("Enter");
    await page.waitForLoadState("networkidle");
    assert.equal(new URL(page.url()).pathname, "/admin/labs", "Keyboard activation left the protected Labs route.");

    results.push({ width, seriousOrCritical: violations.length, ...layout, labsLinkFocused });
    await context.close();
  }
} finally {
  await browser.close();
}

for (const result of results) {
  console.log(`${result.width}px: ${result.seriousOrCritical} serious/critical, ${result.overflow.length} overflow, ${result.smallTargets.length} small targets, keyboard ${result.labsLinkFocused ? "ok" : "failed"}`);
}

if (results.some(result => result.seriousOrCritical || result.overflow.length || result.scrollWidth > result.width + 1 || result.smallTargets.length || !result.labsLinkFocused)) {
  process.exitCode = 1;
}
