import { describe, it, expect } from "vitest";
import {
  contractVerdict,
  surplusText,
  verdictColor,
  verdictMargin,
  MODEL_PRICE_LABEL,
} from "@/app/lib/contract-verdict";
import { SKATER_FMV_VALIDATION } from "@/app/lib/skater-fmv";
import { FMV_VALIDATION as GOALIE_FMV_VALIDATION } from "@/app/lib/goalie-fmv";

const CAP = 104;
const v = (capHit: number, fmvAav: number | null, position = "C") =>
  contractVerdict({ capHit, fmvAav, position, capCeilingM: CAP });

describe("contract-verdict — the margin", () => {
  it("is each model's own walk-forward error, not a round number", () => {
    expect(verdictMargin("C", CAP)).toBeCloseTo(SKATER_FMV_VALIDATION.F.maeCapPct * CAP, 9);
    expect(verdictMargin("D", CAP)).toBeCloseTo(SKATER_FMV_VALIDATION.D.maeCapPct * CAP, 9);
    expect(verdictMargin("G", CAP)).toBeCloseTo(GOALIE_FMV_VALIDATION.maeCapPct * CAP, 9);
  });

  it("routes LD and RD to the defence model, not the forward one", () => {
    for (const pos of ["D", "LD", "RD", " rd "]) {
      expect(verdictMargin(pos, CAP), pos).toBeCloseTo(verdictMargin("D", CAP), 9);
    }
    expect(verdictMargin("LW", CAP)).toBeCloseTo(verdictMargin("C", CAP), 9);
  });

  it("scales with the ceiling rather than fixing dollars", () => {
    expect(verdictMargin("C", 123) / verdictMargin("C", 104)).toBeCloseTo(123 / 104, 9);
  });

  it("is wide enough to matter — over a million at today's ceiling", () => {
    // The whole point. The retired threshold was $1M, and the model is wrong by
    // more than that, so it was manufacturing verdicts out of noise.
    for (const pos of ["C", "D", "G"]) {
      expect(verdictMargin(pos, CAP), pos).toBeGreaterThan(1);
      expect(verdictMargin(pos, CAP), pos).toBeLessThan(2.5);
    }
  });
});

describe("contract-verdict — the call", () => {
  it("says nothing when the gap is inside the margin", () => {
    // Jack Eichel: $13.5M against a $12.4M model price. The old rule printed
    // OVERPAY on a $1.1M gap the model cannot resolve.
    const eichel = v(13.5, 12.4);
    expect(eichel.kind).toBe("fair");
    expect(eichel.tone).toBe("neutral");
    expect(eichel.label).not.toMatch(/OVER|BELOW/);
  });

  it("still calls a genuine gap in both directions", () => {
    expect(v(10.5, 4.5).kind).toBe("overpay");   // Huberdeau
    expect(v(1.0, 14.4).kind).toBe("bargain");   // a star on an entry-level deal
  });

  it("puts the boundary exactly at the margin, inclusive", () => {
    const m = verdictMargin("C", CAP);
    expect(v(10, 10 + m).kind).toBe("fair");
    expect(v(10, 10 + m + 0.001).kind).toBe("bargain");
    expect(v(10, 10 - m).kind).toBe("fair");
    expect(v(10, 10 - m - 0.001).kind).toBe("overpay");
  });

  it("uses the wider goalie margin for goalies", () => {
    // A gap that convicts a forward can be inside the noise for a goalie.
    const gap = (verdictMargin("C", CAP) + verdictMargin("G", CAP)) / 2;
    expect(v(10, 10 - gap, "C").kind).toBe("overpay");
    expect(v(10, 10 - gap, "G").kind).toBe("fair");
  });

  it("distinguishes 'cannot price' from 'priced and fair'", () => {
    const none = v(3, null);
    expect(none.kind).toBe("unpriced");
    expect(none.surplus).toBeNull();
    expect(none.note).toMatch(/not enough recorded play/i);
    expect(surplusText(none)).toBe("—");
    expect(v(3, NaN).kind).toBe("unpriced");
  });

  it("reports the surplus signed the way a reader expects", () => {
    expect(v(1.0, 14.4).surplus).toBeCloseTo(13.4, 6);
    expect(surplusText(v(1.0, 14.4))).toMatch(/^\+\$13\.4M vs market$/);
    expect(surplusText(v(10.5, 4.5))).toMatch(/^−\$6\.0M vs market$/);
  });
});

