import { describe, expect, it } from "vitest";
import { FOCUSABLE_SELECTOR, initialFocusIndex, nextFocusIndex } from "../app/lib/focus-trap";

describe("nextFocusIndex", () => {
  it("advances on Tab", () => {
    expect(nextFocusIndex(4, 0, false)).toBe(1);
    expect(nextFocusIndex(4, 2, false)).toBe(3);
  });

  it("retreats on Shift+Tab", () => {
    expect(nextFocusIndex(4, 2, true)).toBe(1);
  });

  // The wrapping IS the trap. Without it, focus leaves for the browser chrome
  // and then the page behind, where a keyboard user can operate controls they
  // cannot see.
  it("wraps forward past the last element", () => {
    expect(nextFocusIndex(4, 3, false)).toBe(0);
  });

  it("wraps backward before the first", () => {
    expect(nextFocusIndex(4, 0, true)).toBe(3);
  });

  it("enters at the first element when focus is outside the trap", () => {
    expect(nextFocusIndex(4, -1, false)).toBe(0);
  });

  it("enters at the last element on Shift+Tab from outside", () => {
    expect(nextFocusIndex(4, -1, true)).toBe(3);
  });

  it("reports nothing to focus for an empty dialog", () => {
    expect(nextFocusIndex(0, -1, false)).toBe(-1);
    expect(nextFocusIndex(0, 0, true)).toBe(-1);
  });

  it("stays put in a single-element dialog", () => {
    expect(nextFocusIndex(1, 0, false)).toBe(0);
    expect(nextFocusIndex(1, 0, true)).toBe(0);
  });

  it("never returns an out-of-range index", () => {
    for (const count of [1, 2, 5, 9]) {
      for (let cur = -1; cur < count; cur++) {
        for (const shift of [true, false]) {
          const next = nextFocusIndex(count, cur, shift);
          expect(next).toBeGreaterThanOrEqual(0);
          expect(next).toBeLessThan(count);
        }
      }
    }
  });
});

describe("initialFocusIndex", () => {
  it("honours an explicit request", () => {
    expect(initialFocusIndex(5, 3)).toBe(3);
  });

  // A focused container reads as an empty dialog and leaves the first Tab
  // press going nowhere useful.
  it("defaults to the first focusable element, not the container", () => {
    expect(initialFocusIndex(5, null)).toBe(0);
  });

  it("ignores an out-of-range request rather than focusing nothing", () => {
    expect(initialFocusIndex(3, 9)).toBe(0);
    expect(initialFocusIndex(3, -2)).toBe(0);
  });

  it("reports nothing to focus for an empty dialog", () => {
    expect(initialFocusIndex(0, null)).toBe(-1);
  });
});

describe("FOCUSABLE_SELECTOR", () => {
  it("covers the controls these overlays actually contain", () => {
    for (const part of ["a[href]", "button", "input", "select", "textarea", "summary"]) {
      expect(FOCUSABLE_SELECTOR).toContain(part);
    }
  });

  it("excludes disabled controls and anything removed from the tab order", () => {
    expect(FOCUSABLE_SELECTOR).toContain(":not([disabled])");
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])');
  });
});
