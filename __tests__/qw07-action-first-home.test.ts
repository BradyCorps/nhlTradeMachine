import { readFileSync } from "node:fs";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import Home from "@/app/page";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("QW-07 action-first homepage", () => {
  it("puts the three primary product actions ahead of the editorial", () => {
    const page = read("app/page.tsx");
    const actions = [
      ['href="/players"', "Search Players"],
      ['href="/trade-machine"', "Build a Trade"],
      ['href="/teams"', "Explore Teams"],
    ] as const;

    for (const [href, label] of actions) {
      expect(page).toContain(href);
      expect(page).toContain(label);
    }

    expect(page.indexOf("Search Players")).toBeLessThan(page.indexOf("Staff Editorial"));
    expect(page).toContain('aria-label="Start here"');
    expect(page).toContain("min-h-11");
  });

  it("keeps the newspaper cover without a full-screen scroll gate", () => {
    const page = read("app/page.tsx");

    expect(page).toContain("cap-and-crease-wordmark.svg");
    expect(page).toContain("On the Business of Building a Hockey Team");
    expect(page).not.toContain("ScrollNameplate");
    expect(page).not.toContain("ScrollSnap");
    expect(page).not.toContain("LedgerScrollSetdown");
    expect(page).not.toContain("fp-desk-spacer");
  });

  it("renders direct navigation, creator editorial, and an explicitly labelled support link", () => {
    const html = renderToStaticMarkup(React.createElement(Home));
    expect(html).toContain('href="/players"');
    expect(html).toContain('href="/trade-machine"');
    expect(html).toContain('href="/teams"');
    expect(html).toContain('href="https://buymeacoffee.com/capandcrease"');
    expect(html).toContain('aria-label="Buy me a stick tap — support Cap &amp; Crease"');
    expect(html).toContain("Turns out, it’s very hard.");
    expect(html).toContain("— Brady, creator of Cap &amp; Crease");
    expect(html).not.toContain('role="dialog"');
  });
});
