// ── Draft-completion reconcile (VAL1) ────────────────────────────
// When the off-season draft finishes, every selection becomes a rookie asset
// carrying its draft context — draftOverall + the NHLe-translated junior pace —
// which is what routes it through the prospect (pedigree) NAV path.
//
// But a prospect can already sit on a roster from the live feed under an
// accent-stripped spelling: the drafted "Viggo Björck" collides with a seeded
// "Viggo Bjorck". The old step simply dropped the drafted rookie and kept the
// seeded entry — which has no draft context, so it fell out of the prospect
// path and valued as a 0-game skater (NAV 0). Instead, backfill the missing
// draft context from the rookie onto the existing entry, and only append
// rookies that are genuinely new.

import type { Asset } from "@/app/lib/trade-types";
import { normalizeName } from "@/app/lib/name-normalize";

export function reconcileDraftedRookies(existing: Asset[], rookies: Asset[]): Asset[] {
  // First rookie wins on a name collision within the draft class itself.
  const rookieByName = new Map<string, Asset>();
  for (const r of rookies) {
    const key = normalizeName(r.name);
    if (!rookieByName.has(key)) rookieByName.set(key, r);
  }

  const existingIds = new Set(existing.map(p => p.id));
  const existingNames = new Set(existing.map(p => normalizeName(p.name)));

  // Backfill draft context onto any roster player the draft just selected, so an
  // accent-stripped duplicate keeps its pedigree instead of valuing at zero.
  const merged = existing.map(p => {
    const r = rookieByName.get(normalizeName(p.name));
    if (!r) return p;
    return {
      ...p,
      draftYear:       p.draftYear ?? r.draftYear,
      draftOverall:    p.draftOverall ?? r.draftOverall,
      prospectPtsPace: p.prospectPtsPace ?? r.prospectPtsPace,
    };
  });

  // Append only rookies not already present (by id or by normalized name).
  // Drawing from the name-deduped map also collapses within-class duplicates.
  const additions = [...rookieByName.values()].filter(
    r => !existingIds.has(r.id) && !existingNames.has(normalizeName(r.name)),
  );

  return [...merged, ...additions];
}
