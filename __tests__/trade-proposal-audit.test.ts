// ── Trade-proposal audit gate (audit #7) ─────────────────────────
import { describe, it, expect } from "vitest";
import { tradePassesFullAudit } from "@/app/lib/trade-proposal-audit";

describe("tradePassesFullAudit — no fail-open", () => {
  it("passes only completed, acceptable outcomes", () => {
    expect(tradePassesFullAudit("FAIR")).toBe(true);
    expect(tradePassesFullAudit("WIN")).toBe(true);
    expect(tradePassesFullAudit("LOSS")).toBe(true);
  });

  it("rejects blocked and declined verdicts", () => {
    expect(tradePassesFullAudit("BLOCKED")).toBe(false);
    expect(tradePassesFullAudit("DECLINED")).toBe(false);
  });

  it("rejects transient/incomplete states instead of passing them", () => {
    expect(tradePassesFullAudit("IDLE")).toBe(false);
    expect(tradePassesFullAudit("PENDING")).toBe(false);
  });

  it("rejects a missing or unknown status (the fail-open case)", () => {
    expect(tradePassesFullAudit(undefined)).toBe(false);
    expect(tradePassesFullAudit(null)).toBe(false);
    expect(tradePassesFullAudit("")).toBe(false);
    expect(tradePassesFullAudit("SOME_FUTURE_STATUS")).toBe(false);
  });
});
