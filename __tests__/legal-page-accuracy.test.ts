import { describe, it, expect } from "vitest";
import fs from "node:fs";
import path from "node:path";

// ── The privacy page has to stay true ────────────────────────────
//
// A privacy statement is the one document that is worse than useless when it
// drifts: it keeps making a promise the code stopped keeping, and it does it
// with authority. `/legal` names specific browser-storage keys and specific
// third parties precisely so a reader can check it — which only helps if
// somebody actually checks.
//
// These are canaries, not unit tests. Each one pins an INTENT stated on that
// page against what the source now does. If one fails, the fix is usually to
// update the page, not the test.

const ROOT = path.join(__dirname, "..");
const LEGAL = fs.readFileSync(path.join(ROOT, "app/legal/page.tsx"), "utf-8");

/** Every .ts/.tsx file under app/, minus the admin area. */
function appSources(includeAdmin = false): { file: string; text: string }[] {
  const out: { file: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      const rel = path.relative(ROOT, full);
      if (!includeAdmin && (rel.includes("app/admin") || rel.includes("app/api/admin"))) continue;
      if (entry.isDirectory()) walk(full);
      else if (/\.tsx?$/.test(entry.name)) out.push({ file: rel, text: fs.readFileSync(full, "utf-8") });
    }
  };
  walk(path.join(ROOT, "app"));
  return out;
}

describe("legal page — the storage it promises to name", () => {
  it("names every browser-storage key the app writes", () => {
    // The page says what is kept in your browser and lists the keys. A new key
    // that nobody added to the list turns that list into a false statement.
    const declared = new Set<string>();
    for (const { text } of appSources()) {
      // `const FOO_KEY = "..."` and zustand's `persist(..., { name: "..." })`
      for (const m of text.matchAll(/(?:STORAGE_KEY|_KEY)\s*(?::\s*string)?\s*=\s*["'`]([^"'`]+)["'`]/g)) {
        declared.add(m[1]);
      }
      for (const m of text.matchAll(/name:\s*['"]([a-z0-9][a-z0-9:_-]{4,})['"]/gi)) {
        // Only the persisted-store name, not every `name:` field in the app.
        if (/persist\(/.test(text)) declared.add(m[1]);
      }
    }
    // Cache keys live in Redis on the server, not in anyone's browser.
    const browserKeys = [...declared].filter(k => !k.startsWith("cache:"));

    expect(browserKeys.length).toBeGreaterThan(0);
    const undocumented = browserKeys.filter(k => !LEGAL.includes(k));
    expect(undocumented, `not named on /legal: ${undocumented.join(", ")}`).toEqual([]);
  });

  it("still says the browser storage never leaves the device", () => {
    expect(LEGAL).toMatch(/never sent to the server/i);
  });
});

describe("legal page — the claims that are checkable in code", () => {
  it('claims "no cookies are set for visitors", and none are', () => {
    // The admin session cookie is excluded on purpose — the page says the only
    // cookie is the author's own admin session, and that a reader will never
    // receive one.
    const setters = appSources()
      .filter(({ text }) => /cookies\(\)\s*\.\s*set\b|["']Set-Cookie["']|document\.cookie\s*=/.test(text))
      .map(s => s.file);
    expect(setters, `these set a cookie outside the admin area: ${setters.join(", ")}`).toEqual([]);
    expect(LEGAL).toMatch(/No cookies are set for visitors/i);
  });

  it('claims no advertising or cross-site tracking, and ships no tracker', () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf-8"));
    const deps = Object.keys(pkg.dependencies ?? {});
    // Vercel Speed Insights IS disclosed by name on the page. Anything else in
    // this family would not be.
    const trackers = deps.filter(d =>
      /analytics|gtag|google-tag|posthog|plausible|mixpanel|segment|amplitude|hotjar|fullstory|clarity/i.test(d)
      && d !== "@vercel/speed-insights");
    expect(trackers, `undisclosed analytics dependency: ${trackers.join(", ")}`).toEqual([]);
    expect(LEGAL).toMatch(/no advertising/i);
    expect(LEGAL).toMatch(/Speed Insights/);
  });

  it("discloses the only third party a visitor's input is sent to", () => {
    // The narrative feature posts the built trade to Anthropic. If a second
    // outbound destination for user-built content appears, this page is
    // incomplete until it says so.
    expect(LEGAL).toMatch(/Anthropic/);
    expect(LEGAL).toMatch(/Buy Me a Coffee/);
    expect(LEGAL).toMatch(/Vercel/);
  });

  it("claims shared trades are not stored, and the share path stores nothing", () => {
    const share = fs.readFileSync(path.join(ROOT, "app/lib/trade-share.ts"), "utf-8");
    // Encoded into the link, never written down. A db insert here would make
    // "there is no database of shared trades" false.
    expect(share).toMatch(/base64UrlEncode/);
    expect(share).not.toMatch(/\.insert\(|drizzle|redis/i);
    expect(LEGAL).toMatch(/no database of shared trades/i);
  });
});

describe("legal page — the things a donation page must not imply", () => {
  it("says plainly that a donation buys nothing", () => {
    // The one paragraph most likely to be read the way it was not meant.
    expect(LEGAL).toMatch(/not a purchase/i);
    expect(LEGAL).toMatch(/not refundable/i);
    expect(LEGAL).toMatch(/not tax-deductible/i);
    expect(LEGAL).toMatch(/free to everyone/i);
  });

  it("disclaims affiliation and denies advice, in those words", () => {
    expect(LEGAL).toMatch(/not affiliated with, endorsed by/i);
    expect(LEGAL).toMatch(/is financial, betting, investment/i);
    expect(LEGAL).toMatch(/Do not wager on it/i);
    expect(LEGAL).toMatch(/without any warranty/i);
  });
});

describe("the repository's own notices", () => {
  it("ships a licence that does not claim what it cannot", () => {
    const licence = fs.readFileSync(path.join(ROOT, "LICENSE"), "utf-8");
    expect(licence).toMatch(/All rights reserved/i);
    // The repository holds NHL- and MoneyPuck-derived material. A licence that
    // read as covering it would be asserting ownership of someone else's data.
    expect(licence).toMatch(/no ownership of it is asserted/i);
    expect(licence).toMatch(/grants any right in third-party material/i);
  });

  it("ships a security policy with a private reporting route and no promise of money", () => {
    const security = fs.readFileSync(path.join(ROOT, "SECURITY.md"), "utf-8");
    expect(security).toMatch(/do not open a public issue/i);
    expect(security).toMatch(/no bug bounty and no payment/i);
  });
});
