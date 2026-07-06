// ── Future Draft Classes — real prospects for Cup Run years 2-3 ──
// The Cup Run generates synthetic first rounds for 2027/2028. Paste
// real prospects here (in expected draft order, best first) and the
// generator uses them for the top of the round, filling any remaining
// slots synthetically. Leave a year empty to stay fully synthetic.
//
// nhlePace is the NHL-equivalent 82-game scoring pace (same scale as
// prospectPtsPace elsewhere). Omit it to use the slot-based curve.
//
// Example:
//   2027: [
//     { name: "Gavin McKenna", pos: "W", nhlePace: 72 },
//     { name: "Ryan Roobroeck", pos: "W" },
//   ],

export interface FutureDraftProspect {
  name: string;
  pos: "C" | "W" | "D" | "G";
  nhlePace?: number;
}

export const FUTURE_DRAFT_CLASSES: Record<number, FutureDraftProspect[]> = {
  2027: [],
  2028: [],
};
