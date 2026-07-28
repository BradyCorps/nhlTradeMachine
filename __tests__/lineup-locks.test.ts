import { describe, expect, it } from "vitest";
import {
  applyLocks,
  emptyLineupLocks,
  isLocked,
  lockCount,
  lockedIds,
  pruneAllLocks,
  pruneLocks,
  swapLocks,
  toggleLock,
} from "../app/lib/lineup-locks";

describe("toggleLock", () => {
  it("locks an empty slot", () => {
    expect(toggleLock({}, 0, "a")).toEqual({ 0: "a" });
  });

  it("unlocks when the same player is toggled again", () => {
    expect(toggleLock({ 0: "a" }, 0, "a")).toEqual({});
  });

  it("evicts whoever held the slot", () => {
    expect(toggleLock({ 0: "a" }, 0, "b")).toEqual({ 0: "b" });
  });

  // Otherwise a stale lock points at a slot the player no longer occupies,
  // and the next hydrate teleports him back to it.
  it("releases a player's previous slot when he is locked elsewhere", () => {
    expect(toggleLock({ 3: "a" }, 7, "a")).toEqual({ 7: "a" });
  });

  it("ignores an empty slot with no player", () => {
    expect(toggleLock({ 0: "a" }, 5, null)).toEqual({ 0: "a" });
  });

  it("does not mutate the input", () => {
    const locks = { 0: "a" };
    toggleLock(locks, 1, "b");
    expect(locks).toEqual({ 0: "a" });
  });
});

describe("applyLocks", () => {
  const order = ["a", "b", "c", "d"];

  it("returns the order untouched when nothing is locked", () => {
    expect(applyLocks(order, {})).toEqual(order);
  });

  it("seats a locked player at his slot and flows the rest around him", () => {
    expect(applyLocks(order, { 0: "c" })).toEqual(["c", "a", "b", "d"]);
  });

  it("honours several locks at once", () => {
    expect(applyLocks(order, { 0: "d", 3: "a" })).toEqual(["d", "b", "c", "a"]);
  });

  it("keeps unlocked players in their relative order", () => {
    expect(applyLocks(["a", "b", "c", "d", "e"], { 2: "e" }))
      .toEqual(["a", "b", "e", "c", "d"]);
  });

  it("never drops or duplicates a player", () => {
    const result = applyLocks(order, { 1: "d" });
    expect([...result].sort()).toEqual([...order].sort());
    expect(new Set(result).size).toBe(order.length);
  });

  // The reason locks exist: a roster change re-runs the merge, and without
  // locks it reflows the one placement the user deliberately made.
  it("survives a reordering of the incoming list", () => {
    expect(applyLocks(["d", "c", "b", "a"], { 0: "a" })[0]).toBe("a");
  });

  it("ignores a lock on a player who has left the roster", () => {
    expect(applyLocks(order, { 0: "traded-away" })).toEqual(order);
  });

  it("ignores an out-of-range slot rather than growing the lineup", () => {
    expect(applyLocks(order, { 99: "a" })).toEqual(order);
    expect(applyLocks(order, { [-1]: "a" })).toEqual(order);
  });
});

describe("pruneLocks", () => {
  it("drops locks whose player left the roster", () => {
    expect(pruneLocks({ 0: "a", 1: "gone" }, ["a", "b"])).toEqual({ 0: "a" });
  });

  it("prunes every group", () => {
    const locks = { F: { 0: "f1" }, D: { 0: "gone" }, G: { 0: "g1" } };
    expect(pruneAllLocks(locks, ["f1", "g1"]))
      .toEqual({ F: { 0: "f1" }, D: {}, G: { 0: "g1" } });
  });

  it("accepts a Set as well as a list", () => {
    expect(pruneLocks({ 0: "a" }, new Set(["a"]))).toEqual({ 0: "a" });
  });
});

describe("swapLocks", () => {
  // A lock follows its player. The alternative — following the slot — means a
  // manual move is silently undone by the next hydrate.
  it("moves a lock with its player", () => {
    expect(swapLocks({ 0: "a" }, 0, 2)).toEqual({ 2: "a" });
  });

  it("exchanges two locked slots", () => {
    expect(swapLocks({ 0: "a", 2: "b" }, 0, 2)).toEqual({ 0: "b", 2: "a" });
  });

  it("leaves unlocked slots alone", () => {
    expect(swapLocks({ 5: "e" }, 0, 2)).toEqual({ 5: "e" });
  });

  it("is a no-op when the slots match", () => {
    expect(swapLocks({ 0: "a" }, 1, 1)).toEqual({ 0: "a" });
  });
});

describe("helpers", () => {
  it("reports the locked ids and count", () => {
    const locks = { F: { 0: "a", 3: "b" }, D: { 1: "c" }, G: {} };
    expect(lockedIds(locks.F)).toEqual(new Set(["a", "b"]));
    expect(lockCount(locks)).toBe(3);
    expect(lockCount(emptyLineupLocks())).toBe(0);
  });

  it("identifies a locked slot only for the player actually pinned there", () => {
    expect(isLocked({ 0: "a" }, 0, "a")).toBe(true);
    expect(isLocked({ 0: "a" }, 0, "b")).toBe(false);
    expect(isLocked({ 0: "a" }, 1, "a")).toBe(false);
    expect(isLocked({ 0: "a" }, 0, null)).toBe(false);
  });
});
