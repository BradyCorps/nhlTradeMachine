import { describe, expect, it } from "vitest";
import { GM_TAB_FALLBACK, nextTab, visibleTab, type GmTabSpec } from "../app/lib/gm-tabs";

// The deck as it stands with a trade on the block, and with the block empty.
const withAssets: GmTabSpec[] = [
  { key: "roster" }, { key: "lineups" }, { key: "dna" },
  { key: "comparison" }, { key: "breakdown" }, { key: "sim" },
];
const noAssets: GmTabSpec[] = withAssets.map(t =>
  t.key === "comparison" || t.key === "breakdown" ? { ...t, disabled: true } : t);

describe("visibleTab", () => {
  it("shows the tab the user picked", () => {
    expect(visibleTab(withAssets, "comparison")).toBe("comparison");
    expect(visibleTab(noAssets, "dna")).toBe("dna");
  });

  // The reported bug: executing a trade from Compare clears the blocks, so the
  // tab the user was reading became disabled while still being active, and the
  // deck showed a greyed-out header over an empty panel.
  it("never leaves a disabled tab showing", () => {
    expect(visibleTab(noAssets, "comparison")).not.toBe("comparison");
    expect(visibleTab(noAssets, "breakdown")).not.toBe("breakdown");
  });

  it("falls back to a tab that needs neither a trade nor a simulation", () => {
    expect(visibleTab(noAssets, "comparison")).toBe(GM_TAB_FALLBACK);
  });

  // The point of deriving instead of overwriting the selection.
  it("restores the user's choice when it becomes usable again", () => {
    const selected = "breakdown" as const;
    expect(visibleTab(noAssets, selected)).toBe(GM_TAB_FALLBACK);
    expect(visibleTab(withAssets, selected)).toBe("breakdown");
  });

  it("falls back for a tab the deck does not contain", () => {
    expect(visibleTab([{ key: "roster" }], "sim")).toBe("roster");
  });

  it("returns the fallback rather than nothing when every tab is disabled", () => {
    const allOff = withAssets.map(t => ({ ...t, disabled: true }));
    expect(visibleTab(allOff, "sim")).toBe(GM_TAB_FALLBACK);
  });
});

describe("nextTab", () => {
  it("moves in both directions", () => {
    expect(nextTab(withAssets, "roster", 1)).toBe("lineups");
    expect(nextTab(withAssets, "lineups", -1)).toBe("roster");
  });

  it("wraps at both ends", () => {
    expect(nextTab(withAssets, "sim", 1)).toBe("roster");
    expect(nextTab(withAssets, "roster", -1)).toBe("sim");
  });

  // Arrowing onto a disabled tab lands on a panel with nothing in it.
  it("skips disabled tabs", () => {
    expect(nextTab(noAssets, "dna", 1)).toBe("sim");
    expect(nextTab(noAssets, "sim", -1)).toBe("dna");
  });

  it("enters the deck at an end when the current tab is no longer usable", () => {
    expect(nextTab(noAssets, "comparison", 1)).toBe("roster");
    expect(nextTab(noAssets, "comparison", -1)).toBe("sim");
  });

  it("reports nothing to move to when every tab is disabled", () => {
    expect(nextTab(withAssets.map(t => ({ ...t, disabled: true })), "roster", 1)).toBeNull();
  });

  it("stays put in a single-tab deck", () => {
    expect(nextTab([{ key: "roster" }], "roster", 1)).toBe("roster");
    expect(nextTab([{ key: "roster" }], "roster", -1)).toBe("roster");
  });

  it("only ever returns a usable tab", () => {
    for (const dir of [1, -1] as const) {
      for (const from of withAssets) {
        const next = nextTab(noAssets, from.key, dir);
        expect(noAssets.find(t => t.key === next)?.disabled).toBeFalsy();
      }
    }
  });
});
