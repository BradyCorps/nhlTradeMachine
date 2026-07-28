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
