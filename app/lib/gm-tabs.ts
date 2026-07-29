// ── GM analysis tab deck (CXH1) ──────────────────────────────────
//
// The deck disables Compare and Breakdown when there are no assets on the
// blocks, and each of those panels also renders nothing without them. Nothing
// reconciled the two: executing a trade from either tab clears the blocks, so
// the tab the user was reading became disabled while still being the active
// one, and the deck showed a greyed-out header over an empty panel. It looked
// like the trade had broken the page.
//
// The rule is that a disabled tab can never be the visible one. Keeping it as a
// derivation rather than an effect means there is no frame where the empty
// panel is painted, and it recovers on its own: put assets back on the block
// and the tab the user chose returns, because their choice was never discarded.
//
// The second half of the same defect is that `showSimPanel` — set the moment a
// trade executes — was passed into the deck and never read. A trade's whole
// point is its consequences, and those live in the Sim tab.

export type GmTab = "roster" | "lineups" | "dna" | "comparison" | "breakdown" | "sim";

/** Always available: it needs neither a trade on the block nor a simulation. */
export const GM_TAB_FALLBACK: GmTab = "roster";

export interface GmTabSpec {
  key: GmTab;
  disabled?: boolean;
}

/**
 * The tab to actually render, given the one the user selected.
 *
 * Falls back only while the selection is unusable. The selection itself is left
 * alone so it can come back.
 */
export function visibleTab(tabs: GmTabSpec[], selected: GmTab): GmTab {
  const match = tabs.find(t => t.key === selected);
  if (match && !match.disabled) return selected;
  const firstUsable = tabs.find(t => !t.disabled);
  return firstUsable?.key ?? GM_TAB_FALLBACK;
}

/**
 * Arrow-key target within the deck.
 *
 * Skips disabled tabs — arrowing onto one lands on a panel with nothing in it —
 * and wraps at both ends.
 */
export function nextTab(tabs: GmTabSpec[], current: GmTab, dir: 1 | -1): GmTab | null {
  const usable = tabs.filter(t => !t.disabled);
  if (usable.length === 0) return null;
  const at = usable.findIndex(t => t.key === current);
  // Arrowing from a tab that is no longer usable enters the deck at its end.
  if (at < 0) return (dir === 1 ? usable[0] : usable[usable.length - 1]).key;
  return usable[(at + dir + usable.length) % usable.length].key;
}
