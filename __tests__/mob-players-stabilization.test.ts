import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { teamLabelFor } from "@/app/lib/fa-pool";

const read = (path: string) => readFileSync(path, "utf8");

describe("Players mobile stabilization", () => {
  it("lets a long name wrap on its own line in the dossier header instead of truncating", () => {
    const detail = read("app/players/[playerId]/page.tsx");
    const h1 = detail.match(/<h1 className="([^"]*)">\{player\.name\}<\/h1>/);

    expect(h1).not.toBeNull();
    // Truncation is only allowed from `sm` up, where the name has room.
    expect(h1![1].split(/\s+/)).not.toContain("truncate");
    expect(h1![1]).toContain("[overflow-wrap:anywhere]");
    expect(detail).toContain('className="order-last basis-full min-w-0 sm:order-none sm:basis-0 sm:flex-1"');
  });

  it("gives the goalie stat strip three columns on phones", () => {
    const detail = read("app/players/[playerId]/page.tsx");

    expect(detail).toContain('className="grid grid-cols-3 sm:grid-cols-5 border mb-3"');
    expect(detail).not.toMatch(/className="grid grid-cols-5 /);
  });

  it("never prints the free-agent holding id as a team", () => {
    const players = read("app/players/page.tsx");
    const detail = read("app/players/[playerId]/page.tsx");

    expect(teamLabelFor("FA_POOL")).toBe("Free Agent");
    expect(teamLabelFor("EDM")).toBe("EDM");
    expect(teamLabelFor("Edmonton Oilers")).toBe("Edmonton Oilers");
    expect(players).toContain("const teamAbbr = teamLabelFor(player.teamId);");
    expect(players).toContain("{team?.name ?? teamLabelFor(player.teamId)}");
    expect(detail).toContain("{teamLabelFor(teamName)} ·");
  });

  it("keeps team, position and age attached to the name on compact cards", () => {
    const players = read("app/players/page.tsx");
    const card = players.slice(players.indexOf("Mobile card (≤639px)"), players.indexOf('className="compact-player-intelligence"'));

    expect(card).toContain('alignItems: "flex-start"');
    const name = card.indexOf("{player.name}");
    const meta = card.indexOf("{teamAbbr} ·");
    const flags = card.indexOf("<PlayerIconBadges");
    expect(name).toBeGreaterThan(-1);
    expect(meta).toBeGreaterThan(name);
    expect(flags).toBeGreaterThan(meta);
  });

  it("renders cached league data on return so Back can restore the list position", () => {
    const players = read("app/players/page.tsx");

    expect(players).toMatch(/let lastLeague: \{[^}]*\} \| null = null;/);
    expect(players).toContain("useState(() => lastLeague == null)");
    expect(players).toContain("lastLeague = { players: nextPlayers, teams: nextTeams");
  });

  it("records the list position when a dossier opens and restores it once on return", () => {
    const players = read("app/players/page.tsx");

    // The dossier link records the position at the click, before the route scrolls.
    expect(players).toContain("onClick={event => { event.stopPropagation(); rememberListScroll(); }}>Open player dossier</Link>");
    // Consumed once, only for the same list URL, after the list has rendered —
    // and kept in memory, not in browser storage /legal would have to name.
    expect(players).toContain("const takeListScroll = () => { const saved = listScroll; listScroll = null; return saved; };");
    expect(players).not.toMatch(/sessionStorage|localStorage/);
    expect(players).toContain("if (!saved || saved.url !== location.pathname + location.search) return;");
    expect(players).toMatch(/if \(loading \|\| restoredScroll\.current\) return;/);
  });

  it("brings the restarted results back below the sticky filter bar after a filter change", () => {
    const players = read("app/players/page.tsx");

    expect(players).toContain('<div ref={filterBarRef} className="players-filter-bar mob-filter-bar">');
    expect(players).toContain("<div ref={resultsRef}");
    expect(players).toContain("const resultsKey = JSON.stringify([deferredSearch, posFilter, teamFilter, sortKey, sortDir]);");
    // Skips the mount so a restored scroll position is not overridden.
    expect(players).toContain("if (lastResultsKey.current === resultsKey) return;");
  });

  it("keeps the filter entry readable and in the page column", () => {
    const css = read("app/globals.css");

    expect(css).toMatch(/\.compact-filter-summary \.filter-btn \{ font-size: 11px; \}/);
    expect(css).toMatch(/\.players-filter-bar \.compact-filter-summary \{ max-width: 1084px; margin: 0 auto; padding: 0 8px; \}/);
  });

  it("wraps the masthead dateline between phrases, not inside them", () => {
    const header = read("app/components/Header.tsx");
    const dateline = header.slice(header.indexOf("Est. 2026") - 400, header.indexOf("Est. 2026"));

    expect(dateline).toContain("flex-wrap");
    expect(dateline).toContain("[&>span]:whitespace-nowrap");
  });

  it("paints the mobile detail sheet opaque", () => {
    const css = read("app/globals.css");

    // `--paper-bg` has no :root definition, so a bare var() was transparent.
    expect(css).not.toMatch(/:root[^}]*--paper-bg\s*:/);
    expect(css).toMatch(/\.mobile-detail-sheet \{[^}]*background: var\(--paper-bg, var\(--paper\)\)/);
    expect(css).toMatch(/\.mobile-detail-heading \{[^}]*background: var\(--paper-bg, var\(--paper\)\)/);
  });

  it("keeps sheet tabs at their label width and wraps them instead of overprinting", () => {
    const css = read("app/globals.css");

    expect(css).toContain('.mobile-detail-content [role="tablist"] > [role="tab"] { flex: 1 0 auto !important; min-height: 44px; }');
    expect(css).toContain('.mobile-detail-content [role="tablist"] > a { flex: 1 0 100%; margin-left: 0 !important;');
  });

  it("keeps the player value card readable inside the narrow sheet", () => {
    const card = read("app/components/PercentileCard.tsx");

    // Overrides the sheet's overflow-wrap: anywhere, which shrank columns to one character.
    expect(card).toMatch(/\.pcard \{ width: 100%;[\s\S]*?overflow-wrap: break-word;/);
    expect(card).toMatch(/\.pcard-val \{[^}]*white-space: nowrap; \}/);
    expect(card).toMatch(/\.pcard-med \{[^}]*white-space: nowrap; \}/);
    // The name wraps rather than truncating, and the header can wrap the NAV figure below it.
    expect(card).not.toMatch(/\.pcard-name \{[^}]*text-overflow: ellipsis/);
    expect(card).toMatch(/\.pcard-head \{[^}]*flex-wrap: wrap;/);
    expect(card).toContain('<div style={{ flex: "1 1 120px", minWidth: 0 }}>');
  });
});
