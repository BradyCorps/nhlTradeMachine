// ── OFF3: the offseason gets a future tense ──────────────────────
// Signing a big UFA today can make an extension two summers away impossible.
// That consequence existed; nothing surfaced it. These pin the projection.
import { describe, expect, it } from "vitest";
import {
  buildCapHorizon, withProjectedSigning, firstSeasonOverCap, horizonSeasonLabel,
  type HorizonPlayer,
} from "@/app/lib/cap-horizon";

const p = (
  id: string, capHit: number, yearsRemaining: number,
  over: Partial<HorizonPlayer> = {},
): HorizonPlayer => ({
  id, name: id, teamId: "WPG", position: "C", capHit, yearsRemaining, ...over,
});

// Flat ceiling keeps the arithmetic legible; the escalator is season-config's job.
const flat = () => 100;

describe("horizonSeasonLabel", () => {
  it("formats consecutive seasons", () => {
    expect(horizonSeasonLabel(2026, 0)).toBe("2026-27");
    expect(horizonSeasonLabel(2026, 2)).toBe("2028-29");
    expect(horizonSeasonLabel(2029, 0)).toBe("2029-30");
  });
});

describe("buildCapHorizon", () => {
  const roster = [
    p("scheifele", 8.5, 3),
    p("morrissey", 6.25, 2),   // expires after 2027-28
    p("connor", 7.14, 1),      // expires after 2026-27
    p("pick", 0, 0, { position: "Pick" }),
    p("other-team", 9, 5, { teamId: "SJS" }),
  ];
  const horizon = () => buildCapHorizon(roster, { teamId: "WPG", startYear: 2026, ceilingFor: flat });

  it("counts a contract in every season it covers, and none after", () => {
    const h = horizon();
    expect(h.map(s => s.committed)).toEqual([21.9, 14.8, 8.5]);
  });

  it("excludes picks, unsigned players and other teams", () => {
    const ids = horizon()[0].contracts.map(c => c.id);
    expect(ids).toEqual(["scheifele", "connor", "morrissey"]); // by cap hit desc
    expect(ids).not.toContain("pick");
    expect(ids).not.toContain("other-team");
  });

  it("names the deals ending in each season — next summer's decisions", () => {
    const h = horizon();
    expect(h[0].expiring.map(c => c.id)).toEqual(["connor"]);
    expect(h[1].expiring.map(c => c.id)).toEqual(["morrissey"]);
    expect(h[2].expiring.map(c => c.id)).toEqual(["scheifele"]);
  });

  it("reports space against the ceiling", () => {
    expect(horizon().map(s => s.space)).toEqual([78.1, 85.2, 91.5]);
  });

  it("applies retention, so a retained hit is not double-counted", () => {
    const h = buildCapHorizon([p("retained", 10, 2, { retainedPct: 0.5 })],
      { teamId: "WPG", startYear: 2026, ceilingFor: flat });
    expect(h[0].committed).toBe(5);
  });

  it("uses the projected ceiling by default rather than a flat one", () => {
    const h = buildCapHorizon([p("a", 5, 3)], { teamId: "WPG", startYear: 2026 });
    expect(h[0].ceiling).toBeGreaterThan(0);
    expect(h[2].ceiling).toBeGreaterThanOrEqual(h[0].ceiling);
  });
});

describe("withProjectedSigning — the Kucherov/Morrissey problem", () => {
  // WPG has room today. Morrissey's deal ends after 2027-28, so his extension
  // is a 2028-29 charge. A six-year UFA signed now must not hide that.
  const roster = [p("scheifele", 8.5, 6), p("morrissey", 6.25, 2)];
  const horizon = buildCapHorizon(roster, { teamId: "WPG", startYear: 2026, ceilingFor: () => 20 });

  it("shows room before the signing", () => {
    expect(horizon.map(s => s.space)).toEqual([5.2, 5.2, 11.5]);
  });

  it("charges the new deal in every season it covers", () => {
    const after = withProjectedSigning(horizon, { id: "kucherov", name: "Kucherov", aav: 12, term: 6 });
    expect(after.map(s => s.committed)).toEqual([26.8, 26.8, 20.5]);
    expect(after.map(s => s.space)).toEqual([-6.8, -6.8, -0.5]);
  });

  it("flags the first season it breaks the cap", () => {
    const after = withProjectedSigning(horizon, { id: "kucherov", name: "Kucherov", aav: 12, term: 6 });
    expect(firstSeasonOverCap(after)?.label).toBe("2026-27");
    expect(firstSeasonOverCap(horizon)).toBeNull();
  });

  it("only bites in the seasons a short deal actually covers", () => {
    const after = withProjectedSigning(horizon, { id: "rental", name: "Rental", aav: 12, term: 1 });
    expect(after.map(s => s.space)).toEqual([-6.8, 5.2, 11.5]);
  });

  it("carries the new contract's own expiry into the horizon", () => {
    const after = withProjectedSigning(horizon, { id: "x", name: "X", aav: 1, term: 2 });
    expect(after[1].expiring.map(c => c.id)).toContain("x");
    expect(after[0].expiring.map(c => c.id)).not.toContain("x");
  });

  it("leaves the original horizon untouched", () => {
    const before = horizon.map(s => s.committed);
    withProjectedSigning(horizon, { id: "y", name: "Y", aav: 9, term: 3 });
    expect(horizon.map(s => s.committed)).toEqual(before);
  });
});

// ── OFF3 wiring ──────────────────────────────────────────────────
import fs from "fs";
import path from "path";
const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("OFF3 — the Re-Sign screen shows the horizon", () => {
  it("builds the horizon from the live roster and renders it", () => {
    const src = read("app/components/ResignPhase.tsx");
    expect(src).toContain("buildCapHorizon(roster");
    expect(src).toContain("<CapHorizon horizon={horizon} />");
  });

  it("gives the advanced-stat expander a real touch target", () => {
    // It was a ~10px glyph with padding: 0 — under the 44px minimum.
    const src = read("app/components/ResignPhase.tsx");
    const chevron = src.slice(src.indexOf('aria-hidden="true"'));
    expect(chevron.slice(0, 400)).toContain("tap-target");
    expect(chevron.slice(0, 400)).not.toContain("padding: 0,");
  });
});

describe("OFF3 — CapHorizon accessibility", () => {
  const src = () => read("app/components/CapHorizon.tsx");

  it("has no text below the 10px AA floor", () => {
    const sizes = [...src().matchAll(/text-\[(\d+)px\]/g)].map(m => Number(m[1]));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(10);
  });

  it("is a real table with scoped headers and a caption", () => {
    const s = src();
    expect(s).toContain("<caption");
    expect(s).toContain('scope="col"');
    expect(s).toContain('scope="row"');
  });

  it("states expiry in words rather than by colour", () => {
    const s = src();
    expect(s).toMatch(/RFA.*:.*UFA|"RFA" : "UFA"/s);
  });

  it("labels over-cap seasons in text, not just red", () => {
    expect(src()).toContain('s.space < 0 ? " over" : ""');
  });

  it("exposes the collapse state to assistive tech", () => {
    expect(src()).toContain("aria-expanded={open}");
  });
});
