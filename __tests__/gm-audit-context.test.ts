// ── GM Audit contextual reasoning (TM5/TM6) ──────────────────────
// The two named audit scenarios are pinned here:
//  - McAvoy: a franchise D may move for a franchise goalie + 2nd-line D,
//    and the reasoning must account for an elite incumbent (Swayman).
//  - Hellebuyck: a franchise goalie is franchise-calibre on the goalie
//    value scale, and crease fit flags must be coherent both ways.

import { describe, it, expect } from "vitest";
import {
  assessFranchiseReturn,
  assessCreaseContext,
  isFranchiseCalibre,
  GOALIE_FRANCHISE_FACTOR,
} from "@/app/lib/gm-audit-context";

const FRANCHISE = 160; // mirrors FRANCHISE.threshold in season-config

describe("isFranchiseCalibre — position-aware bar", () => {
  it("judges goalies on the goalie value scale", () => {
    // 130 NAV: short of the 160 skater bar, clears the ~115 goalie bar
    expect(isFranchiseCalibre({ name: "G", position: "G", nav: 130 }, FRANCHISE)).toBe(true);
    expect(isFranchiseCalibre({ name: "F", position: "C", nav: 130 }, FRANCHISE)).toBe(false);
    expect(GOALIE_FRANCHISE_FACTOR).toBeLessThan(1);
  });

  it("picks never qualify", () => {
    expect(isFranchiseCalibre({ name: "1st", position: "Pick", nav: 500 }, FRANCHISE)).toBe(false);
  });
});

describe("assessFranchiseReturn — the McAvoy package", () => {
  it("franchise goalie + second-line D qualifies as a franchise return", () => {
    const r = assessFranchiseReturn([
      { name: "Connor Hellebuyck", position: "G", nav: 135, gsax: 25, gamesStarted: 55 },
      { name: "Second-Line D", position: "D", nav: 95 },
    ], FRANCHISE);
    expect(r.qualifies).toBe(true);
    expect(r.headliner!.name).toBe("Connor Hellebuyck");
    expect(r.reason).toContain("Hellebuyck");
  });

  it("near-franchise skater + quality second piece qualifies as a package", () => {
    const r = assessFranchiseReturn([
      { name: "Near Star", position: "C", nav: 135 },
      { name: "Top-4 D", position: "D", nav: 100 },
    ], FRANCHISE);
    expect(r.qualifies).toBe(true);
    expect(r.reason).toContain("package");
  });

  it("near-franchise headliner alone does NOT qualify", () => {
    const r = assessFranchiseReturn([
      { name: "Near Star", position: "C", nav: 135 },
      { name: "Depth F", position: "W", nav: 40 },
    ], FRANCHISE);
    expect(r.qualifies).toBe(false);
    expect(r.reason).toContain("second piece");
  });

  it("a mid-tier return is rejected with the headliner named", () => {
    const r = assessFranchiseReturn([
      { name: "Middle Six F", position: "W", nav: 70 },
      { name: "Third Pair D", position: "D", nav: 45 },
    ], FRANCHISE);
    expect(r.qualifies).toBe(false);
    expect(r.reason).toContain("Middle Six F");
  });

  it("an all-picks return never qualifies through this path", () => {
    const r = assessFranchiseReturn([
      { name: "2028 1st", position: "Pick", nav: 60 },
      { name: "2029 1st", position: "Pick", nav: 55 },
    ], FRANCHISE);
    expect(r.qualifies).toBe(false);
  });
});

describe("assessCreaseContext — the Swayman/Hellebuyck cases", () => {
  const hellebuyck = { name: "Connor Hellebuyck", position: "G", nav: 135, gsax: 25, gamesStarted: 55 };

  it("elite incumbent → LOGJAM with the incumbent named (Swayman case)", () => {
    const ctx = assessCreaseContext(hellebuyck, [
      { name: "Jeremy Swayman", position: "G", nav: 110, gsax: 14, gamesStarted: 48 },
      { name: "Backup", position: "G", nav: 15, gsax: -2, gamesStarted: 20 },
    ]);
    expect(ctx.verdict).toBe("LOGJAM");
    expect(ctx.incumbent!.name).toBe("Jeremy Swayman");
    expect(ctx.detail).toContain("Swayman");
    expect(ctx.detail).toContain("logjam");
  });

  it("struggling heavy-start incumbent → UPGRADE, never a logjam (fit coherence)", () => {
    const ctx = assessCreaseContext(hellebuyck, [
      { name: "Struggling Starter", position: "G", nav: 30, gsax: -8, gamesStarted: 40 },
    ]);
    // Workload alone must not block an upgrade — quality does.
    expect(ctx.verdict).toBe("UPGRADE");
    expect(ctx.detail).toContain("upgrade");
  });

  it("empty crease → UPGRADE, framed as filling the most valuable hole", () => {
    const ctx = assessCreaseContext(hellebuyck, []);
    expect(ctx.verdict).toBe("UPGRADE");
    expect(ctx.detail).toContain("no established starter");
  });

  it("a backup-calibre goalie arriving triggers no crease narrative", () => {
    const ctx = assessCreaseContext(
      { name: "Journeyman", position: "G", nav: 20, gsax: -1, gamesStarted: 18 },
      [{ name: "Starter", position: "G", nav: 90, gsax: 10, gamesStarted: 50 }],
    );
    expect(ctx.verdict).toBe("NEUTRAL");
  });
});
