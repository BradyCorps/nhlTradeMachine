import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("MOB-03 Players responsive layout", () => {
  it("switches the row, header, and compact sort control from section width", () => {
    const css = read("app/globals.css");
    const playersCss = css.slice(
      css.indexOf("/* ── Players analytics page"),
      css.indexOf("/* Trade proposal sends"),
    );

    expect(playersCss).toContain("container-name: player-ledger");
    expect(playersCss).toContain("container-type: inline-size");
    expect(playersCss).toMatch(/@container player-ledger \(min-width:\s*1040px\)/);
    expect(playersCss).toMatch(/\.player-row-desktop\s*\{\s*display:\s*none\s*!important/);
    expect(playersCss).toMatch(/\.player-row-mobile\s*\{\s*display:\s*block\s*!important/);
    expect(playersCss).toMatch(/\.players-column-header\s*\{\s*display:\s*none\s*!important/);
    expect(playersCss).toMatch(/@container player-ledger[\s\S]*?\.players-column-header\s*\{\s*display:\s*grid\s*!important/);
    expect(playersCss).toMatch(/\.col-header\s*\{[\s\S]*?white-space:\s*normal;[\s\S]*?overflow-wrap:\s*anywhere;/);
    expect(playersCss).not.toMatch(/@media \(max-width:\s*639px\)\s*\{\s*\.player-row-desktop/);
  });

  it("keeps sorting and the controlling value available on compact cards", () => {
    const players = read("app/players/page.tsx");

    expect(players).toContain('className="players-compact-sort"');
    expect(players).toContain('aria-label={`${sectionLabel} sort metric`}');
    expect(players).toContain("const activeColumn");
    expect(players).toContain("const compactColumns");
    expect(players).toContain('label={index === 0 ? `Sort: ${column.label}` : column.label}');
    expect(players).toContain('className="player-row-expand tap-target"');
  });

  it("does not hide compact-card stats in a nested horizontal scroller", () => {
    const css = read("app/globals.css");
    const statRow = css.slice(
      css.indexOf(".player-mobile-stat-row"),
      css.indexOf(".player-expanded-panel"),
    );

    expect(statRow).toContain("grid-template-columns: repeat(3, minmax(0, 1fr))");
    expect(statRow).not.toContain("overflow-x");
    expect(statRow).not.toContain("scrollbar-width");
  });

  it("labels and cues the remaining local extension scroller, then wraps it on wider containers", () => {
    const players = read("app/players/page.tsx");
    const css = read("app/globals.css");

    expect(players).toContain('className="fresh-ink-row"');
    expect(players).toContain('aria-label="Recent contract extensions"');
    expect(players).toContain('label="Swipe or scroll for recent extensions"');
    expect(css).toMatch(/@media \(min-width:\s*768px\)[\s\S]*?\.fresh-ink-row\s*\{[\s\S]*?flex-wrap:\s*wrap/);
  });
});
