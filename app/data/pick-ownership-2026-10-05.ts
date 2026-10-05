import type { PickOwnershipEvidence } from "@/app/lib/pick-ownership";

// Bounded, attributable inventory. This is NOT a complete league ledger.
// Every unlisted identity is unavailable, never inferred to be original-owned.
const asOf = "2026-10-05";
const chicago = "https://www.nhl.com/blackhawks/team/future-draft-picks";
const tracker = "https://puckpedia.com/team/chicago-blackhawks/draftpicks";
const fact = (id: string, currentOwnerId: string, sourceUrls: string[], conditions?: string,
  relatedPickIds?: string[]): PickOwnershipEvidence => ({ id, currentOwnerId, sourceUrls, asOf, conditions, relatedPickIds });

export const PICK_OWNERSHIP_EVIDENCE: PickOwnershipEvidence[] = [
  // Explicit current inventory on the club page, cross-checked with PuckPedia.
  ...[1, 2, 3, 6, 7].map(round => fact(`pick-CHI-2027-${round}`, "CHI", [chicago, tracker])),
  ...[1, 2, 3, 4, 5, 6].map(round => fact(`pick-CHI-2028-${round}`, "CHI", [chicago, tracker])),
  ...[1, 2, 3, 4, 5, 6, 7].map(round => fact(`pick-CHI-2029-${round}`, "CHI", [chicago, tracker])),
  fact("pick-VAN-2027-2", "CHI", [chicago, tracker]),
  fact("pick-TBL-2027-3", "CHI", [chicago, tracker]),
  // Original identity for the re-acquired fourth is ambiguous between the
  // club page and trade chain. Neither CHI/VAN fourth is unlocked here.
  fact("pick-SJS-2028-4", "CHI", [chicago, tracker]),
  fact("pick-CHI-2028-7", "SJS", [chicago, tracker]),
  fact("pick-CHI-2027-5", "CAR", [chicago, tracker]),
  fact("pick-OTT-2027-6", "CHI", [
    "https://www.nhl.com/senators/news/ottawa-senators-acquire-andre-burakovsky-from-chicago-in-exchange-for-a-sixth-round-draft-pick",
    tracker,
  ]),
  fact("pick-TOR-2027-2", "CBJ", [
    "https://www.nhl.com/news/maple-leafs-acquire-kirill-marchenko-in-trade-with-blue-jackets-for-matthew-knies",
    "https://puckpedia.com/team/columbus-blue-jackets/draftpicks",
  ], "Published trade identifies TOR's 2027 second; current tracker identifies a conditional CBJ-origin second instead. Original identity and conditions conflict; neither is freely selectable.", ["pick-CBJ-2027-2"]),
  fact("pick-PHI-2027-6", "TOR", [
    "https://puckpedia.com/team/PHILADELPHIA-FLYERS/draftpicks",
    "https://puckpedia.com/team/toronto-maple-leafs/draftpicks",
    "https://www.prosportstransactions.com/hockey/DraftTrades/Years/2027.htm",
  ]),
  fact("pick-COL-2027-1", "TOR", [
    "https://www.nhl.com/news/topic/trade-coverage/nicolas-roy-traded-to-colorado-avalanche-by-toronto-maple-leafs",
  ], "Colorado's 2027 first is top-10 protected; the unprotected 2028 first is the alternative. Prior obligations and conveyance are unresolved; neither is freely selectable.", ["pick-COL-2028-1"]),
  fact("pick-EDM-2027-1", "CHI", [
    "https://www.nhl.com/blackhawks/news/release-blackhawks-acquire-mangiapane-and-conditional-first-round-pick-from-oilers", tracker,
  ], "Conditional first-round obligation; 2027/2028 conveyance and protection require verification. Neither alternative is freely selectable.", ["pick-EDM-2028-1"]),
  fact("pick-EDM-2028-2", "CHI", [chicago, tracker],
    "Club inventory labels this conditional; full terms are not established. Unavailable until reconciled."),
  fact("pick-FLA-2027-1", "CHI", [chicago, tracker],
    "Conditional Florida first-round right. Conflicting prior obligations and alternative years remain unresolved.", ["pick-FLA-2028-1", "pick-FLA-2029-1"]),
];
