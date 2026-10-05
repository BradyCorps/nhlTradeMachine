import type { Asset } from "./trade-types";
import type { TradeRecord } from "./trades";
import { orderedRosterTrades } from "./published-roster-ownership";

export interface PickOwnershipEvidence {
  id: string;
  currentOwnerId: string;
  sourceUrls: string[];
  asOf: string;
  conditions?: string | null;
  /** All mutually exclusive picks/obligations; none is freely selectable. */
  relatedPickIds?: string[];
}

export function pickOriginalTeam(pick: Asset): string | null {
  return /^pick-([A-Z]+)-\d{4}-[1-7]$/.exec(pick.id)?.[1] ?? null;
}

/** Legacy cached/generated picks have no ownership evidence: fail closed. */
export function canOfferPick(pick: Asset): boolean {
  return pick.position !== "Pick" || (pick.pickOwnership === "verified" &&
    !!pick.teamId && !pick.isProtected && !pick.conditions);
}

export function pickUnavailableReason(pick: Asset): string | null {
  if (canOfferPick(pick)) return null;
  return pick.conditions || (pick.pickOwnership === "conditional"
    ? "Conditional obligation — not available as an unconditional pick."
    : "Current ownership is unverified — unavailable for selection.");
}

/** Saved blocks are checked against the session inventory, not stale snapshots. */
export function pickOffersSupported(assets: Asset[], inventory: Asset[], teamId: string | null | undefined): boolean {
  const ids = assets.filter(a => a.position === "Pick").map(a => a.id);
  if (new Set(ids).size !== ids.length) return false;
  return ids.every(id => {
    const matches = inventory.filter(p => p.position === "Pick" && p.id === id);
    return matches.length === 1 && matches[0].teamId === teamId && canOfferPick(matches[0]);
  });
}

/** Shared by both asset selectors. Session transfers change teamId, not identity. */
export function teamPickAssets(players: Asset[], teamId: string): Asset[] {
  const byId = new Map<string, Asset>();
  for (const pick of players) {
    if (pick.position !== "Pick" || byId.has(pick.id)) continue;
    if (pick.teamId === teamId || (!pick.teamId && (pick.currentOwnerId ?? pickOriginalTeam(pick)) === teamId)) byId.set(pick.id, pick);
  }
  return [...byId.values()];
}

export function resolvePickOwnership(
  picks: Asset[], evidence: PickOwnershipEvidence[], trades: TradeRecord[],
): Asset[] {
  const inventory = new Map<string, Asset>();
  const evidenceById = new Map(evidence.map(e => [e.id, e]));
  for (const pick of picks) {
    const originalOwnerId = pickOriginalTeam(pick);
    if (!originalOwnerId || inventory.has(pick.id)) continue;
    const fact = evidenceById.get(pick.id);
    inventory.set(pick.id, { ...pick, originalOwnerId,
      teamId: fact?.currentOwnerId ?? "", currentOwnerId: fact?.currentOwnerId ?? null,
      pickOwnership: fact ? (fact.conditions ? "conditional" : "verified") : "unverified",
      conditions: fact?.conditions ?? null,
      isProtected: !!fact?.conditions,
      ownershipSources: fact?.sourceUrls ?? [], ownershipAsOf: fact?.asOf ?? null,
    });
  }
  const block = (id: string, conditions: string, fact?: PickOwnershipEvidence) => {
    const pick = inventory.get(id);
    if (pick) inventory.set(id, { ...pick, ...(fact ? { ownershipSources: fact.sourceUrls, ownershipAsOf: fact.asOf } : {}),
      pickOwnership: "conditional", isProtected: true, conditions });
  };
  for (const fact of evidence) if (fact.conditions) {
    for (const id of [fact.id, ...(fact.relatedPickIds ?? [])]) block(id, fact.conditions, fact);
    const original = inventory.get(fact.id)?.originalOwnerId;
    const years = new Set([...fact.conditions.matchAll(/\b20\d{2}\b/g)].map(m => Number(m[0])));
    // Known explicit groups reserve only their specified alternatives; free
    // text alone cannot identify a promoted/replacement round safely.
    if (!fact.relatedPickIds?.length) for (const pick of inventory.values()) {
      if (original && pick.originalOwnerId === original && years.has(pick.year!)) block(pick.id, fact.conditions);
    }
  }
  for (const trade of orderedRosterTrades(trades)) for (const [index, side] of trade.sides.entries()) {
    for (const asset of side.assetsGiven) {
      if (asset.kind !== "pick") continue;
      const pick = inventory.get(asset.ref.id);
      if (!pick) continue; // Never invent an identity from a name or snapshot owner.
      // A captured source already includes this trade (or a later one).
      if (pick.ownershipAsOf && trade.executedDate < pick.ownershipAsOf.slice(0, 10)) continue;
      const conditions = [pick.conditions, trade.conditions, asset.inputSnapshot.conditions,
        asset.inputSnapshot.isProtected ? "Protected pick; conveyance must be verified." : null]
        .filter((v): v is string => typeof v === "string" && !!v.trim()).join(" · ");
      const ownerId = trade.sides[1 - index].teamId;
      inventory.set(pick.id, { ...pick, teamId: ownerId, currentOwnerId: ownerId,
        pickOwnership: conditions ? "conditional" : "verified", isProtected: !!conditions,
        conditions: conditions || null, ownershipSources: [trade.sourceUrl ?? `published:${trade.id}`],
        ownershipAsOf: trade.executedDate });
      if (conditions) {
        // Free text cannot safely resolve alternatives. Conservatively reserve
        // this original team's picks in every mentioned future year, not just
        // one potentially conveyable slot. No inferred/promoted round.
        const years = new Set([...conditions.matchAll(/\b20\d{2}\b/g)].map(m => Number(m[0])));
        for (const alternative of inventory.values()) if (alternative.originalOwnerId === pick.originalOwnerId && years.has(alternative.year!)) {
          block(alternative.id, conditions);
        }
      }
    }
  }
  // An unresolved right is not unconditional team draft capital. Keep its
  // reported beneficiary separately; alternative slots cannot count twice.
  return [...inventory.values()].map(p => p.pickOwnership === "conditional" ? { ...p, teamId: "" } : p);
}
