// ── OFF1: the phase CTA must name where the user actually goes ───
// The offer-sheet screen promised "Proceed to Free Agency" when free agency
// had already happened two screens earlier, inside the re-sign phase's open
// market. Four screens each wrote their own label with nothing tying it to the
// transition performed.
import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";
import { OFFSEASON_FLOW, offseasonCta, offseasonNext, type OffseasonPhase } from "@/app/lib/offseason-phases";

const read = (p: string) => fs.readFileSync(path.join(process.cwd(), p), "utf8");

describe("offseason phase order", () => {
  it("ends the offer-sheet phase at the season, not at free agency", () => {
    expect(offseasonNext("OFFER_SHEETS")).toBe("SEASON");
    expect(offseasonCta("OFFER_SHEETS")).not.toMatch(/free agency/i);
    expect(offseasonCta("OFFER_SHEETS")).toContain("Armchair GM");
  });

  it("routes both draft entry points to the re-sign phase", () => {
    expect(offseasonNext("DRAFT_NIGHT")).toBe("RESIGN");
    expect(offseasonNext("DRAFT_SUMMARY")).toBe("RESIGN");
  });

  it("puts offer sheets after re-signing", () => {
    expect(offseasonNext("RESIGN")).toBe("OFFER_SHEETS");
  });

  it("never promises a phase that does not follow", () => {
    // A label naming a phase must name the one it actually leads to.
    const named: Record<OffseasonPhase, RegExp> = {
      DRAFT_NIGHT:   /re-sign/i,
      DRAFT_SUMMARY: /re-sign/i,
      RESIGN:        /offer sheet/i,
      OFFER_SHEETS:  /armchair gm/i,
    };
    for (const phase of Object.keys(OFFSEASON_FLOW) as OffseasonPhase[]) {
      expect(offseasonCta(phase), `${phase} CTA`).toMatch(named[phase]);
    }
  });

  it("reaches the season from every phase by following `next`", () => {
    for (const start of Object.keys(OFFSEASON_FLOW) as OffseasonPhase[]) {
      let at: string = start, hops = 0;
      while (at !== "SEASON" && hops++ < 10) at = offseasonNext(at as OffseasonPhase);
      expect(at, `${start} must terminate`).toBe("SEASON");
    }
  });
});

describe("the phase screens read from the shared table", () => {
  const screens: [string, OffseasonPhase][] = [
    ["app/components/DraftNight.tsx", "DRAFT_NIGHT"],
    ["app/armchair-gm/CupRunDraftSummaryModal.tsx", "DRAFT_SUMMARY"],
    ["app/components/ResignPhase.tsx", "RESIGN"],
    ["app/components/OfferSheetPhase.tsx", "OFFER_SHEETS"],
  ];

  it.each(screens)("%s uses offseasonCta for its phase", (file, phase) => {
    const src = read(file);
    expect(src).toContain(`offseasonCta("${phase}")`);
  });

  it("leaves no hardcoded phase CTA behind", () => {
    for (const [file] of screens) {
      expect(read(file), file).not.toMatch(/Done — Proceed to Free Agency/);
    }
  });
});

// ── OFF4: the RFA screen matches the FA screen's analytics ──────
// An offer sheet costs picks and cap and can be matched. Committing to one
// while seeing less about the player than a UFA on the previous screen is
// backwards.
describe("OFF4 — offer-sheet rows carry the same analytics as the market", () => {
  const shared = () => read("app/components/OffseasonPlayerAnalytics.tsx");

  it("has one implementation of the expandable panel, not two", () => {
    // "Match the FA analytics" is a guarantee that only holds if it is shared.
    const s = shared();
    expect(s).toContain("export function ExpandedStats");
    expect(s).toContain("export function AnalyticsDisclosure");
    expect(s).toContain("export function StatLine");
    for (const screen of ["app/components/ResignPhase.tsx", "app/components/OfferSheetPhase.tsx"]) {
      expect(read(screen), screen).toContain('from "@/app/components/OffseasonPlayerAnalytics"');
    }
  });

  it("both screens use the shared disclosure and the shared panel", () => {
    for (const screen of ["app/components/ResignPhase.tsx", "app/components/OfferSheetPhase.tsx"]) {
      const src = read(screen);
      expect(src, screen).toContain("<AnalyticsDisclosure");
      expect(src, screen).toMatch(/isExpanded && <ExpandedStats/);
    }
  });

  it("gives the offer-sheet screen a NAV source so the panel is not blank", () => {
    expect(read("app/components/OfferSheetPhase.tsx")).toContain("navMap");
    expect(read("app/armchair-gm/page.tsx")).toMatch(/rfaMarket=\{rfaMarket\}[\s\S]{0,120}navMap=\{navMap\}/);
  });

  it("keeps the disclosure header-only so the panel can span the row", () => {
    // Nesting the grid inside the name column made it unreadable.
    const s = shared();
    expect(s).not.toMatch(/AnalyticsDisclosure[\s\S]{0,1200}\{expanded && <ExpandedStats/);
  });

  it("holds the offer-sheet screen to the same 10px AA floor", () => {
    const sizes = [...read("app/components/OfferSheetPhase.tsx").matchAll(/text-\[(\d+)px\]/g)]
      .map(m => Number(m[1]));
    expect(Math.min(...sizes)).toBeGreaterThanOrEqual(10);
  });
});