describe("contract-verdict — what it claims", () => {
  it("never paints a within-margin gap green or red", () => {
    // A sign alone is not evidence. Colouring by it is the same error as
    // labelling by it.
    expect(verdictColor(v(13.5, 12.4).tone)).toBe(verdictColor("neutral"));
    expect(verdictColor("good")).not.toBe(verdictColor("neutral"));
    expect(verdictColor("bad")).not.toBe(verdictColor("neutral"));
  });

  it("hedges the note rather than convicting a general manager", () => {
    // Measured on 1,995 contracts: when the model flags an overpay the gap is
    // still there three seasons later 57% of the time. The copy has to carry
    // that, because a bare red number does not.
    const note = v(10.5, 4.5).note;
    expect(note).toMatch(/57%/);
    expect(note).toMatch(/typically sign|usually signs/i);
    expect(note).not.toMatch(/\bmistake\b|\bblunder\b|\bwrong\b/i);
  });

  it("explains a within-margin gap instead of leaving it blank", () => {
    expect(v(13.5, 12.4).note).toMatch(/inside the model's own margin/i);
  });

  it("calls the number a market price, never a fair value", () => {
    expect(MODEL_PRICE_LABEL).toMatch(/market price/i);
    expect(MODEL_PRICE_LABEL).not.toMatch(/fair/i);
  });
});

describe("contract-verdict — a free agent has no contract to judge", () => {
  const fa = (over: Record<string, unknown> = {}) => contractVerdict({
    fmvAav: 9.61, capHit: 0, position: "W",
    expiresThisOffseason: true, lastCapHit: 7.75, capCeilingM: CAP, ...over,
  });

  it("refuses to call an unsigned player a bargain", () => {
    // The launch blocker. roster-assembly zeroes capHit for pending free agents
    // so trade pricing treats them as a nought-year rental; four of six
    // surfaces read that zero as a contract and printed "+$9.6M vs market ·
    // PAID BELOW MARKET" in green for a player nobody had signed.
    const v = fa();
    expect(v.kind).toBe("noContract");
    expect(v.tone).toBe("neutral");
    expect(v.surplus).toBeNull();
    expect(surplusText(v)).not.toMatch(/\+/);
  });

  it("catches it from the zeroed cap hit even without the flag", () => {
    // Belt and braces: a $0 hit beside a real expiring deal is a free agent
    // whether or not the caller remembered to pass the flag.
    expect(fa({ expiresThisOffseason: undefined }).kind).toBe("noContract");
  });

  it("still says what he is worth, and what he used to earn", () => {
    // Refusing a verdict is not refusing to be useful.
    expect(fa().note).toMatch(/\$9\.6M/);
    expect(fa().note).toMatch(/\$7\.8M/);
    expect(fa().note).toMatch(/not under contract/i);
  });

  it("does not mistake a genuinely cheap contract for a free agent", () => {
    // Celebrini on an entry-level deal IS a bargain and must keep reading as
    // one. The distinction is a contract existing, not a contract being small.
    const elc = contractVerdict({ fmvAav: 14.4, capHit: 0.95, position: "C", capCeilingM: CAP });
    expect(elc.kind).toBe("bargain");
    const minimum = contractVerdict({ fmvAav: 3.0, capHit: 0.775, position: "W", capCeilingM: CAP });
    expect(minimum.kind).toBe("bargain");
  });

  it("does not fire on a player who simply has no priced market", () => {
    expect(contractVerdict({ fmvAav: null, capHit: 0, position: "W", capCeilingM: CAP }).kind)
      .toBe("unpriced");
  });
});
