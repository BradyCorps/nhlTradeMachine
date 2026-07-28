// ── Line locks ───────────────────────────────────────────────────
//
// Lineup order is recomputed whenever the roster changes — a trade, a signing,
// a Cup Run rollover all re-run `hydrateLineupOrdersForRoster`. That is correct
// for players you never touched, and destructive for the one decision you cared
// about: putting a specific winger on the top line. Bring in a centre and the
// merge quietly reflows everything around him.
//
// A lock pins one player to one slot. It constrains AUTOMATIC reordering only —
// a manual move is the user overruling themselves, and the lock travels with
// the player rather than blocking the drag.
//
// Locks are per group (F/D/G), because slot indices only mean anything inside a
// group: index 1 is the first-line centre among forwards and the first-pair
// left defenceman among defencemen.

import type { LineupGroup } from "@/app/lib/lineup-order";

/** Slot index → the player id pinned there. */
export type GroupLocks = Record<number, string>;
export type LineupLocks = Record<LineupGroup, GroupLocks>;

export const emptyLineupLocks = (): LineupLocks => ({ F: {}, D: {}, G: {} });

/**
 * Lock `playerId` to `index`, or clear that slot when it already holds him.
 *
 * A player can hold only one slot, so locking him somewhere new releases his
 * previous one. Without that, dragging a locked player and re-locking him would
 * leave a lock behind pointing at a slot he no longer occupies, and the next
 * hydrate would teleport him back.
 */
export function toggleLock(
  locks: GroupLocks,
  index: number,
  playerId: string | null | undefined,
): GroupLocks {
  if (!playerId) return locks;

  const next: GroupLocks = {};
  for (const [slot, id] of Object.entries(locks)) {
    if (id === playerId) continue;            // release his old slot
    if (Number(slot) === index) continue;     // and whoever held this one
    next[Number(slot)] = id;
  }

  const wasLockedHere = locks[index] === playerId;
  if (!wasLockedHere) next[index] = playerId;
  return next;
}

/** Every player id currently pinned in this group. */
export const lockedIds = (locks: GroupLocks): Set<string> =>
  new Set(Object.values(locks));

export const isLocked = (locks: GroupLocks, index: number, playerId?: string | null): boolean =>
  playerId != null && locks[index] === playerId;

/**
 * Re-seat `order` so every locked player sits at their pinned index.
 *
 * Unlocked players keep their relative order and flow into whatever slots are
 * left. A lock on a player who is no longer in `order` — traded away, sent
 * down — is ignored rather than leaving a hole; `pruneLocks` clears it for
 * real once the roster is known.
 */
export function applyLocks(order: string[], locks: GroupLocks): string[] {
  const present = new Set(order);
  const active = Object.entries(locks)
    .map(([slot, id]) => ({ index: Number(slot), id }))
    .filter(({ index, id }) => present.has(id) && index >= 0 && index < order.length);

  if (active.length === 0) return order;

  const pinned = new Set(active.map(l => l.id));
  const flowing = order.filter(id => !pinned.has(id));

  const result: (string | null)[] = new Array(order.length).fill(null);
  for (const { index, id } of active) result[index] = id;

  let next = 0;
  for (let i = 0; i < result.length; i++) {
    if (result[i] === null) result[i] = flowing[next++] ?? null;
  }

  return result.filter((id): id is string => id !== null);
}

/**
 * Drop locks whose player is no longer on the roster.
 *
 * Called on roster change: a lock that outlives its player would silently
 * re-seat whoever inherits that id, and a stale lock is invisible in the UI —
 * there is no player on it to show a lock badge.
 */
export function pruneLocks(locks: GroupLocks, rosterIds: Iterable<string>): GroupLocks {
  const alive = rosterIds instanceof Set ? rosterIds : new Set(rosterIds);
  const next: GroupLocks = {};
  for (const [slot, id] of Object.entries(locks)) {
    if (alive.has(id)) next[Number(slot)] = id;
  }
  return next;
}

export function pruneAllLocks(locks: LineupLocks, rosterIds: Iterable<string>): LineupLocks {
  const alive = new Set(rosterIds);
  return {
    F: pruneLocks(locks.F, alive),
    D: pruneLocks(locks.D, alive),
    G: pruneLocks(locks.G, alive),
  };
}

/**
 * Move a lock when the user manually swaps two slots.
 *
 * A lock follows its player rather than its slot. Anything else means a manual
 * move either silently breaks the lock or is silently undone by the next
 * hydrate — both worse than the lock simply travelling.
 */
export function swapLocks(locks: GroupLocks, a: number, b: number): GroupLocks {
  if (a === b) return locks;
  const next: GroupLocks = { ...locks };
  const atA = locks[a];
  const atB = locks[b];
  delete next[a];
  delete next[b];
  if (atA != null) next[b] = atA;
  if (atB != null) next[a] = atB;
  return next;
}

export const lockCount = (locks: LineupLocks): number =>
  Object.keys(locks.F).length + Object.keys(locks.D).length + Object.keys(locks.G).length;
