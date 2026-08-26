import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { franchiseOptionLabel } from "@/app/armchair-gm/TeamSelectModal";

describe("QW-05 accessible Armchair selector", () => {
  const selector = readFileSync("app/armchair-gm/TeamSelectModal.tsx", "utf8");
  const armchair = readFileSync("app/armchair-gm/page.tsx", "utf8");

  it("announces abbreviation, franchise, season, mode, and phase", () => {
    expect(franchiseOptionLabel(
      { id: "ANA", name: "Anaheim Ducks" },
      "Bubble",
      "offseason",
    )).toBe("Select ANA — Anaheim Ducks — 2026-27 Off-Season — Bubble");
  });

  it("shows both franchise abbreviation and full name", () => {
    expect(selector).toContain("{t.id}");
    expect(selector).toContain("{t.name}");
    expect(selector).toContain("aria-label={franchiseOptionLabel(t, phase, mode)}");
  });

  it("keeps option and close targets touch-sized with an explicit selected state", () => {
    expect(selector).toContain("min-h-[96px] min-w-[44px]");
    expect(selector).toContain("min-h-11 min-w-11");
    expect(selector).toContain("aria-pressed={isSelected}");
    expect(selector).toContain("isSelected ? 'var(--ledger-warm)' : 'var(--ledger-card)'");
    expect(selector).not.toContain("isSelected ? 'var(--ledger-ink)'");
  });

  it("retains focus-managed selection, close, and reset controls", () => {
    expect(selector).toContain("useDialog");
    expect(selector).toContain("onSelectTeam(t)");
    expect(selector).toContain("onClick={onClose}");
    expect(armchair).toContain('aria-label="Void all executed trades"');
    expect(armchair).toContain('className="tap-target w-full');
  });
});
