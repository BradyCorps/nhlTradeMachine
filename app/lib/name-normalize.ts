// ── name-normalize.ts ─────────────────────────────────────────────
// One canonical name key for cross-source player matching. Data feeds
// disagree on diacritics ("Viggo Björck" vs "Viggo Bjorck"), casing,
// and punctuation — every already-drafted / already-rostered check must
// compare through this normalizer, never raw strings.

export function normalizeName(name: string): string {
  return (name || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]/g, "");
}
