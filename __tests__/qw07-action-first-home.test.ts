import { readFileSync } from "node:fs";
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

  it("offers one-action destinations before optional model details", () => {
    const modal = read("app/components/WelcomeModal.tsx");

    expect(modal).toContain('href="/players"');
    expect(modal).toContain("Search Players");
    expect(modal).toContain('href="/trade-machine"');
    expect(modal).toContain("Build a Trade");
    expect(modal).toContain('href="/teams"');
    expect(modal).toContain("Explore Teams");
    expect(modal).toContain("<details");
    expect(modal).toContain("How the models work");
    expect(modal.indexOf("Search Players")).toBeLessThan(modal.indexOf("How the models work"));
  });

  it("persists dismissal locally and exposes dialog semantics", () => {
    const modal = read("app/components/WelcomeModal.tsx");

    expect(modal).toContain('const STORAGE_KEY = "cap-and-crease-welcomed-v1"');
    expect(modal).toContain("localStorage.getItem(STORAGE_KEY)");
    expect(modal).toContain('localStorage.setItem(STORAGE_KEY, "1")');
    expect(modal).toContain("useDialog({");
    expect(modal).toContain("{...dialog}");
  });
});
